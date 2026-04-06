/**
 * OPTIMAL BREAKS — Beatport Top 10 Tracks para artistas y sellos
 *
 * Scrapea la página pública de Beatport de un artista o sello, extrae el
 * bloque "Top Ten Tracks" desde __NEXT_DATA__ y guarda el resultado como
 * JSONB en Supabase (columnas beatport_top_tracks en artists / labels).
 *
 * El slug y el ID numérico deben coincidir con la URL canónica de Beatport:
 *   https://www.beatport.com/artist/<slug>/<id>
 *   https://www.beatport.com/label/<slug>/<id>
 * Ej.: Deekline → artist/deekline/3171. Si no conoces el ID, abre la ficha
 * del artista o sello en beatport.com y copia los dos últimos segmentos.
 *
 * Uso:
 *   node scripts/beatport-top-tracks.mjs artist yo-speed 526398
 *   node scripts/beatport-top-tracks.mjs label  83       54171
 *   node scripts/beatport-top-tracks.mjs --all-artists     # todos los que tienen beatport_id
 *   node scripts/beatport-top-tracks.mjs --all-labels       # todos los que tienen beatport_id
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

async function fetchBeatportPage(url) {
  const res = await fetch(url, {
    headers: { 'User-Agent': UA, Accept: 'text/html,application/xhtml+xml', 'Accept-Language': 'en-US,en;q=0.9' },
  })
  if (!res.ok) throw new Error(`Beatport HTTP ${res.status} for ${url}`)
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

function releaseYear(t) {
  const raw = t.publish_date || t.new_release_date
  if (!raw) return null
  const m = String(raw).match(/^(\d{4})/)
  if (!m) return null
  const y = parseInt(m[1], 10)
  return (y >= 1970 && y <= 2100) ? y : null
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
async function scrapeTopTracks(type, slug, beatportId) {
  const beatportUrl = `https://www.beatport.com/${type}/${slug}/${beatportId}`
  console.log(`  ↳ Fetching ${beatportUrl}`)
  const html = await fetchBeatportPage(beatportUrl)
  const nextData = extractNextData(html)
  if (!nextData) throw new Error('__NEXT_DATA__ not found')

  const queries = nextData.props?.pageProps?.dehydratedState?.queries || []

  const topQuery = queries.find((q) => {
    const key = Array.isArray(q.queryKey) ? q.queryKey[0] : String(q.queryKey ?? '')
    return key.includes(`${type === 'artist' ? 'artist' : 'label'}-${beatportId}-top-10-tracks`)
  })

  if (!topQuery) {
    console.log(`  ↳ No top-10-tracks query found. Available:`, queries.map(q => JSON.stringify(q.queryKey).slice(0, 100)))
    return { tracks: [], beatport_url: beatportUrl }
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
    }
  })

  console.log(`  ↳ Parsed ${tracks.length} top tracks`)
  return { tracks, beatport_url: beatportUrl }
}

// ---------------------------------------------------------------------------
// Upsert to Supabase
// ---------------------------------------------------------------------------
async function upsertTopTracks(supabase, table, slug, beatportUrl, beatportId, tracks) {
  const payload = {
    beatport_url: beatportUrl,
    beatport_id: beatportId,
    beatport_top_tracks: tracks,
    beatport_top_tracks_updated_at: new Date().toISOString(),
  }

  const { error } = await supabase.from(table).update(payload).eq('slug', slug)
  if (error) throw new Error(`Supabase update ${table}.${slug}: ${error.message}`)
  console.log(`  ✓ ${table}.${slug} updated (${tracks.length} tracks)`)
}

// ---------------------------------------------------------------------------
// Batch mode: all artists / labels that have beatport_id set
// ---------------------------------------------------------------------------
async function batchUpdate(supabase, table, dryRun) {
  const { data: rows, error } = await supabase
    .from(table)
    .select('slug, beatport_id')
    .not('beatport_id', 'is', null)
    .order('slug')
  if (error) throw new Error(`Supabase select ${table}: ${error.message}`)
  if (!rows?.length) { console.log(`  No rows with beatport_id in ${table}`); return }

  console.log(`\n  Found ${rows.length} ${table} with beatport_id\n`)
  const type = table === 'artists' ? 'artist' : 'label'

  for (const row of rows) {
    try {
      const { tracks, beatport_url } = await scrapeTopTracks(type, row.slug, row.beatport_id)
      if (!dryRun) {
        await upsertTopTracks(supabase, table, row.slug, beatport_url, row.beatport_id, tracks)
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

function sleep(ms) { return new Promise(r => setTimeout(r, ms)) }

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------
async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes('--dry-run')
  const filtered = args.filter(a => a !== '--dry-run')

  if (filtered.includes('--all-artists')) {
    const supabase = requireSupabase()
    return batchUpdate(supabase, 'artists', dryRun)
  }
  if (filtered.includes('--all-labels')) {
    const supabase = requireSupabase()
    return batchUpdate(supabase, 'labels', dryRun)
  }

  if (filtered.length < 3) {
    console.log(`
  OPTIMAL BREAKS — Beatport Top 10 Tracks

  Uso:
    node scripts/beatport-top-tracks.mjs artist <slug> <beatport_id>
    node scripts/beatport-top-tracks.mjs label  <slug> <beatport_id>
    node scripts/beatport-top-tracks.mjs --all-artists [--dry-run]
    node scripts/beatport-top-tracks.mjs --all-labels  [--dry-run]

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

  console.log(`\n  Beatport Top 10 — ${type}: ${slug} (id ${beatportId})${dryRun ? ' [DRY-RUN]' : ''}\n`)

  const { tracks, beatport_url } = await scrapeTopTracks(type, slug, beatportId)

  for (const t of tracks) {
    const artists = t.artists.map(a => a.name).join(', ')
    console.log(`  #${t.position} ${t.title}${t.mix_name ? ` (${t.mix_name})` : ''} — ${artists} [${t.label}] ${t.sample_url ? '🔊' : ''}`)
  }

  if (!dryRun) {
    const supabase = requireSupabase()
    const table = type === 'artist' ? 'artists' : 'labels'
    await upsertTopTracks(supabase, table, slug, beatport_url, beatportId, tracks)
  } else {
    console.log(`\n  [dry-run] No se escribe en BD`)
  }
}

main().catch((err) => {
  console.error(`\n  ✗ Error: ${err.message}`)
  process.exit(1)
})
