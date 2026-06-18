/**
 * OPTIMAL BREAKS — Beatport Top 10 Tracks para artistas y sellos
 *
 * Scrapea la página pública de Beatport de un artista o sello, extrae el
 * bloque "Top Ten Tracks" desde __NEXT_DATA__ y guarda el resultado como
 * JSONB en Supabase (columnas beatport_top_tracks en artists / labels).
 *
 * El slug y el ID numérico deben coincidir con la URL en Beatport — con o sin locale:
 *   https://www.beatport.com/artist/<slug>/<id>
 *   https://www.beatport.com/es/artist/<slug>/<id>
 *   https://www.beatport.com/label/<slug>/<id>
 * Ej.: Deekline → artist/deekline/3171. Si no conoces el ID, abre la ficha
 * del artista o sello en beatport.com y copia los dos últimos segmentos.
 *
 * Uso:
 *   node scripts/beatport-top-tracks.mjs artist yo-speed 526398
 *   node scripts/beatport-top-tracks.mjs label  83       54171
 *   node scripts/beatport-top-tracks.mjs --all-artists     # todos los que tienen beatport_id
 *   node scripts/beatport-top-tracks.mjs --all-labels       # todos los que tienen beatport_id
 *   node scripts/beatport-top-tracks.mjs --all-artists --missing-only  # solo sin Top 10 (vacío/null)
 *   node scripts/beatport-top-tracks.mjs --fill-missing-artists       # ↑ + busca Beatport si falta beatport_id
 *   node scripts/beatport-top-tracks.mjs --fill-missing-artists --limit=30
 *   node scripts/beatport-top-tracks.mjs --dry-run artist yo-speed 526398
 *
 * Documentación en repo: README.md / README.es.md (sección Beatport Top 10).
 * Atajo npm: npm run db:beatport:top -- artist <slug> <beatport_id>
 * Guía: node scripts/guia-base-datos.mjs run beatport-top artist <slug> <id>
 *
 * Credenciales (.env.local):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY)
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
function parseEnvText(text) {
  const out = {}
  let t0 = text
  if (t0.charCodeAt(0) === 0xfeff) t0 = t0.slice(1)
  for (const line of t0.split('\n')) {
    let t = line.trim()
    if (t.startsWith('export ')) t = t.slice(7).trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1)
    out[k] = v
  }
  return out
}

function loadEnv() {
  const base = existsSync(join(ROOT, '.env')) ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8')) : {}
  const local = existsSync(join(ROOT, '.env.local')) ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8')) : {}
  for (const [k, v] of Object.entries({ ...base, ...local })) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnv()

// ---------------------------------------------------------------------------
// Supabase
// ---------------------------------------------------------------------------
function requireSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim()
  if (!url || !key) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local')
  return createClient(url, key, { auth: { persistSession: false } })
}

// ---------------------------------------------------------------------------
// Beatport fetch helpers (reutiliza patrón de chart-40-breaks.mjs)
// ---------------------------------------------------------------------------
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

/**
 * Modo navegador opcional con Playwright para sortear Cloudflare cuando un fetch
 * directo devuelve 403 (rate-limit / bot management). Se activa con --headless,
 * o automáticamente cuando el fetch HTTP plano falla y BEATPORT_HEADLESS_FALLBACK=1.
 */
let _headlessBrowser = null
async function getHeadlessBrowser() {
  if (_headlessBrowser) return _headlessBrowser
  /**
   * Beatport está protegido por Cloudflare. Para sortear «Just a moment…» se
   * necesita Chrome real (canal `chrome`) y, sobre todo, una IP que Cloudflare
   * no tenga marcada. Tras un batch grande (~200 scrapes) la IP se queda en
   * lista negra varias horas: en ese caso ni `--headless` consigue pasar y hay
   * que reintentar más tarde desde la misma IP o desde otra.
   */
  const { chromium } = await import('playwright')
  const args = [
    '--disable-blink-features=AutomationControlled',
    '--disable-dev-shm-usage',
    '--no-sandbox',
  ]
  try {
    _headlessBrowser = await chromium.launch({ channel: 'chrome', headless: true, args })
  } catch (err) {
    console.log(`  ↳ canal chrome no disponible (${err.message?.slice(0, 80)}); fallback chromium`)
    _headlessBrowser = await chromium.launch({ headless: true, args })
  }
  return _headlessBrowser
}

