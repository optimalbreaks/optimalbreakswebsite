// Campañas del admin (/administrator/mailing). Solo servidor.
// Diseño del HTML: docs/GUIA_MAILS.md (fanzine, tablas, Outlook).

import { createHmac, timingSafeEqual } from 'crypto'
import nodemailer from 'nodemailer'
import { createServiceSupabase, fetchAllRows } from '@/lib/supabase-admin'
import { editorialCopy, smtpReady } from '@/lib/transactional-mail'
import { isGpt5Family, openAiChatCompletionsBody, resolveOpenAiModel } from '@/lib/openai-editorial'
import { isAudience, isPreset } from '@/lib/mailing/presets'
import { normalizeTrackCanonicalUrl } from '@/lib/track-canonical-key'
import type {
  MailCampaignAudience,
  MailCampaignPreset,
  MailCampaignRecipientRow,
  MailCampaignRow,
} from '@/types/database'

const SITE = 'https://www.optimalbreaks.com'
const BATCH = 2
const GAP_MS = 800

export { isAudience, isPreset }

function madridYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Madrid', year: 'numeric' }).format(now))
}

export function octoberWindow(now = new Date()): { since: string; until: string; label: string } {
  const year = madridYear(now)
  return { since: `${year}-10-01`, until: `${year}-10-31`, label: `octubre ${year}` }
}

function esc(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function firstName(raw: string): string {
  const word = raw.trim().split(/\s+/)[0]?.replace(/[<>]/g, '') || ''
  return word.length > 24 ? '' : word
}

function hmacSecret(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() || process.env.SMTP_PASS?.trim() || 'ob-mailing'
}

export function unsubscribeToken(email: string): string {
  return createHmac('sha256', hmacSecret()).update(email.trim().toLowerCase()).digest('hex').slice(0, 32)
}

export function unsubscribeUrl(email: string): string {
  const e = encodeURIComponent(email.trim().toLowerCase())
  return `${SITE}/api/mailing/unsubscribe?e=${e}&t=${unsubscribeToken(email)}`
}

export function tokenMatches(email: string, token: string): boolean {
  const expected = unsubscribeToken(email)
  const a = Buffer.from(expected)
  const b = Buffer.from(token.trim())
  if (a.length !== b.length) return false
  return timingSafeEqual(a, b)
}

const FEATURES = [
  { nombre: 'Mis Tracks', url: `${SITE}/es/mi-cuenta/tracks`, que: 'La lista de cada persona. Se monta pulsando + en un tema.' },
  { nombre: 'Top de la comunidad', url: `${SITE}/es/topalltimes`, que: 'Los temas y artistas más guardados. /es/top100 llega al mismo sitio.' },
  { nombre: 'Charts', url: `${SITE}/es/charts`, que: 'New Releases y el resto de listas de la redacción.' },
  { nombre: 'Lanzamientos', url: `${SITE}/es/topreleases`, que: 'Resumen de la quincena, el trimestre y la semana.' },
  { nombre: 'Artistas', url: `${SITE}/es/artists`, que: 'Fichas de artista, con su Top 10 de Beatport.' },
  { nombre: 'Sellos', url: `${SITE}/es/labels`, que: 'Fichas de sello.' },
  { nombre: 'Tu ficha de artista', url: `${SITE}/es/mi-cuenta/artista`, que: 'Reclamar la ficha y, si se aprueba, abrir bookings.' },
  { nombre: 'Almas gemelas', url: `${SITE}/es/mi-cuenta/almas-gemelas`, que: 'Gente con una lista parecida a la tuya.' },
  { nombre: 'Blog', url: `${SITE}/es/blog`, que: 'Piezas de la redacción.' },
  { nombre: 'Agenda', url: `${SITE}/es/events`, que: 'Eventos.' },
  { nombre: 'Sesiones', url: `${SITE}/es/mixes`, que: 'Mixes publicados.' },
  { nombre: 'Parkineo', url: `${SITE}/es/parkineo`, que: 'Sesiones para escuchar en el móvil.' },
]

type TopTrack = {
  puesto: number
  titulo: string
  artistas: string
  sello: string
  url: string
}

type TopArtist = { puesto: number; nombre: string; url: string }

function trackUrl(row: Record<string, unknown>): string {
  const primary = row.primary as { source?: string; id?: string; week_date?: string } | undefined
  const src = primary?.source
  const id = primary?.id
  if (!src || !id) return `${SITE}/es/topalltimes`
  if (src === 'vinyl') return `${SITE}/es/charts?play=vinyl:${encodeURIComponent(id)}`
  if (src === 'chart' || src === 'featured') {
    const params = new URLSearchParams({ play: `${src}:${id}` })
    const week = (primary?.week_date || '').trim()
    if (week) params.set('week', week)
    return `${SITE}/es/charts?${params}`
  }
  if (src === 'beatport_top') {
    const origin = row.beatport_share_origin as { kind?: string; slug?: string } | undefined
    const external = String(row.external_url || '')
    const match = external.match(/beatport\.com\/(?:[a-z]{2}\/)?track\/[^/]+\/(\d+)/i)
    if (origin?.slug && match) {
      const folder = origin.kind === 'label' ? 'labels' : 'artists'
      return `${SITE}/es/${folder}/${origin.slug}?play=beatport:${match[1]}`
    }
  }
  return `${SITE}/es/topalltimes`
}

function asTrack(row: unknown, index: number): TopTrack | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const title = String(r.title || '').trim()
  if (!title) return null
  const artists = Array.isArray(r.artists) ? r.artists.map((a) => String(a)).filter(Boolean).join(', ') : String(r.artists || '')
  return {
    puesto: index + 1,
    titulo: title,
    artistas: artists,
    sello: String(r.label || ''),
    url: trackUrl(r),
  }
}

