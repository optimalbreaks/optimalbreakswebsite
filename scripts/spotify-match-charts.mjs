/**
 * OPTIMAL BREAKS — Matching de tracks del chart contra Spotify (spotify_url)
 *
 * Recorre chart_tracks (40 Breaks Vitales) y chart_featured_tracks (New Releases)
 * y rellena la columna `spotify_url` con el enlace verificado al track en Spotify.
 * La UI de /charts muestra «SPOTIFY» siempre: enlace directo si hay match,
 * búsqueda en open.spotify.com si no (así el matching solo mejora, nunca bloquea).
 *
 *   node scripts/spotify-match-charts.mjs                       # todo lo pendiente (spotify_url NULL)
 *   node scripts/spotify-match-charts.mjs --week=2026-08-10     # solo esa edición (lunes ISO)
 *   node scripts/spotify-match-charts.mjs --table=featured      # solo New Releases (chart|featured|all)
 *   node scripts/spotify-match-charts.mjs --dry-run             # no escribe en BD
 *   node scripts/spotify-match-charts.mjs --force               # re-matchea también filas con spotify_url
 *   node scripts/spotify-match-charts.mjs --limit=50            # tope de filas por tabla
 *
 * Requiere .env.local:
 *   SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET  (app en developer.spotify.com; client credentials)
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY)
 *
 * Redes con SSL inspection (Acttax): si falla el TLS contra accounts.spotify.com,
 * ejecutar con `node --use-system-ca scripts/spotify-match-charts.mjs …`.
 *
 * Criterio de match (conservador; mejor NULL que enlace equivocado):
 *   - el título normalizado debe coincidir (exacto o contenido en el nombre del track);
 *   - al menos un artista nuestro debe estar entre los artistas del candidato;
 *   - el mix_name («Extended Mix»…) puntúa pero no bloquea («Original Mix» se ignora:
 *     en Spotify el mix original suele ir sin sufijo).
 * Ambigüedad o cero candidatos → se deja NULL y se lista en el resumen.
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
      v = v.slice(1, -1)
    }
    out[k] = v
  }
  return out
}

function loadEnv() {
  const base = existsSync(join(ROOT, '.env')) ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8')) : {}
  const local = existsSync(join(ROOT, '.env.local')) ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8')) : {}
  const merged = { ...base, ...local }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

loadEnv()

// ---------------------------------------------------------------------------
// Args
// ---------------------------------------------------------------------------

const argv = process.argv.slice(2)
function argValue(name, def = null) {
  const p = `--${name}=`
  const hit = argv.find((a) => a.startsWith(p))
  return hit ? hit.slice(p.length) : def
}
const WEEK = argValue('week')
const TABLE = (argValue('table', 'all') || 'all').toLowerCase()
const DRY_RUN = argv.includes('--dry-run')
const FORCE = argv.includes('--force')
const LIMIT = Number(argValue('limit', '0')) || 0
const PAUSE_MS = Number(argValue('pause-ms', '350')) || 350
const MARKET = argValue('market', 'ES')

if (!['all', 'chart', 'featured'].includes(TABLE)) {
  console.error(`--table debe ser chart | featured | all (recibido: ${TABLE})`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Supabase REST (service role)
// ---------------------------------------------------------------------------

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const SB_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

async function sbGet(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: SB_HEADERS })
  if (!res.ok) throw new Error(`Supabase GET ${pathAndQuery}: HTTP ${res.status} ${await res.text()}`)
  return res.json()
}

async function sbPatch(table, id, body) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${table}?id=eq.${id}`, {
    method: 'PATCH',
    headers: { ...SB_HEADERS, Prefer: 'return=minimal' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error(`Supabase PATCH ${table}/${id}: HTTP ${res.status} ${await res.text()}`)
}

/** Filas pendientes con paginación (PostgREST corta en ~1000). */
async function fetchRows(table) {
  const cols = 'id,title,mix_name,artists,label,spotify_url'
  const filters = []
  if (!FORCE) filters.push('spotify_url=is.null')
  if (WEEK) {
    const eds = await sbGet(`chart_editions?select=id&week_date=eq.${WEEK}`)
    if (!eds.length) throw new Error(`No hay chart_editions con week_date=${WEEK}`)
    filters.push(`chart_edition_id=eq.${eds[0].id}`)
  }
  const filterStr = filters.length ? `&${filters.join('&')}` : ''
  const rows = []
  const PAGE = 500
  for (let offset = 0; ; offset += PAGE) {
    const page = await sbGet(`${table}?select=${cols}${filterStr}&order=id&limit=${PAGE}&offset=${offset}`)
    rows.push(...page)
    if (page.length < PAGE) break
    if (LIMIT && rows.length >= LIMIT) break
  }
  return LIMIT ? rows.slice(0, LIMIT) : rows
}

