/**
 * Reata saves huérfanas (track_id sin fila viva) por canonical_url / link_url.
 * Uso: node scripts/rebind-saved-chart-tracks.mjs [--email user@domain.com] [--dry-run]
 */
import { readFileSync, existsSync } from 'fs'
import { join, resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')

function parseEnv(text) {
  const out = {}
  for (const line of text.split('\n')) {
    let t = line.trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[t.slice(0, eq).trim()] = v
  }
  return out
}

function normalizeUrlKey(u) {
  const s = (u || '').trim().toLowerCase()
  if (!s) return ''
  const yt = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-z0-9_-]{11})/i)
  if (yt) return `yt:${yt[1]}`
  try {
    const url = new URL(s)
    return `${url.host}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return s.replace(/[?#].*$/, '').replace(/\/$/, '')
  }
}

function arg(name) {
  const i = process.argv.indexOf(`--${name}`)
  if (i === -1) return null
  const n = process.argv[i + 1]
  return !n || n.startsWith('--') ? true : n
}

const dryRun = !!arg('dry-run')
const emailFilter = arg('email')

const env = {
  ...parseEnv(existsSync(join(ROOT, '.env')) ? readFileSync(join(ROOT, '.env'), 'utf8') : ''),
  ...parseEnv(existsSync(join(ROOT, '.env.local')) ? readFileSync(join(ROOT, '.env.local'), 'utf8') : ''),
}
const sb = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY)

let userIds = null
if (emailFilter && emailFilter !== true) {
  const { data: auth } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
  const u = auth?.users?.find((x) => (x.email || '').toLowerCase() === String(emailFilter).toLowerCase())
  if (!u) throw new Error(`Usuario no encontrado: ${emailFilter}`)
  userIds = [u.id]
}

let q = sb.from('saved_chart_tracks').select('id, user_id, track_source, track_id, canonical_url, snapshot')
if (userIds) q = q.in('user_id', userIds)
const { data: saves, error } = await q
if (error) throw error

const bySource = { chart: [], featured: [], vinyl: [] }
for (const s of saves || []) {
  if (s.track_source in bySource) bySource[s.track_source].push(s)
}

const [{ data: liveChart }, { data: liveFeat }, { data: liveVinyl }] = await Promise.all([
  sb.from('chart_tracks').select('id, beatport_url'),
  sb.from('chart_featured_tracks').select('id, link_url'),
  sb.from('chart_vinyl_tracks').select('id, discogs_url, youtube_url'),
])

const liveChartIds = new Set((liveChart || []).map((r) => r.id))
const liveFeatIds = new Set((liveFeat || []).map((r) => r.id))
const liveVinylIds = new Set((liveVinyl || []).map((r) => r.id))

function indexLive(rows, pickUrl) {
  const m = new Map()
  for (const r of rows) {
    const k = normalizeUrlKey(pickUrl(r))
    if (k) m.set(k, r.id)
  }
  return m
}

const chartIdx = indexLive(liveChart || [], (r) => r.beatport_url)
const featIdx = indexLive(liveFeat || [], (r) => r.link_url)
const vinylIdx = indexLive(liveVinyl || [], (r) => r.discogs_url || r.youtube_url)

let rebound = 0
let deleted = 0
let skipped = 0

for (const s of saves || []) {
  const live =
    s.track_source === 'chart' ? liveChartIds.has(s.track_id)
    : s.track_source === 'featured' ? liveFeatIds.has(s.track_id)
    : s.track_source === 'vinyl' ? liveVinylIds.has(s.track_id)
    : true
  if (live || s.track_source === 'beatport_top') continue

  const url = s.canonical_url || (s.snapshot?.beatport_url) || (s.snapshot?.link_url) || null
  const key = normalizeUrlKey(url)
  if (!key) { skipped++; continue }

  const newId =
    s.track_source === 'chart' ? chartIdx.get(key)
    : s.track_source === 'featured' ? featIdx.get(key)
    : s.track_source === 'vinyl' ? vinylIdx.get(key)
    : null
  if (!newId || newId === s.track_id) { skipped++; continue }

  const { data: dup } = await sb
    .from('saved_chart_tracks')
    .select('id')
    .eq('user_id', s.user_id)
    .eq('track_source', s.track_source)
    .eq('track_id', newId)
    .maybeSingle()

  if (dryRun) {
    console.log(`[dry-run] ${s.track_source} ${s.track_id.slice(0, 8)} → ${newId.slice(0, 8)} | ${url}`)
    rebound++
    continue
  }

  if (dup) {
    await sb.from('saved_chart_tracks').delete().eq('id', s.id)
    deleted++
  } else {
    await sb.from('saved_chart_tracks').update({ track_id: newId }).eq('id', s.id)
    rebound++
  }
}

console.log(`Rebind: ${rebound} actualizados, ${deleted} duplicados eliminados, ${skipped} sin URL/sin match${dryRun ? ' (dry-run)' : ''}.`)
