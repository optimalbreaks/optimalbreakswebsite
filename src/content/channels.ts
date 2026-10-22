// ============================================
// OPTIMAL BREAKS — /channels
// Cuenta de Spotify, listas, cuenta de YouTube y los vídeos del canal.
// Los vídeos salen solos del feed del canal (@OptimalBreakswebsite).
// `keywords` mete el vídeo en su serie (Godino, Afghan, cerdito).
// `youtubeId` solo se usa si el feed no responde.
// La portada y el play los pinta LazyYouTubeEmbed (solo al pulsar).
// ============================================

import type { Locale } from '@/lib/i18n-config'

export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@OptimalBreakswebsite'
export const YOUTUBE_CHANNEL_HANDLE = '@OptimalBreakswebsite'
/** El mismo canal que @OptimalBreakswebsite. La lista de subidas trae vídeo y Short a la vez. */
export const YOUTUBE_CHANNEL_ID = 'UCYKQPLahCkM_0yZfLGCR0SQ'
/** Avatar del canal (vinilo). Se pide por `/api/og/image-proxy`, no en caliente a Google. */
export const YOUTUBE_CHANNEL_AVATAR =
  'https://yt3.googleusercontent.com/noaTUfEIfwS82wowVqUY8ROy07qktW9mZdjewXEtbDlDeq0SVehJT3us4UFwpHN2VlePhTbk6lI=s900-c-k-c0x00ffffff-no-rj'

type Copy = Record<Locale, string>

export type ChannelAccount = {
  id: 'spotify' | 'youtube'
  kicker: Copy
  title: Copy
  text: Copy
  href: string | null
  button: Copy
}

export type ChannelPlaylist = {
  id: string
  /** Id de la lista en Spotify (`open.spotify.com/playlist/<id>`). */
  spotifyId: string
  name: string
  text: Copy
  href: string
  embed: string
}

export type ChannelSeries = {
  id: string
  title: Copy
  text: Copy
  /** Si el título del vídeo contiene alguna, entra en esta serie. */
  keywords: string[]
  /** Ids que van aquí aunque el título mencione otra serie. */
  pinIds?: string[]
  /** Respaldo si el feed del canal no responde. */
  youtubeId: string | null
  /** Ficha de la web, si la serie ya vive en otra sección. */
  href?: string
}

export type ChannelUpload = {
  id: string
  title: string
  /** Vertical. YouTube lo publica como Short (`/shorts/`). */
  short: boolean
}

export type ChannelGuide = {
  href: string
  label: Copy
  youtubeId: string | null
}

export const CHANNEL_ACCOUNTS: ChannelAccount[] = [
  {
    id: 'spotify',
    kicker: { es: 'Listas', en: 'Playlists' },
    title: { es: 'Spotify', en: 'Spotify' },
    text: {
      es: 'La cuenta de Spotify de Optimal Breaks y las listas que salen de la web. Temazos 2026 junta lo mejor de cada quincena y de cada temporada.',
      en: 'The Optimal Breaks Spotify account and the playlists that come out of the site. Temazos 2026 collects the best of each fortnight and each season.',
    },
    href: null,
    button: { es: 'Abrir la cuenta', en: 'Open the account' },
  },
  {
    id: 'youtube',
    kicker: { es: 'Vídeo', en: 'Video' },
    title: { es: 'YouTube', en: 'YouTube' },
    text: {
      es: 'El canal @OptimalBreakswebsite. Ahí van los vídeos de la escena y, sección por sección, cómo se usa la web.',
      en: 'The channel @OptimalBreakswebsite. Scene videos go there, and so does a walkthrough of each part of the site.',
    },
    href: YOUTUBE_CHANNEL_URL,
    button: { es: 'Abrir el canal', en: 'Open the channel' },
  },
]

export const CHANNEL_PLAYLISTS: ChannelPlaylist[] = [
  {
    id: 'temazos-2026',
    spotifyId: '1IeXy1JkoPIRpX9TPCuPYI',
    name: 'TEMAZOS 2026',
    text: {
      es: 'Los temas que destacan en Top novedades: la primavera, el verano y cada quincena. Se van sumando. No se quita lo que ya está.',
      en: 'The tracks Top releases highlights: spring, summer and each fortnight. They keep being added. Nothing already there comes off.',
    },
    href: 'https://open.spotify.com/playlist/1IeXy1JkoPIRpX9TPCuPYI',
    embed: 'https://open.spotify.com/embed/playlist/1IeXy1JkoPIRpX9TPCuPYI?utm_source=generator&theme=0',
  },
]

