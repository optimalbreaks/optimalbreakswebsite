/**
 * Rellena mixes.published_at desde la fecha de publicación de YouTube.
 *
 * 1) Si existe YOUTUBE_DATA_API_KEY (YouTube Data API v3), usa videos.list (oficial).
 * 2) Si no, intenta leer uploadDate del HTML de la página del vídeo (frágil; puede fallar).
 *
 * Uso: node scripts/backfill-mix-youtube-published-at.mjs [--force]
 *   --force  Vuelve a escribir published_at aunque ya exista.
 * Requiere: NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE (igual que artist-upsert).
 * Opcional: YOUTUBE_DATA_API_KEY (YouTube Data API v3) o yt-dlp en PATH.
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'
import { spawnSync } from 'child_process'

const YT_ID_RE = /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/

function extractYouTubeId(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.match(YT_ID_RE)
  return m ? m[1] : null
}

/** @returns {Promise<string|null>} ISO 8601 o null */
async function publishedAtFromDataApi(videoId, apiKey) {
  const u = new URL('https://www.googleapis.com/youtube/v3/videos')
  u.searchParams.set('part', 'snippet')
  u.searchParams.set('id', videoId)
  u.searchParams.set('key', apiKey)
  const r = await fetch(u)
  if (!r.ok) {
    console.warn(`Data API ${videoId}: HTTP ${r.status}`)
    return null
  }
  const j = await r.json()
  const iso = j?.items?.[0]?.snippet?.publishedAt
  return typeof iso === 'string' ? iso : null
}

/** @returns {string|null} ISO 8601 (solo fecha → medianoche UTC) o null */
function publishedAtFromHtml(html) {
  const m =
    html.match(/"uploadDate":"([^"]+)"/) ||
    html.match(/"publishDate":"([^"]+)"/) ||
    html.match(/itemprop="uploadDate"[^>]*content="([^"]+)"/)
  if (!m) return null
  const raw = m[1]
  if (/^\d{8}$/.test(raw)) {
    const y = raw.slice(0, 4)
    const mo = raw.slice(4, 6)
    const d = raw.slice(6, 8)
    return `${y}-${mo}-${d}T00:00:00.000Z`
  }
  if (/^\d{4}-\d{2}-\d{2}/.test(raw)) {
    const t = raw.includes('T') ? raw : `${raw}T00:00:00.000Z`
    try {
      return new Date(t).toISOString()
    } catch {
      return null
    }
  }
  return null
}

async function publishedAtFromWatchPage(videoId) {
  const r = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'en-US,en;q=0.9',
    },
  })
  if (!r.ok) return null
  const html = await r.text()
  return publishedAtFromHtml(html)
}

/** yt-dlp --print upload_date (YYYYMMDD) si está en PATH */
function publishedAtFromYtDlp(videoUrl) {
  const res = spawnSync('yt-dlp', ['--print', 'upload_date', '--no-download', videoUrl], {
    encoding: 'utf8',
    windowsHide: true,
  })
  if (res.status !== 0 || !res.stdout?.trim()) return null
  const ymd = res.stdout.trim()
  if (!/^\d{8}$/.test(ymd)) return null
  const y = ymd.slice(0, 4)
  const mo = ymd.slice(4, 6)
  const d = ymd.slice(6, 8)
  return `${y}-${mo}-${d}T12:00:00.000Z`
}

async function resolvePublishedAt(videoId, videoUrl, apiKey) {
  if (apiKey) {
    const iso = await publishedAtFromDataApi(videoId, apiKey)
    if (iso) return iso
  }
  const ytdl = publishedAtFromYtDlp(videoUrl)
  if (ytdl) return ytdl
  return publishedAtFromWatchPage(videoId)
}

function chunk(arr, n) {
  const out = []
  for (let i = 0; i < arr.length; i += n) out.push(arr.slice(i, i + n))
  return out
}

const force = process.argv.includes('--force')

loadEnvLocal()
const creds = supabaseApiCredentials()
if (!creds) {
  console.error('Faltan credenciales Supabase API.')
  process.exit(1)
}

const apiKey = (process.env.YOUTUBE_DATA_API_KEY || process.env.YOUTUBE_API_KEY || '').trim()

const supabase = createClient(creds.url, creds.key, {
  auth: { persistSession: false, autoRefreshToken: false },
})

const { data: mixes, error } = await supabase
  .from('mixes')
  .select('id, slug, video_url, platform, published_at')
  .eq('platform', 'youtube')

if (error) {
  console.error(error.message)
  process.exit(1)
}

const rows = (mixes || []).filter((m) => extractYouTubeId(m.video_url))
let updated = 0
let skipped = 0

for (const m of rows) {
  const id = extractYouTubeId(m.video_url)
  if (!id) continue
  if (!force && m.published_at) {
    skipped++
    continue
  }
  const iso = await resolvePublishedAt(id, m.video_url, apiKey)
  if (!iso) {
    console.warn('Sin fecha:', m.slug, id)
    continue
  }
  const { error: upErr } = await supabase.from('mixes').update({ published_at: iso }).eq('id', m.id)
  if (upErr) {
    console.error('Update', m.slug, upErr.message)
    continue
  }
  console.log('OK', m.slug, iso)
  updated++
  await new Promise((r) => setTimeout(r, apiKey ? 120 : 400))
}

console.log(`Hecho. Actualizados: ${updated}, ya tenían fecha: ${skipped}, total youtube con URL: ${rows.length}`)
if (!apiKey) {
  console.log(
    'Opcional: YOUTUBE_DATA_API_KEY en .env.local para API oficial (cuota diaria). Sin clave se usa yt-dlp si existe, o scraping HTML.',
  )
}
