// ============================================
// OPTIMAL BREAKS — Backfill canonical_url + snapshot en saved_chart_tracks
// ----------------------------------------------------------------------
// Capa 4 de defensa de "Mis Tracks": para cada save vivo (track_id existe en
// la tabla origen) que NO tenga `canonical_url` o `snapshot`, copia los
// metadatos esenciales desde la fila viva. Después de ejecutar este script:
//
//   - canonical_url está relleno → un upsert futuro que regenere UUIDs no
//     puede orfanar el save (lo reata el endpoint vía URL).
//   - snapshot está relleno → si la fila viva fuese borrada por completo,
//     "Mis Tracks" sigue mostrando título/artistas/artwork/URL inmutables.
//
// MEJORA aditiva: si el snapshot ya existe pero le faltan campos nuevos
// (p. ej. `release_date` introducido en abril/2026), también los rellena
// siempre que la fuente viva sí los tenga. Nunca pisa valores existentes.
//
// `beatport_top`: el snapshot es la única fuente, pero ahora podemos
// cruzar la URL canónica con `artists.beatport_top_tracks` y
// `labels.beatport_top_tracks` (JSONB ya enriquecido con release_date)
// para refrescar el snapshot del save sin tocar nada más.
//
// Uso:
//   node scripts/saved-tracks-backfill.mjs           # global (todos los users)
//   node scripts/saved-tracks-backfill.mjs --email X@Y.com  # un user
//   node scripts/saved-tracks-backfill.mjs --dry-run        # no modifica BD
//   node scripts/saved-tracks-backfill.mjs --scrape-beatport
//      # último recurso: para saves `beatport_top` cuyo track ya cayó del
//      # Top 10 (no está en JSONB) y no tienen release_date en el snapshot,
//      # scrapea publish_date desde el enlace de Beatport del snapshot.
// ============================================

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function parseEnvText(text) {
  const out = {}; let t0 = text
  if (t0.charCodeAt(0) === 0xfeff) t0 = t0.slice(1)
  for (const line of t0.split('\n')) {
    let t = line.trim()
    if (t.startsWith('export ')) t = t.slice(7).trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq === -1) continue
    const k = t.slice(0, eq).trim(); let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}
function loadEnv() {
  const base = existsSync(join(ROOT, '.env')) ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8')) : {}
  const local = existsSync(join(ROOT, '.env.local')) ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8')) : {}
  for (const [k, v] of Object.entries({ ...base, ...local })) if (process.env[k] === undefined) process.env[k] = v
}
loadEnv()

function arg(name, fallback = null) {
  const idx = process.argv.findIndex((a) => a === `--${name}`)
  if (idx === -1) return fallback
  const next = process.argv[idx + 1]
  if (!next || next.startsWith('--')) return true
  return next
}
const dryRun = !!arg('dry-run', false)
const email = arg('email')
const scrapeBeatport = !!arg('scrape-beatport', false)

async function fetchBeatportPublishDate(url) {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: {
        'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Safari/537.36',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return null
    const html = await res.text()
    const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/)
    if (!m) return null
    let data
    try { data = JSON.parse(m[1]) } catch { return null }
    const stack = [data]
    const seen = new Set()
    while (stack.length) {
      const node = stack.pop()
      if (!node || typeof node !== 'object' || seen.has(node)) continue
      seen.add(node)
      const cand = node.publish_date || node.new_release_date || node.publishDate || node.newReleaseDate
      if (typeof cand === 'string') {
        const s = cand.slice(0, 10)
        if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s
      }
      for (const k of Object.keys(node)) {
        const v = node[k]
        if (v && typeof v === 'object') stack.push(v)
      }
    }
    return null
  } catch {
    return null
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
)

let userFilterId = null
if (email) {
  const { data: usersData } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const u = (usersData?.users || []).find((x) => (x.email || '').toLowerCase() === email.toLowerCase())
  if (!u) { console.error(`Usuario ${email} no encontrado`); process.exit(1) }
  userFilterId = u.id
  console.log(`Filtrando por usuario: ${email}`)
}