async function closeHeadlessBrowser() {
  if (_headlessBrowser) {
    try { await _headlessBrowser.close() } catch {}
    _headlessBrowser = null
  }
}

async function fetchBeatportPageHeadless(url) {
  const browser = await getHeadlessBrowser()
  const ctx = await browser.newContext({
    userAgent: UA,
    locale: url.includes('/es/') ? 'es-ES' : 'en-US',
    viewport: { width: 1366, height: 800 },
    extraHTTPHeaders: { 'Accept-Language': url.includes('/es/') ? 'es,en-US;q=0.9' : 'en-US,en;q=0.9' },
  })
  // Anti-detección básica: navigator.webdriver = false, plugins, languages.
  await ctx.addInitScript(() => {
    Object.defineProperty(navigator, 'webdriver', { get: () => false })
    Object.defineProperty(navigator, 'languages', { get: () => ['es-ES', 'es', 'en'] })
    Object.defineProperty(navigator, 'plugins', { get: () => [1, 2, 3, 4, 5] })
  })
  const page = await ctx.newPage()
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
    /** Cloudflare challenge interstitial — bucle largo: el browser real tarda en pasar el reto. */
    const deadline = Date.now() + 180000
    let lastTitle = ''
    while (Date.now() < deadline) {
      const has = await page.evaluate(() => !!document.querySelector('script#__NEXT_DATA__')).catch(() => false)
      if (has) break
      const title = await page.title().catch(() => '')
      if (title !== lastTitle) {
        console.log(`    · esperando challenge — title="${title}"`)
        lastTitle = title
      }
      await page.waitForTimeout(1500).catch(() => {})
    }
    const has = await page.evaluate(() => !!document.querySelector('script#__NEXT_DATA__')).catch(() => false)
    if (!has) {
      const title = await page.title().catch(() => '?')
      throw new Error(`__NEXT_DATA__ no apareció en 180s (title="${title}")`)
    }
    const html = await page.content()
    return html
  } finally {
    await ctx.close()
  }
}

async function fetchBeatportPage(url, { headless = false, autoFallback = false } = {}) {
  if (headless) return fetchBeatportPageHeadless(url)
  const acceptLang = url.includes('/es/') ? 'es,en-US;q=0.9,en;q=0.8' : 'en-US,en;q=0.9'
  const res = await fetch(url, {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html,application/xhtml+xml',
      'Accept-Language': acceptLang,
    },
  })
  if (!res.ok) {
    if (autoFallback && (res.status === 403 || res.status === 503)) {
      console.log(`  ↳ HTTP ${res.status} → reintentando con navegador headless`)
      return fetchBeatportPageHeadless(url)
    }
    throw new Error(`Beatport HTTP ${res.status} for ${url}`)
  }
  return res.text()
}

function extractNextData(html) {
  const marker = '__NEXT_DATA__'
  const idx = html.indexOf(marker)
  if (idx === -1) return null
  const start = html.indexOf('>', idx) + 1
  const end = html.indexOf('</script>', start)
  return JSON.parse(html.slice(start, end).trim())
}

function artworkUrl(img) {
  if (!img) return null
  if (img.dynamic_uri) return String(img.dynamic_uri).replace(/\{w\}/g, '250').replace(/\{h\}/g, '250')
  if (img.uri) return String(img.uri)
  return null
}

