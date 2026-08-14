/**
 * Rellena mixes.published_at (y duration_minutes en SoundCloud) desde la plataforma.
 *
 * YouTube:
 *   1) YOUTUBE_DATA_API_KEY (API v3) → videos.list
 *   2) yt-dlp --print upload_date si está en PATH
 *   3) scraping HTML uploadDate
 *
 * SoundCloud:
 *   scraping HTML de la página del track → created_at + duration (ms)
 *
 * Uso: node scripts/backfill-mix-youtube-published-at.mjs [--force]
 *   --force  Vuelve a escribir published_at aunque ya exista.
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

function isSoundCloudTrackUrl(url) {
  if (!url || typeof url !== 'string') return false
  try {
    const u = new URL(url)
    return u.hostname.includes('soundcloud.com') && u.pathname.split('/').filter(Boolean).length >= 2
  } catch {
    return false
  }
}

/** @returns {Promise<{ published_at: string|null, duration_minutes: number|null }>} */
async function soundCloudMetaFromPage(trackUrl) {
  const r = await fetch(trackUrl, {
    headers: {
      'User-Agent':
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
      'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
    },
  })
  if (!r.ok) return { published_at: null, duration_minutes: null }
  const html = await r.text()
  const created = html.match(/"created_at":"([^"]+)"/)?.[1] ?? null
  const durMs = html.match(/"duration":(\d+)/)?.[1]
  let published_at = null
  if (created) {
    try {
      published_at = new Date(created).toISOString()
    } catch {
      published_at = null
    }
  }
  const duration_minutes =
    durMs && Number.isFinite(Number(durMs)) ? Math.max(1, Math.round(Number(durMs) / 60000)) : null
  return { published_at, duration_minutes }
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

console.log(`YouTube. Actualizados: ${updated}, ya tenían fecha: ${skipped}, total: ${rows.length}`)
if (!apiKey) {
  console.log(
    'Opcional: YOUTUBE_DATA_API_KEY en .env.local para API oficial (cuota diaria). Sin clave se usa yt-dlp si existe, o scraping HTML.',
  )
}

const { data: scMixes, error: scErr } = await supabase
  .from('mixes')
  .select('id, slug, embed_url, platform, published_at, duration_minutes')
  .eq('platform', 'soundcloud')

if (scErr) {
  console.error(scErr.message)
  process.exit(1)
}

const scRows = (scMixes || []).filter((m) => isSoundCloudTrackUrl(m.embed_url))
let scUpdated = 0
let scSkipped = 0

for (const m of scRows) {
  const url = m.embed_url.trim()
  if (!force && m.published_at) {
    scSkipped++
    continue
  }
  const meta = await soundCloudMetaFromPage(url)
  if (!meta.published_at) {
    console.warn('SoundCloud sin fecha:', m.slug, url)
    continue
  }
  const patch = { published_at: meta.published_at }
  if (meta.duration_minutes != null && (force || m.duration_minutes == null)) {
    patch.duration_minutes = meta.duration_minutes
  }
  const { error: upErr } = await supabase.from('mixes').update(patch).eq('id', m.id)
  if (upErr) {
    console.error('Update SC', m.slug, upErr.message)
    continue
  }
  console.log('OK SC', m.slug, meta.published_at, meta.duration_minutes ? `${meta.duration_minutes} min` : '')
  scUpdated++
  await new Promise((r) => setTimeout(r, 400))
}

console.log(`SoundCloud. Actualizados: ${scUpdated}, ya tenían fecha: ${scSkipped}, total: ${scRows.length}`)
