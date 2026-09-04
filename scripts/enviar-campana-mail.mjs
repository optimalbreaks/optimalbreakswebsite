/**
 * Campaña puntual: Top 100 (temas + artistas) con botones a cada fila.
 *
 *   node scripts/enviar-campana-mail.mjs --dry-run
 *   node scripts/enviar-campana-mail.mjs --test
 *       → solo a SMTP_USER (contacto@optimalbreaks.com).
 *   node scripts/enviar-campana-mail.mjs --send
 *       → emails confirmados con < 100 canciones únicas.
 *
 * Portadas: Beatport sirve WebP y Outlook no lo pinta. Se bajan, se
 * convierten a JPEG con sharp y van incrustadas (CID). YouTube ya era JPG.
 *
 * SMTP OVH en .env.local. No enviar la base sin --send explícito.
 * Guía: docs/GUIA_MAILS.md
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { createRequire } from 'module'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import sharp from 'sharp'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal } from './lib/artist-upsert.mjs'

const require = createRequire(import.meta.url)
const nodemailer = require('nodemailer')

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const SITE = 'https://www.optimalbreaks.com'
const TOP_API = `${SITE}/api/public/charts/community-monthly?limit=10`
const OUT_HTML = join(ROOT, 'mailing', 'save-tracks-top100.html')

loadEnvLocal()

const args = new Set(process.argv.slice(2))
const dryRun = args.has('--dry-run')
const doSend = args.has('--send')
const isTest = !dryRun && !doSend
const SAVE_CAP = 100
const SKIP_EMAILS = new Set(
  [
    process.env.SMTP_USER,
    'contacto@optimalbreaks.com',
    'contacto@eskaladigital.com',
  ]
    .map((e) => (e || '').trim().toLowerCase())
    .filter(Boolean),
)
const SEND_GAP_MS = 1500

function esc(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function firstName(raw) {
  const t = String(raw || '').trim()
  if (!t) return ''
  const w = t.split(/\s+/)[0].replace(/[<>]/g, '')
  return w.length > 24 ? '' : w
}

function remoteFetchUrl(url) {
  const u = String(url || '').trim()
  if (!u) return ''
  if (u.startsWith('/')) return `${SITE}${u}`
  if (!/^https:\/\//i.test(u)) return ''
  try {
    const host = new URL(u).hostname
    if (
      host === 'i.ytimg.com' ||
      host === 'geo-media.beatport.com' ||
      host === 'img.youtube.com'
    ) {
      return `${SITE}/api/og/image-proxy?src=${encodeURIComponent(u)}`
    }
  } catch {
    return ''
  }
  return u
}

function localPublicPath(url) {
  const u = String(url || '').trim()
  if (!u.startsWith('/')) return null
  return join(ROOT, 'public', ...u.split('/').filter(Boolean))
}

async function jpegThumb(url, size) {
  if (!url) return null
  try {
    let input
    const disk = localPublicPath(url)
    if (disk && existsSync(disk)) {
      input = readFileSync(disk)
    } else {
      const remote = remoteFetchUrl(url)
      if (!remote) return null
      const res = await fetch(remote, { headers: { accept: 'image/*' } })
      if (!res.ok) return null
      input = Buffer.from(await res.arrayBuffer())
    }
    return await sharp(input)
      .rotate()
      .resize(size, size, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 82, mozjpeg: true })
      .toBuffer()
  } catch {
    return null
  }
}

function trackPlayUrl(t) {
  const src = t?.primary?.source
  const id = t?.primary?.id
  if (!src || !id) return `${SITE}/es/top100`
  const params = new URLSearchParams()
  if (src === 'vinyl') {
    params.set('play', `vinyl:${id}`)
    return `${SITE}/es/charts?${params}`
  }
  if (src === 'chart' || src === 'featured') {
    params.set('play', `${src}:${id}`)
    const week = (t.primary.week_date || '').trim()
    if (week) params.set('week', week)
    return `${SITE}/es/charts?${params}`
  }
  if (src === 'beatport_top') {
    const o = t.beatport_share_origin
    const m = String(t.external_url || '').match(/beatport\.com\/(?:[a-z]{2}\/)?track\/[^/]+\/(\d+)/i)
    if (o?.slug && m) {
      const folder = o.kind === 'label' ? 'labels' : 'artists'
      return `${SITE}/es/${folder}/${o.slug}?play=beatport:${m[1]}`
    }
  }
  return `${SITE}/es/top100`
}

function artistUrl(a) {
  const slug = (a?.slug || '').trim()
  return slug ? `${SITE}/es/artists/${slug}` : `${SITE}/es/top100`
}

function warnStripe() {
  const cells = []
  for (let i = 0; i < 12; i++) {
    const bg = i % 2 === 0 ? '#1a1a1a' : '#f7e733'
    cells.push(
      `<td width="8.33%" height="8" bgcolor="${bg}" style="font-size:0; line-height:0;">&nbsp;</td>`,
    )
  }
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;"><tr>${cells.join('')}</tr></table>`
}

function ctaBtn(href, label, bg = '#d62828') {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;">
    <tr>
      <td align="center" bgcolor="${bg}" style="border:3px solid #1a1a1a;">
          <a href="${esc(href)}" target="_blank" style="display:inline-block; padding:10px 12px; font-family:Arial Black,Arial,Helvetica,sans-serif; font-size:11px; line-height:1.15; color:#ffffff; text-decoration:none; text-transform:uppercase; letter-spacing:0.5px; white-space:nowrap;">${esc(label)}</a>
      </td>
    </tr>
  </table>`
}

function thumbImg(asset, size, alt) {
  if (!asset) {
    return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="${size}" style="border-collapse:collapse;"><tr><td width="${size}" height="${size}" bgcolor="#1a1a1a" style="border:3px solid #1a1a1a; font-size:0; line-height:0;">&nbsp;</td></tr></table>`
  }
  const src = asset.cid ? `cid:${asset.cid}` : asset.dataUri
  return `<img src="${esc(src)}" width="${size}" height="${size}" alt="${esc(alt || '')}" style="display:block; width:${size}px; height:${size}px; border:3px solid #1a1a1a;">`
}

function sectionHead(title, sub) {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    <tr>
      <td bgcolor="#1a1a1a" style="padding:10px 14px; border:3px solid #1a1a1a;">
        <p style="margin:0; font-family:Arial Black,Arial,Helvetica,sans-serif; font-size:13px; letter-spacing:1.5px; color:#f7e733; text-transform:uppercase;">${esc(title)}</p>
        ${sub ? `<p style="margin:4px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.4; color:#e8dcc8;">${esc(sub)}</p>` : ''}
      </td>
    </tr>
  </table>`
}

function trackRow(t, asset) {
  const href = trackPlayUrl(t)
  const mix = (t.mix_name || '').trim()
  const title = mix ? `${t.title} (${mix})` : t.title
  return `<tr>
    <td style="padding:0 0 10px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; border:3px solid #1a1a1a;">
        <tr>
          <td width="40" valign="middle" align="center" bgcolor="#f7e733" style="border-right:3px solid #1a1a1a; font-family:Arial Black,Arial,sans-serif; font-size:18px; line-height:1; color:#1a1a1a;">${t.rank}</td>
          <td width="76" valign="middle" bgcolor="#1a1a1a" style="padding:6px;">${thumbImg(asset, 64, t.title)}</td>
          <td valign="middle" bgcolor="#e8dcc8" style="padding:10px 10px 10px 12px;">
            <p style="margin:0 0 3px 0; font-family:Arial Black,Arial,Helvetica,sans-serif; font-size:14px; line-height:1.2; color:#1a1a1a;">${esc(title)}</p>
            <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:12px; line-height:1.35; color:#4a4238;">${esc(t.artists)}</p>
          </td>
          <td width="118" valign="middle" align="center" bgcolor="#e8dcc8" style="padding:8px 10px 8px 0;">${ctaBtn(href, '+ / Save')}</td>
        </tr>
      </table>
    </td>
  </tr>`
}

function artistRow(a, asset) {
  const href = artistUrl(a)
  return `<tr>
    <td style="padding:0 0 8px 0;">
      <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; border:3px solid #1a1a1a;">
        <tr>
          <td width="36" valign="middle" align="center" bgcolor="#1a1a1a" style="font-family:Arial Black,Arial,sans-serif; font-size:15px; color:#f7e733;">${a.rank}</td>
          <td width="60" valign="middle" bgcolor="#1a1a1a" style="padding:5px;">${thumbImg(asset, 48, a.name)}</td>
          <td valign="middle" bgcolor="#e8dcc8" style="padding:8px 10px;">
            <p style="margin:0; font-family:Arial Black,Arial,Helvetica,sans-serif; font-size:13px; line-height:1.2; color:#1a1a1a;">${esc(a.name)}</p>
          </td>
          <td width="108" valign="middle" align="center" bgcolor="#e8dcc8" style="padding:8px 8px 8px 0;">${ctaBtn(href, 'Ficha / Page', '#1a1a1a')}</td>
        </tr>
      </table>
    </td>
  </tr>`
}

const AVG_SAVES = 50

function langSwitcher() {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
    <tr>
      <td align="center" bgcolor="#1a1a1a" style="padding:11px 14px; border-bottom:3px solid #1a1a1a;">
        <a href="#mail-es" style="font-family:Arial Black,Arial,sans-serif; font-size:12px; color:#f7e733; text-decoration:none; letter-spacing:0.5px;">Español</a>
        <span style="font-family:Arial,sans-serif; font-size:12px; color:#666;"> &nbsp;·&nbsp; </span>
        <a href="#mail-en" style="font-family:Arial Black,Arial,sans-serif; font-size:12px; color:#e8dcc8; text-decoration:none; letter-spacing:0.5px;">English</a>
      </td>
    </tr>
  </table>`
}

function introBody(greetingName, saveCount, lang) {
  const n = Number(saveCount) || 0
  const name = greetingName ? esc(greetingName) : ''
  const p = 'margin:0 0 14px 0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.55; color:#1a1a1a;'
  const pLast = 'margin:0; font-family:Arial,Helvetica,sans-serif; font-size:15px; line-height:1.55; color:#1a1a1a;'

  if (lang === 'en') {
    const hi = name ? `Hi, ${name}` : 'Hi'
    const hook =
      n === 0
        ? `${hi} — quick one. One of the best things on the site barely gets used: <strong>your own track list</strong>.`
        : `${hi} — quick one about <strong>your track list</strong>. It’s one of the best parts of the site, and it’s yours.`
    let tally
    if (n <= 0) {
      tally = `You’ve saved <strong>none</strong> so far. People who actually use it usually land around <strong>${AVG_SAVES}</strong> — not a race, just the stuff you want on hand.`
    } else if (n < AVG_SAVES) {
      tally = `You’re at <strong>${n}</strong>. Most active lists sit around <strong>${AVG_SAVES}</strong> — no rush, just the tracks that really hit.`
    } else {
      tally = `You’ve got <strong>${n}</strong> — you’re in good shape. If a few classics are still missing, add them when you feel like it.`
    }
    return `<p style="${p}">${hook} Hit <strong>+</strong> on the charts and they land in <strong>My Tracks</strong> — your queue, whenever you want. Same move quietly shapes the Top 100.</p>
<p style="${pLast}">${tally} Below are ten that are hot right now — if one grabs you, you know what to do.</p>`
  }

  const hola = name ? `Hola, ${name}` : 'Hola'
  const hook =
    n === 0
      ? `${hola}. Te escribo por una de las mejores cosas de la web, y casi no se usa: <strong>tu propia lista de temas</strong>.`
      : `${hola}. Te escribo por <strong>tu lista de temas</strong> — es tuya, y es de lo mejor que hay aquí.`
  let tally
  if (n <= 0) {
    tally = `De momento llevas <strong>cero</strong>. Quien le saca partido suele andar por unas <strong>${AVG_SAVES}</strong>; no es una carrera, es tener a mano lo que te gusta.`
  } else if (n < AVG_SAVES) {
    tally = `Llevas <strong>${n}</strong>. Quien le saca partido suele andar por unas <strong>${AVG_SAVES}</strong>; sin prisa, solo lo que de verdad te va.`
  } else {
    tally = `Llevas <strong>${n}</strong> — vas bien. Si te quedan clásicos fuera, súmelos cuando te apetezca.`
  }
  return `<p style="${p}">${hook} Pulsa el <strong>+</strong> en los charts y quedan en <strong>Mis Tracks</strong>: tu cola, cuando quieras. Ese mismo gesto va ordenando el Top 100.</p>
<p style="${pLast}">${tally} Abajo van diez que ahora suenan fuerte; si alguna te pide el +, ya sabes.</p>`
}

function buildHtml({ greetingName, tracks, artists, draftAs, trackAssets, artistAssets, saveCount }) {
  const bodyEs = introBody(greetingName, saveCount, 'es')
  const bodyEn = introBody(greetingName, saveCount, 'en')
  const draftBar = draftAs
    ? `<tr><td bgcolor="#f7e733" style="padding:10px 16px; border-bottom:3px solid #1a1a1a; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#1a1a1a;">
        <strong>BORRADOR</strong> — saludo como si fueras <strong>${esc(draftAs)}</strong>. Solo va a contacto@optimalbreaks.com.
      </td></tr>`
    : ''
  return `<!DOCTYPE html>
<html lang="es" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office">
<head>
  <meta http-equiv="Content-Type" content="text/html; charset=utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="x-apple-disable-message-reformatting">
  <title>Tus 10 breaks / Your 10 tracks</title>
  <!--[if gte mso 9]><xml><o:OfficeDocumentSettings><o:AllowPNG/><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml><![endif]-->
</head>
<body style="margin:0; padding:0; background-color:#d4c9b8; -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%;">
  <div style="display:none; max-height:0; overflow:hidden; mso-hide:all;">
    Si te apetece, deja tus imprescindibles. / Save what you love — My Tracks, and the Top 100.
  </div>
  <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; background-color:#d4c9b8;">
    <tr>
      <td align="center" style="padding:20px 10px;">
        <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="border-collapse:collapse; width:600px; max-width:600px;">
          <tr><td>${warnStripe()}</td></tr>
          <tr>
            <td align="center" bgcolor="#e8dcc8" style="padding:10px 0 0 0; font-size:0; line-height:0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="border-collapse:collapse;"><tr><td width="88" height="10" bgcolor="#f7e733" style="font-size:0;">&nbsp;</td></tr></table>
            </td>
          </tr>
          <tr>
            <td bgcolor="#e8dcc8" style="border:4px solid #1a1a1a; padding:0;">
              <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                ${draftBar}
                <tr>
                  <td style="padding:22px 18px 6px 18px;">
                    <p style="margin:0 0 2px 0; font-family:Arial Black,Arial,Helvetica,sans-serif; font-size:26px; line-height:0.95; color:#1a1a1a; font-weight:bold;">
                      OPTIMAL<span style="color:#d62828;">BREAKS</span>
                    </p>
                    <p style="margin:8px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:11px; letter-spacing:2px; text-transform:uppercase; color:#4a4238;">Mis Tracks · My Tracks</p>
                  </td>
                </tr>
                <tr>
                  <td style="padding:0;">${langSwitcher()}</td>
                </tr>
                <tr>
                  <td style="padding:14px 18px 18px 18px;">
                    <a name="mail-es" id="mail-es" style="color:inherit; text-decoration:none;"></a>
                    ${bodyEs}
                  </td>
                </tr>
                <tr>
                  <td bgcolor="#ddd3c2" style="padding:16px 18px 18px 18px; border-top:3px solid #1a1a1a;">
                    <a name="mail-en" id="mail-en" style="color:inherit; text-decoration:none;"></a>
                    ${bodyEn}
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 18px 16px 18px;">
                    ${sectionHead('Top 10', 'Charts · + / Save')}
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse; margin-top:0;">
                      <tr><td height="10" style="font-size:0; line-height:0;">&nbsp;</td></tr>
                      ${tracks.map((t, i) => trackRow(t, trackAssets[i])).join('')}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td style="padding:4px 18px 16px 18px;">
                    ${sectionHead('Top 10 artistas', 'Artists')}
                    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="border-collapse:collapse;">
                      <tr><td height="10" style="font-size:0; line-height:0;">&nbsp;</td></tr>
                      ${artists.map((a, i) => artistRow(a, artistAssets[i])).join('')}
                    </table>
                  </td>
                </tr>
                <tr>
                  <td align="center" style="padding:6px 18px 20px 18px;">
                    ${ctaBtn(`${SITE}/es/top100`, 'Top 100')}
                    <p style="margin:14px 0 0 0; font-family:Arial,Helvetica,sans-serif; font-size:12px; color:#4a4238;">
                      <a href="${SITE}/es/charts" style="color:#d62828; font-weight:bold;">ES charts</a>
                      &nbsp;·&nbsp;
                      <a href="${SITE}/en/charts" style="color:#d62828; font-weight:bold;">EN charts</a>
                      &nbsp;·&nbsp;
                      <a href="${SITE}/en/top100" style="color:#1a1a1a; font-weight:bold;">EN Top 100</a>
                    </p>
                  </td>
                </tr>
                <tr>
                  <td bgcolor="#1a1a1a" style="padding:16px 18px;">
                    <p style="margin:0; font-family:Arial,Helvetica,sans-serif; font-size:11px; line-height:1.5; color:#e8dcc8;">
                      Tienes cuenta en Optimal Breaks. Aviso puntual, no newsletter.<br>
                      ¿Baja? Responde con asunto <strong>Baja</strong> a
                      <a href="mailto:contacto@optimalbreaks.com?subject=Baja" style="color:#f7e733;">contacto@optimalbreaks.com</a>.
                      &nbsp;·&nbsp; Unsubscribe: same subject.
                    </p>
                  </td>
                </tr>
              </table>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`
}

function smtpTransport() {
  const host = process.env.SMTP_HOST || 'ssl0.ovh.net'
  const port = Number(process.env.SMTP_PORT || 465)
  const user = process.env.SMTP_USER
  const pass = process.env.SMTP_PASS
  if (!user || !pass) {
    throw new Error('Faltan SMTP_USER / SMTP_PASS en .env.local')
  }
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465 || process.env.SMTP_SECURE === '1',
    auth: { user, pass },
    tls: { rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' },
  })
}

async function uniqueSavesByUser(sb) {
  const counts = new Map()
  for (let from = 0; ; from += 1000) {
    const { data, error } = await sb
      .from('saved_chart_tracks')
      .select('user_id, track_id, track_source')
      .order('id', { ascending: true })
      .range(from, from + 999)
    if (error) throw new Error(error.message)
    const rows = data || []
    for (const s of rows) {
      if (!counts.has(s.user_id)) counts.set(s.user_id, new Set())
      counts.get(s.user_id).add(`${s.track_source}:${s.track_id}`)
    }
    if (rows.length < 1000) break
  }
  const out = new Map()
  for (const [id, set] of counts) out.set(id, set.size)
  return out
}

async function listAudience(sb) {
  const { data: profiles, error } = await sb
    .from('profiles')
    .select('id, display_name, username, role')
  if (error) throw new Error(error.message)
  const { data: authData } = await sb.auth.admin.listUsers({ perPage: 200 })
  const authById = new Map((authData?.users || []).map((u) => [u.id, u]))
  const saves = await uniqueSavesByUser(sb)
  const skipped = { self: 0, unconfirmed: 0, noEmail: 0, overCap: 0 }
  const recipients = []
  for (const p of profiles || []) {
    const auth = authById.get(p.id)
    const email = (auth?.email || '').trim().toLowerCase()
    const n = saves.get(p.id) || 0
    const label = (p.display_name || p.username || email || p.id.slice(0, 8)).trim()
    if (SKIP_EMAILS.has(email) || (p.role === 'admin' && n >= SAVE_CAP)) {
      skipped.self++
      continue
    }
    if (n >= SAVE_CAP) {
      skipped.overCap++
      continue
    }
    if (!email) {
      skipped.noEmail++
      continue
    }
    if (!auth?.email_confirmed_at) {
      skipped.unconfirmed++
      continue
    }
    recipients.push({
      id: p.id,
      email,
      name: firstName(p.display_name || p.username),
      label,
      saves: n,
    })
  }
  recipients.sort((a, b) => a.saves - b.saves || a.label.localeCompare(b.label, 'es'))
  return { recipients, skipped }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function mailPayload(to, html, greetingName, subject, attachments) {
  const from = process.env.SMTP_FROM || `Optimal Breaks <${process.env.SMTP_USER}>`
  const ccRaw = (process.env.SMTP_USER || 'contacto@optimalbreaks.com').trim()
  const cc =
    ccRaw && String(to).trim().toLowerCase() !== ccRaw.toLowerCase() ? ccRaw : undefined
  return {
    from,
    to,
    cc,
    replyTo: process.env.SMTP_USER,
    subject,
    html,
    text: `${greetingName ? `Hola, ${greetingName}` : 'Hola'} / Hi.\n\nMis Tracks: https://www.optimalbreaks.com/es/top100\nMy Tracks: https://www.optimalbreaks.com/en/top100\n`,
    attachments,
    headers: {
      'List-Unsubscribe': `<mailto:contacto@optimalbreaks.com?subject=Baja>`,
    },
  }
}

function toAsset(buf, cid) {
  if (!buf) return { asset: null, attachment: null }
  return {
    asset: { cid, dataUri: `data:image/jpeg;base64,${buf.toString('base64')}` },
    attachment: {
      filename: `${cid}.jpg`,
      content: buf,
      cid,
      contentType: 'image/jpeg',
      contentDisposition: 'inline',
    },
  }
}

async function loadAssets(tracks, artists) {
  const trackAssets = []
  const artistAssets = []
  const attachments = []
  for (let i = 0; i < tracks.length; i++) {
    const buf = await jpegThumb(tracks[i].artwork_url, 128)
    const { asset, attachment } = toAsset(buf, `ob-t${i + 1}@optimalbreaks.com`)
    trackAssets.push(asset)
    if (attachment) attachments.push(attachment)
  }
  for (let i = 0; i < artists.length; i++) {
    const buf = await jpegThumb(artists[i].image_url, 96)
    const { asset, attachment } = toAsset(buf, `ob-a${i + 1}@optimalbreaks.com`)
    artistAssets.push(asset)
    if (attachment) attachments.push(attachment)
  }
  return { trackAssets, artistAssets, attachments }
}

const topRes = await fetch(TOP_API, { headers: { accept: 'application/json' } })
if (!topRes.ok) {
  throw new Error(`No se pudo leer el Top 100 (${topRes.status})`)
}
const top = await topRes.json()
const tracks = (top.top_tracks || []).slice(0, 10)
const artists = (top.top_artists || []).slice(0, 10)
if (!tracks.length) throw new Error('Top 100 vacío')

console.log('Bajando portadas y convirtiendo a JPEG…')
const { trackAssets, artistAssets, attachments } = await loadAssets(tracks, artists)
const okThumbs = attachments.length
console.log(`Portadas listas: ${okThumbs} JPEG incrustados`)

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
const sb = createClient(url, key, { auth: { persistSession: false } })
const { recipients, skipped } = await listAudience(sb)

console.log(
  `Audiencia (no se envía salvo --send): ${recipients.length}  (skip: tú=${skipped.self} ≥${SAVE_CAP}=${skipped.overCap} sin confirmar=${skipped.unconfirmed})`,
)

const htmlForFile = buildHtml({
  greetingName: recipients[0]?.name || '',
  tracks,
  artists,
  saveCount: recipients[0]?.saves ?? 0,
  draftAs: recipients[0]?.label || 'borrador',
  trackAssets: trackAssets.map((a) => (a ? { dataUri: a.dataUri } : null)),
  artistAssets: artistAssets.map((a) => (a ? { dataUri: a.dataUri } : null)),
})
writeFileSync(OUT_HTML, htmlForFile, 'utf8')
console.log(`HTML → ${OUT_HTML}`)

if (dryRun) {
  console.log('Dry-run: no se ha enviado nada.')
  process.exit(0)
}

const transport = smtpTransport()
const subjectLive = 'Tus 10 breaks / Your 10 tracks'

if (isTest) {
  const htmlMail = buildHtml({
    greetingName: recipients[0]?.name || '',
    tracks,
    artists,
    saveCount: recipients[0]?.saves ?? 0,
    draftAs: recipients[0]?.label || 'borrador',
    trackAssets,
    artistAssets,
  })
  const info = await transport.sendMail(
    mailPayload(
      process.env.SMTP_USER,
      htmlMail,
      recipients[0]?.name || '',
      `[BORRADOR] ${subjectLive}`,
      attachments,
    ),
  )
  console.log(`Borrador → ${process.env.SMTP_USER}  messageId=${info.messageId || '—'}`)
  process.exit(0)
}

if (!doSend) process.exit(0)

let ok = 0
let fail = 0
for (let i = 0; i < recipients.length; i++) {
  const r = recipients[i]
  const html = buildHtml({
    greetingName: r.name,
    tracks,
    artists,
    saveCount: r.saves,
    draftAs: null,
    trackAssets,
    artistAssets,
  })
  try {
    const info = await transport.sendMail(mailPayload(r.email, html, r.name, subjectLive, attachments))
    ok++
    console.log(`OK  ${String(r.saves).padStart(3)}  ${r.label}  ${info.messageId || ''}`)
  } catch (err) {
    fail++
    console.error(`FAIL ${r.label}: ${err.message || err}`)
  }
  if (i < recipients.length - 1) await sleep(SEND_GAP_MS)
}
console.log(`Hecho: ${ok} enviados, ${fail} fallos, de ${recipients.length}.`)
