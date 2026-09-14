/**
 * OPTIMAL BREAKS — Picks «New releases» por semana (chart_featured_tracks)
 *
 * Este script **UPSERT creyendo la `week_date` del JSON** (lunes editorial). Quien genera ese JSON debe
 * respetar el invariante: **misma semana que la fecha de release del tema en la tienda**
 * (`release_date` en JSON; típico Beatport vía scrape). Agrupación por mes/chat/sucesión arbitraria NO.
 *
 * Por defecto solo lee el JSON. Opcionalmente obtiene `release_date` (YYYY-MM-DD)
 * desde la tienda: Beatport (__NEXT_DATA__) o Bandcamp (`data-tralbum` → album_release_date).
 * En Beatport, si faltan, también rellena `bpm`, `music_key` y `sample_url` (Playwright si Cloudflare 403).
 * No pisa `full_audio_url` ni artwork editorial.
 *
 *   node scripts/chart-featured-upsert.mjs data/charts/picks/2026-03-30.json
 *   node scripts/chart-featured-upsert.mjs data/charts/picks/2026-04-20.json --create-edition
 *   node scripts/chart-featured-upsert.mjs data/charts/picks/2026-04-27.json --enrich-release-dates --write-json
 *   node scripts/chart-featured-upsert.mjs --backfill-remixer-credits
 *
 * Flags:
 *   --enrich-release-dates    (alias: --enrich-beatport-dates) Rellena `release_date` vía URL del pick.
 *                             En Beatport: también bpm / music_key / sample_url si están vacíos.
 *   --write-json              Tras enriquecer, guarda de nuevo el JSON (pretty-print).
 *   --force-release-dates     (alias: --force-beatport-dates) Fuerza refetch aunque ya haya fecha válida.
 *   --backfill-remixer-credits  Sin JSON: UPDATE `artists[]` en filas vivas (featured + 40 Breaks + vinyl) y reescribe `data/charts/picks/*.json`. Mismos UUID.
 *
 * NOTA — «eliminados» en el log: solo se borran filas de chart_featured_tracks de ESTA semana
 * que ya no están en el JSON (no se borran artistas, chart_tracks 40 Breaks ni otras tablas).
 *
 * Formato JSON:
 * {
 *   "week_date": "2026-03-30",
 *   "picks": [
 *     {
 *       "sort_order": 1,
 *       "title": "Título del tema o release",
 *       "artists": [{ "name": "Artista", "url": "https://…" }],
 *       "label": "Sello",
 *       "platform": "beatport",
 *       "link_url": "https://…",
 *       "link_label": "",
 *       "artwork_url": "https://…",
 *       "sample_url": "https://geo-samples.beatport.com/…mp3",
 *       "mix_name": "Original Mix",
 *       "bpm": 135,
 *       "music_key": "G Minor",
 *       "release_year": 2026,
 *       "release_date": "2026-04-18",
 *       "spotify_url": "https://open.spotify.com/track/…",   // opcional; normal: lo rellena spotify-match-charts.mjs
 *       "note_en": "",
 *       "note_es": ""
 *     }
 *   ]
 * }
 *
 * platform: beatport | bandcamp | soundcloud | other (solo afecta al texto del botón si link_label vacío)
 *
 * Deduplicación: si repites el mismo link (o el mismo id numérico en URL de track Beatport),
 * se omite la segunda entrada y se avisa por consola. También se avisa si varios picks
 * comparten la misma artwork_url (típico: varios cortes de un EP).
 *
 * Requiere .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Por defecto la fila chart_editions con ese week_date debe existir. Con --create-edition
 * se inserta una edición publicada mínima (igual que chart-vinyl-upsert) si aún no hay fila.
 */