function asArtist(row: unknown, index: number): TopArtist | null {
  if (!row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const name = String(r.name || '').trim()
  if (!name) return null
  const slug = String(r.slug || '').trim()
  return {
    puesto: index + 1,
    nombre: name,
    url: slug ? `${SITE}/es/artists/${slug}` : `${SITE}/es/topalltimes`,
  }
}

async function fetchTop(since?: string, until?: string): Promise<{ temas: TopTrack[]; artistas: TopArtist[] }> {
  const params = new URLSearchParams({ limit: '10' })
  if (since) params.set('since', since)
  if (until) params.set('until', until)
  const res = await fetch(`${SITE}/api/public/charts/community-monthly?${params}`, {
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`Top de la comunidad ${res.status}`)
  const json = await res.json() as { top_tracks?: unknown[]; top_artists?: unknown[] }
  const temas = (json.top_tracks || []).slice(0, 10).map(asTrack).filter((t): t is TopTrack => !!t)
  const artistas = (json.top_artists || []).slice(0, 10).map(asArtist).filter((a): a is TopArtist => !!a)
  return { temas, artistas }
}

export async function buildMailContext(preset: MailCampaignPreset): Promise<string> {
  const october = octoberWindow()
  const [top10, mes] = await Promise.all([
    fetchTop().catch((err: unknown) => ({ error: err instanceof Error ? err.message : 'top' })),
    fetchTop(october.since, october.until).catch((err: unknown) => ({ error: err instanceof Error ? err.message : 'octubre' })),
  ])
  const context = {
    sitio: SITE,
    preset,
    top10,
    octubre: { etiqueta: october.label, desde: october.since, hasta: october.until, ranking: mes },
    funciones: FEATURES,
    reglas: [
      'No cites número de votos, fans ni escuchas.',
      'No inventes temas, artistas ni URL.',
      'Placeholders literales: {{NOMBRE}} {{SAVES}} {{BAJA_URL}}.',
    ],
  }
  return JSON.stringify(context)
}

const SYSTEM_PROMPT = `Eres quien maqueta los correos de Optimal Breaks (archivo de breakbeat). Devuelves SOLO el HTML del email, sin markdown ni explicación.

El HTML tiene que verse en Outlook de Windows (motor Word):
- Tablas con role="presentation", cellpadding="0", cellspacing="0", border="0".
- Ancho 600 px, centrado (align="center").
- Estilos inline. Sin flex, grid, rgba, position, ni imágenes de fondo CSS.
- Botón = td con bgcolor y un <a> con padding. Sin border-radius.
- Paleta: fondo #d4c9b8, tarjeta #e8dcc8, tinta #1a1a1a, rojo #d62828, cinta #f7e733, texto secundario #4a4238.
- Franja superior de celdas alternas #1a1a1a y #f7e733, no un degradado.
- Marca: OPTIMAL en negro y BREAKS en #d62828.
- Español primero. Debajo, un bloque en inglés con fondo #ddd3c2.
- Párrafos cortos. Cada tema o función es una fila clicable, no un muro de texto.
- El briefing del admin manda. Si pide 10 temas, son los 10 del contexto, en orden, con su URL.
- Anti-invención: temas, artistas, sellos y URL salen de CONTEXTO. Si una lista viene vacía o con "error", no la rellenes.
- No escribas cuántos votos, fans o escuchas tiene un puesto, ni cuánta gente usa la web.
- Saludo con el placeholder literal {{NOMBRE}}. Si hablas de su lista, {{SAVES}}.
- El enlace de baja es exactamente href="{{BAJA_URL}}" con el texto "Darme de baja". Una sola vez, al pie.
- Documento completo: <!DOCTYPE html><html><body>…</body></html>.`

function stripFence(raw: string): string {
  return raw.replace(/^```html?\s*/i, '').replace(/```\s*$/i, '').trim()
}

function ensurePlaceholders(html: string): string {
  let out = html
  if (!out.includes('{{NOMBRE}}')) {
    out = out.replace(
      /<body([^>]*)>/i,
      `<body$1><p style="font-family:Arial,Helvetica,sans-serif;font-size:16px;color:#1a1a1a;">Hola {{NOMBRE}},</p>`,
    )
  }
  if (!out.includes('{{BAJA_URL}}')) {
    const footer = `<p style="font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#4a4238;">Optimal Breaks · <a href="{{BAJA_URL}}" style="color:#1a1a1a;">Darme de baja</a></p>`
    out = /<\/body>/i.test(out) ? out.replace(/<\/body>/i, `${footer}</body>`) : `${out}${footer}`
  }
  return out
}

export async function generateCampaignHtml(briefing: string, preset: MailCampaignPreset): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) throw new Error('OPENAI_API_KEY no configurada')
  const model = resolveOpenAiModel('OPENAI_MAILING_MODEL')
  const context = await buildMailContext(preset)
  const body = openAiChatCompletionsBody({
    model,
    maxCompletionTokens: 16_000,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `BRIEFING:\n${briefing.trim() || '(sin briefing: usa el preset y el contexto)'}\n\nCONTEXTO:\n${context}` },
    ],
  })
  if (isGpt5Family(model)) body.reasoning_effort = 'none'

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(110_000),
  })
  if (!res.ok) {
    const errText = await res.text()
    throw new Error(`OpenAI ${res.status}: ${errText.slice(0, 400)}`)
  }
  const json = await res.json() as { choices?: Array<{ message?: { content?: string } }> }
  const html = ensurePlaceholders(stripFence(String(json.choices?.[0]?.message?.content || '')))
  if (!html.includes('<')) throw new Error('La IA no devolvió HTML. Reintenta.')
  return html
}

