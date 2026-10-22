/**
 * OPTIMAL BREAKS — Añade a la lista de Spotify «Temazos 2026» los temas
 * que destacan los artículos de /topreleases (quincena y temporada).
 *
 *   node --import tsx scripts/spotify-temazos.mjs --dry-run
 *   node --import tsx scripts/spotify-temazos.mjs --auth
 *   node --import tsx scripts/spotify-temazos.mjs
 *
 * Qué entra, el mismo corte que /topreleases, en directo:
 *   - periodo que cierra antes del 6 oct 2026 → los más votados (20 en temporada, 10 en quincena)
 *   - a partir de esa fecha → los 20 más escuchados
 * Un tema que ya está en la lista no se repite. No se borra nada de la lista.
 * Solo entran enlaces de ficha (`open.spotify.com/track/…`). Una búsqueda no.
 *
 * La primera vez, `--auth` abre Spotify en el navegador. Hay que aceptar con la
 * cuenta donde vive la lista (Premium). El refresh token se guarda en `.env.local`
 * (`SPOTIFY_REFRESH_TOKEN`), que no se versiona.
 * En el panel de la app (developer.spotify.com → Settings → Redirect URIs) tiene
 * que estar `http://127.0.0.1:8888/callback`.
 *
 * Al publicar una quincena o un trimestre, `generar-blog-agente.mjs` lanza este
 * script. Sin token, avisa y no tumba el artículo.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
import { createServer } from 'http'
import { spawn } from 'child_process'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const PLAYLIST_NAME = 'TEMAZOS 2026'
/** Mismo id que `CHANNEL_PLAYLISTS` en src/content/channels.ts. */
const PLAYLIST_ID = '1IeXy1JkoPIRpX9TPCuPYI'
const PLAYS_SINCE = '2026-10-06'
const REDIRECT_URI = 'http://127.0.0.1:8888/callback'
const SCOPES = 'playlist-read-private playlist-modify-public playlist-modify-private'

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
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

function saveEnvLocal(key, value) {
  const path = join(ROOT, '.env.local')
  let text = existsSync(path) ? readFileSync(path, 'utf8') : ''
  const line = `${key}=${value}`
  const re = new RegExp(`^${key}=.*$`, 'm')
  if (re.test(text)) text = text.replace(re, line)
  else text = `${text.replace(/\s*$/, '')}\n${line}\n`
  writeFileSync(path, text)
  process.env[key] = value
}

loadEnv()

const args = new Set(process.argv.slice(2))
const DRY = args.has('--dry-run')
const AUTH = args.has('--auth')

const SUPABASE_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').replace(/\/$/, '')
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
const CLIENT_ID = process.env.SPOTIFY_CLIENT_ID || ''
const CLIENT_SECRET = process.env.SPOTIFY_CLIENT_SECRET || ''

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y/o SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
if (!CLIENT_ID || !CLIENT_SECRET) {
  console.error('Faltan SPOTIFY_CLIENT_ID / SPOTIFY_CLIENT_SECRET en .env.local')
  process.exit(1)
}

const SB_HEADERS = {
  apikey: SERVICE_KEY,
  Authorization: `Bearer ${SERVICE_KEY}`,
  'Content-Type': 'application/json',
}

function trackIdFromUrl(url) {
  const s = String(url || '').trim()
  if (!s) return null
  const uri = s.match(/^spotify:track:([A-Za-z0-9]+)$/)
  if (uri) return uri[1]
  try {
    const u = new URL(s)
    if (!u.hostname.endsWith('spotify.com')) return null
    const m = u.pathname.match(/\/track\/([A-Za-z0-9]+)/)
    return m ? m[1] : null
  } catch {
    return null
  }
}

function labelOf(t) {
  const mix = t.mix_name && !/^original mix$/i.test(t.mix_name) ? ` (${t.mix_name})` : ''
  return `${t.artists || '—'} — ${t.title || '—'}${mix}`
}

/** Misma lista que pinta /topreleases: votos si el periodo cierra antes del 6 oct 2026; si no, los más escuchados. */
function rankedFromLive(digest, live) {
  const votes = digest.until < PLAYS_SINCE
  if (votes && live?.voted?.length) return live.voted
  if (!votes && live?.released?.length) return live.released
  if (!votes && live?.played?.length) return live.played
  if (votes && Array.isArray(digest.voted)) return digest.voted
  if (Array.isArray(digest.released) && digest.released.length) return digest.released
  return Array.isArray(digest.played) ? digest.played : []
}

async function fortnightLoader() {
  const mod = await import('../src/lib/fortnight-live.ts')
  const fn = mod.loadFortnightLive || mod.default?.loadFortnightLive
  if (typeof fn !== 'function') throw new Error('No se pudo cargar el ranking en directo de /topreleases')
  return fn
}

