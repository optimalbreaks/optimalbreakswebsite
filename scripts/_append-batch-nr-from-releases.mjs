/**
 * Uso puntual: añade picks a la semana vigente desde URLs Beatport.
 *
 * Modo actual: SOLO añade releases con UNA pista (singles).
 * Los releases con varias pistas se listan al final pero NO se añaden.
 * Acepta URLs /release/... o /track/... (release → lista de pistas desde NEXT_DATA).
 *
 * Ritmo ante Cloudflare / rate-limit: proceso **serie** y pausa configurable
 * entre URLs (evita el patrón "30 requests en paralelo" que dispara protección).
 *   BEATPORT_BATCH_PAUSE_MS — pausa después de cada URL (default 2200).
 *
 * ┌─ Importante — NO es la web en producción ──────────────────────────────────┐
 * │ Este script solo escribe **PICKS_PATH** (JSON en repo). `/charts` lee **     │
 * │ chart_featured_tracks en Supabase**. Tras ejecutar este script (o cualquier│
 * │ cambio manual al mismo JSON), publicar picks en BD con:                     │
 * │   npm run db:chart:featured -- data/charts/picks/YYYY-MM-DD.json             │
 * │ o: node scripts/guia-base-datos.mjs run chart-featured-file <ese-json>       │
 * │ (SSL corporativo: `node --use-system-ca scripts/chart-featured-upsert.mjs`.) │
 * │ Panel admin Tracks → import Beatport ya escribe en BD; no necesita ese paso.│
 * └────────────────────────────────────────────────────────────────────────────┘
 *
 * Borrar tras ejecutar.
 */
// IMPORTANTE — TLS:
//   En redes con SSL inspection (Acttax, VPN/firewall), Node 20+ no usa el
//   truststore del SO por defecto y `fetch` muere con
//   `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ("fetch failed").
//   Lanzar este script SIEMPRE como:
//     node --use-system-ca scripts/_append-batch-nr-from-releases.mjs
//   (npm NO acepta --use-system-ca en NODE_OPTIONS, por eso no usamos npm aquí).
import { readFileSync, writeFileSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const URLS_RAW = `
https://www.beatport.com/es/release/kinetic/6756323
https://www.beatport.com/es/release/military-march/6652196
https://www.beatport.com/es/release/my-apocolypse/6393847
https://www.beatport.com/es/release/tricycle/6024665
https://www.beatport.com/es/release/invisible/5945800
https://www.beatport.com/es/release/fire-startr/5944059
https://www.beatport.com/es/release/can-you/6771072
https://www.beatport.com/es/release/drop/6764610
https://www.beatport.com/es/release/i-dont-kno/6756353
https://www.beatport.com/es/release/explosion/6899683
https://www.beatport.com/es/release/as-as/6897104
https://www.beatport.com/es/release/go/6895706
https://www.beatport.com/es/release/clan-terrie-kynd-remix/6882492
https://www.beatport.com/es/release/xray/6866170
https://www.beatport.com/es/release/pump-the-base/6860382
https://www.beatport.com/es/release/shake-the-room/6859267
https://www.beatport.com/es/track/brand-new-vibe/28548419
https://www.beatport.com/es/track/on-the-floor/28548420
https://www.beatport.com/es/release/rave-funk/6857628
https://www.beatport.com/es/release/sonic-shift/6822466
https://www.beatport.com/es/release/scarlet/6806858
https://www.beatport.com/es/release/foghorns-lasers-bassbins-ep/6800218
https://www.beatport.com/es/release/go-towards-the-light/6795811
https://www.beatport.com/es/release/gotta-crush/6795360
https://www.beatport.com/es/release/heartbeat/6795581
https://www.beatport.com/es/release/days-with-you/6791109
https://www.beatport.com/es/release/the-over-take-mine/6787632
https://www.beatport.com/es/release/shake-it-baby/6787606
https://www.beatport.com/es/release/solar-hallucinate/6783171
https://www.beatport.com/es/release/feels-like/6780433
`

const PICKS_PATH = resolve(ROOT, 'data/charts/picks/2026-05-04.json')

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

let _browser = null
async function getBrowser() {
  if (_browser) return _browser
  let chromium
  let usingPatchright = false
  try {
    ;({ chromium } = await import('patchright'))
    usingPatchright = true
  } catch {
    ;({ chromium } = await import('playwright'))
  }
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ]
  try {
    _browser = await chromium.launch({ channel: 'chrome', headless: true, args })
  } catch (err) {
    console.log(`  ↳ canal chrome no disponible (${(err.message || '').slice(0, 60)}); fallback chromium`)
    _browser = await chromium.launch({ headless: true, args })
  }
  console.log(`  ↳ navegador headless: ${usingPatchright ? 'patchright' : 'playwright'}`)
  return _browser
}
async function closeBrowser() {
  if (_browser) {
    try { await _browser.close() } catch {}
    _browser = null
  }
}