/** Hero del artista en geo-media; subimos versión grande al bucket. */
function upscaleBeatportArtistImageUrl(url) {
  if (!url || typeof url !== 'string') return null
  return url.replace(/image_size\/\d+x\d+\//i, 'image_size/1400x1400/')
}

/** Imagen de ficha en dehydratedState (query distinta a top-10-tracks). */
function extractArtistHeroImageFromNextData(nextData, beatportId) {
  if (!nextData || beatportId == null) return null
  const queries = nextData.props?.pageProps?.dehydratedState?.queries || []
  const idStr = String(beatportId)
  for (const q of queries) {
    const keyRaw = Array.isArray(q.queryKey) ? q.queryKey[0] : String(q.queryKey ?? '')
    const key = String(keyRaw)
    if (!key.includes(`artist-${idStr}`)) continue
    if (key.includes('top-10-tracks')) continue
    const u = pickArtistImageFromPayload(q.state?.data, beatportId)
    if (u) return upscaleBeatportArtistImageUrl(u)
  }
  for (const q of queries) {
    const u = pickArtistImageFromPayload(q.state?.data, beatportId)
    if (u) return upscaleBeatportArtistImageUrl(u)
  }
  return null
}

function pickArtistImageFromPayload(node, beatportId, depth = 0) {
  if (depth > 14 || node == null) return null
  if (typeof node !== 'object') return null
  if (Array.isArray(node)) {
    for (const x of node) {
      const u = pickArtistImageFromPayload(x, beatportId, depth + 1)
      if (u) return u
    }
    return null
  }
  const id = node.id ?? node.artist_id
  const idMatch =
    id === beatportId ||
    String(id) === String(beatportId) ||
    (typeof id === 'number' && Number.isFinite(Number(beatportId)) && id === Number(beatportId))
  if (idMatch && node.image) {
    const u = artworkUrl(node.image)
    if (u && /geo-media\.beatport\.com/i.test(u)) return u
  }
  for (const k of Object.keys(node)) {
    const u = pickArtistImageFromPayload(node[k], beatportId, depth + 1)
    if (u) return u
  }
  return null
}

async function maybeUploadArtistPortraitFromBeatport(supabase, obSlug, sourceUrl, { dryRun = false } = {}) {
  if (!sourceUrl || dryRun) return
  const { data: row, error: selErr } = await supabase.from('artists').select('image_url').eq('slug', obSlug).maybeSingle()
  if (selErr) throw new Error(selErr.message)
  const cur = (row?.image_url || '').trim()
  if (cur.startsWith('https://') || cur.startsWith('/images/')) return

  const { uploadArtistPortraitFromUrl } = await import('./lib/upload-artist-portrait-to-storage.mjs')
  const publicUrl = await uploadArtistPortraitFromUrl({ slug: obSlug, sourceUrl, quiet: false })
  const { error: upErr } = await supabase.from('artists').update({ image_url: publicUrl }).eq('slug', obSlug)
  if (upErr) throw new Error(upErr.message)
  console.log(`  ✓ Portrait synced from Beatport → Storage (${obSlug})`)
}

function releaseYear(t) {
  const raw = t.publish_date || t.new_release_date
  if (!raw) return null
  const m = String(raw).match(/^(\d{4})/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  return (y >= 1970 && y <= 2100) ? y : null
}

function releaseDateIso(t) {
  const raw = t.publish_date || t.new_release_date
  if (!raw) return null
  const m = String(raw).trim().match(/^(\d{4}-\d{2}-\d{2})/)
  if (!m) return null
  const y = parseInt(m[1].slice(0, 4), 10)
  return (y >= 1970 && y <= 2100) ? m[1] : null
}

function isTopTracksEmpty(v) {
  if (v == null) return true
  if (!Array.isArray(v)) return true
  return v.length === 0
}

/** Slug en la URL canónica de Beatport (distinto del slug OB en algunos artistas). */
function parseBeatportSlugFromUrl(beatportUrl, kind) {
  if (!beatportUrl || typeof beatportUrl !== 'string') return null
  const re = kind === 'artist'
    ? /\/artist\/([a-z0-9-]+)\/\d+/i
    : /\/label\/([a-z0-9-]+)\/\d+/i
  const m = beatportUrl.match(re)
  return m ? m[1] : null
}

function nameToBeatportSlugGuess(name) {
  return String(name || '')
    .toLowerCase()
    .normalize('NFD').replace(/\p{M}/gu, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function searchBeatportArtistByExactName(displayName, { headless = false } = {}) {
  const q = encodeURIComponent(displayName.trim())
  const searchUrl = `https://www.beatport.com/search?q=${q}`
  let html
  if (headless) {
    try {
      html = await fetchBeatportPage(searchUrl, { headless: true })
    } catch {
      return null
    }
  } else {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    })
    if (!res.ok) return null
    html = await res.text()
  }
  const marker = '__NEXT_DATA__'
  const idx = html.indexOf(marker)
  if (idx === -1) return null
  const start = html.indexOf('>', idx) + 1
  const end = html.indexOf('</script>', start)
  let nd
  try {
    nd = JSON.parse(html.slice(start, end).trim())
  } catch {
    return null
  }
  const queries = nd?.props?.pageProps?.dehydratedState?.queries || []
  const targetLower = displayName.toLowerCase().trim()

  for (const query of queries) {
    const artistsArr = query?.state?.data?.artists?.data || []
    for (const r of artistsArr) {
      const rName = (r.artist_name || r.name || '').toLowerCase().trim()
      const rId = r.artist_id || r.id
      if (rName === targetLower && rId) {
        const nm = r.artist_name || r.name
        const slugBp = (typeof r.slug === 'string' && r.slug.trim())
          ? r.slug.trim().toLowerCase()
          : nameToBeatportSlugGuess(nm)
        const idNum = typeof rId === 'number' ? rId : parseInt(String(rId), 10)
        if (slugBp && Number.isFinite(idNum))
          return { slug: slugBp, id: idNum, name: nm }
      }
    }
    const genericResults = query?.state?.data?.results || []
    for (const r of genericResults) {
      if (r.slug && typeof r.id === 'number') {
        const rName = (r.name || '').toLowerCase().trim()
        if (rName === targetLower)
          return { slug: r.slug, id: r.id, name: r.name }
      }
    }
  }

  const artistPattern = /\/artist\/([a-z0-9-]+)\/(\d+)/gi
  const seen = new Set()
  let match
  while ((match = artistPattern.exec(html)) !== null) {
    const [, aSlug, aId] = match
    if (seen.has(aSlug)) continue
    seen.add(aSlug)
    const cleanSlug = aSlug.replace(/-/g, ' ').toLowerCase()
    const targetClean = displayName.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z0-9 ]/g, '').trim()
    // Solo coincidencia fuerte (evita falsos positivos con partial match)
    if (cleanSlug === targetClean)
      return { slug: aSlug, id: parseInt(aId, 10), name: displayName }
  }

  return null
}