async function sbGet(pathAndQuery) {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/${pathAndQuery}`, { headers: SB_HEADERS })
  if (!res.ok) throw new Error(`Supabase GET ${res.status} ${await res.text()}`)
  return res.json()
}

async function loadArticles() {
  const posts = []
  for (let offset = 0; ; offset += 100) {
    const rows = await sbGet(
      `blog_posts?select=slug,title_es,digest&is_published=eq.true&digest=not.is.null&order=id.asc&limit=100&offset=${offset}`,
    )
    posts.push(...rows)
    if (rows.length < 100) break
  }
  const load = await fortnightLoader()
  const articles = []
  for (const p of posts) {
    const digest = p.digest
    if (!digest || digest.kind === 'agenda' || !digest.from || !digest.until) continue
    const topN = digest.kind === 'trimestre' ? 20 : 10
    let live = null
    try {
      live = await load(digest.from, digest.until, topN)
    } catch (err) {
      console.warn(`[temazos] Ranking en directo de ${p.slug}: ${err instanceof Error ? err.message : err}`)
    }
    const tracks = rankedFromLive(digest, live)
    if (tracks.length) articles.push({ ...p, tracks })
  }
  return articles.sort(
    (a, b) => String(a.digest.from).localeCompare(String(b.digest.from)) || String(a.digest.until).localeCompare(String(b.digest.until)),
  )
}

async function freshSpotify(ids) {
  const map = new Map()
  const list = [...ids]
  if (!list.length) return map
  for (let i = 0; i < list.length; i += 60) {
    const chunk = list.slice(i, i + 60).join(',')
    const rows = await sbGet(`chart_featured_tracks?select=id,spotify_url&id=in.(${chunk})`)
    for (const r of rows) map.set(r.id, r.spotify_url || null)
  }
  return map
}

async function collect() {
  const articles = await loadArticles()
  const ids = new Set()
  for (const a of articles) for (const t of a.tracks) if (t.featured_id) ids.add(t.featured_id)
  const fresh = await freshSpotify(ids)
  const picked = []
  const seen = new Set()
  const missing = []
  for (const a of articles) {
    const rank = a.digest.until < PLAYS_SINCE ? 'votos' : 'escuchas'
    const rows = []
    for (const t of a.tracks) {
      const url = t.featured_id && fresh.has(t.featured_id) ? fresh.get(t.featured_id) : t.spotify_url
      const id = trackIdFromUrl(url)
      const line = labelOf(t)
      if (!id) {
        missing.push({ article: a.title_es, line })
        continue
      }
      const uri = `spotify:track:${id}`
      if (seen.has(uri)) continue
      seen.add(uri)
      rows.push({ uri, line })
    }
    picked.push({ slug: a.slug, title: a.title_es, from: a.digest.from, until: a.digest.until, rank, rows })
  }
  return { picked, missing }
}

function basicAuth() {
  return `Basic ${Buffer.from(`${CLIENT_ID}:${CLIENT_SECRET}`).toString('base64')}`
}

async function tokenRequest(body) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { Authorization: basicAuth(), 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(body),
  })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new Error(`Spotify token ${res.status}: ${json.error_description || json.error || res.statusText}`)
  return json
}

function openBrowser(url) {
  if (process.platform === 'win32') spawn('cmd', ['/c', 'start', '', url], { detached: true, stdio: 'ignore' }).unref()
  else if (process.platform === 'darwin') spawn('open', [url], { detached: true, stdio: 'ignore' }).unref()
  else spawn('xdg-open', [url], { detached: true, stdio: 'ignore' }).unref()
}

function waitForCode() {
  return new Promise((resolveCode, reject) => {
    const server = createServer((req, res) => {
      const url = new URL(req.url || '/', REDIRECT_URI)
      const code = url.searchParams.get('code')
      const error = url.searchParams.get('error')
      res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' })
      res.end(code ? '<p>Listo. Puedes cerrar esta pestaña.</p>' : `<p>Spotify no autorizó: ${error || 'sin código'}.</p>`)
      server.close()
      if (code) resolveCode(code)
      else reject(new Error(error || 'autorización cancelada'))
    })
    server.listen(8888, '127.0.0.1', () => {
      const q = new URLSearchParams({
        client_id: CLIENT_ID,
        response_type: 'code',
        redirect_uri: REDIRECT_URI,
        scope: SCOPES,
      })
      const url = `https://accounts.spotify.com/authorize?${q}`
      console.log(`Abre Spotify e inicia sesión en la cuenta de «${PLAYLIST_NAME}».`)
      console.log('Si Spotify dice Invalid redirect URI, añade en la app esta dirección:')
      console.log(`  ${REDIRECT_URI}`)
      openBrowser(url)
    })
    server.on('error', reject)
    setTimeout(() => {
      server.close()
      reject(new Error('nadie autorizó en 3 minutos'))
    }, 180_000).unref()
  })
}