function mailButton(href: string, label: string, bg: string, color: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0"><tr><td align="center" bgcolor="${bg}" style="border:3px solid #1a1a1a;"><a href="${href}" style="display:inline-block;padding:10px 16px;font-family:Arial,Helvetica,sans-serif;font-size:14px;font-weight:bold;color:${color};text-decoration:none;">${label}</a></td></tr></table>`
}

function fallbackTemasHtml(): string {
  return `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:#1a1a1a;">Entra en el top, dale al play y al + en lo que te mueva.</p>
    ${mailButton(`${SITE}/es/topalltimes`, 'IR AL TOP', '#d62828', '#ffffff')}`
}

type VoteTrack = {
  puesto: number
  titulo: string
  artistas: string
  sello: string
  year: string
  bpm: string
  clave: string
  artwork: string
  url: string
  keys: string[]
}

let voteTopCache: { at: number; rows: VoteTrack[] } | null = null

function voteTrackFromRow(row: unknown): VoteTrack | null {
  const parsed = asTrack(row, 0)
  if (!parsed || !row || typeof row !== 'object') return null
  const r = row as Record<string, unknown>
  const keys: string[] = []
  const canonical = String(r.canonical_key || '').trim()
  if (canonical) keys.push(canonical)
  const primary = r.primary as { source?: string; id?: string } | undefined
  if (primary?.source && primary?.id) keys.push(`t:${primary.source}:${primary.id}`)
  const external = normalizeTrackCanonicalUrl(String(r.external_url || ''))
  if (external) keys.push(external)
  const rank = Number(r.rank)
  const bpm = Number(r.bpm)
  const art = String(r.artwork_url || '').trim()
  const year = Number(r.year)
  return {
    puesto: Number.isFinite(rank) && rank > 0 ? rank : parsed.puesto,
    titulo: parsed.titulo,
    artistas: parsed.artistas,
    sello: String(r.label || '').trim(),
    year: Number.isFinite(year) && year > 1900 ? String(year) : '',
    bpm: Number.isFinite(bpm) && bpm > 0 ? String(Math.round(bpm)) : '',
    clave: String(r.music_key || '').trim(),
    artwork: /^https:\/\//i.test(art) ? art : '',
    url: parsed.url,
    keys,
  }
}

