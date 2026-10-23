// ============================================
// OPTIMAL BREAKS — Parkineo
// Sesiones de quien pincha y aún no tiene ficha.
// Enlace de SoundCloud, YouTube o Mixcloud. Sin archivo.
// Más de 15 minutos y como mucho 3 horas.
// ============================================

import { extractYouTubeId } from '@/lib/mix-sessions'

export const PARKINEO_MIN_SECONDS = 15 * 60
export const PARKINEO_MAX_SECONDS = 3 * 60 * 60

export const PARKINEO_PUBLIC_COLUMNS =
  'id, slug, dj_name, city, title, platform, embed_url, video_url, image_url, duration_minutes, published_at'

/** Día de publicación en Madrid. El mismo texto en servidor y en el navegador. */
export function formatParkineoPublished(iso: string | null | undefined, lang: string): string | null {
  if (!iso) return null
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return null
  return new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    timeZone: 'Europe/Madrid',
  }).format(d)
}

export type ParkineoPlatform = 'soundcloud' | 'youtube' | 'mixcloud'
export type ParkineoLang = 'es' | 'en'

export type ParkineoErrorCode =
  | 'invalid_url'
  | 'unsupported'
  | 'too_short'
  | 'too_long'
  | 'duration_unknown'
  | 'unreachable'
  | 'pending_exists'
  | 'duplicate'
  | 'fields'
  | 'confirm'
  | 'name'
  | 'city'
  | 'title'

export type ResolvedParkineoLink = {
  platform: ParkineoPlatform
  sourceUrl: string
  sourceKey: string
  embedUrl: string | null
  videoUrl: string | null
  imageUrl: string | null
  durationSeconds: number
  durationMinutes: number
}

const COPY: Record<ParkineoLang, Record<ParkineoErrorCode, string>> = {
  es: {
    invalid_url: 'Pega un enlace https de SoundCloud, YouTube o Mixcloud.',
    unsupported: 'Solo SoundCloud, YouTube o Mixcloud. El archivo no se sube aquí: cuélgalo en una de esas y pega el enlace.',
    too_short: 'Esto dura 15 minutos o menos. Es un tema, no una sesión.',
    too_long: 'Como mucho 3 horas. Manda el set, no la grabación de toda la noche.',
    duration_unknown: 'No hemos podido leer la duración. Comprueba que el enlace abre.',
    unreachable: 'No hemos podido abrir ese enlace. Prueba con la URL larga.',
    pending_exists: 'Ya tienes una sesión en cola. Cuando la escuchemos podrás mandar otra.',
    duplicate: 'Esa sesión ya está en Parkineo o en la cola.',
    fields: 'Hacen falta el nombre, la ciudad, el título y el enlace.',
    confirm: 'Marca que la sesión la has pinchado tú.',
    name: 'El nombre de DJ tiene que tener entre 2 y 60 caracteres.',
    city: 'La ciudad tiene que tener entre 2 y 60 caracteres.',
    title: 'El título tiene que tener entre 2 y 120 caracteres.',
  },
  en: {
    invalid_url: 'Paste an https link from SoundCloud, YouTube or Mixcloud.',
    unsupported: 'SoundCloud, YouTube or Mixcloud only. Files are not uploaded here: put it on one of those and paste the link.',
    too_short: 'This is 15 minutes or shorter. That is a track, not a session.',
    too_long: 'Three hours at most. Send the set, not a recording of the whole night.',
    duration_unknown: 'We could not read the length. Check that the link opens.',
    unreachable: 'We could not open that link. Try the long URL.',
    pending_exists: 'You already have a session in the queue. You can send another once we have listened.',
    duplicate: 'That session is already in Parkineo or in the queue.',
    fields: 'Name, city, title and the link are required.',
    confirm: 'Tick that you mixed this session.',
    name: 'The DJ name must be between 2 and 60 characters.',
    city: 'The city must be between 2 and 60 characters.',
    title: 'The title must be between 2 and 120 characters.',
  },
}

export function parkineoLang(raw: unknown): ParkineoLang {
  return raw === 'en' ? 'en' : 'es'
}

export function parkineoMessage(code: ParkineoErrorCode, lang: ParkineoLang): string {
  return COPY[lang][code]
}

export function parkineoSlugBase(djName: string, title: string): string {
  const dj = slugPart(djName)
  const name = slugPart(title)
  return `${dj}-${name}`.slice(0, 80).replace(/-+$/g, '')
}

function slugPart(value: string): string {
  const s = value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36)
  return s || 'sesion'
}