async function accessToken() {
  let refresh = process.env.SPOTIFY_REFRESH_TOKEN || ''
  if (AUTH || !refresh) {
    const code = await waitForCode()
    const tok = await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI })
    if (!tok.refresh_token) throw new Error('Spotify no devolvió refresh token')
    saveEnvLocal('SPOTIFY_REFRESH_TOKEN', tok.refresh_token)
    console.log('Token guardado en .env.local')
    return tok.access_token
  }
  const tok = await tokenRequest({ grant_type: 'refresh_token', refresh_token: refresh })
  if (tok.refresh_token) saveEnvLocal('SPOTIFY_REFRESH_TOKEN', tok.refresh_token)
  return tok.access_token
}

async function api(token, path, options = {}) {
  const res = await fetch(`https://api.spotify.com/v1${path}`, {
    ...options,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(options.headers || {}) },
  })
  if (res.status === 204) return null
  const json = await res.json().catch(() => ({}))
  if (!res.ok) {
    const msg = json?.error?.message || res.statusText
    throw new Error(`Spotify ${options.method || 'GET'} ${path}: ${res.status} ${msg}`)
  }
  return json
}

async function findPlaylist(token) {
  try {
    const known = await api(token, `/playlists/${PLAYLIST_ID}`)
    if (known?.id) return known
  } catch {
    /* si el id no responde, se busca por nombre */
  }
  const me = await api(token, '/me')
  let url = '/me/playlists?limit=50'
  const similar = []
  while (url) {
    const page = await api(token, url.startsWith('http') ? url.replace('https://api.spotify.com/v1', '') : url)
    for (const p of page.items || []) {
      const name = String(p.name || '').trim()
      if (name.toLowerCase().includes('temazo')) similar.push(`${name}${p.owner?.id === me.id ? '' : ' (de otra cuenta)'}`)
      if (name.toLowerCase() === PLAYLIST_NAME.toLowerCase() && p.owner?.id === me.id) return p
    }
    url = page.next
  }
  const hint = similar.length ? ` He visto: ${similar.join(' · ')}` : ''
  throw new Error(`No hay una lista tuya llamada «${PLAYLIST_NAME}».${hint}`)
}

function itemUri(row) {
  return row?.item?.uri || row?.track?.uri || null
}

async function playlistUris(token, id) {
  const have = new Set()
  let path = `/playlists/${id}/items?limit=100&fields=next,items(item(uri),track(uri))`
  while (path) {
    let page
    try {
      page = await api(token, path)
    } catch (err) {
      if (!String(err.message).includes('404') || path.includes('/tracks')) throw err
      path = path.replace('/items?', '/tracks?')
      continue
    }
    for (const row of page.items || []) {
      const uri = itemUri(row)
      if (uri) have.add(uri)
    }
    path = page.next ? page.next.replace('https://api.spotify.com/v1', '') : ''
  }
  return have
}

async function addUris(token, id, uris) {
  let path = `/playlists/${id}/items`
  for (let i = 0; i < uris.length; i += 100) {
    const chunk = uris.slice(i, i + 100)
    try {
      await api(token, path, { method: 'POST', body: JSON.stringify({ uris: chunk }) })
    } catch (err) {
      if (!String(err.message).includes('404') || path.endsWith('/tracks')) throw err
      path = `/playlists/${id}/tracks`
      await api(token, path, { method: 'POST', body: JSON.stringify({ uris: chunk }) })
    }
  }
}

async function main() {
  const { picked, missing } = await collect()
  const total = picked.reduce((n, a) => n + a.rows.length, 0)
  console.log(`Artículos: ${picked.length}. Temas con ficha de Spotify (sin repetir): ${total}. Sin ficha: ${missing.length}.`)
  for (const a of picked) {
    console.log(`\n${a.from} → ${a.until} · ${a.rank} · ${a.title} (${a.rows.length})`)
    for (const [i, row] of a.rows.entries()) console.log(`  ${i + 1}. ${row.line}`)
  }
  if (missing.length) {
    console.log('\nSin enlace de tema en Spotify (no se añaden):')
    for (const m of missing) console.log(`  · ${m.line}  [${m.article}]`)
  }
  if (DRY) return
  if (!process.env.SPOTIFY_REFRESH_TOKEN && !AUTH) {
    console.log('\nFalta autorizar la cuenta. Ejecuta: npm run db:spotify:temazos -- --auth')
    process.exit(process.env.OB_TEMAZOS_OPTIONAL === '1' ? 0 : 1)
  }
  const token = await accessToken()
  const playlist = await findPlaylist(token)
  const have = await playlistUris(token, playlist.id)
  const fresh = []
  for (const a of picked) for (const row of a.rows) if (!have.has(row.uri)) fresh.push(row)
  if (!fresh.length) {
    console.log(`\n«${PLAYLIST_NAME}» ya tiene esos ${total} temas.`)
    return
  }
  await addUris(token, playlist.id, fresh.map((r) => r.uri))
  console.log(`\nAñadidos ${fresh.length} a «${PLAYLIST_NAME}». Ya estaban ${total - fresh.length}.`)
  for (const row of fresh) console.log(`  + ${row.line}`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