async function fetchHeadless(url) {
  const browser = await getBrowser()
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: url.includes('/es/') ? 'es-ES' : 'en-US',
    viewport: { width: 1366, height: 800 },
    extraHTTPHeaders: {
      'Accept-Language': url.includes('/es/') ? 'es,en-US;q=0.9' : 'en-US,en;q=0.9',
    },
  })
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
    Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en'] })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
  })
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    /** Mismo orden de magnitud que `beatport-top-tracks.mjs` para el challenge de CF */
    const deadline = Date.now() + 180000
    while (Date.now() < deadline) {
      const has = await page
        .evaluate(() => !!document.querySelector('script#__NEXT_DATA__'))
        .catch(() => false)
      if (has) break
      await page.waitForTimeout(1500).catch(() => {})
    }
    const ok = await page
      .evaluate(() => !!document.querySelector('script#__NEXT_DATA__'))
      .catch(() => false)
    if (!ok) throw new Error('__NEXT_DATA__ no apareció')
    return page.content()
  } finally {
    await ctx.close()
  }
}

async function fetchHttp(url) {
  const acceptLang = url.includes('/es/') ? 'es,en-US;q=0.9,en;q=0.8' : 'en-US,en;q=0.9'
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': acceptLang },
    })
    if (!res.ok) {
      if (res.status === 403 || res.status === 503) {
        console.log(`  ↳ HTTP ${res.status} → headless`)
        return fetchHeadless(url)
      }
      throw new Error(`HTTP ${res.status}`)
    }
    return res.text()
  } catch (err) {
    const msg = (err?.message || String(err)).toLowerCase()
    if (
      msg.includes('fetch failed') ||
      msg.includes('econnreset') ||
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('socket')
    ) {
      console.log(`  ↳ fetch fallback → headless (${(err.message || '').slice(0, 60)})`)
      return fetchHeadless(url)
    }
    throw err
  }
}

function extractNextData(html) {
  const idx = html.indexOf('__NEXT_DATA__')
  if (idx === -1) return null
  const start = html.indexOf('>', idx) + 1
  const end = html.indexOf('</script>', start)
  return JSON.parse(html.slice(start, end).trim())
}

function artworkUrl(t) {
  const pick = (img) => {
    if (!img) return ''
    if (img.dynamic_uri)
      return String(img.dynamic_uri).replace(/\{w\}/g, '250').replace(/\{h\}/g, '250')
    if (img.uri) return String(img.uri)
    return ''
  }
  return pick(t?.release?.image) || pick(t?.image) || ''
}