async function communityVoteTracks(): Promise<VoteTrack[]> {
  if (voteTopCache && Date.now() - voteTopCache.at < 10 * 60 * 1000) return voteTopCache.rows
  const res = await fetch(`${SITE}/api/public/charts/community-monthly?limit=30`, {
    signal: AbortSignal.timeout(90_000),
  })
  if (!res.ok) throw new Error(`Top ${res.status}`)
  const json = await res.json() as { top_tracks?: unknown[] }
  const rows = (json.top_tracks || []).map(voteTrackFromRow).filter((t): t is VoteTrack => !!t)
  voteTopCache = { at: Date.now(), rows }
  return rows
}

function temasRowsHtml(tracks: VoteTrack[]): string {
  if (tracks.length === 0) {
    return `<p style="margin:0 0 12px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.45;color:#1a1a1a;">El top ya está en tu lista. Sigue por las novedades y vota lo que falte.</p>
      ${mailButton(`${SITE}/es/charts`, 'NOVEDADES', '#d62828', '#ffffff')}`
  }
  const rows = tracks.map((track) => {
    const href = esc(track.url)
    const meta = [track.artistas, track.sello, track.year].filter(Boolean).map((part) => esc(part)).join(' <span style="color:#1a1a1a;">|</span> ')
    const chips: string[] = []
    if (track.bpm) chips.push(`<td bgcolor="#7b2ff7" style="padding:2px 6px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;color:#ffffff;">${esc(track.bpm)}</td>`)
    if (track.clave) chips.push(`<td bgcolor="#0891b2" style="padding:2px 6px;font-family:Arial,Helvetica,sans-serif;font-size:10px;font-weight:bold;color:#ffffff;">${esc(track.clave)}</td>`)
    const chipsHtml = chips.length
      ? `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin-top:6px;"><tr>${chips.join('<td width="4" style="font-size:0;line-height:0;">&nbsp;</td>')}</tr></table>`
      : ''
    const cover = track.artwork
      ? `<a href="${href}"><img src="${esc(track.artwork)}" alt="" width="64" height="64" style="display:block;width:64px;height:64px;border:0;"></a>`
      : '&nbsp;'
    return `<tr>
      <td style="padding:0 0 8px;">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="border:3px solid #1a1a1a;background:#fffdf8;">
          <tr>
            <td width="48" align="center" valign="middle" bgcolor="#f7e733" style="border-right:3px solid #1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:20px;font-weight:900;color:#1a1a1a;">${track.puesto}</td>
            <td width="64" valign="middle" bgcolor="#1a1a1a" style="border-right:3px solid #1a1a1a;font-size:0;line-height:0;">${cover}</td>
            <td valign="middle" style="padding:8px 10px;">
              <a href="${href}" style="font-family:Arial,Helvetica,sans-serif;font-size:14px;line-height:1.25;font-weight:bold;color:#1a1a1a;text-decoration:none;">${esc(track.titulo)}</a>
              ${meta ? `<br><span style="font-family:Arial,Helvetica,sans-serif;font-size:12px;line-height:1.35;color:#4a4238;">${meta}</span>` : ''}
              ${chipsHtml}
            </td>
            <td width="40" align="center" valign="middle" bgcolor="#f7e733" style="border-left:3px solid #1a1a1a;">
              <a href="${href}" title="Play" style="font-family:Arial,Helvetica,sans-serif;font-size:16px;font-weight:bold;color:#1a1a1a;text-decoration:none;">&#9654;</a>
            </td>
            <td width="40" align="center" valign="middle" bgcolor="#ffffff" style="border-left:3px solid #1a1a1a;">
              <a href="${href}" title="Votar" style="font-family:Arial,Helvetica,sans-serif;font-size:22px;font-weight:bold;color:#1a1a1a;text-decoration:none;line-height:1;">+</a>
            </td>
          </tr>
        </table>
      </td>
    </tr>`
  }).join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">${rows}</table>`
}