import { readFileSync, writeFileSync, existsSync, readdirSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { extractRemixerNames, mergeArtistCreditObjects } from './lib/remixer-credits.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

function loadEnv() {
  const base = existsSync(join(ROOT, '.env'))
    ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8'))
    : {}
  const local = existsSync(join(ROOT, '.env.local'))
    ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8'))
    : {}
  const merged = { ...base, ...local }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnv()

/** URL comparable: host/path en minúsculas, sin barra final. */
function normalizeFeaturedLinkUrl(raw) {
  let u = (raw || '').trim()
  if (!u) return ''
  u = u.replace(/^http:\/\//i, 'https://')
  u = u.replace(/^https:\/\/(www\.)?beatport\.com/i, 'https://www.beatport.com')
  u = u.replace(/\/+$/, '')
  return u.toLowerCase()
}

/**
 * Clave de deduplicación: para /track/.../id de Beatport usamos el id numérico
 * (evita duplicar el mismo tema con variantes de URL).
 */
function dedupeKeyForFeaturedLink(linkUrl) {
  const n = normalizeFeaturedLinkUrl(linkUrl)
  const m = n.match(/\/track\/[^/]+\/(\d+)$/)
  if (m) return `beatport:${m[1]}`
  return n || linkUrl
}

function warnSharedArtworkClusters(rows) {
  const byArt = new Map()
  for (const r of rows) {
    const art = (r.artwork_url || '').trim()
    if (!art) continue
    const list = byArt.get(art) ?? []
    list.push(`${r.title}${r.mix_name ? ` (${r.mix_name})` : ''}`)
    byArt.set(art, list)
  }
  for (const [, titles] of byArt) {
    if (titles.length < 2) continue
    console.warn(
      '  ⚠ Misma carátula en varios picks (suelen ser cortes del mismo EP). Revisa si quieres solo uno:',
      titles.join(' · '),
    )
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function beatportCanonicalFetchUrl(originalUrl) {
  const u = (originalUrl || '').trim().replace(/^http:\/\//i, 'https://')
  return u.replace(/^(https:\/\/www\.beatport\.com)\/[a-z]{2}\//i, '$1/')
}

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

async function fetchBeatportHeadless(originalUrl) {
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

async function fetchBeatportHtml(originalUrl) {
  const url = beatportCanonicalFetchUrl(originalUrl)
  try {
    const res = await fetch(url, {
      headers: {
        'User-Agent': UA,
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) {
      if (res.status === 403 || res.status === 503) {
        console.log(`     ↳ HTTP ${res.status} → headless`)
        return fetchBeatportHeadless(originalUrl)
      }
      throw new Error(`HTTP ${res.status}`)
    }
    const html = await res.text()
    if (!html.includes('__NEXT_DATA__') || /Just a moment/i.test(html)) {
      console.log('     ↳ Cloudflare / sin NEXT_DATA → headless')
      return fetchBeatportHeadless(originalUrl)
    }
    return html
  } catch (err) {
    const msg = (err?.message || String(err)).toLowerCase()
    if (
      msg.includes('fetch failed') ||
      msg.includes('econnreset') ||
      msg.includes('network') ||
      msg.includes('timeout') ||
      msg.includes('socket')
    ) {
      console.log(`     ↳ fetch fallback → headless (${(err.message || '').slice(0, 60)})`)
      return fetchBeatportHeadless(originalUrl)
    }
    throw err
  }
}

function extractNextDataJson(html) {
  const marker = '__NEXT_DATA__'
  const idx = html.indexOf(marker)
  if (idx === -1) return null
  const start = html.indexOf('>', idx) + 1
  const end = html.indexOf('</script>', start)
  try {
    return JSON.parse(html.slice(start, end).trim())
  } catch {
    return null
  }
}

function beatportTrackIdFromUrl(url) {
  const m = String(url || '').match(/\/track\/[^/]+\/(\d+)/i)
  return m ? m[1] : null
}

function musicKeyFromBlob(obj) {
  const k = obj?.key
  if (typeof k === 'string' && k.trim()) return k.trim()
  if (k && typeof k === 'object') {
    return String(k.name || k.name_short || k.camelot_name || '').trim()
  }
  if (typeof obj?.key_name === 'string' && obj.key_name.trim()) return obj.key_name.trim()
  if (typeof obj?.musical_key === 'string' && obj.musical_key.trim()) return obj.musical_key.trim()
  return ''
}

function normalizeTrackDetailsBlob(data) {
  if (!data || typeof data !== 'object') return null
  if (data.id && (data.slug || data.key || data.bpm || data.sample_url)) return data
  const trackId = data.track_id
  if (!trackId) return null
  return {
    id: trackId,
    bpm: data.bpm,
    key: data.key,
    key_name: data.key_name,
    musical_key: data.musical_key,
    sample_url: data.sample_url,
    mix_name: data.mix_name,
    publish_date: data.publish_date || data.new_release_date || data.release?.release_date,
    new_release_date: data.new_release_date,
    release: data.release,
  }
}

function dateFromBlob(obj) {
  const raw =
    obj?.publish_date ||
    obj?.new_release_date ||
    obj?.release?.release_date ||
    obj?.release?.publish_date
  if (typeof raw !== 'string') return null
  const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

function metaFromTrackBlob(obj) {
  if (!obj || typeof obj !== 'object') return null
  const bpmRaw = obj.bpm
  const bpmNum = Number(bpmRaw)
  const bpm = Number.isFinite(bpmNum) && bpmNum > 0 ? bpmNum : null
  const music_key = musicKeyFromBlob(obj)
  const sample_url = typeof obj.sample_url === 'string' ? obj.sample_url.trim() : ''
  const date = dateFromBlob(obj)
  if (!date && bpm == null && !music_key && !sample_url) return null
  return {
    date,
    bpm,
    music_key,
    sample_url: sample_url || null,
  }
}

function findBeatportTrackBlob(nextData, trackId) {
  const qs = nextData?.props?.pageProps?.dehydratedState?.queries || []
  for (const q of qs) {
    const key0 = Array.isArray(q?.queryKey) ? String(q.queryKey[0] || '') : ''
    const data = q?.state?.data
    if (!data || typeof data !== 'object') continue
    if (typeof key0 === 'string' && /^track-details-\d+$/.test(key0) && data.track_id) {
      const n = normalizeTrackDetailsBlob(data)
      if (n) return n
    }
    if (typeof key0 === 'string' && /^track-\d+$/.test(key0) && data.id) {
      return data
    }
  }
  const found = { blob: null, fallback: null }
  const walk = (node) => {
    if (!node || typeof node !== 'object' || found.blob) return
    if (Array.isArray(node)) {
      for (const x of node) walk(x)
      return
    }
    const id = node.id ?? node.track_id
    const looksLikeTrack = !!(node.sample_url || node.bpm || node.key || node.mix_name)
    if (id != null && String(id) === String(trackId) && looksLikeTrack) {
      found.blob = node
      return
    }
    if (!found.fallback && looksLikeTrack && (node.sample_url || node.key) && node.bpm) {
      found.fallback = node
    }
    for (const v of Object.values(node)) {
      if (v && typeof v === 'object') walk(v)
    }
  }
  walk(nextData)
  return found.blob || found.fallback
}

/** BPM, tonalidad, sample y fecha desde la ficha pública Beatport (__NEXT_DATA__). */
async function fetchBeatportTrackMeta(trackUrl) {
  try {
    const html = await fetchBeatportHtml(trackUrl)
    const nextData = extractNextDataJson(html)
    if (!nextData) return { ok: false, error: 'no __NEXT_DATA__' }
    const trackId = beatportTrackIdFromUrl(trackUrl)
    const blob = findBeatportTrackBlob(nextData, trackId)
    const meta = metaFromTrackBlob(blob)
    if (!meta) return { ok: false, error: 'metadatos de track no encontrados en NEXT_DATA' }
    if (!meta.music_key) {
      const k = blob?.key
      console.log(
        `     ↳ sin tonalidad. key=${JSON.stringify(k)} · campos=${Object.keys(blob || {}).filter((x) => /key/i.test(x)).join(',') || 'ninguno'}`,
      )
    }
    return { ok: true, ...meta }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}

/** Fecha del lanzamiento (YYYY-MM-DD) desde la página del track en Bandcamp. */
async function fetchBandcampReleaseDateFromTrackPage(trackUrl) {
  try {
    let parsed
    try {
      parsed = new URL(trackUrl)
    } catch {
      return { ok: false, error: 'URL inválida' }
    }
    if (!parsed.hostname.toLowerCase().endsWith('.bandcamp.com')) {
      return { ok: false, error: 'no es bandcamp.com' }
    }
    const res = await fetch(trackUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const html = await res.text()
    const tralbum = html.match(/data-tralbum="([^"]*)"/)
    if (!tralbum) return { ok: false, error: 'no data-tralbum' }
    const decoded = tralbum[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const obj = JSON.parse(decoded)
    const raw = obj.album_release_date || obj.release_date
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, error: 'sin album_release_date en tralbum' }
    }
    const d = new Date(raw.trim())
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'fecha no parseable' }
    const y = d.getUTCFullYear()
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    if (y < 1970 || y > 2100) return { ok: false, error: 'año fuera de rango' }
    return { ok: true, date: `${y}-${mo}-${day}` }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}

async function fetchPickReleaseDateFromStoreUrl(url) {
  const n = normalizeFeaturedLinkUrl(url).replace(/^https:\/\//, '')
  if (/^www\.beatport\.com\/track\//.test(n) || /^beatport\.com\/track\//.test(n)) {
    let u = (url || '').trim().replace(/^http:\/\//i, 'https://')
    u = u.replace(/^https:\/\/(www\.)?beatport\.com/i, 'https://www.beatport.com')
    return fetchBeatportTrackMeta(u)
  }
  if (/\.bandcamp\.com\/track\//.test(n)) {
    return fetchBandcampReleaseDateFromTrackPage(url.trim())
  }
  return { ok: false, error: 'URL no es track Beatport ni Bandcamp' }
}

function isBeatportTrackUrl(u) {
  const s = (u || '').trim().toLowerCase()
  return /beatport\.com\/track\/[^/]+\/\d+/.test(s)
}

function isBandcampTrackUrl(u) {
  const s = (u || '').trim().toLowerCase()
  return /\.bandcamp\.com\/track\//.test(s)
}

function isEnrichableStoreUrl(u) {
  return isBeatportTrackUrl(u) || isBandcampTrackUrl(u)
}

function hasValidReleaseDate(p) {
  const r = p.release_date
  if (r == null || r === '') return false
  const s = String(r).trim().slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s)
}

function pickMissingBeatportChips(p) {
  const bpmMissing = p.bpm == null || !(Number(p.bpm) > 0)
  const keyMissing = !(p.music_key || '').trim()
  const sampleMissing = !(p.sample_url || '').trim()
  return bpmMissing || keyMissing || sampleMissing
}

function pickNeedsStoreEnrich(p, force) {
  const url = (p.link_url || '').trim()
  if (!isEnrichableStoreUrl(url)) return false
  if (force) return true
  if (!hasValidReleaseDate(p)) return true
  if (isBeatportTrackUrl(url) && pickMissingBeatportChips(p)) return true
  return false
}

async function enrichPicksStoreReleaseDates(picks, { force, verbose }) {
  let ok = 0
  let fail = 0
  const need = picks.filter((p) => pickNeedsStoreEnrich(p, force))
  if (need.length === 0) {
    console.log(
      '  ↳ Tiendas: ningún pick Beatport/Bandcamp necesita fecha ni chips (--force-release-dates para repetir).',
    )
    return
  }
  console.log(`  ↳ Tiendas (Beatport/Bandcamp): enriqueciendo ${need.length} pick(s)...`)
  for (let i = 0; i < need.length; i++) {
    const p = need[i]
    const url = (p.link_url || '').trim()
    const res = await fetchPickReleaseDateFromStoreUrl(url)
    if (res.ok) {
      if (res.date && (force || !hasValidReleaseDate(p))) {
        p.release_date = res.date
        const y = parseInt(res.date.slice(0, 4), 10)
        if (Number.isFinite(y) && y >= 1970 && y <= 2100) {
          if (p.release_year == null || !Number.isFinite(Number(p.release_year))) {
            p.release_year = y
          }
        }
      }
      if (res.bpm != null && (force || p.bpm == null || !(Number(p.bpm) > 0))) {
        p.bpm = res.bpm
      }
      if (res.music_key && (force || !(p.music_key || '').trim())) {
        p.music_key = res.music_key
      }
      if (res.sample_url && (force || !(p.sample_url || '').trim())) {
        p.sample_url = res.sample_url
      }
      ok++
      console.log(
        `     ✓ [${i + 1}/${need.length}] ${(p.title || '').slice(0, 48)} → ${p.release_date || '—'} · ${p.bpm ?? '—'} · ${p.music_key || '—'}`,
      )
      if (verbose && p.sample_url) console.log(`       sample: ${String(p.sample_url).slice(0, 80)}`)
    } else {
      fail++
      console.warn(`     ✗ [${i + 1}/${need.length}] ${(p.title || '?').slice(0, 40)}: ${res.error}`)
    }
    await sleep(550)
  }
  console.log(`  ↳ Tiendas: ${ok} OK, ${fail} fallos.`)
}

function requireSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim()
  if (!url || !key) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

/** Tras UPSERT local, purga la Data Cache de /charts en producción. */
async function pingPublicChartsRevalidate() {
  const secret = (
    process.env.REVALIDATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim()
  const base = (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL ||
    'https://www.optimalbreaks.com'
  ).trim()
  if (!secret) {
    console.warn(
      '  ⚠ Sin REVALIDATE_SECRET / service role: /charts sigue con la semana cacheada hasta el próximo deploy.',
    )
    return
  }
  const origin = /^https?:\/\//i.test(base) ? base : `https://${base}`
  const url = `${origin.replace(/\/$/, '')}/api/revalidate`
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ secret }),
    })
    if (res.ok) {
      console.log('  ↳ Caché web pública invalidada (/charts).')
    } else {
      console.warn(
        `  ⚠ Revalidate HTTP ${res.status} — /charts puede seguir mostrando la semana vieja hasta un deploy.`,
      )
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`  ⚠ No se pudo invalidar caché web: ${msg}`)
  }
}

function artistsCreditKey(artists) {
  return (artists || [])
    .map((x) => String(x?.name || '').trim().toLowerCase())
    .filter(Boolean)
    .join('|')
}

function rewritePicksJsonRemixers() {
  const dir = join(ROOT, 'data/charts/picks')
  if (!existsSync(dir)) return { filesTouched: 0, picksTouched: 0 }
  const files = readdirSync(dir).filter((f) => f.endsWith('.json') && !f.includes('example'))
  let filesTouched = 0
  let picksTouched = 0
  for (const f of files) {
    const pth = join(dir, f)
    let json
    try {
      json = JSON.parse(readFileSync(pth, 'utf8'))
    } catch {
      continue
    }
    if (!Array.isArray(json.picks)) continue
    let changed = false
    for (const pick of json.picks) {
      const next = mergeArtistCreditObjects(pick.artists, extractRemixerNames(pick.mix_name))
      if (artistsCreditKey(pick.artists) === artistsCreditKey(next)) continue
      pick.artists = next
      changed = true
      picksTouched++
    }
    if (changed) {
      writeFileSync(pth, `${JSON.stringify(json, null, 2)}\n`, 'utf8')
      filesTouched++
    }
  }
  return { filesTouched, picksTouched }
}

async function backfillRemixerCreditsInDb(supabase) {
  const tables = ['chart_featured_tracks', 'chart_tracks', 'chart_vinyl_tracks']
  for (const table of tables) {
    let from = 0
    const PAGE = 500
    let patched = 0
    for (;;) {
      const { data, error } = await supabase
        .from(table)
        .select('id, artists, mix_name')
        .range(from, from + PAGE - 1)
      if (error) throw new Error(`${table}: ${error.message}`)
      if (!data?.length) break
      for (const row of data) {
        const next = mergeArtistCreditObjects(row.artists, extractRemixerNames(row.mix_name))
        if (artistsCreditKey(row.artists) === artistsCreditKey(next)) continue
        const { error: upErr } = await supabase.from(table).update({ artists: next }).eq('id', row.id)
        if (upErr) throw new Error(`update ${table} ${row.id}: ${upErr.message}`)
        patched++
        console.log(`    ${table}: ${(row.mix_name || '').trim()} → ${next.map((a) => a.name).join(', ')}`)
      }
      if (data.length < PAGE) break
      from += PAGE
    }
    console.log(`  ↳ ${table}: ${patched} filas con remixer añadido`)
  }
}

async function main() {
  const argv = process.argv.slice(2)
  if (argv.includes('--backfill-remixer-credits')) {
    const jsonStats = rewritePicksJsonRemixers()
    console.log(`  ↳ JSON picks: ${jsonStats.picksTouched} temas en ${jsonStats.filesTouched} archivos`)
    const supabase = requireSupabase()
    await backfillRemixerCreditsInDb(supabase)
    await pingPublicChartsRevalidate()
    return
  }

  const createEditionIfMissing = argv.includes('--create-edition')
  const enrichReleaseDates =
    argv.includes('--enrich-release-dates') || argv.includes('--enrich-beatport-dates')
  const writeJson = argv.includes('--write-json')
  const forceReleaseDates =
    argv.includes('--force-release-dates') || argv.includes('--force-beatport-dates')
  const verboseEnrich = argv.includes('--verbose')

  const rel = argv.find((a) => !a.startsWith('--'))
  if (!rel) {
    console.error('Uso: node scripts/chart-featured-upsert.mjs <ruta-desde-raíz-repo.json> [flags]')
    console.error('  --create-edition')
    console.error('  --enrich-release-dates  --write-json  --force-release-dates  --verbose')
    process.exit(1)
  }

  const path = resolve(ROOT, rel)
  if (!existsSync(path)) {
    console.error('No existe:', path)
    process.exit(1)
  }

  let data
  try {
    data = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.error('JSON inválido:', e.message)
    process.exit(1)
  }

  const weekDate = data.week_date
  if (!weekDate || typeof weekDate !== 'string') {
    console.error('Falta week_date (YYYY-MM-DD)')
    process.exit(1)
  }

  const picks = Array.isArray(data.picks) ? data.picks : []

  if (enrichReleaseDates) {
    await enrichPicksStoreReleaseDates(picks, { force: forceReleaseDates, verbose: verboseEnrich })
    if (writeJson) {
      writeFileSync(path, `${JSON.stringify(data, null, 2)}\n`, 'utf8')
      console.log(`  ↳ JSON actualizado: ${rel}`)
    }
  } else if (writeJson && !enrichReleaseDates) {
    console.warn('  ⚠ --write-json sin --enrich-release-dates: no se escribe nada.')
  }

  const supabase = requireSupabase()

  const { data: edition, error: edErr } = await supabase
    .from('chart_editions')
    .select('id')
    .eq('week_date', weekDate)
    .maybeSingle()

  if (edErr) throw new Error(`chart_editions: ${edErr.message}`)

  let editionId = edition?.id
  if (!editionId) {
    if (!createEditionIfMissing) {
      console.error(`No hay chart_editions con week_date=${weekDate}.`)
      console.error('  Crea/publica esa semana en Supabase, o re-ejecuta con --create-edition')
      process.exit(1)
    }
    const title = `40 Breaks Vitales — ${weekDate}`
    const { data: inserted, error: insEdErr } = await supabase
      .from('chart_editions')
      .insert({
        week_date: weekDate,
        title,
        description_en: `The 40 breakbeat tracks defining the week of ${weekDate}.`,
        description_es: `Los 40 temas de breakbeat que definen la semana del ${weekDate}.`,
        sources: [],
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insEdErr) throw new Error(`Insert chart_edition: ${insEdErr.message}`)
    editionId = inserted.id
    console.log(`  ↳ Creada chart_editions week_date=${weekDate} (id=${editionId}). Publica el 40 cuando toque.`)
  }

  // Picks vivos en la semana (los necesitamos ANTES de cualquier mutación
  // para poder hacer rebind por link_url y NO regenerar UUIDs en cada run.
  // Borrar + insertar destruye los `chart_featured_tracks.id` y orfana los
  // saves de los usuarios en `saved_chart_tracks` que apuntan a esos UUIDs.
  const { data: existingRows, error: exErr } = await supabase
    .from('chart_featured_tracks')
    .select('id, link_url')
    .eq('chart_edition_id', editionId)
  if (exErr) throw new Error(`load chart_featured_tracks: ${exErr.message}`)

  const existingByKey = new Map()
  for (const r of existingRows || []) {
    const k = dedupeKeyForFeaturedLink(r.link_url || '')
    if (!k) continue
    if (!existingByKey.has(k)) existingByKey.set(k, r.id)
  }

  if (picks.length === 0) {
    if ((existingRows || []).length > 0) {
      const { error: delAllErr } = await supabase
        .from('chart_featured_tracks')
        .delete()
        .eq('chart_edition_id', editionId)
      if (delAllErr) throw new Error(`delete chart_featured_tracks (semana vacía): ${delAllErr.message}`)
    }
    console.log(`  ↳ Semana ${weekDate}: lista vacía (picks borrados).`)
    await pingPublicChartsRevalidate()
    return
  }

  const sortedPicks = [...picks].sort(
    (a, b) => Number(a.sort_order) - Number(b.sort_order),
  )
  const seenKeys = new Set()
  const dedupedPicks = []
  for (let i = 0; i < sortedPicks.length; i++) {
    const p = sortedPicks[i]
    const sort = Number(p.sort_order)
    if (!Number.isFinite(sort) || sort < 1) {
      throw new Error(`pick #${i + 1}: sort_order inválido`)
    }
    const title = (p.title || '').trim()
    if (!title) throw new Error(`pick sort_order=${sort}: falta title`)
    const link_url = (p.link_url || '').trim()
    if (!link_url) throw new Error(`pick "${title}": falta link_url`)

    const key = dedupeKeyForFeaturedLink(link_url)
    if (seenKeys.has(key)) {
      console.warn(
        `  ⚠ Omitido duplicado (mismo enlace / mismo id Beatport): «${title}» → ${link_url}`,
      )
      continue
    }
    seenKeys.add(key)
    dedupedPicks.push(p)
  }

  function parseJsonReleaseDate(p) {
    const r = p.release_date
    if (r == null || r === '') return null
    const s = String(r).trim().slice(0, 10)
    return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
  }

  const buildRow = (p, idx) => {
    const title = (p.title || '').trim()
    const link_url = (p.link_url || '').trim()
    const bpmRaw = p.bpm
    const bpm =
      bpmRaw != null && Number.isFinite(Number(bpmRaw)) && Number(bpmRaw) > 0
        ? Number(bpmRaw)
        : null

    const row = {
      chart_edition_id: editionId,
      sort_order: idx + 1,
      title,
      mix_name: (p.mix_name || '').trim(),
      artists: mergeArtistCreditObjects(
        Array.isArray(p.artists) ? p.artists : [],
        extractRemixerNames(p.mix_name),
      ),
      label: (p.label || '').trim(),
      platform: (p.platform || 'other').trim().toLowerCase() || 'other',
      link_url,
      link_label: (p.link_label || '').trim(),
      artwork_url: (p.artwork_url || '').trim() || null,
      sample_url: (p.sample_url || '').trim() || null,
      full_audio_url: (p.full_audio_url || '').trim() || null,
      bpm,
      music_key: (p.music_key || '').trim(),
      release_year:
        p.release_year != null && Number.isFinite(Number(p.release_year))
          ? Number(p.release_year)
          : null,
      release_date: parseJsonReleaseDate(p),
      note_en: (p.note_en || '').trim(),
      note_es: (p.note_es || '').trim(),
    }
    // spotify_url / tidal_url solo si vienen en el JSON: si falta la clave, el
    // UPDATE no pisa el match ya guardado en BD por spotify-match-charts.mjs.
    if (typeof p.spotify_url === 'string' && p.spotify_url.trim()) {
      row.spotify_url = p.spotify_url.trim()
    }
    if (typeof p.tidal_url === 'string' && p.tidal_url.trim()) {
      row.tidal_url = p.tidal_url.trim()
    }
    return row
  }

  const rows = dedupedPicks.map(buildRow)
  warnSharedArtworkClusters(rows)

  // Sync estable: separa la lista en updates/inserts/deletes contra la BD
  // viva. NO borramos filas vivas que sigan siendo válidas → sus UUIDs y los
  // saves del usuario que las referencian se preservan.
  const newKeys = new Set()
  const updates = []
  const inserts = []
  for (const row of rows) {
    const k = dedupeKeyForFeaturedLink(row.link_url)
    newKeys.add(k)
    const liveId = existingByKey.get(k)
    if (liveId) updates.push({ id: liveId, data: row })
    else inserts.push(row)
  }

  const toDelete = []
  for (const [k, id] of existingByKey.entries()) {
    if (!newKeys.has(k)) toDelete.push(id)
  }

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('chart_featured_tracks')
      .delete()
      .in('id', toDelete)
    if (delErr) throw new Error(`delete chart_featured_tracks (no presentes): ${delErr.message}`)
  }

  // Evitar violación UNIQUE (chart_edition_id, sort_order) al reordenar: primero valores
  // intermedios grandes, luego PATCH final en la segunda pasada (misma regla útil tras reubicaciones).
  if (updates.length > 0) {
    // Zona alta por encima del máximo habitual de lista (≤200 antes de 059): evita UNIQUE+CHECK
    // al reordenar mientras Postgres aplica PATCHs uno a uno desde el cliente REST.
    let bump = 0
    const TEMP_SORT_START = Math.min(
      32100,
      32767 - Math.max(1, updates.length) - 1,
    )
    for (const u of updates) {
      bump++
      const { error } = await supabase
        .from('chart_featured_tracks')
        .update({ sort_order: TEMP_SORT_START + bump })
        .eq('id', u.id)
      if (error) throw new Error(`prep sort_order ${u.id}: ${error.message}`)
    }
  }

  for (const u of updates) {
    const { error: upErr } = await supabase
      .from('chart_featured_tracks')
      .update(u.data)
      .eq('id', u.id)
    if (upErr) throw new Error(`update ${u.id}: ${upErr.message}`)
  }

  if (inserts.length > 0) {
    const { error: insErr } = await supabase
      .from('chart_featured_tracks')
      .insert(inserts)
    if (insErr) throw new Error(`insert chart_featured_tracks: ${insErr.message}`)
  }

  console.log(
    `  ↳ Semana ${weekDate}: ${rows.length} picks vigentes ` +
    `(${updates.length} actualizados, ${inserts.length} nuevos, ${toDelete.length} eliminados).`,
  )
  await pingPublicChartsRevalidate()
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
