/**
 * OPTIMAL BREAKS — Picks «New releases» por semana (chart_featured_tracks)
 *
 * Este script **UPSERT creyendo la `week_date` del JSON** (lunes editorial). Quien genera ese JSON debe
 * respetar el invariante: **misma semana que la fecha de release del tema en la tienda**
 * (`release_date` en JSON; típico Beatport vía scrape). Agrupación por mes/chat/sucesión arbitraria NO.
 *
 * Por defecto solo lee el JSON. Opcionalmente obtiene `release_date` (YYYY-MM-DD)
 * desde la tienda: Beatport (__NEXT_DATA__) o Bandcamp (`data-tralbum` → album_release_date).
 *
 *   node scripts/chart-featured-upsert.mjs data/charts/picks/2026-03-30.json
 *   node scripts/chart-featured-upsert.mjs data/charts/picks/2026-04-20.json --create-edition
 *   node scripts/chart-featured-upsert.mjs data/charts/picks/2026-04-27.json --enrich-release-dates --write-json
 *
 * Flags:
 *   --enrich-release-dates    (alias: --enrich-beatport-dates) Rellena `release_date` vía URL del pick.
 *   --write-json              Tras enriquecer, guarda de nuevo el JSON (pretty-print).
 *   --force-release-dates     (alias: --force-beatport-dates) Fuerza refetch aunque ya haya fecha válida.
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

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

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

/** Fecha YYYY-MM-DD desde la página pública del track (publish_date / new_release_date en NEXT_DATA). */
async function fetchBeatportPublishDate(trackUrl) {
  try {
    const res = await fetch(trackUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const html = await res.text()
    const marker = '__NEXT_DATA__'
    const idx = html.indexOf(marker)
    if (idx === -1) return { ok: false, error: 'no __NEXT_DATA__' }
    const start = html.indexOf('>', idx) + 1
    const end = html.indexOf('</script>', start)
    const nextData = JSON.parse(html.slice(start, end).trim())

    const queries = nextData?.props?.pageProps?.dehydratedState?.queries || []
    for (const q of queries) {
      const d = q?.state?.data
      if (!d || typeof d !== 'object') continue
      const candidates = [d, d.track, d.results, d.data]
      for (const c of candidates) {
        if (!c) continue
        const arr = Array.isArray(c) ? c : [c]
        for (const obj of arr) {
          if (!obj || typeof obj !== 'object') continue
          const raw = obj.publish_date || obj.new_release_date
          if (typeof raw === 'string') {
            const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
            if (m) return { ok: true, date: `${m[1]}-${m[2]}-${m[3]}` }
          }
        }
      }
    }
    return { ok: false, error: 'publish_date no encontrado en NEXT_DATA' }
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
    return fetchBeatportPublishDate(u)
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

async function enrichPicksStoreReleaseDates(picks, { force, verbose }) {
  let ok = 0
  let fail = 0
  const need = picks.filter((p) => {
    const url = (p.link_url || '').trim()
    if (!isEnrichableStoreUrl(url)) return false
    if (force) return true
    return !hasValidReleaseDate(p)
  })
  if (need.length === 0) {
    console.log(
      '  ↳ Tiendas: ningún pick con URL Beatport/Bandcamp necesita release_date (--force-release-dates para repetir).',
    )
    return
  }
  console.log(`  ↳ Tiendas (Beatport/Bandcamp): obteniendo release_date para ${need.length} pick(s)...`)
  for (let i = 0; i < need.length; i++) {
    const p = need[i]
    const url = (p.link_url || '').trim()
    const res = await fetchPickReleaseDateFromStoreUrl(url)
    if (res.ok) {
      p.release_date = res.date
      const y = parseInt(res.date.slice(0, 4), 10)
      if (Number.isFinite(y) && y >= 1970 && y <= 2100) {
        if (p.release_year == null || !Number.isFinite(Number(p.release_year))) {
          p.release_year = y
        }
      }
      ok++
      if (verbose) console.log(`     ✓ [${i + 1}/${need.length}] ${(p.title || '').slice(0, 48)} → ${res.date}`)
    } else {
      fail++
      console.warn(`     ✗ [${i + 1}/${need.length}] ${(p.title || '?').slice(0, 40)}: ${res.error}`)
    }
    await sleep(550)
  }
  console.log(`  ↳ Tiendas: ${ok} fechas OK, ${fail} fallos.`)
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

/** Tras UPSERT local, purga la Data Cache de /charts en producción (si hay secret + URL). */
async function pingPublicChartsRevalidate() {
  const secret = process.env.REVALIDATE_SECRET?.trim()
  const base = (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL
  )?.trim()
  if (!secret || !base) return
  const origin = /^https?:\/\//i.test(base) ? base : `https://${base}`
  const url = `${origin.replace(/\/$/, '')}/api/revalidate?secret=${encodeURIComponent(secret)}`
  try {
    const res = await fetch(url, { method: 'POST' })
    if (res.ok) {
      console.log('  ↳ Caché web pública invalidada (/charts).')
    } else {
      console.warn(`  ⚠ Revalidate HTTP ${res.status} — los picks pueden tardar ~5 min en verse online.`)
    }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    console.warn(`  ⚠ No se pudo invalidar caché web: ${msg}`)
  }
}

async function main() {
  const argv = process.argv.slice(2)
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
      artists: Array.isArray(p.artists) ? p.artists : [],
      label: (p.label || '').trim(),
      platform: (p.platform || 'other').trim().toLowerCase() || 'other',
      link_url,
      link_label: (p.link_label || '').trim(),
      artwork_url: (p.artwork_url || '').trim() || null,
      sample_url: (p.sample_url || '').trim() || null,
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
    // spotify_url solo si viene en el JSON: si falta la clave, el UPDATE no pisa
    // el match ya guardado en BD por scripts/spotify-match-charts.mjs.
    if (typeof p.spotify_url === 'string' && p.spotify_url.trim()) {
      row.spotify_url = p.spotify_url.trim()
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
