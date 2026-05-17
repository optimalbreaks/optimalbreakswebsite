/**
 * Batch local: nuevos lanzamientos → `data/charts/picks/<lunes>.json` + luego UPSERT a Supabase (no lo hace solo).
 *
 * INVARIANTE (memorízalo igual que tatuaje): cada tema va al JSON cuyo **lunes (`week_date`)**
 * sea el de la **semana ISO del release day que devuelve Beatport** (`publish_date`).
 * Ni la fecha en que pegas URLs ni cuántos mensajes seguidos envíes eligen la carpeta/semana—solo ese release_date
 * (+ override explícito `YYYY-MM-DD URL` por línea, o `NR_BATCH_FALLBACK_WEEK` si falta fecha en scrape).
 *
 * **Semana de destino (no se adivina “la siguiente” en el calendario del repo):**
 *   Por defecto: **lunes de la semana del `release_date` que devuelve Beatport** (`publish_date`), misma idea que
 *   `chartEditionWeekMondayFromPublish` / import admin `featured-import`.
 *   Opcional por línea: `2026-05-25 https://www.beatport.com/es/track/foo/123` fuerza ese lunes de edición.
 *   Sin fecha en Beatport: `NR_BATCH_FALLBACK_WEEK=YYYY-MM-DD` (cualquier día → se corrige al lunes de esa semana).
 *
 * Un mismo pegado puede abrir/rellenar **varios** JSON si los temas caen en lunes distintos.
 *
 * Modo actual: SOLO singles (releases multipista se listan pero no se insertan).
 * Acepta /release/ o /track/.
 *
 * Ritmo ante Cloudflare / rate-limit: proceso **serie** y pausa configurable
 * entre URLs (evita el patrón "30 requests en paralelo" que dispara protección).
 *   BEATPORT_BATCH_PAUSE_MS — pausa después de cada URL (default 2200).
 *   NR_APPEND_FORCE_PLAYWRIGHT=1 — usar solo Playwright (omitir Patchright) si headless cierra al instante con CF.
 *
 * Operativa — **viernes (día de lanzamientos):** Beatport suele ir más cargado; `403`/fallos intermitentes
 * son normales. Si falla todo el día, **reintentar al día siguiente** o subir la pausa; no implica que el script esté roto.
 *
 * ┌─ Importante — NO es la web en producción ──────────────────────────────────┐
 * │ Este script solo escribe JSON(s) por **lunes** detectado (`data/charts/...`).│
 * │ `/charts` lee `chart_featured_tracks`. Tras el batch ejecuta UPSERT por     │
 * │ **cada** fichero tocado (o la guía `chart-featured-file` por archivo):       │
 * │   npm run db:chart:featured -- data/charts/picks/<lunes>.json                │
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
import { readFileSync, writeFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const URLS_RAW = `
`

/** Lunes ISO de la semana del lanzamiento (`src/lib/beatport-next-data-tracks.ts`, misma que admin import). */
function chartEditionWeekMondayFromPublish(isoYYYYMMDD) {
  if (isoYYYYMMDD == null || isoYYYYMMDD === '') return null
  const s = String(isoYYYYMMDD).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

function weekMondayFromOverrideOrFallback(overrideOrDay) {
  if (overrideOrDay == null || String(overrideOrDay).trim() === '') return null
  return chartEditionWeekMondayFromPublish(String(overrideOrDay).trim().slice(0, 10))
}

/** Una URL por línea, o `YYYY-MM-DD URL` como en `/api/admin/featured-import`. */
function parseImportLines(text) {
  const weekRe = /^(\d{4}-\d{2}-\d{2})\s+(https?:\/\/\S+)/i
  const out = []
  const seen = new Set()
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(weekRe)
    let urlRaw
    let weekOverride = null
    if (m) {
      weekOverride = m[1]
      urlRaw = m[2]
    } else if (/^https?:\/\//i.test(t)) {
      urlRaw = t
    } else continue
    const url = urlRaw.replace(/\/+$/, '').replace(/^http:\/\//i, 'https://')
    if (seen.has(url)) continue
    seen.add(url)
    out.push({ weekOverride, url })
  }
  return out
}

function resolveEditionMondayForPick(pick, weekOverride) {
  const fromLine = weekMondayFromOverrideOrFallback(weekOverride)
  if (fromLine) return fromLine
  const fromBeatport = chartEditionWeekMondayFromPublish(pick.release_date)
  if (fromBeatport) return fromBeatport
  const fb =
    process.env.NR_BATCH_FALLBACK_WEEK?.trim() ||
    process.env.PICKS_FALLBACK_WEEK?.trim() ||
    ''
  return weekMondayFromOverrideOrFallback(fb)
}

function loadOrInitPicksFile(weekMonday) {
  const path = resolve(ROOT, 'data/charts/picks', `${weekMonday}.json`)
  if (!existsSync(path)) {
    return { path, data: { week_date: weekMonday, picks: [] } }
  }
  const data = JSON.parse(readFileSync(path, 'utf8'))
  const wd = data.week_date
  if (wd !== weekMonday) {
    console.warn(
      `  ⚠ JSON ${weekMonday}.json tiene week_date=${wd}; normalizamos picks a esta edición.`,
    )
    data.week_date = weekMonday
  }
  if (!Array.isArray(data.picks)) data.picks = []
  return { path, data }
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

async function launchChromiumBrowser() {
  let chromium
  const forcePw = String(process.env.NR_APPEND_FORCE_PLAYWRIGHT || '').trim() === '1'
  if (forcePw) {
    ;({ chromium } = await import('playwright'))
  } else {
    try {
      ;({ chromium } = await import('patchright'))
    } catch {
      ;({ chromium } = await import('playwright'))
    }
  }
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ]
  try {
    return await chromium.launch({ channel: 'chrome', headless: true, args })
  } catch {
    return await chromium.launch({ headless: true, args })
  }
}

async function closeBrowser() {}

/** Quita `/xx/` de locale en path (p. ej. `/es/release/` → `/release/`) — suele mejorar respuestas frente a rutas `/es/`. */
function beatportCanonicalFetchUrl(originalUrl) {
  const u = (originalUrl || '').trim().replace(/^http:\/\//i, 'https://')
  return u.replace(/^(https:\/\/www\.beatport\.com)\/[a-z]{2}\//i, '$1/')
}

async function fetchHeadless(originalUrl) {
  const url = beatportCanonicalFetchUrl(originalUrl)
  const browser = await launchChromiumBrowser()
  try {
    const ctx = await browser.newContext({
      userAgent: UA,
      locale: 'en-US',
      viewport: { width: 1366, height: 800 },
      extraHTTPHeaders: { 'Accept-Language': 'en-US,en;q=0.9' },
    })
    await ctx.addInitScript(() => {
      Object.defineProperty(navigator, 'webdriver', { get: () => false })
      Object.defineProperty(navigator, 'languages', { get: () => ['en-US', 'en'] })
      Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
    })
    const page = await ctx.newPage()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
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
      return await page.content()
    } finally {
      await ctx.close().catch(() => {})
    }
  } finally {
    try {
      await browser.close()
    } catch {}
  }
}

async function fetchHttp(originalUrl) {
  const url = beatportCanonicalFetchUrl(originalUrl)
  /** `Accept-Language` con `es` delante a veces devuelve 403 a `fetch` desde Node frente a Cloudflare. */
  const acceptLang = 'en-US,en;q=0.9'
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': acceptLang },
    })
    if (!res.ok) {
      if (res.status === 403 || res.status === 503) {
        console.log(`  ↳ HTTP ${res.status} → headless`)
        return fetchHeadless(originalUrl)
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
      return fetchHeadless(originalUrl)
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

const importEntries = parseImportLines(URLS_RAW)

const uniqQueue = []
const queueSeenUrl = new Set()
for (const row of importEntries) {
  if (!/beatport\.com/i.test(row.url || '')) continue
  const u = String(row.url).replace(/^http:\/\//i, 'https://').replace(/\/+$/, '')
  if (queueSeenUrl.has(u)) continue
  queueSeenUrl.add(u)
  uniqQueue.push({ url: u, weekOverride: row.weekOverride })
}

/** @typedef {{ path: string, data: Record<string, unknown>, dirty: boolean, existingKeys: Set<string>, nextSort: number, addedHere: number }} WeekState */

const weekStates = new Map()

function ensureWeek(monday) {
  if (!weekStates.has(monday)) {
    const { path, data } = loadOrInitPicksFile(monday)
    const existingKeys = new Set((data.picks || []).map((p) => dedupeKey(p.link_url)))
    const nextSort =
      Math.max(
        0,
        ...(data.picks || []).map((p) =>
          Number.isFinite(Number(p.sort_order)) ? Number(p.sort_order) : 0,
        ),
      ) + 1
    weekStates.set(monday, {
      path,
      data,
      dirty: false,
      existingKeys,
      nextSort,
      addedHere: 0,
    })
  }
  return weekStates.get(monday)
}

let addedSinglesTotal = 0
const albums = []
const failed = []

const BATCH_PAUSE_MS = Math.max(
  0,
  Number.parseInt(String(process.env.BEATPORT_BATCH_PAUSE_MS || '2200').trim(), 10) || 2200,
)
const total = uniqQueue.length

if (total > 0) {
  console.log(
    `  ↳ Ritmo: 1 URL a la vez, pausa ${BATCH_PAUSE_MS} ms entre cada una ` +
      `(override: BEATPORT_BATCH_PAUSE_MS=3000 …)`,
  )
}

for (let i = 0; i < uniqQueue.length; i++) {
  const { url, weekOverride } = uniqQueue[i]
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
      const monday = resolveEditionMondayForPick(pick, weekOverride)
      if (!monday) {
        const detail =
          'sin release_date en Beatport; usa fecha en línea (YYYY-MM-DD URL) o env NR_BATCH_FALLBACK_WEEK=YYYY-MM-DD'
        console.warn(`    [${idx}/${total}] · ${detail}`)
        failed.push({ url, reason: detail })
      } else {
        const st = ensureWeek(monday)
        const k = dedupeKey(pick.link_url)
        if (st.existingKeys.has(k)) {
          console.warn(
            `    [${idx}/${total}] · ya estaba en ${monday}: ${pick.title}`,
          )
        } else {
          st.existingKeys.add(k)
          pick.sort_order = st.nextSort++
          st.data.picks.push(pick)
          st.dirty = true
          st.addedHere++
          addedSinglesTotal++
          console.log(
            `    [${idx}/${total}] + [${monday}] ${pick.title}${
              pick.mix_name ? ` (${pick.mix_name})` : ''
            } — ${(pick.artists || [])
              .map((a) => a.name)
              .join(', ')}`,
          )
        }
      }
    }
  } catch (e) {
    console.error(`    [${idx}/${total}] Fallo: ${url} → ${e.message || e}`)
    failed.push({ url, reason: e.message || String(e) })
  }
  if (i + 1 < uniqQueue.length && BATCH_PAUSE_MS > 0) {
    await new Promise((r) => setTimeout(r, BATCH_PAUSE_MS))
  }
}

for (const [monday, st] of weekStates) {
  if (st.dirty) {
    writeFileSync(st.path, `${JSON.stringify(st.data, null, 2)}\n`, 'utf8')
    console.log(`  ↳ Guardado picks/${monday}.json (${st.data.picks.length} entradas, +${st.addedHere} nuevos)`)
  }
}

console.log(`\n=== RESUMEN ===`)
console.log(`Singles añadidos (suma todas las semanas): ${addedSinglesTotal}`)
if (weekStates.size) {
  console.log(`Semanas tocadas (${weekStates.size}):`)
  for (const monday of [...weekStates.keys()].sort()) {
    const st = weekStates.get(monday)
    console.log(
      `  · ${monday}: archivo ${st.path.split(/[/\\]/).slice(-3).join('/')} picks=${st.data.picks?.length ?? 0} (+${st.addedHere})`,
    )
  }
}
console.log(`Álbumes (varias pistas, NO añadidos): ${albums.length}`)
for (const a of albums) {
  console.log(`  · ${a.url} → ${a.count} pistas`)
}
if (failed.length) {
  console.log(`Fallos: ${failed.length}`)
  for (const f of failed) console.log(`  · ${f.url}: ${f.reason}`)
}

await closeBrowser()