/** Temas del top que esta persona no tiene en Mis Tracks. Sin userId, el top tal cual (quien no ha votado). */
export async function temasHtmlForUser(userId: string | null): Promise<string> {
  try {
    const tops = await communityVoteTracks()
    if (!userId) return temasRowsHtml(tops.slice(0, 5))
    const svc = createServiceSupabase()
    const saved = await fetchAllRows<{ track_source: string; track_id: string; canonical_url: string | null }>((from, to) =>
      svc.from('saved_chart_tracks').select('track_source, track_id, canonical_url').eq('user_id', userId).order('id').range(from, to),
    )
    if (saved.error) throw new Error(saved.error.message)
    const mine = new Set<string>()
    for (const row of saved.data) {
      mine.add(`t:${row.track_source}:${row.track_id}`)
      const key = normalizeTrackCanonicalUrl(row.canonical_url)
      if (key) mine.add(key)
    }
    const pending = tops.filter((track) => !track.keys.some((key) => mine.has(key))).slice(0, 5)
    return temasRowsHtml(pending)
  } catch (err) {
    console.warn('[mailing] temas', err instanceof Error ? err.message : err)
    return fallbackTemasHtml()
  }
}

export function personalize(html: string, opts: { name: string; email: string; saves: number; draft?: boolean; temas?: string }): string {
  const nombre = firstName(opts.name) || 'tú'
  let out = html
    .replaceAll('{{TEMAS}}', opts.temas || fallbackTemasHtml())
    .replaceAll('{{NOMBRE}}', esc(nombre))
    .replaceAll('{{SAVES}}', String(opts.saves))
    .replaceAll('{{BAJA_URL}}', esc(unsubscribeUrl(opts.email)))
  if (opts.draft) {
    const bar = `<tr><td bgcolor="#f7e733" style="padding:10px 16px;border-bottom:3px solid #1a1a1a;font-family:Arial,Helvetica,sans-serif;font-size:12px;color:#1a1a1a;"><strong>BORRADOR</strong> — solo va a contacto@. Así se vería el envío.</td></tr>`
    out = /<body[^>]*>/i.test(out)
      ? out.replace(/<body[^>]*>/i, (tag) => `${tag}<table role="presentation" width="100%"><tbody>${bar}</tbody></table>`)
      : bar + out
  }
  return out
}

function htmlToText(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 4000)
}