let savedQ = sb.from('saved_chart_tracks').select('id, user_id, track_source, track_id, canonical_url, snapshot')
if (userFilterId) savedQ = savedQ.eq('user_id', userFilterId)
const { data: saved, error: savedErr } = await savedQ
if (savedErr) { console.error(savedErr); process.exit(1) }
console.log(`Saves a evaluar: ${saved.length}`)

const featIds = Array.from(new Set(saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)))
const chartIds = Array.from(new Set(saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)))
const vinylIds = Array.from(new Set(saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)))

async function fetchInBatches(table, columns, ids) {
  const out = new Map()
  for (let i = 0; i < ids.length; i += 200) {
    const slice = ids.slice(i, i + 200)
    if (!slice.length) continue
    const { data, error } = await sb.from(table).select(columns).in('id', slice)
    if (error) throw error
    for (const r of data || []) out.set(r.id, r)
  }
  return out
}

const featRows = await fetchInBatches(
  'chart_featured_tracks',
  'id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, link_url, sample_url',
  featIds,
)
const chartRows = await fetchInBatches(
  'chart_tracks',
  'id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, beatport_url, sample_url',
  chartIds,
)
const vinylRows = await fetchInBatches(
  'chart_vinyl_tracks',
  'id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url',
  vinylIds,
)