// ---------------------------------------------------------------------------
// Scrape top-10 tracks
// ---------------------------------------------------------------------------

/**
 * @param {'artist'|'label'} type
 * @param {string} slug
 * @param {number} beatportId
 * @returns {Promise<{tracks: object[], beatport_url: string}>}
 */
async function scrapeTopTracks(type, slug, beatportId, { headless = false } = {}) {
  const seg = type === 'artist' ? 'artist' : 'label'
  /** Primero locale ES (ficha p.ej. /es/artist/slug/id), luego sin prefijo (Beatport redirige pero el HTML puede variar). */
  const candidateUrls = [
    `https://www.beatport.com/es/${seg}/${slug}/${beatportId}`,
    `https://www.beatport.com/${seg}/${slug}/${beatportId}`,
  ]

  let lastEmpty = { tracks: [], beatport_url: candidateUrls[0], artistHeroImageUrl: null }
  let lastError = null
  const autoFallback = process.env.BEATPORT_HEADLESS_FALLBACK === '1'

  for (const beatportUrl of candidateUrls) {
    try {
      console.log(`  ↳ Fetching ${beatportUrl}${headless ? ' [headless]' : ''}`)
      const html = await fetchBeatportPage(beatportUrl, { headless, autoFallback })
      const nextData = extractNextData(html)
      if (!nextData) throw new Error('__NEXT_DATA__ not found')

      const queries = nextData.props?.pageProps?.dehydratedState?.queries || []

      const topQuery = queries.find((q) => {
        const key = Array.isArray(q.queryKey) ? q.queryKey[0] : String(q.queryKey ?? '')
        return key.includes(`${type === 'artist' ? 'artist' : 'label'}-${beatportId}-top-10-tracks`)
      })

      if (!topQuery) {
        console.log(`  ↳ No top-10-tracks query for this URL. Keys:`, queries.map(q => JSON.stringify(q.queryKey).slice(0, 100)))
        const hero = type === 'artist' ? extractArtistHeroImageFromNextData(nextData, beatportId) : null
        lastEmpty = { tracks: [], beatport_url: beatportUrl, artistHeroImageUrl: hero }
        continue
      }

      const results = topQuery.state?.data?.results || []
      const tracks = results.map((t, i) => {
        const artists = (t.artists || []).map((a) => ({
          name: a.name,
          beatport_url: `https://www.beatport.com/artist/${a.slug}/${a.id}`,
        }))
        const label = t.release?.label || t.label
        return {
          position: i + 1,
          title: (t.name || '').trim(),
          mix_name: (t.mix_name || '').trim(),
          artists,
          label: label?.name || '',
          bpm: t.bpm || null,
          key: t.key?.name || '',
          beatport_url: `https://www.beatport.com/track/${t.slug}/${t.id}`,
          artwork_url: artworkUrl(t.release?.image) || artworkUrl(t.image),
          sample_url: t.sample_url || null,
          release_year: releaseYear(t),
          release_date: releaseDateIso(t),
        }
      })

      console.log(`  ↳ Parsed ${tracks.length} top tracks`)
      const artistHeroImageUrl = type === 'artist' ? extractArtistHeroImageFromNextData(nextData, beatportId) : null
      return { tracks, beatport_url: beatportUrl, artistHeroImageUrl }
    } catch (err) {
      lastError = err
      console.log(`  ↳ Fallback (${err.message})`)
    }
  }

  if (lastError) console.log(`  ↳ Sin datos Top 10 en ninguna URL; último error: ${lastError.message}`)
  return lastEmpty
}