function createTransport() {
  const host = process.env.SMTP_HOST || 'ssl0.ovh.net'
  const port = Number(process.env.SMTP_PORT || 465)
  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465 || process.env.SMTP_SECURE === '1',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    connectionTimeout: 8000,
    greetingTimeout: 8000,
    socketTimeout: 15000,
    tls: { rejectUnauthorized: process.env.NODE_TLS_REJECT_UNAUTHORIZED !== '0' },
  })
}

const SKIP_EMAILS = new Set(
  ['contacto@optimalbreaks.com', 'contacto@eskaladigital.com', (process.env.SMTP_USER || '').trim().toLowerCase()].filter(Boolean),
)

export type AudiencePerson = {
  user_id: string
  email: string
  display_name: string
  save_count: number
}

export async function listAudience(audience: MailCampaignAudience): Promise<AudiencePerson[]> {
  const svc = createServiceSupabase()
  const [profilesRes, savesRes, suppressedRes] = await Promise.all([
    fetchAllRows<{ id: string; display_name: string | null }>((from, to) =>
      svc.from('profiles').select('id, display_name').order('id').range(from, to),
    ),
    fetchAllRows<{ user_id: string }>((from, to) =>
      svc.from('saved_chart_tracks').select('user_id').order('id').range(from, to),
    ),
    svc.from('mail_suppressions').select('email'),
  ])
  if (profilesRes.error) throw new Error(profilesRes.error.message)
  if (savesRes.error) throw new Error(savesRes.error.message)
  if (suppressedRes.error) throw new Error(suppressedRes.error.message)

  const names = new Map(profilesRes.data.map((p) => [p.id, (p.display_name || '').trim()]))
  const counts = new Map<string, number>()
  for (const row of savesRes.data) counts.set(row.user_id, (counts.get(row.user_id) || 0) + 1)
  const blocked = new Set((suppressedRes.data || []).map((r) => r.email.trim().toLowerCase()))

  const people: AudiencePerson[] = []
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await svc.auth.admin.listUsers({ page, perPage: 200 })
    if (error) throw new Error(error.message)
    const users = data.users || []
    for (const user of users) {
      const email = (user.email || '').trim().toLowerCase()
      if (!email || !user.email_confirmed_at) continue
      if (SKIP_EMAILS.has(email) || blocked.has(email)) continue
      const saveCount = counts.get(user.id) || 0
      if (audience === 'sin_lista' && saveCount !== 0) continue
      if (audience === 'lista_corta' && (saveCount < 1 || saveCount >= 100)) continue
      if (audience === 'con_lista' && saveCount < 1) continue
      people.push({
        user_id: user.id,
        email,
        display_name: names.get(user.id) || '',
        save_count: saveCount,
      })
    }
    if (users.length < 200) break
  }
  people.sort((a, b) => a.email.localeCompare(b.email))
  return people
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function sendOne(opts: {
  to: string
  subject: string
  html: string
  draft?: boolean
}): Promise<string | null> {
  if (!smtpReady()) throw new Error('SMTP sin configurar')
  const transport = createTransport()
  const cc = editorialCopy(opts.to)
  const info = await transport.sendMail({
    from: process.env.SMTP_FROM || `Optimal Breaks <${process.env.SMTP_USER}>`,
    to: opts.to,
    cc: cc || undefined,
    replyTo: process.env.SMTP_USER || 'contacto@optimalbreaks.com',
    subject: opts.subject,
    html: opts.html,
    text: htmlToText(opts.html),
    headers: {
      'List-Unsubscribe': `<mailto:${process.env.SMTP_USER || 'contacto@optimalbreaks.com'}?subject=Baja>, <${unsubscribeUrl(opts.to)}>`,
      'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
    },
  })
  return info.messageId || null
}

export async function sendTest(campaign: MailCampaignRow): Promise<void> {
  const to = (process.env.SMTP_USER || 'contacto@optimalbreaks.com').trim()
  if (!campaign.html_content.trim()) throw new Error('No hay HTML')
  const temas = await temasHtmlForUser(null)
  const html = personalize(campaign.html_content, { name: 'Narciso', email: to, saves: 0, draft: true, temas })
  await sendOne({ to, subject: `[BORRADOR] ${campaign.subject}`, html, draft: true })
}

