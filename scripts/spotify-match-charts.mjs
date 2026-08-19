/**
 * OPTIMAL BREAKS — Matching de tracks del chart contra Spotify / TIDAL
 * (columnas spotify_url / tidal_url en chart_tracks + chart_featured_tracks)
 *
 * Recorre chart_tracks (40 Breaks Vitales) y chart_featured_tracks (New Releases)
 * y rellena la columna del servicio con el enlace verificado al track.
 * UI: el botón SPOTIFY se muestra siempre (fallback a búsqueda); el botón TIDAL
 * solo aparece con match verificado (su catálogo de breaks es más limitado).
 *
 *   node scripts/spotify-match-charts.mjs                       # Spotify, charts pendientes (spotify_url NULL)
 *   node scripts/spotify-match-charts.mjs --service=tidal       # TIDAL (tidal_url NULL)
 *   node scripts/spotify-match-charts.mjs --week=2026-08-10     # solo esa edición (lunes ISO)
 *   node scripts/spotify-match-charts.mjs --table=featured      # chart | featured | all (charts)
 *   node scripts/spotify-match-charts.mjs --table=beatport      # Top 10 Beatport de artists + labels (JSONB)
 *   node scripts/spotify-match-charts.mjs --table=artists       # solo Top 10 de artistas | labels = solo sellos
 *   node scripts/spotify-match-charts.mjs --dry-run             # no escribe en BD
 *   node scripts/spotify-match-charts.mjs --force               # re-matchea también filas con enlace
 *   node scripts/spotify-match-charts.mjs --limit=50            # tope de filas/tracks por tabla
 *
 * Requiere .env.local:
 *   SPOTIFY_CLIENT_ID + SPOTIFY_CLIENT_SECRET  (app en developer.spotify.com; client credentials)
 *   TIDAL_CLIENT_ID + TIDAL_CLIENT_SECRET      (app en developer.tidal.com; solo --service=tidal)
 *   NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY)
 *
 * Redes con SSL inspection (Acttax): si falla el TLS contra accounts.spotify.com,
 * ejecutar con `node --use-system-ca scripts/spotify-match-charts.mjs …`.
 *
 * Criterio de match (conservador; mejor NULL que enlace equivocado):
 *   - el título normalizado debe coincidir (exacto o contenido en el nombre del track);
 *   - al menos un artista nuestro debe estar entre los artistas del candidato;
 *   - el mix_name («Extended Mix»…) puntúa pero no bloquea («Original Mix» se ignora:
 *     el mix original suele ir sin sufijo en streaming).
 * Ambigüedad o cero candidatos → se deja NULL y se lista en el resumen.
 *
 * Cuotas: Spotify Development Mode tiene cuota diaria (~1.300 búsquedas por cuenta);
 * al agotarse el script corta con resumen y se reanuda otro día donde quedó.
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
const SERVICE = (argValue('service', 'spotify') || 'spotify').toLowerCase()

if (!['all', 'chart', 'featured', 'beatport', 'artists', 'labels'].includes(TABLE)) {
  console.error(`--table debe ser chart | featured | all | beatport | artists | labels (recibido: ${TABLE})`)
  process.exit(1)
}
if (!['spotify', 'tidal'].includes(SERVICE)) {
  console.error(`--service debe ser spotify | tidal (recibido: ${SERVICE})`)
  process.exit(1)
}
/** Columna destino en BD según servicio. */
const COLUMN = SERVICE === 'tidal' ? 'tidal_url' : 'spotify_url'

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
  const cols = `id,title,mix_name,artists,label,${COLUMN}`
  const filters = []
  if (!FORCE) filters.push(`${COLUMN}=is.null`)
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
// APIs de streaming (client credentials). Ambos backends devuelven candidatos
// normalizados: { name, artists: string[], url }.
// ---------------------------------------------------------------------------