// ---------------------------------------------------------------------------
// Spotify Web API (client credentials)
// ---------------------------------------------------------------------------

const SPOTIFY_ID = process.env.SPOTIFY_CLIENT_ID || ''
const SPOTIFY_SECRET = process.env.SPOTIFY_CLIENT_SECRET || ''
if (!SPOTIFY_ID || !SPOTIFY_SECRET) {
  console.error(
    'Faltan SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET en .env.local.\n' +
    'Crea una app en https://developer.spotify.com/dashboard (Web API; requiere cuenta Premium\n' +
    'desde feb-2026) y copia Client ID + Client Secret. La UI funciona sin esto (enlace de búsqueda).',
  )
  process.exit(1)
}

let tokenCache = { value: '', expiresAt: 0 }
async function spotifyToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - 30_000) return tokenCache.value
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${SPOTIFY_ID}:${SPOTIFY_SECRET}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`Spotify token: HTTP ${res.status} ${await res.text()}`)
  const json = await res.json()
  tokenCache = { value: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 }
  return tokenCache.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

async function spotifySearch(query) {
  const token = await spotifyToken()
  const url = `https://api.spotify.com/v1/search?type=track&limit=10&market=${encodeURIComponent(MARKET)}&q=${encodeURIComponent(query)}`
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } })
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') || '2')
      console.warn(`  … rate limit Spotify, esperando ${retry}s`)
      await sleep((retry + 1) * 1000)
      continue
    }
    if (!res.ok) throw new Error(`Spotify search: HTTP ${res.status} ${await res.text()}`)
    const json = await res.json()
    return json?.tracks?.items || []
  }
  throw new Error('Spotify search: rate limit persistente (429 x3)')
}

// ---------------------------------------------------------------------------
// Normalización y scoring
// ---------------------------------------------------------------------------