export async function tickCampaign(campaignId: string): Promise<{ sent: number; failed: number; pending: number; done: boolean; paused: boolean }> {
  const svc = createServiceSupabase()
  const { data: campaign, error } = await svc.from('mail_campaigns').select('*').eq('id', campaignId).single()
  if (error || !campaign) throw new Error(error?.message || 'Campaña no encontrada')
  const row = campaign as MailCampaignRow
  if (row.status !== 'sending' || row.is_paused) {
    const pending = await countStatus(campaignId, 'pending')
    return { sent: 0, failed: 0, pending, done: false, paused: true }
  }
  if (!row.html_content.trim()) throw new Error('No hay HTML')

  const { data: pendingRows, error: pendingErr } = await svc
    .from('mail_campaign_recipients')
    .select('*')
    .eq('campaign_id', campaignId)
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH)
  if (pendingErr) throw new Error(pendingErr.message)
  const batch = (pendingRows || []) as MailCampaignRecipientRow[]
    if (batch.length === 0) {
    await svc.from('mail_campaigns').update({
      status: 'sent',
      is_paused: false,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', campaignId)
    return { sent: 0, failed: 0, pending: 0, done: true, paused: false }
  }

  const ids = batch.map((r) => r.id)
  const { data: claimed, error: claimErr } = await svc
    .from('mail_campaign_recipients')
    .update({ status: 'sending' })
    .in('id', ids)
    .eq('status', 'pending')
    .select('*')
  if (claimErr) throw new Error(claimErr.message)

  let sent = 0
  let failed = 0
  const claimedRows = (claimed || []) as MailCampaignRecipientRow[]
  for (let i = 0; i < claimedRows.length; i++) {
    const person = claimedRows[i]
    if (!person) continue
    if (i > 0) await sleep(GAP_MS)
    try {
      const temas = row.html_content.includes('{{TEMAS}}')
        ? await temasHtmlForUser(person.user_id)
        : undefined
      const html = personalize(row.html_content, {
        name: person.display_name,
        email: person.email,
        saves: person.save_count,
        temas,
      })
      await sendOne({ to: person.email, subject: row.subject, html })
      await svc.from('mail_campaign_recipients').update({
        status: 'sent',
        sent_at: new Date().toISOString(),
        error_message: null,
      }).eq('id', person.id)
      sent++
    } catch (err) {
      await svc.from('mail_campaign_recipients').update({
        status: 'failed',
        error_message: err instanceof Error ? err.message.slice(0, 500) : 'Error de envío',
      }).eq('id', person.id)
      failed++
    }
  }

  const pending = await countStatus(campaignId, 'pending')
  const stillSending = await countStatus(campaignId, 'sending')
  const done = pending === 0 && stillSending === 0
  await svc.from('mail_campaigns').update({
    status: done ? 'sent' : 'sending',
    completed_at: done ? new Date().toISOString() : null,
    updated_at: new Date().toISOString(),
  }).eq('id', campaignId)
  return { sent, failed, pending, done, paused: false }
}

async function countStatus(campaignId: string, status: MailCampaignRecipientRow['status']): Promise<number> {
  const svc = createServiceSupabase()
  const { count, error } = await svc
    .from('mail_campaign_recipients')
    .select('id', { count: 'exact', head: true })
    .eq('campaign_id', campaignId)
    .eq('status', status)
  if (error) throw new Error(error.message)
  return count || 0
}

export async function recipientCounts(campaignId: string): Promise<Record<string, number>> {
  const svc = createServiceSupabase()
  const { data, error } = await svc
    .from('mail_campaign_recipients')
    .select('status')
    .eq('campaign_id', campaignId)
  if (error) throw new Error(error.message)
  const counts: Record<string, number> = { pending: 0, sending: 0, sent: 0, failed: 0, skipped: 0, total: 0 }
  for (const row of data || []) {
    const status = row.status
    counts[status] = (counts[status] || 0) + 1
    counts.total++
  }
  return counts
}