// Índice por URL canónica para refrescar saves `beatport_top` con la fecha
// que ya tenemos en los Top 10 JSONB de `artists` / `labels`.
function normalizeUrl(u) {
  const s = String(u || '').trim().toLowerCase()
  if (!s) return ''
  try {
    const url = new URL(s)
    return `${url.host}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return s.replace(/[?#].*$/, '').replace(/\/$/, '')
  }
}
const beatportTopByUrl = new Map() // canonicalKey -> { release_date, year, ... }
async function indexBeatportTop(table) {
  let from = 0
  const pageSize = 500
  while (true) {
    const { data, error } = await sb
      .from(table)
      .select('beatport_top_tracks')
      .not('beatport_top_tracks', 'is', null)
      .range(from, from + pageSize - 1)
    if (error) { console.warn(`  · ${table}: ${error.message}`); break }
    if (!data || data.length === 0) break
    for (const row of data) {
      const list = Array.isArray(row.beatport_top_tracks) ? row.beatport_top_tracks : []
      for (const t of list) {
        const url = t?.beatport_url || ''
        const key = normalizeUrl(url)
        if (!key) continue
        const rd = typeof t?.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(t.release_date.slice(0, 10)) ? t.release_date.slice(0, 10) : null
        if (!rd && !t?.release_year) continue
        if (!beatportTopByUrl.has(key)) {
          beatportTopByUrl.set(key, { release_date: rd, year: t?.release_year ?? null })
        } else if (rd && !beatportTopByUrl.get(key).release_date) {
          beatportTopByUrl.get(key).release_date = rd
        }
      }
    }
    if (data.length < pageSize) break
    from += pageSize
  }
}
await indexBeatportTop('artists')
await indexBeatportTop('labels')
console.log(`Índice Beatport Top (artistas+sellos): ${beatportTopByUrl.size} URLs únicas`)

function artistsToString(a) {
  if (!Array.isArray(a)) return ''
  return a.map((x) => (x && typeof x === 'object' ? x.name : x)).filter(Boolean).join(', ')
}

function buildSnapshot(src, row) {
  if (!row) return null
  const base = {
    title: row.title || '',
    mix_name: row.mix_name || null,
    artists: artistsToString(row.artists),
    label: row.label || null,
    year: row.release_year || row.year || null,
    bpm: row.bpm || null,
    music_key: row.music_key || null,
    artwork_url: row.artwork_url || null,
    sample_url: row.sample_url || null,
  }
  if (src !== 'vinyl') {
    const rd = typeof row.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.release_date.slice(0, 10))
      ? row.release_date.slice(0, 10)
      : null
    base.release_date = rd
  }
  if (src === 'featured') return { ...base, beatport_url: row.link_url || null }
  if (src === 'chart') return { ...base, beatport_url: row.beatport_url || null }
  if (src === 'vinyl') return { ...base, beatport_url: row.discogs_url || null, youtube_url: row.youtube_url || null }
  return base
}

// Aplica al snapshot ya existente los campos nuevos disponibles en la fila
// viva. Nunca pisa valores no nulos previos: solo rellena huecos.
function mergeSnapshotAdditive(prev, src, row) {
  if (!row) return null
  const next = { ...(prev || {}) }
  let changed = false
  const setIfMissing = (k, v) => {
    if ((next[k] === undefined || next[k] === null || next[k] === '') && v != null && v !== '') {
      next[k] = v
      changed = true
    }
  }
  setIfMissing('title', row.title || null)
  setIfMissing('mix_name', row.mix_name || null)
  setIfMissing('artists', artistsToString(row.artists) || null)
  setIfMissing('label', row.label || null)
  setIfMissing('year', row.release_year ?? row.year ?? null)
  setIfMissing('bpm', row.bpm ?? null)
  setIfMissing('music_key', row.music_key || null)
  setIfMissing('artwork_url', row.artwork_url || null)
  setIfMissing('sample_url', row.sample_url || null)
  if (src !== 'vinyl') {
    const rd = typeof row.release_date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(row.release_date.slice(0, 10))
      ? row.release_date.slice(0, 10)
      : null
    setIfMissing('release_date', rd)
  }
  if (src === 'featured') setIfMissing('beatport_url', row.link_url || null)
  else if (src === 'chart') setIfMissing('beatport_url', row.beatport_url || null)
  else if (src === 'vinyl') {
    setIfMissing('beatport_url', row.discogs_url || null)
    setIfMissing('youtube_url', row.youtube_url || null)
  }
  return changed ? next : null
}

function liveUrl(src, row) {
  if (!row) return null
  if (src === 'featured') return row.link_url || null
  if (src === 'chart') return row.beatport_url || null
  if (src === 'vinyl') return row.discogs_url || row.youtube_url || null
  return null
}

let updates = 0
let skippedAlreadyOk = 0
let orphans = 0
let updatedThisRun = 0
let enrichedAdditive = 0
let enrichedBeatportTop = 0
let scrapedBeatport = 0
const failures = []
const orphanBeatportToScrape = []

for (const s of saved) {
  // 1) Saves `beatport_top`: la fuente viva está en `artists.beatport_top_tracks`
  // y `labels.beatport_top_tracks` (JSONB). Cruzamos por URL canónica.
  if (s.track_source === 'beatport_top') {
    const url = (s.snapshot && s.snapshot.beatport_url) || s.canonical_url
    const key = normalizeUrl(url)
    const liveTop = key ? beatportTopByUrl.get(key) : null
    const prev = (s.snapshot && typeof s.snapshot === 'object') ? s.snapshot : {}
    if (!liveTop) {
      // Cayó del Top 10. Si pediste --scrape-beatport y falta release_date,
      // se procesa más abajo en una segunda pasada (red, lento).
      if (scrapeBeatport && !prev.release_date && url) {
        orphanBeatportToScrape.push({ save: s, url })
      } else {
        skippedAlreadyOk++
      }
      continue
    }
    const need = {}
    const next = { ...prev }
    let changed = false
    if (liveTop.release_date && !prev.release_date) {
      next.release_date = liveTop.release_date
      changed = true
    }
    if (liveTop.year && !prev.year) {
      next.year = liveTop.year
      changed = true
    }
    if (changed) need.snapshot = next
    if (Object.keys(need).length === 0) { skippedAlreadyOk++; continue }
    updates++
    enrichedBeatportTop++
    if (dryRun) continue
    const { error: updErr } = await sb.from('saved_chart_tracks').update(need).eq('id', s.id)
    if (updErr) failures.push({ id: s.id, error: updErr.message })
    else updatedThisRun++
    continue
  }

  // 2) Resto de orígenes: chart / featured / vinyl
  const row =
    s.track_source === 'featured' ? featRows.get(s.track_id)
    : s.track_source === 'chart' ? chartRows.get(s.track_id)
    : s.track_source === 'vinyl' ? vinylRows.get(s.track_id)
    : null
  if (!row) {
    orphans++
    if (scrapeBeatport) {
      const prev = (s.snapshot && typeof s.snapshot === 'object') ? s.snapshot : {}
      const url = prev.beatport_url || s.canonical_url || ''
      const isBeatport = /(^|\/\/)([^/]*\.)?beatport\.com\/track\//i.test(url)
      if (!prev.release_date && isBeatport) {
        orphanBeatportToScrape.push({ save: s, url })
      }
    }
    continue
  }

  const need = {}
  if (!s.canonical_url) {
    const u = liveUrl(s.track_source, row)
    if (u) need.canonical_url = u
  }
  if (!s.snapshot || Object.keys(s.snapshot).length === 0) {
    const snap = buildSnapshot(s.track_source, row)
    if (snap) need.snapshot = snap
  } else {
    // Snapshot existe: solo rellenamos huecos (p. ej. release_date añadido
    // después del save original). Nunca pisamos valores no nulos previos.
    const merged = mergeSnapshotAdditive(s.snapshot, s.track_source, row)
    if (merged) {
      need.snapshot = merged
      enrichedAdditive++
    }
  }
  if (Object.keys(need).length === 0) { skippedAlreadyOk++; continue }

  updates++
  if (dryRun) continue
  const { error: updErr } = await sb.from('saved_chart_tracks').update(need).eq('id', s.id)
  if (updErr) failures.push({ id: s.id, error: updErr.message })
  else updatedThisRun++
}

// 3) Última pasada (opcional): scraping directo de Beatport para saves
// `beatport_top` cuyo track cayó del Top 10 y no tienen release_date.
if (scrapeBeatport && orphanBeatportToScrape.length) {
  console.log(`\nScrapeando ${orphanBeatportToScrape.length} enlaces Beatport para recuperar release_date...`)
  for (const { save, url } of orphanBeatportToScrape) {
    process.stdout.write(`  · ${url} → `)
    const rd = await fetchBeatportPublishDate(url)
    if (!rd) { console.log('sin fecha'); continue }
    const prev = (save.snapshot && typeof save.snapshot === 'object') ? save.snapshot : {}
    const next = { ...prev, release_date: rd }
    if (!prev.year) {
      const y = parseInt(rd.slice(0, 4), 10)
      if (Number.isFinite(y)) next.year = y
    }
    updates++
    scrapedBeatport++
    if (dryRun) { console.log(`${rd} [dry-run]`); continue }
    const { error: updErr } = await sb.from('saved_chart_tracks').update({ snapshot: next }).eq('id', save.id)
    if (updErr) { console.log(`error: ${updErr.message}`); failures.push({ id: save.id, error: updErr.message }) }
    else { console.log(rd); updatedThisRun++ }
    await new Promise((r) => setTimeout(r, 500)) // pequeño respiro entre fetches
  }
}

console.log('\n=== Resultado ===')
console.log(`Saves OK ya rellenas: ${skippedAlreadyOk}`)
console.log(`Saves que necesitaban backfill: ${updates}`)
console.log(`  · enriquecidas aditivamente (faltaban campos como release_date): ${enrichedAdditive}`)
console.log(`  · beatport_top refrescadas con release_date desde JSONB: ${enrichedBeatportTop}`)
if (scrapeBeatport) console.log(`  · beatport_top scraped desde Beatport (último recurso): ${scrapedBeatport}`)
if (!dryRun) console.log(`  · actualizadas con éxito: ${updatedThisRun}`)
console.log(`Saves huérfanas (sin fila viva, no se pueden rellenar aquí): ${orphans}`)
if (failures.length) {
  console.log(`Errores: ${failures.length}`)
  for (const f of failures.slice(0, 10)) console.log(`  ${f.id}: ${f.error}`)
}
if (dryRun) console.log('\n[dry-run] no se ha modificado nada.')
