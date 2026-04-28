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
// Uso:
//   node scripts/saved-tracks-backfill.mjs           # global (todos los users)
//   node scripts/saved-tracks-backfill.mjs --email X@Y.com  # un user
//   node scripts/saved-tracks-backfill.mjs --dry-run        # no modifica BD
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
  'id, title, mix_name, artists, label, release_year, bpm, music_key, artwork_url, link_url, sample_url',
  featIds,
)
const chartRows = await fetchInBatches(
  'chart_tracks',
  'id, title, mix_name, artists, label, release_year, bpm, music_key, artwork_url, beatport_url, sample_url',
  chartIds,
)
const vinylRows = await fetchInBatches(
  'chart_vinyl_tracks',
  'id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url',
  vinylIds,
)

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
  if (src === 'featured') return { ...base, beatport_url: row.link_url || null }
  if (src === 'chart') return { ...base, beatport_url: row.beatport_url || null }
  if (src === 'vinyl') return { ...base, beatport_url: row.discogs_url || null, youtube_url: row.youtube_url || null }
  return base
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
const failures = []

for (const s of saved) {
  if (s.track_source === 'beatport_top') { skippedAlreadyOk++; continue }
  const row =
    s.track_source === 'featured' ? featRows.get(s.track_id)
    : s.track_source === 'chart' ? chartRows.get(s.track_id)
    : s.track_source === 'vinyl' ? vinylRows.get(s.track_id)
    : null
  if (!row) { orphans++; continue }

  const need = {}
  if (!s.canonical_url) {
    const u = liveUrl(s.track_source, row)
    if (u) need.canonical_url = u
  }
  if (!s.snapshot || Object.keys(s.snapshot).length === 0) {
    const snap = buildSnapshot(s.track_source, row)
    if (snap) need.snapshot = snap
  }
  if (Object.keys(need).length === 0) { skippedAlreadyOk++; continue }

  updates++
  if (dryRun) continue
  const { error: updErr } = await sb.from('saved_chart_tracks').update(need).eq('id', s.id)
  if (updErr) failures.push({ id: s.id, error: updErr.message })
  else updatedThisRun++
}

console.log('\n=== Resultado ===')
console.log(`Saves OK ya rellenas: ${skippedAlreadyOk}`)
console.log(`Saves que necesitaban backfill: ${updates}`)
if (!dryRun) console.log(`  · actualizadas con éxito: ${updatedThisRun}`)
console.log(`Saves huérfanas (sin fila viva, no se pueden rellenar aquí): ${orphans}`)
if (failures.length) {
  console.log(`Errores: ${failures.length}`)
  for (const f of failures.slice(0, 10)) console.log(`  ${f.id}: ${f.error}`)
}
if (dryRun) console.log('\n[dry-run] no se ha modificado nada.')