function norm(s) {
  return (s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/** «Original Mix» no aparece como sufijo en Spotify: se trata como mix vacío. */
function normMix(mixName) {
  const m = norm(mixName)
  return m === 'original mix' || m === 'original' ? '' : m
}

function artistMatches(ourName, candArtists) {
  const our = norm(ourName)
  if (!our) return false
  return candArtists.some((c) => {
    const cn = norm(c)
    return cn === our || cn.includes(our) || our.includes(cn)
  })
}

/**
 * Puntúa un candidato de Spotify contra nuestra fila.
 * Devuelve 0 si no es aceptable (título o artistas no cuadran).
 */
function scoreCandidate(row, cand) {
  const ourTitle = norm(row.title)
  const ourMix = normMix(row.mix_name)
  const candName = norm(cand.name)
  // «Title - Extended Mix» → base «title»
  const candBase = norm(String(cand.name).split(/\s+[-–—]\s+/)[0])
  const candArtists = (cand.artists || []).map((a) => a?.name || '')

  const titleExact = candName === ourTitle || candBase === ourTitle
  const titleContained = !titleExact && (candName.includes(ourTitle) || ourTitle.includes(candBase))
  if (!titleExact && !titleContained) return 0

  const ourArtists = (Array.isArray(row.artists) ? row.artists : [])
    .map((a) => (a && typeof a === 'object' ? a.name : a))
    .filter(Boolean)
  const matched = ourArtists.filter((n) => artistMatches(n, candArtists)).length
  if (matched === 0) return 0

  let score = (titleExact ? 4 : 2) + matched * 2
  if (ourMix) {
    if (candName.includes(ourMix)) score += 3
    else score -= 1
  } else if (candName !== ourTitle && candBase === ourTitle && candName.length > ourTitle.length) {
    // Nuestro mix es «original» pero el candidato es un remix/edit con sufijo: penaliza.
    score -= 2
  }
  return score
}

function bestMatch(row, candidates) {
  let best = null
  let bestScore = 0
  for (const cand of candidates) {
    const s = scoreCandidate(row, cand)
    if (s > bestScore) {
      best = cand
      bestScore = s
    }
  }
  // Umbral mínimo: título contenido (2) + 1 artista (2) = 4.
  return bestScore >= 4 ? best : null
}

// ---------------------------------------------------------------------------
// Revalidación de caché pública (igual que chart-featured-upsert)
// ---------------------------------------------------------------------------

async function pingPublicChartsRevalidate() {
  const secret = process.env.REVALIDATE_SECRET?.trim()
  const base = (process.env.SITE_URL || process.env.NEXT_PUBLIC_SITE_URL || process.env.VERCEL_URL)?.trim()
  if (!secret || !base) return
  const origin = /^https?:\/\//i.test(base) ? base : `https://${base}`
  const url = `${origin.replace(/\/$/, '')}/api/revalidate?secret=${encodeURIComponent(secret)}`
  try {
    const res = await fetch(url, { method: 'POST' })
    if (res.ok) console.log('  ↳ Caché web pública invalidada (/charts).')
    else console.warn(`  ⚠ Revalidate HTTP ${res.status} — los enlaces pueden tardar ~5 min en verse online.`)
  } catch (e) {
    console.warn(`  ⚠ No se pudo invalidar caché web: ${e instanceof Error ? e.message : String(e)}`)
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function processTable(table) {
  const rows = await fetchRows(table)
  console.log(`\n■ ${table}: ${rows.length} filas ${FORCE ? '(--force: re-matcheo)' : 'pendientes'}${WEEK ? ` — semana ${WEEK}` : ''}`)
  let matched = 0
  let notFound = 0
  const misses = []

  for (const row of rows) {
    const artistNames = (Array.isArray(row.artists) ? row.artists : [])
      .map((a) => (a && typeof a === 'object' ? a.name : a))
      .filter(Boolean)
    const label = `«${row.title}»${row.mix_name ? ` (${row.mix_name})` : ''} — ${artistNames.join(', ')}`

    // Búsqueda con campos (precisa); si nada aceptable, texto plano (laxa).
    const cleanTitle = String(row.title).replace(/"/g, '')
    const firstArtist = String(artistNames[0] || '').replace(/"/g, '')
    let candidates = await spotifySearch(`track:"${cleanTitle}" artist:"${firstArtist}"`)
    let hit = bestMatch(row, candidates)
    if (!hit) {
      await sleep(PAUSE_MS)
      candidates = await spotifySearch(`${artistNames.join(' ')} ${row.title}`)
      hit = bestMatch(row, candidates)
    }

    if (hit) {
      const spotifyUrl = hit.external_urls?.spotify || `https://open.spotify.com/track/${hit.id}`
      matched++
      console.log(`  ✓ ${label}\n      → ${spotifyUrl}  [${hit.name} — ${(hit.artists || []).map((a) => a.name).join(', ')}]`)
      if (!DRY_RUN) await sbPatch(table, row.id, { spotify_url: spotifyUrl })
    } else {
      notFound++
      misses.push(label)
      console.log(`  ✗ ${label} — sin match fiable (queda enlace de búsqueda en la UI)`)
    }
    await sleep(PAUSE_MS)
  }

  console.log(`  ── ${table}: ${matched} matches, ${notFound} sin match.`)
  return { matched, notFound, misses }
}

async function main() {
  console.log(`Spotify matching — tablas: ${TABLE}${DRY_RUN ? ' (dry-run, no escribe)' : ''}`)
  const totals = { matched: 0, notFound: 0 }
  const tables = TABLE === 'all' ? ['chart_tracks', 'chart_featured_tracks'] : TABLE === 'chart' ? ['chart_tracks'] : ['chart_featured_tracks']
  for (const t of tables) {
    const r = await processTable(t)
    totals.matched += r.matched
    totals.notFound += r.notFound
  }
  console.log(`\nTotal: ${totals.matched} enlaces guardados, ${totals.notFound} sin match.`)
  if (!DRY_RUN && totals.matched > 0) await pingPublicChartsRevalidate()
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