// ---------------------------------------------------------------------------
// Upsert to Supabase
// ---------------------------------------------------------------------------
async function upsertTopTracks(supabase, table, slug, beatportUrl, beatportId, tracks, extra = {}) {
  const { artistHeroImageUrl = null, dryRun = false } = extra
  const payload = {
    beatport_url: beatportUrl,
    beatport_id: beatportId,
    beatport_top_tracks: tracks,
    beatport_top_tracks_updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from(table).update(payload).eq('slug', slug)
  if (error) throw new Error(`Supabase update ${table}.${slug}: ${error.message}`)
  console.log(`  ✓ ${table}.${slug} updated (${tracks.length} tracks)`)

  if (table === 'artists' && artistHeroImageUrl) {
    await maybeUploadArtistPortraitFromBeatport(supabase, slug, artistHeroImageUrl, { dryRun })
  }
}

// ---------------------------------------------------------------------------
// Batch mode: all artists / labels that have beatport_id set
// ---------------------------------------------------------------------------
async function batchUpdate(supabase, table, dryRun, { missingOnly = false, headless = false } = {}) {
  const { data: rows, error } = await supabase
    .from(table)
    .select('slug, beatport_id, beatport_url, beatport_top_tracks')
    .not('beatport_id', 'is', null)
    .order('slug')
  if (error) throw new Error(`Supabase select ${table}: ${error.message}`)
  if (!rows?.length) { console.log(`  No rows with beatport_id in ${table}`); return }

  const kind = table === 'artists' ? 'artist' : 'label'
  const todo = missingOnly ? rows.filter((r) => isTopTracksEmpty(r.beatport_top_tracks)) : rows
  if (!todo.length) {
    console.log(`\n  ${table}: ninguna fila${missingOnly ? ' sin Top 10' : ''}; nada que hacer.\n`)
    return
  }

  console.log(`\n  ${table}: ${todo.length} filas a procesar${missingOnly ? ' (solo sin lista Top 10)' : ''}\n`)

  for (const row of todo) {
    try {
      const bpSlug = parseBeatportSlugFromUrl(row.beatport_url, kind) || row.slug
      const { tracks, beatport_url, artistHeroImageUrl } = await scrapeTopTracks(kind, bpSlug, row.beatport_id, { headless })
      if (!dryRun) {
        await upsertTopTracks(supabase, table, row.slug, beatport_url, row.beatport_id, tracks, {
          artistHeroImageUrl: kind === 'artist' ? artistHeroImageUrl : null,
          dryRun,
        })
      } else {
        console.log(`  [dry-run] ${row.slug}: ${tracks.length} tracks`)
        if (tracks.length) console.log(`    #1: ${tracks[0].title} — ${tracks[0].artists.map(a => a.name).join(', ')}`)
      }
      await sleep(1500)
    } catch (err) {
      console.error(`  ✗ ${row.slug}: ${err.message}`)
    }
  }
}

async function fillMissingArtists(supabase, dryRun, maxTotal = Infinity, { headless = false, slugFilter = null } = {}) {
  const { data: all, error } = await supabase
    .from('artists')
    .select('slug, name, beatport_id, beatport_url, beatport_top_tracks')
    .order('slug')
  if (error) throw new Error(`Supabase select artists: ${error.message}`)
  let pool = all || []
  if (slugFilter?.length) {
    const want = new Set(slugFilter)
    pool = pool.filter((a) => want.has(a.slug))
  }
  const emptyTop = pool.filter((a) => isTopTracksEmpty(a.beatport_top_tracks))
  const withId = emptyTop.filter((a) => a.beatport_id != null)
  const withoutId = emptyTop.filter((a) => a.beatport_id == null && (a.name || '').trim())

  console.log(`
  Beatport Top 10 — relleno de faltantes (artistas)
  Sin lista o vacío: ${emptyTop.length}
    · con beatport_id: ${withId.length}
    · sin beatport_id (se intentará buscar por nombre exacto): ${withoutId.length}
${Number.isFinite(maxTotal) ? `  Límite de filas procesadas: ${maxTotal}` : ''}
`)

  let processed = 0
  const delays = { afterScrapeMs: 1500, afterSearchMs: 900 }

  for (const row of withId) {
    if (processed >= maxTotal) break
    try {
      const bpSlug = parseBeatportSlugFromUrl(row.beatport_url, 'artist') || row.slug
      console.log(`\n  [${processed + 1}] ${row.slug} (id ${row.beatport_id}) slug BP: ${bpSlug}`)
      const { tracks, beatport_url, artistHeroImageUrl } = await scrapeTopTracks('artist', bpSlug, row.beatport_id, { headless })
      if (!dryRun) {
        await upsertTopTracks(supabase, 'artists', row.slug, beatport_url, row.beatport_id, tracks, {
          artistHeroImageUrl,
          dryRun,
        })
      } else {
        console.log(`  [dry-run] ${row.slug}: ${tracks.length} tracks`)
      }
      processed++
      await sleep(delays.afterScrapeMs)
    } catch (err) {
      console.error(`  ✗ ${row.slug}: ${err.message}`)
    }
  }

  for (const row of withoutId) {
    if (processed >= maxTotal) break
    try {
      const nm = row.name.trim()
      process.stdout.write(`\n  [${processed + 1}] ${row.slug} — buscar «${nm}» en Beatport...`)
      const bp = await searchBeatportArtistByExactName(nm, { headless })
      if (!bp) {
        console.log(' ✗ sin coincidencia exacta')
        await sleep(delays.afterSearchMs)
        continue
      }
      console.log(` → artist/${bp.slug}/${bp.id}`)
      const { tracks, beatport_url, artistHeroImageUrl } = await scrapeTopTracks('artist', bp.slug, bp.id, { headless })
      if (!dryRun) {
        if (tracks.length) {
          await upsertTopTracks(supabase, 'artists', row.slug, beatport_url, bp.id, tracks, {
            artistHeroImageUrl,
            dryRun,
          })
        } else {
          const { error: upErr } = await supabase.from('artists').update({
            beatport_url,
            beatport_id: bp.id,
            beatport_top_tracks: [],
            beatport_top_tracks_updated_at: new Date().toISOString(),
          }).eq('slug', row.slug)
          if (upErr) throw new Error(upErr.message)
          console.log(`  ✓ artists.${row.slug}: sin Top 10 en Beatport; guardados id/url`)
        }
      } else {
        console.log(`  [dry-run] tracks: ${tracks.length}`)
      }
      processed++
      await sleep(delays.afterScrapeMs)
    } catch (err) {
      console.error(`  ✗ ${row.slug}: ${err.message}`)
    }
  }

  console.log(`\n  Hecho — operaciones ejecutadas / intentadas: ${processed}`)
}

function parseLimitArg(filtered) {
  const raw = filtered.find((a) => a.startsWith('--limit='))
  if (!raw) return Infinity
  const n = parseInt(raw.split('=')[1], 10)
  return Number.isFinite(n) && n > 0 ? n : Infinity
}

function parseSlugsArg(filtered) {
  const raw = filtered.find((a) => a.startsWith('--slugs='))
  if (!raw) return null
  return raw
    .slice('--slugs='.length)
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
}

function stripLimitArg(filtered) {
  return filtered.filter((a) => !a.startsWith('--limit=') && !a.startsWith('--slugs='))
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  let filtered = args.filter(a => a !== '--dry-run')
  const missingOnly = filtered.includes('--missing-only')
  filtered = filtered.filter((a) => a !== '--missing-only')
  const headless = filtered.includes('--headless')
  filtered = filtered.filter((a) => a !== '--headless')

  const maxTotal = parseLimitArg(filtered)
  const slugFilter = parseSlugsArg(filtered)
  filtered = stripLimitArg(filtered)

  if (filtered.includes('--all-artists')) {
    filtered = filtered.filter((a) => a !== '--all-artists')
    if (filtered.length) {
      console.error('Argumentos extra tras --all-artists:', filtered.join(' '))
      process.exit(1)
    }
    const supabase = requireSupabase()
    return batchUpdate(supabase, 'artists', dryRun, { missingOnly, headless })
  }
  if (filtered.includes('--all-labels')) {
    filtered = filtered.filter((a) => a !== '--all-labels')
    if (filtered.length) {
      console.error('Argumentos extra tras --all-labels:', filtered.join(' '))
      process.exit(1)
    }
    const supabase = requireSupabase()
    return batchUpdate(supabase, 'labels', dryRun, { missingOnly, headless })
  }

  if (filtered.includes('--fill-missing-artists')) {
    filtered = filtered.filter((a) => a !== '--fill-missing-artists')
    if (filtered.length) {
      console.error('Argumentos extra tras --fill-missing-artists:', filtered.join(' '))
      process.exit(1)
    }
    const supabase = requireSupabase()
    return fillMissingArtists(supabase, dryRun, maxTotal, { headless, slugFilter })
  }

  if (filtered.length < 3) {
    console.log(`
  OPTIMAL BREAKS — Beatport Top 10 Tracks

  Uso:
    node scripts/beatport-top-tracks.mjs artist <slug> <beatport_id> [--headless]
    node scripts/beatport-top-tracks.mjs label  <slug> <beatport_id> [--headless]
    node scripts/beatport-top-tracks.mjs --all-artists [--missing-only] [--headless] [--dry-run]
    node scripts/beatport-top-tracks.mjs --all-labels [--missing-only] [--headless] [--dry-run]
    node scripts/beatport-top-tracks.mjs --fill-missing-artists [--limit=N] [--headless] [--dry-run]

  --headless: usa Playwright + Chromium (resiste el muro Cloudflare cuando el
  fetch HTTP plano devuelve 403). Requiere "npm i -D playwright" + "npx playwright install chromium".
  También se puede activar fallback automático con BEATPORT_HEADLESS_FALLBACK=1.

  Ejemplo:
    node scripts/beatport-top-tracks.mjs artist yo-speed 526398
    node scripts/beatport-top-tracks.mjs label  83       54171
`)
    process.exit(0)
  }

  const [type, slug, idStr] = filtered
  if (type !== 'artist' && type !== 'label') {
    console.error(`  ✗ Tipo debe ser 'artist' o 'label', recibido: ${type}`)
    process.exit(1)
  }

  const beatportId = parseInt(idStr, 10)
  if (!Number.isFinite(beatportId)) {
    console.error(`  ✗ beatport_id no es numérico: ${idStr}`)
    process.exit(1)
  }

  console.log(`\n  Beatport Top 10 — ${type}: ${slug} (id ${beatportId})${dryRun ? ' [DRY-RUN]' : ''}${headless ? ' [HEADLESS]' : ''}\n`)

  const { tracks, beatport_url, artistHeroImageUrl } = await scrapeTopTracks(type, slug, beatportId, { headless })

  for (const t of tracks) {
    const artists = t.artists.map(a => a.name).join(', ')
    console.log(`  #${t.position} ${t.title}${t.mix_name ? ` (${t.mix_name})` : ''} — ${artists} [${t.label}] ${t.sample_url ? '🔊' : ''}`)
  }

  if (!dryRun) {
    const supabase = requireSupabase()
    const table = type === 'artist' ? 'artists' : 'labels'
    await upsertTopTracks(supabase, table, slug, beatport_url, beatportId, tracks, {
      artistHeroImageUrl: type === 'artist' ? artistHeroImageUrl : null,
      dryRun,
    })
  } else {
    console.log(`\n  [dry-run] No se escribe en BD`)
  }
}

main()
  .then(() => closeHeadlessBrowser())
  .catch(async (err) => {
    console.error(`\n  ✗ Error: ${err.message}`)
    await closeHeadlessBrowser()
    process.exit(1)
  })