export function parkineoOpenHref(row: {
  video_url?: string | null
  embed_url?: string | null
}): string | null {
  const human = row.video_url?.trim()
  if (human && /^https:\/\//i.test(human) && !/api\.soundcloud\.com/i.test(human)) return human
  const embed = row.embed_url?.trim()
  if (embed && /^https:\/\/(www\.)?(soundcloud|mixcloud)\.com\//i.test(embed)) return embed
  return human || null
}

type Fail = { ok: false; code: ParkineoErrorCode }
type Ok = { ok: true; link: ResolvedParkineoLink }

export async function resolveParkineoLink(raw: string): Promise<Ok | Fail> {
  const url = parseHttps(raw)
  if (!url) return { ok: false, code: 'invalid_url' }
  const host = url.hostname.toLowerCase().replace(/^www\./, '')

  if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com' || host === 'youtu.be') {
    return resolveYouTube(url)
  }
  if (host === 'soundcloud.com' || host === 'on.soundcloud.com' || host === 'm.soundcloud.com') {
    return resolveSoundCloud(url.toString())
  }
  if (host === 'mixcloud.com') {
    return resolveMixcloud(url)
  }
  return { ok: false, code: 'unsupported' }
}

function parseHttps(raw: string): URL | null {
  const t = raw.trim()
  if (!t || t.length > 500) return null
  let url: URL
  try {
    url = new URL(t)
  } catch {
    return null
  }
  if (url.protocol !== 'https:' || url.username || url.password) return null
  return url
}

function durationVerdict(seconds: number | null): ParkineoErrorCode | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 'duration_unknown'
  if (seconds <= PARKINEO_MIN_SECONDS) return 'too_short'
  if (seconds > PARKINEO_MAX_SECONDS) return 'too_long'
  return null
}

function pack(
  platform: ParkineoPlatform,
  sourceUrl: string,
  sourceKey: string,
  embedUrl: string | null,
  videoUrl: string | null,
  imageUrl: string | null,
  seconds: number,
): Ok {
  return {
    ok: true,
    link: {
      platform,
      sourceUrl,
      sourceKey,
      embedUrl,
      videoUrl,
      imageUrl,
      durationSeconds: seconds,
      durationMinutes: Math.max(16, Math.round(seconds / 60)),
    },
  }
}

async function resolveYouTube(url: URL): Promise<Ok | Fail> {
  const id = extractYouTubeId(url.toString())
  if (!id) return { ok: false, code: 'unsupported' }
  const seconds = await youtubeDuration(id)
  const verdict = durationVerdict(seconds)
  if (verdict) return { ok: false, code: verdict }
  const watch = `https://www.youtube.com/watch?v=${id}`
  return pack(
    'youtube',
    watch,
    `yt:${id}`,
    watch,
    watch,
    `https://i.ytimg.com/vi/${id}/hqdefault.jpg`,
    seconds as number,
  )
}

async function youtubeDuration(videoId: string): Promise<number | null> {
  const fromPlayer = await youtubePlayerSeconds(videoId)
  if (fromPlayer) return fromPlayer
  return youtubeHtmlSeconds(videoId)
}