export const CHANNEL_SERIES: ChannelSeries[] = [
  {
    id: 'godino',
    title: { es: 'Godino', en: 'Godino' },
    text: {
      es: 'Los vídeos de Godino. Se ven aquí cuando están en el canal.',
      en: 'Godino’s videos. They show up here once they are on the channel.',
    },
    keywords: ['godino'],
    youtubeId: null,
  },
  {
    id: 'afghan',
    title: { es: 'Afghan Headspin', en: 'Afghan Headspin' },
    text: {
      es: 'Los vídeos de Afghan. Se ven aquí cuando están en el canal.',
      en: 'Afghan’s videos. They show up here once they are on the channel.',
    },
    keywords: ['afghan'],
    pinIds: ['fuhAUOml-5w'],
    youtubeId: null,
  },
  {
    id: 'lechon',
    title: { es: 'El cerdito', en: 'The little pig' },
    text: {
      es: 'El cerdito del cómic. Los episodios también se suben al canal.',
      en: 'The little pig from the comic. The episodes go up on the channel too.',
    },
    keywords: ['lechon', 'cerdito', 'cerdo'],
    youtubeId: '0khcoyg3Pi8',
    href: '/comic',
  },
]

function fold(value: string) {
  return value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
}

/** Los 15 últimos del canal, vídeos y Shorts. Vacío si YouTube no responde. */
export async function loadYouTubeChannelUploads(): Promise<ChannelUpload[]> {
  try {
    const uploadsPlaylistId = `UU${YOUTUBE_CHANNEL_ID.slice(2)}`
    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?playlist_id=${uploadsPlaylistId}`,
      process.env.NODE_ENV === 'development' ? { cache: 'no-store' } : { next: { revalidate: 300 } },
    )
    if (!response.ok) return []
    const xml = await response.text()
    const parsed: { id: string; title: string }[] = []
    for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const block = match[1] ?? ''
      const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim()
      const raw = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim()
      if (!id || !raw) continue
      parsed.push({
        id,
        title: raw
          .replace(/&amp;/g, '&')
          .replace(/&lt;/g, '<')
          .replace(/&gt;/g, '>')
          .replace(/&quot;/g, '"')
          .replace(/&#39;/g, "'"),
      })
    }
    const shorts = await Promise.all(parsed.map((video) => isYouTubeShort(video.id)))
    return parsed.map((video, index) => ({ ...video, short: shorts[index] === true }))
  } catch {
    return []
  }
}

/** Vídeos del feed que encajan en la serie. Un id clavado no sale en otra. */
export function videosForSeries(series: ChannelSeries, uploads: ChannelUpload[]): ChannelUpload[] {
  const pinnedIds = new Set(CHANNEL_SERIES.flatMap((item) => item.pinIds ?? []))
  const mine = new Set(series.pinIds ?? [])
  const keys = series.keywords.map(fold)
  const matched = uploads.filter((video) => {
    if (mine.has(video.id)) return true
    if (pinnedIds.has(video.id)) return false
    return keys.some((key) => fold(video.title).includes(key))
  })
  if (matched.length > 0) return matched
  if (uploads.length === 0 && series.youtubeId) return [{ id: series.youtubeId, title: series.title.es, short: false }]
  return []
}

/** Un `/shorts/` vertical responde con más alto que ancho. Un vídeo apaisado, no. */
async function isYouTubeShort(id: string): Promise<boolean> {
  try {
    const response = await fetch(
      `https://www.youtube.com/oembed?url=${encodeURIComponent(`https://www.youtube.com/shorts/${id}`)}&format=json`,
      process.env.NODE_ENV === 'development' ? { cache: 'no-store' } : { next: { revalidate: 300 } },
    )
    if (!response.ok) return false
    const data = (await response.json()) as { width?: number; height?: number }
    return typeof data.width === 'number' && typeof data.height === 'number' && data.height > data.width
  } catch {
    return false
  }
}

/** Un vídeo por sección, cuando esté grabado. El enlace de la ficha ya funciona. */
export const CHANNEL_GUIDES: ChannelGuide[] = [
  { href: '/charts', label: { es: 'Tracks', en: 'Tracks' }, youtubeId: null },
  { href: '/topreleases', label: { es: 'Novedades', en: 'Releases' }, youtubeId: null },
  { href: '/topalltimes', label: { es: 'Top histórico', en: 'All-time top' }, youtubeId: null },
  { href: '/artists', label: { es: 'Artistas', en: 'Artists' }, youtubeId: null },
  { href: '/labels', label: { es: 'Sellos', en: 'Labels' }, youtubeId: null },
  { href: '/events', label: { es: 'Eventos', en: 'Events' }, youtubeId: null },
  { href: '/festivals', label: { es: 'Festivales', en: 'Festivals' }, youtubeId: null },
  { href: '/scenes', label: { es: 'Escenas', en: 'Scenes' }, youtubeId: null },
  { href: '/mixes', label: { es: 'Mixes', en: 'Mixes' }, youtubeId: null },
  { href: '/parkineo', label: { es: 'Parkineo', en: 'Parkineo' }, youtubeId: null },
  { href: '/history', label: { es: 'Historia', en: 'History' }, youtubeId: null },
  { href: '/blog', label: { es: 'Blog', en: 'Blog' }, youtubeId: null },
  { href: '/comic', label: { es: 'Cómic', en: 'Comic' }, youtubeId: null },
]