function releaseDateIso(t) {
  const raw = t?.publish_date || t?.new_release_date
  if (!raw) return null
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function pickFromTrackBlob(t) {
  if (!t?.id || !t?.slug) return null
  const artists = (t.artists || [])
    .map((a) => ({ name: (a?.name || '').trim() }))
    .filter((x) => x.name)
  const link_url = `https://www.beatport.com/track/${t.slug}/${t.id}`
  const rd = releaseDateIso(t)
  const y = rd ? Number.parseInt(rd.slice(0, 4), 10) : undefined
  return {
    title: (t.name || '').trim(),
    mix_name: (t.mix_name || '').trim(),
    artists: artists.length ? artists : [{ name: 'Unknown' }],
    label: (t.release?.label?.name || '').trim(),
    platform: 'beatport',
    link_url,
    link_label: '',
    artwork_url: artworkUrl(t),
    sample_url: (t.sample_url || '').trim() || '',
    bpm: typeof t.bpm === 'number' && t.bpm > 0 ? t.bpm : null,
    music_key: (t.key?.name_short || t.key?.name || '').trim(),
    release_year: Number.isFinite(y) && y >= 1970 && y <= 2100 ? y : undefined,
    release_date: rd || undefined,
    note_en: '',
    note_es: '',
  }
}

function findAllTracksFromReleaseNextData(nd) {
  const qs = nd?.props?.pageProps?.dehydratedState?.queries || []
  for (const q of qs) {
    const key0 = Array.isArray(q?.queryKey) ? q.queryKey[0] : ''
    const data = q?.state?.data
    if (!data || typeof data !== 'object') continue
    if (
      (key0 === 'tracks' || /tracks/i.test(String(key0))) &&
      Array.isArray(data.results) &&
      data.results.length &&
      data.results[0]?.id &&
      data.results[0]?.slug
    ) {
      const out = []
      for (const t of data.results) {
        const p = pickFromTrackBlob(t)
        if (p?.title) out.push(p)
      }
      if (out.length) return out
    }
  }
  for (const q of qs) {
    const key0 = Array.isArray(q?.queryKey) ? q.queryKey[0] : ''
    const data = q?.state?.data
    if (typeof key0 === 'string' && /^track-\d+$/.test(key0) && data?.id && data?.slug) {
      const p = pickFromTrackBlob(data)
      if (p?.title) return [p]
    }
  }
  return []
}

function dedupeKey(linkUrl) {
  const n = (linkUrl || '').trim().toLowerCase()
  const m = n.match(/\/track\/[^/]+\/(\d+)/)
  return m ? `beatport:${m[1]}` : n
}

async function fetchTracks(url) {
  const html = await fetchHttp(url)
  const nd = extractNextData(html)
  if (!nd) throw new Error('no __NEXT_DATA__')
  return findAllTracksFromReleaseNextData(nd)
}

const uniqUrls = []
const seenUrls = new Set()
for (const line of URLS_RAW.split('\n')) {
  const t = line.trim()
  if (!t || !t.includes('beatport')) continue
  const c = t.replace(/^http:\/\//i, 'https://')
  if (seenUrls.has(c)) continue
  seenUrls.add(c)
  uniqUrls.push(c)
}

const data = JSON.parse(readFileSync(PICKS_PATH, 'utf8'))
const existing = new Set((data.picks || []).map((p) => dedupeKey(p.link_url)))
let nextSort =
  Math.max(
    0,
    ...(data.picks || []).map((p) =>
      Number.isFinite(Number(p.sort_order)) ? Number(p.sort_order) : 0,
    ),
  ) + 1

let added = 0
const albums = []
const failed = []

const BATCH_PAUSE_MS = Math.max(
  0,
  Number.parseInt(String(process.env.BEATPORT_BATCH_PAUSE_MS || '2200').trim(), 10) || 2200,
)
const total = uniqUrls.length

if (total > 0) {
  console.log(
    `  ↳ Ritmo: 1 URL a la vez, pausa ${BATCH_PAUSE_MS} ms entre cada una ` +
      `(override: BEATPORT_BATCH_PAUSE_MS=3000 ...)`,
  )
}

for (let i = 0; i < uniqUrls.length; i++) {
  const url = uniqUrls[i]
  const idx = i + 1
  console.log(`  [${idx}/${total}] ${url}`)
  try {
    const tracks = await fetchTracks(url)
    if (!tracks.length) {
      console.warn(`    [${idx}/${total}] Sin pistas: ${url}`)
      failed.push({ url, reason: 'sin pistas' })
    } else if (tracks.length > 1) {
      console.log(`    [${idx}/${total}] ⏭️  ÁLBUM (${tracks.length} pistas): ${url}`)
      for (const t of tracks) {
        console.log(`        · ${t.title}${t.mix_name ? ` (${t.mix_name})` : ''}`)
      }
      albums.push({ url, count: tracks.length, titles: tracks.map((t) => t.title) })
    } else {
      const pick = tracks[0]
      const k = dedupeKey(pick.link_url)
      if (existing.has(k)) {
        console.warn(`    [${idx}/${total}] · ya estaba: ${pick.title}`)
      } else {
        existing.add(k)
        pick.sort_order = nextSort++
        data.picks.push(pick)
        added++
        console.log(
          `    [${idx}/${total}] + ${pick.title}${pick.mix_name ? ` (${pick.mix_name})` : ''} — ${(pick.artists || [])
            .map((a) => a.name)
            .join(', ')}`,
        )
      }
    }
  } catch (e) {
    console.error(`    [${idx}/${total}] Fallo: ${url} → ${e.message || e}`)
    failed.push({ url, reason: e.message || String(e) })
  }
  if (i + 1 < uniqUrls.length && BATCH_PAUSE_MS > 0) {
    await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS))
  }
}

if (added > 0) {
  writeFileSync(PICKS_PATH, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
}

console.log(`\n=== RESUMEN ===`)
console.log(`Singles añadidos: ${added}`)
console.log(`Álbumes (varias pistas, NO añadidos): ${albums.length}`)
for (const a of albums) {
  console.log(`  · ${a.url} → ${a.count} pistas`)
}
if (failed.length) {
  console.log(`Fallos: ${failed.length}`)
  for (const f of failed) console.log(`  · ${f.url}: ${f.reason}`)
}
console.log(`Total picks en JSON: ${data.picks.length}`)

await closeBrowser()