async function youtubePlayerSeconds(videoId: string): Promise<number | null> {
  try {
    const res = await fetch('https://www.youtube.com/youtubei/v1/player?prettyPrint=false', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0',
        'Accept-Language': 'en',
      },
      body: JSON.stringify({
        videoId,
        context: { client: { clientName: 'WEB', clientVersion: '2.20241018.01.00', hl: 'en', gl: 'US' } },
      }),
      signal: AbortSignal.timeout(8000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { videoDetails?: { lengthSeconds?: string } }
    const seconds = Number(json.videoDetails?.lengthSeconds)
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  } catch {
    return null
  }
}

async function youtubeHtmlSeconds(videoId: string): Promise<number | null> {
  try {
    const res = await fetch(`https://www.youtube.com/watch?v=${videoId}`, {
      headers: { 'User-Agent': 'OptimalBreaks/1.0', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(8000),
      redirect: 'follow',
    })
    if (!res.ok) return null
    const html = await res.text()
    const dur = html.match(/"lengthSeconds":"(\d+)"/)
    const seconds = dur ? Number(dur[1]) : NaN
    return Number.isFinite(seconds) && seconds > 0 ? seconds : null
  } catch {
    return null
  }
}

async function resolveSoundCloud(raw: string): Promise<Ok | Fail> {
  const page = await fetchText(raw, 12000)
  if (!page.ok && !page.text) return { ok: false, code: 'unreachable' }
  let finalUrl: URL
  try {
    finalUrl = new URL(page.finalUrl || raw)
  } catch {
    return { ok: false, code: 'unreachable' }
  }
  finalUrl.protocol = 'https:'
  finalUrl.hostname = 'soundcloud.com'
  finalUrl.search = ''
  finalUrl.hash = ''
  const path = finalUrl.pathname.replace(/\/+$/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return { ok: false, code: 'unsupported' }
  const canonical = `https://soundcloud.com${path}`
  const ms = page.text.match(/"duration":(\d+)/)
  const seconds = soundCloudSeconds(ms ? Number(ms[1]) : null)
  const verdict = durationVerdict(seconds)
  if (verdict) return { ok: false, code: verdict }
  const trackId = page.text.match(/soundcloud:tracks:(\d+)/)?.[1] || null
  const secret = path.match(/\/(s-[A-Za-z0-9]+)\/?$/)?.[1] || null
  const embedUrl = trackId
    ? secret
      ? `https://api.soundcloud.com/tracks/${trackId}?secret_token=${secret}`
      : `https://api.soundcloud.com/tracks/${trackId}`
    : canonical
  const artwork = await soundCloudArtwork(canonical)
  return pack('soundcloud', canonical, `sc:${path.toLowerCase()}`, embedUrl, canonical, artwork, seconds as number)
}

function soundCloudSeconds(raw: number | null): number | null {
  if (raw == null || !Number.isFinite(raw) || raw <= 0) return null
  return raw >= 1000 ? Math.round(raw / 1000) : Math.round(raw)
}

async function soundCloudArtwork(canonical: string): Promise<string | null> {
  try {
    const res = await fetch(`https://soundcloud.com/oembed?format=json&url=${encodeURIComponent(canonical)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'OptimalBreaks/1.0' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { thumbnail_url?: string }
    const thumb = String(json.thumbnail_url || '').trim()
    return thumb.startsWith('https://') ? thumb : null
  } catch {
    return null
  }
}

async function resolveMixcloud(url: URL): Promise<Ok | Fail> {
  const feed = url.searchParams.get('feed')
  if (feed && url.pathname.includes('/widget')) {
    const next = feed.startsWith('http') ? feed : `https://www.mixcloud.com${feed.startsWith('/') ? '' : '/'}${feed}`
    const parsed = parseHttps(next)
    if (!parsed) return { ok: false, code: 'invalid_url' }
    return resolveMixcloud(parsed)
  }
  url.protocol = 'https:'
  url.hostname = 'www.mixcloud.com'
  url.search = ''
  url.hash = ''
  const path = url.pathname.replace(/\/+$/, '')
  const parts = path.split('/').filter(Boolean)
  if (parts.length < 2) return { ok: false, code: 'unsupported' }
  const canonical = `https://www.mixcloud.com${path}`
  const page = await fetchText(canonical, 12000)
  if (!page.ok && !page.text) return { ok: false, code: 'unreachable' }
  const seconds = mixcloudSeconds(page.text)
  const verdict = durationVerdict(seconds)
  if (verdict) return { ok: false, code: verdict }
  const artwork = await mixcloudArtwork(canonical)
  return pack('mixcloud', canonical, `mc:${path.toLowerCase()}`, canonical, canonical, artwork, seconds as number)
}

function mixcloudSeconds(html: string): number | null {
  const keyed = html.match(/"(?:audio_length|audioLength)"\s*:\s*(\d+)/)
  if (keyed) return normalizeMaybeMs(Number(keyed[1]))
  const iso = html.match(/itemprop="duration"\s+content="PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?"/i)
  if (iso) {
    const h = Number(iso[1] || 0)
    const m = Number(iso[2] || 0)
    const s = Number(iso[3] || 0)
    const total = h * 3600 + m * 60 + s
    return total > 0 ? total : null
  }
  return null
}

function normalizeMaybeMs(raw: number): number | null {
  if (!Number.isFinite(raw) || raw <= 0) return null
  return raw >= 20_000 ? Math.round(raw / 1000) : Math.round(raw)
}

async function mixcloudArtwork(canonical: string): Promise<string | null> {
  try {
    const res = await fetch(`https://www.mixcloud.com/oembed/?format=json&url=${encodeURIComponent(canonical)}`, {
      signal: AbortSignal.timeout(8000),
      headers: { 'User-Agent': 'OptimalBreaks/1.0' },
    })
    if (!res.ok) return null
    const json = (await res.json()) as { image?: string; thumbnail_url?: string }
    const thumb = String(json.image || json.thumbnail_url || '').trim()
    return thumb.startsWith('https://') ? thumb : null
  } catch {
    return null
  }
}

async function fetchText(url: string, ms: number): Promise<{ ok: boolean; finalUrl: string; text: string }> {
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      headers: { 'User-Agent': 'OptimalBreaks/1.0', 'Accept-Language': 'en' },
      signal: AbortSignal.timeout(ms),
    })
    const text = res.ok ? await res.text() : ''
    return { ok: res.ok, finalUrl: res.url || url, text }
  } catch {
    return { ok: false, finalUrl: url, text: '' }
  }
}