const SVC = SERVICE === 'tidal'
  ? {
      label: 'TIDAL',
      id: process.env.TIDAL_CLIENT_ID || '',
      secret: process.env.TIDAL_CLIENT_SECRET || '',
      tokenUrl: 'https://auth.tidal.com/v1/oauth2/token',
      credsHelp:
        'Faltan TIDAL_CLIENT_ID / TIDAL_CLIENT_SECRET en .env.local.\n' +
        'Crea una app en https://developer.tidal.com/dashboard y copia Client ID + Client Secret.',
    }
  : {
      label: 'Spotify',
      id: process.env.SPOTIFY_CLIENT_ID || '',
      secret: process.env.SPOTIFY_CLIENT_SECRET || '',
      tokenUrl: 'https://accounts.spotify.com/api/token',
      credsHelp:
        'Faltan SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET en .env.local.\n' +
        'Crea una app en https://developer.spotify.com/dashboard (Web API; requiere cuenta Premium\n' +
        'desde feb-2026) y copia Client ID + Client Secret. La UI funciona sin esto (enlace de búsqueda).',
    }

if (!SVC.id || !SVC.secret) {
  console.error(SVC.credsHelp)
  process.exit(1)
}

let tokenCache = { value: '', expiresAt: 0 }
async function serviceToken() {
  if (tokenCache.value && Date.now() < tokenCache.expiresAt - 30_000) return tokenCache.value
  const res = await fetch(SVC.tokenUrl, {
    method: 'POST',
    headers: {
      Authorization: `Basic ${Buffer.from(`${SVC.id}:${SVC.secret}`).toString('base64')}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: 'grant_type=client_credentials',
  })
  if (!res.ok) throw new Error(`${SVC.label} token: HTTP ${res.status} ${await res.text()}`)
  const json = await res.json()
  tokenCache = { value: json.access_token, expiresAt: Date.now() + (json.expires_in || 3600) * 1000 }
  return tokenCache.value
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

/** Cuota diaria por cuenta agotada (Spotify Development Mode): reanudar otro día. */
class QuotaExceeded extends Error {
  constructor(retryAfterSec) {
    super(`cuota diaria de la API agotada (retry-after ${retryAfterSec}s)`)
    this.quotaExceeded = true
  }
}

/** fetch con manejo de 429 (rate limit corto → espera; cuota diaria → aborta). */
async function fetchWith429(url, headers) {
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(url, { headers })
    if (res.status === 429) {
      const retry = Number(res.headers.get('retry-after') || '2')
      const body = await res.text().catch(() => '')
      if (retry > 600 || body.includes('QUOTA_EXCEEDED')) throw new QuotaExceeded(retry)
      console.warn(`  … rate limit ${SVC.label}, esperando ${retry}s`)
      await sleep((retry + 1) * 1000)
      continue
    }
    if (!res.ok) throw new Error(`${SVC.label} search: HTTP ${res.status} ${await res.text()}`)
    return res.json()
  }
  throw new Error(`${SVC.label} search: rate limit persistente (429 x3)`)
}

async function spotifySearch(query) {
  const token = await serviceToken()
  const url = `https://api.spotify.com/v1/search?type=track&limit=10&market=${encodeURIComponent(MARKET)}&q=${encodeURIComponent(query)}`
  const json = await fetchWith429(url, { Authorization: `Bearer ${token}` })
  return (json?.tracks?.items || []).map((t) => ({
    name: t.name || '',
    artists: (t.artists || []).map((a) => a?.name || '').filter(Boolean),
    url: t.external_urls?.spotify || `https://open.spotify.com/track/${t.id}`,
  }))
}

async function tidalSearch(query) {
  const token = await serviceToken()
  const url = `https://openapi.tidal.com/v2/searchResults?filter[query]=${encodeURIComponent(query)}&countryCode=${encodeURIComponent(MARKET)}&include=tracks.artists`
  const json = await fetchWith429(url, {
    Authorization: `Bearer ${token}`,
    Accept: 'application/vnd.api+json',
  })
  const included = json?.included || []
  const artistById = new Map(
    included.filter((r) => r.type === 'artists').map((a) => [a.id, a.attributes?.name || '']),
  )
  return included
    .filter((r) => r.type === 'tracks')
    .map((t) => {
      const title = t.attributes?.title || ''
      const version = (t.attributes?.version || '').trim()
      return {
        // `version` es el mix («Extended Mix»…); se añade al nombre para el scoring.
        name: version && !title.toLowerCase().includes(version.toLowerCase()) ? `${title} (${version})` : title,
        artists: (t.relationships?.artists?.data || []).map((r) => artistById.get(r.id) || '').filter(Boolean),
        url: t.attributes?.externalLinks?.[0]?.href || `https://tidal.com/browse/track/${t.id}`,
      }
    })
}

const searchTracks = SERVICE === 'tidal' ? tidalSearch : spotifySearch

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
 * Puntúa un candidato normalizado ({ name, artists: string[], url }) contra
 * nuestra fila. Devuelve 0 si no es aceptable (título o artistas no cuadran).
 */
function scoreCandidate(row, cand) {
  const ourTitle = norm(row.title)
  const ourMix = normMix(row.mix_name)
  const candName = norm(cand.name)
  // «Title - Extended Mix» → base «title»
  const candBase = norm(String(cand.name).split(/\s+[-–—]\s+/)[0])
  const candArtists = cand.artists || []

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

/**
 * Busca el mejor match de streaming para una fila { title, mix_name, artists, label }.
 * Cachea por firma normalizada (título+primer artista) para no repetir búsquedas de
 * un mismo track que aparece en varias fichas (Top 10 de artista y de sello, colabos…).
 * Devuelve el candidato ({name, artists, url}) o null. Lanza QuotaExceeded al agotar cuota.
 */
const matchCache = new Map()
async function findMatch(row) {
  const artistNames = (Array.isArray(row.artists) ? row.artists : [])
    .map((a) => (a && typeof a === 'object' ? a.name : a))
    .filter(Boolean)
  const cleanTitle = String(row.title || '').replace(/"/g, '')
  const firstArtist = String(artistNames[0] || '').replace(/"/g, '')
  const cacheKey = `${norm(cleanTitle)}|${normMix(row.mix_name)}|${norm(firstArtist)}`
  if (matchCache.has(cacheKey)) return matchCache.get(cacheKey)

  const queries = SERVICE === 'tidal'
    ? [`${firstArtist} ${cleanTitle}`, cleanTitle]
    : [`track:"${cleanTitle}" artist:"${firstArtist}"`, `${artistNames.join(' ')} ${row.title}`]
  let hit = bestMatch(row, await searchTracks(queries[0]))
  if (!hit) {
    await sleep(PAUSE_MS)
    hit = bestMatch(row, await searchTracks(queries[1]))
  }
  matchCache.set(cacheKey, hit || null)
  await sleep(PAUSE_MS)
  return hit || null
}

function rowLabel(row) {
  const artistNames = (Array.isArray(row.artists) ? row.artists : [])
    .map((a) => (a && typeof a === 'object' ? a.name : a))
    .filter(Boolean)
  return `«${row.title}»${row.mix_name ? ` (${row.mix_name})` : ''} — ${artistNames.join(', ')}`
}

async function processTable(table) {
  const rows = await fetchRows(table)
  console.log(`\n■ ${table}: ${rows.length} filas ${FORCE ? '(--force: re-matcheo)' : 'pendientes'}${WEEK ? ` — semana ${WEEK}` : ''}`)
  let matched = 0
  let notFound = 0
  const misses = []

  for (const row of rows) {
    const label = rowLabel(row)
    let hit
    try {
      hit = await findMatch(row)
    } catch (e) {
      if (e?.quotaExceeded) {
        console.warn(`\n  ■ ${e.message}. Progreso guardado: reejecuta el script mañana y continuará con las filas pendientes (${COLUMN} NULL).`)
        return { matched, notFound, misses, quotaExceeded: true }
      }
      throw e
    }

    if (hit) {
      matched++
      console.log(`  ✓ ${label}\n      → ${hit.url}  [${hit.name} — ${(hit.artists || []).join(', ')}]`)
      if (!DRY_RUN) await sbPatch(table, row.id, { [COLUMN]: hit.url })
    } else {
      notFound++
      misses.push(label)
      console.log(`  ✗ ${label} — sin match fiable`)
    }
  }

  console.log(`  ── ${table}: ${matched} matches, ${notFound} sin match.`)
  return { matched, notFound, misses }
}

/** Filas de artists/labels con Top 10 de Beatport (JSONB beatport_top_tracks). */
async function fetchEntities(entityTable) {
  const rows = []
  const PAGE = 500
  // El filtrado por elemento (algunos ya tienen url) se hace en JS al iterar el array.
  for (let offset = 0; ; offset += PAGE) {
    const page = await sbGet(
      `${entityTable}?select=id,slug,beatport_top_tracks&beatport_top_tracks=not.is.null&order=id&limit=${PAGE}&offset=${offset}`,
    )
    rows.push(...page.filter((r) => Array.isArray(r.beatport_top_tracks) && r.beatport_top_tracks.length))
    if (page.length < PAGE) break
  }
  return rows
}

/**
 * Procesa el Top 10 de Beatport embebido en artists/labels: matchea cada track del
 * array JSONB y reescribe la columna con los nuevos {COLUMN}. Solo toca elementos sin
 * enlace (salvo --force). PATCH del array completo una vez por entidad.
 */
async function processBeatportEntity(entityTable) {
  const entities = await fetchEntities(entityTable)
  const totalTracks = entities.reduce((n, e) => n + e.beatport_top_tracks.length, 0)
  console.log(`\n■ ${entityTable}.beatport_top_tracks: ${entities.length} fichas, ${totalTracks} tracks ${FORCE ? '(--force: re-matcheo)' : ''}`)
  let matched = 0
  let notFound = 0
  const misses = []
  let processedTracks = 0

  for (const ent of entities) {
    const list = ent.beatport_top_tracks
    let changed = false
    for (const el of list) {
      if (!FORCE && el[COLUMN]) continue // ya tiene enlace de este servicio
      if (LIMIT && processedTracks >= LIMIT) break
      processedTracks++
      const row = { title: el.title, mix_name: el.mix_name, artists: el.artists, label: el.label }
      const label = `[${ent.slug}] ${rowLabel(row)}`
      let hit
      try {
        hit = await findMatch(row)
      } catch (e) {
        if (e?.quotaExceeded) {
          if (changed && !DRY_RUN) await sbPatch(entityTable, ent.id, { beatport_top_tracks: list })
          console.warn(`\n  ■ ${e.message}. Progreso guardado: reejecuta mañana y seguirá por los tracks sin ${COLUMN}.`)
          return { matched, notFound, misses, quotaExceeded: true }
        }
        throw e
      }
      if (hit) {
        matched++
        el[COLUMN] = hit.url
        changed = true
        console.log(`  ✓ ${label}\n      → ${hit.url}`)
      } else {
        notFound++
        misses.push(label)
        console.log(`  ✗ ${label} — sin match fiable`)
      }
    }
    if (changed && !DRY_RUN) await sbPatch(entityTable, ent.id, { beatport_top_tracks: list })
    if (LIMIT && processedTracks >= LIMIT) break
  }

  console.log(`  ── ${entityTable}.beatport_top_tracks: ${matched} matches, ${notFound} sin match.`)
  return { matched, notFound, misses }
}

async function main() {
  console.log(`${SVC.label} matching (columna ${COLUMN}) — tablas: ${TABLE}${DRY_RUN ? ' (dry-run, no escribe)' : ''}`)
  const totals = { matched: 0, notFound: 0 }

  // Charts (chart_tracks / chart_featured_tracks)
  const chartTables =
    TABLE === 'all' ? ['chart_tracks', 'chart_featured_tracks']
    : TABLE === 'chart' ? ['chart_tracks']
    : TABLE === 'featured' ? ['chart_featured_tracks']
    : []
  // Top 10 Beatport embebido (artists / labels)
  const beatportEntities =
    TABLE === 'beatport' ? ['artists', 'labels']
    : TABLE === 'artists' ? ['artists']
    : TABLE === 'labels' ? ['labels']
    : []

  let stop = false
  for (const t of chartTables) {
    const r = await processTable(t)
    totals.matched += r.matched
    totals.notFound += r.notFound
    if (r.quotaExceeded) { stop = true; break }
  }
  if (!stop) {
    for (const e of beatportEntities) {
      const r = await processBeatportEntity(e)
      totals.matched += r.matched
      totals.notFound += r.notFound
      if (r.quotaExceeded) break
    }
  }

  console.log(`\nTotal: ${totals.matched} enlaces guardados, ${totals.notFound} sin match.`)
  if (!DRY_RUN && totals.matched > 0) await pingPublicChartsRevalidate()
}

main().catch((e) => {
  console.error(`\nERROR: ${e instanceof Error ? e.message : String(e)}`)
  process.exit(1)
})
