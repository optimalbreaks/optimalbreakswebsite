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

const FEED_CACHE: RequestInit =
  process.env.NODE_ENV === 'development' ? { cache: 'no-store' } : { next: { revalidate: 300 } }

function decodeXml(value: string) {
  return value
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
}

type FeedVideo = { id: string; title: string; description: string; published: string }

/** Feed público de un canal (15 últimos). Vacío si YouTube no responde. */
async function loadYouTubeFeed(channelId: string): Promise<FeedVideo[]> {
  try {
    const response = await fetch(
      `https://www.youtube.com/feeds/videos.xml?playlist_id=UU${channelId.slice(2)}`,
      FEED_CACHE,
    )
    if (!response.ok) return []
    const xml = await response.text()
    const parsed: FeedVideo[] = []
    for (const match of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
      const block = match[1] ?? ''
      const id = block.match(/<yt:videoId>([^<]+)<\/yt:videoId>/)?.[1]?.trim()
      const raw = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim()
      if (!id || !raw) continue
      parsed.push({
        id,
        title: decodeXml(raw),
        description: decodeXml(block.match(/<media:description>([\s\S]*?)<\/media:description>/)?.[1] ?? ''),
        published: block.match(/<published>([^<]+)<\/published>/)?.[1]?.trim() ?? '',
      })
    }
    return parsed
  } catch {
    return []
  }
}

/** Los 15 últimos del canal, vídeos y Shorts. Vacío si YouTube no responde. */
export async function loadYouTubeChannelUploads(): Promise<ChannelUpload[]> {
  const parsed = await loadYouTubeFeed(YOUTUBE_CHANNEL_ID)
  const shorts = await Promise.all(parsed.map((video) => isYouTubeShort(video.id)))
  return parsed.map((video, index) => ({ id: video.id, title: video.title, short: shorts[index] === true }))
}

// ============================================
// /voices — los que cuentan el break (no son la música: la difunden).
// Alta: una entrada en SCENE_VOICES. Sin tabla ni panel (decisión de Narciso, 10 nov 2026).
// ============================================

export type SceneVoiceLink = { kind: 'youtube' | 'twitch' | 'instagram' | 'podcast' | 'web'; label: string; href: string }

export type SceneVoice = {
  id: string
  name: string
  role: Copy
  text: Copy
  /** Color de la tarjeta (variable de globals.css). */
  accent: 'red' | 'yellow' | 'orange' | 'uv' | 'acid' | 'cyan' | 'pink' | 'blue'
  /** Pegatina de la cabecera: lo que los distingue en dos palabras. */
  badge: Copy
  /** Frase suya, literal (descripción del canal, de un vídeo o de un post). No se traduce. */
  quote?: { text: string; source: string }
  /** Ficha de sello, si el comunicador es también un sello. */
  label?: { slug: string; name: string }
  /** Formatos con nombre propio (ONDE BASS, PEPINARDOS…). */
  formats: { name: string; text: Copy }[]
  links: SceneVoiceLink[]
  /** Fichas de la web relacionadas (presentan, pinchan o son jurado). */
  artists: { slug: string; name: string; note?: Copy }[]
  /** Retrato de la ficha del artista, si el comunicador la tiene. */
  imageUrl?: string
  /** Canal de YouTube: sus últimos vídeos entran solos. */
  youtubeChannelId?: string
  /** El canal mezcla temas: solo entran los vídeos cuyo título lleve alguna (o que nombren a Optimal Breaks). */
  youtubeKeywords?: string[]
  /** Feed RSS de podcast (Podbean…): se listan los últimos episodios como enlaces. */
  podcastFeed?: string
}

export const SCENE_VOICES: SceneVoice[] = [
  {
    id: 'cigui9',
    name: 'Cigui9',
    role: { es: 'Creador de contenido · ONDE BASS', en: 'Content creator · ONDE BASS' },
    text: {
      es: 'Creador de contenido de la escena breakbeat andaluza. Graba en las fiestas, entrevista al público y a los artistas, y con JottaFrank presenta ONDE BASS.',
      en: 'Content creator from the Andalusian breakbeat scene. He films at the parties, interviews the crowd and the artists, and hosts ONDE BASS with JottaFrank.',
    },
    accent: 'red',
    badge: { es: 'Concurso', en: 'Contest' },
    quote: {
      text: 'ONDE BASS es mucho más que una competición. Es un proyecto creado para apoyar a los productores, descubrir nuevos talentos y dar protagonismo a quienes trabajan detrás de cada producción musical.',
      source: 'ONDE BASS 2026 · presentación oficial',
    },
    formats: [
      {
        name: 'ONDE BASS 2026',
        text: {
          es: 'Concurso de productores de breakbeat. Cada capítulo, un grupo presenta su tema y un jurado de productores lo escucha, lo comenta y lo puntúa. La idea es dar visibilidad a quien produce y que el tema salga mejor.',
          en: 'A breakbeat producers’ contest. Each episode, a group plays its track and a jury of producers listens, discusses and scores it. The point is to give producers visibility and make the track better.',
        },
      },
    ],
    links: [
      { kind: 'youtube', label: '@cigui9', href: 'https://www.youtube.com/@cigui9' },
      { kind: 'instagram', label: '@cigui9', href: 'https://www.instagram.com/cigui9/' },
    ],
    artists: [
      { slug: 'jottafrank', name: 'JottaFrank', note: { es: 'copresenta ONDE BASS', en: 'co-hosts ONDE BASS' } },
      { slug: 'maxuka', name: 'Maxuka', note: { es: 'ganador de ONDE BASS 2025', en: 'ONDE BASS 2025 winner' } },
      { slug: 'basstyler', name: 'Basstyler', note: { es: 'jurado 2026', en: '2026 jury' } },
    ],
    youtubeChannelId: 'UCtmEB00X0L01WtXGk21R4mw',
    youtubeKeywords: ['onde bass', 'breakbeat', 'break', 'optimal', 'godino', 'olibass'],
  },
  {
    id: 'kultura-breakz',
    name: 'Kultura Breakz',
    role: { es: 'Radio-show semanal · DJ Kultur', en: 'Weekly radio show · DJ Kultur' },
    text: {
      es: 'El radio-show de DJ Kultur, el primero en España dedicado solo al breakbeat y sus variantes. Sale cada miércoles en YouTube y también se emite en Twitch. Detrás hay además una web con tienda.',
      en: 'DJ Kultur’s radio show, the first in Spain devoted only to breakbeat and its offshoots. A new episode every Wednesday on YouTube, also streamed on Twitch. There is a website with a shop behind it too.',
    },
    accent: 'yellow',
    badge: { es: 'Cada miércoles', en: 'Every Wednesday' },
    quote: {
      text: 'Principal portal y radio-show español dedicado al género electrónico estilo BREAKBEAT.',
      source: 'Kultura Breakz',
    },
    formats: [
      {
        name: 'KULTURA BREAKZ',
        text: {
          es: 'Un programa por semana, numerado: ya van más de 150.',
          en: 'One numbered show a week: more than 150 so far.',
        },
      },
    ],
    links: [
      { kind: 'youtube', label: '@kulturabreakz', href: 'https://www.youtube.com/@kulturabreakz' },
      { kind: 'twitch', label: 'kulturabreakz', href: 'https://www.twitch.tv/kulturabreakz' },
      { kind: 'instagram', label: '@kultura_breakz', href: 'https://www.instagram.com/kultura_breakz/' },
      { kind: 'web', label: 'kulturabreakz.com', href: 'https://www.kulturabreakz.com' },
    ],
    artists: [
      { slug: 'kultur', name: 'Kultur', note: { es: 'lo presenta', en: 'hosts it' } },
      { slug: 'jan-b', name: 'Jan-B', note: { es: 'su pareja de producción desde 2003', en: 'his production partner since 2003' } },
    ],
    imageUrl: '/images/artists/dj_kultur.webp',
    youtubeChannelId: 'UCP2RVBEcuY6ZL3ifKmOZ8Pw',
  },
  {
    id: 'onda-canalla',
    name: 'Onda Canalla',
    role: { es: 'Entrevistas · Cádiz', en: 'Interviews · Cádiz' },
    text: {
      es: 'Programa de entrevistas a los artistas de la escena, desde la bahía de Cádiz. Morpheus Black pregunta y Daniel Moreno graba. Van a las fiestas (Oshun, Pandora, Dreambeach) y se sientan con DJs y productores, de las leyendas a los nombres nuevos.',
      en: 'An interview show with the scene’s artists, from the Bay of Cádiz. Morpheus Black asks and Daniel Moreno films. They go to the parties (Oshun, Pandora, Dreambeach) and sit down with DJs and producers, from legends to new names.',
    },
    accent: 'orange',
    badge: { es: 'Temporada 4', en: 'Season 4' },
    quote: {
      text: 'Programa de entrevistas a los artistas mas canallas de la escena!!',
      source: 'Onda Canalla',
    },
    formats: [
      {
        name: 'ONDA CANALLA',
        text: {
          es: 'Entrevistas por temporadas, de media hora. Va por la cuarta.',
          en: 'Half-hour interviews in seasons. Now on the fourth.',
        },
      },
      {
        name: 'Talent show con Sala Oshun',
        text: {
          es: 'Anunciado en octubre de 2026 como el primer talent show de breakbeat.',
          en: 'Announced in October 2026 as the first breakbeat talent show.',
        },
      },
    ],
    links: [
      { kind: 'youtube', label: '@Ondacanalla', href: 'https://www.youtube.com/@Ondacanalla' },
      { kind: 'instagram', label: '@ondacanalla', href: 'https://www.instagram.com/ondacanalla/' },
    ],
    artists: [
      { slug: 'yo-speed', name: 'Yo Speed', note: { es: 'entrevistado', en: 'interviewed' } },
      { slug: 'rasco', name: 'Rasco', note: { es: 'entrevistado', en: 'interviewed' } },
      { slug: 'hankook', name: 'Hankook', note: { es: 'entrevistado', en: 'interviewed' } },
      { slug: 'dj-nitro', name: 'DJ Nitro', note: { es: 'entrevistado', en: 'interviewed' } },
      { slug: 'mutant-breakz', name: 'Mutantbreakz', note: { es: 'entrevistados', en: 'interviewed' } },
      { slug: 'four-motion', name: 'Four Motion', note: { es: 'charla sobre la IA', en: 'talk on AI' } },
    ],
    youtubeChannelId: 'UCYuPxgW4QwtQi9UtB1BaiXg',
    youtubeKeywords: ['breakbeat', 'break', 'prodigy', 'oshun'],
  },
  {
    id: 'dirty-kitchen-rave',
    name: 'Dirty Kitchen Rave',
    role: { es: 'Twitch y podcast · sello DKR', en: 'Twitch and podcast · DKR label' },
    text: {
      es: 'Directos en Twitch varias noches por semana con lo último del breakbeat, y conversación sin filtro entre tema y tema. Luego se cuelgan enteros en el podcast.',
      en: 'Live Twitch streams several nights a week with the latest breakbeat, and unfiltered talk between tracks. Then they go up in full on the podcast.',
    },
    accent: 'uv',
    badge: { es: 'En Twitch', en: 'On Twitch' },
    quote: {
      text: 'Playing the latest in breakbeat, don’t sleep on these shows if you wanna know what’s what in the most underground scene in the World!',
      source: 'The DIRTY KITCHEN RAVE Podcast',
    },
    label: { slug: 'dirty-kitchen-rave', name: 'DIRTY KITCHEN RAVE' },
    imageUrl: 'https://wfekymvossnjdncbvtua.supabase.co/storage/v1/object/public/media/labels/dirty-kitchen-rave/logo.jpg',
    formats: [
      {
        name: 'Upfront Breaks',
        text: { es: 'Lo que todavía no ha salido: lo que llega en los próximos meses.', en: 'What is not out yet: what lands in the coming months.' },
      },
      {
        name: 'Breakin Saturdays',
        text: { es: 'La sesión del sábado, con lo último del breakbeat.', en: 'The Saturday session, with the latest breakbeat.' },
      },
      {
        name: 'Medicinal Mondays',
        text: { es: 'Para empezar la semana.', en: 'To start the week.' },
      },
    ],
    links: [
      { kind: 'twitch', label: 'DirtyKitchenRave', href: 'https://www.twitch.tv/dirtykitchenrave' },
      { kind: 'twitch', label: 'Afghan_Headspin', href: 'https://www.twitch.tv/afghan_headspin' },
      { kind: 'twitch', label: 'djbrowniee', href: 'https://www.twitch.tv/djbrowniee' },
      { kind: 'podcast', label: 'Podcast', href: 'https://dirtykitchenrave.podbean.com/' },
      { kind: 'web', label: 'dirtykitchenrave.com', href: 'https://www.dirtykitchenrave.com' },
    ],
    artists: [
      { slug: 'afghan-headspin', name: 'Afghan Headspin', note: { es: 'pincha y presenta', en: 'DJs and hosts' } },
      { slug: 'dj-brownie', name: 'DJ Brownie', note: { es: 'pincha y presenta', en: 'DJs and hosts' } },
    ],
    podcastFeed: 'https://feed.podbean.com/dirtykitchenrave/feed.xml',
  },
  {
    id: 'jan-b',
    name: 'Jan-B',
    role: { es: 'Reels en Instagram · PEPINARDOS', en: 'Instagram reels · PEPINARDOS' },
    text: {
      es: 'Productor y DJ andaluz desde 2003. En Instagram cuenta las novedades del breakbeat a cámara, tema a tema, y las manda a Beatport y a Optimal Breaks.',
      en: 'Andalusian producer and DJ since 2003. On Instagram he talks through the new breakbeat releases to camera, one by one, and points to Beatport and Optimal Breaks.',
    },
    accent: 'acid',
    badge: { es: 'Pepinardos', en: 'Pepinardos' },
    quote: {
      text: 'Más novedades breakbeat! Otros 6 PEPINARDOS publicados estos últimos días que ya puedes encontrar en @beatport y en @optimal.breaks',
      source: '@dj_jan_b en Instagram',
    },
    formats: [
      {
        name: 'PEPINARDOS',
        text: {
          es: 'Los lanzamientos de breakbeat de los últimos días, en un reel. Se publican con @optimal.breaks.',
          en: 'The breakbeat releases of the last few days, in one reel. Posted with @optimal.breaks.',
        },
      },
      {
        name: '+PEPINO',
        text: { es: 'Más novedades, entre un PEPINARDOS y el siguiente.', en: 'More new releases, between one PEPINARDOS and the next.' },
      },
      {
        name: 'Top Breakbeat',
        text: { es: 'Lo mejor del mes.', en: 'The best of the month.' },
      },
    ],
    links: [
      { kind: 'instagram', label: '@dj_jan_b', href: 'https://www.instagram.com/dj_jan_b/' },
      { kind: 'youtube', label: '@Jan-B_aka_Janbalik', href: 'https://www.youtube.com/@Jan-B_aka_Janbalik' },
    ],
    artists: [{ slug: 'jan-b', name: 'Jan-B', note: { es: 'su ficha', en: 'his profile' } }],
    imageUrl: '/images/artists/jan_b_artist.webp',
  },
]

export type SceneVoiceVideo = ChannelUpload & { published: string; voiceId: string; aboutUs: boolean }
export type PodcastEpisode = { title: string; href: string; published: string }

function matchesAny(text: string, keys: string[]) {
  const folded = fold(text)
  return keys.some((key) => folded.includes(fold(key)))
}

/** Últimos vídeos del comunicador (como mucho `limit`). `aboutUs` = el vídeo nombra a Optimal Breaks. */
export async function loadSceneVoiceVideos(voice: SceneVoice, limit = 3): Promise<SceneVoiceVideo[]> {
  if (!voice.youtubeChannelId) return []
  const feed = await loadYouTubeFeed(voice.youtubeChannelId)
  const keys = voice.youtubeKeywords ?? []
  const aboutUs = (video: FeedVideo) =>
    matchesAny(`${video.title}\n${video.description}`, ['optimal breaks', 'optimalbreaks', 'optimal.breaks'])
  const picked = feed
    .filter((video) => keys.length === 0 || matchesAny(video.title, keys) || aboutUs(video))
    .slice(0, limit)
  const shorts = await Promise.all(picked.map((video) => isYouTubeShort(video.id)))
  return picked.map((video, index) => ({
    id: video.id,
    title: video.title,
    short: shorts[index] === true,
    published: video.published,
    voiceId: voice.id,
    aboutUs: aboutUs(video),
  }))
}

/** Vídeos de los comunicadores que hablan de Optimal Breaks (todo el feed, no solo los últimos). */
export async function loadVoicesAboutUs(): Promise<SceneVoiceVideo[]> {
  const lists = await Promise.all(
    SCENE_VOICES.filter((voice) => voice.youtubeChannelId).map((voice) => loadSceneVoiceVideos(voice, 15)),
  )
  return lists
    .flat()
    .filter((video) => video.aboutUs)
    .sort((a, b) => b.published.localeCompare(a.published))
}

/** Últimos episodios de un podcast por su RSS. Vacío si no responde. */
export async function loadPodcastEpisodes(feedUrl: string, limit = 4): Promise<PodcastEpisode[]> {
  try {
    const response = await fetch(feedUrl, FEED_CACHE)
    if (!response.ok) return []
    const xml = await response.text()
    const episodes: PodcastEpisode[] = []
    for (const match of xml.matchAll(/<item>([\s\S]*?)<\/item>/g)) {
      const block = match[1] ?? ''
      const title = block.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1]?.trim()
      const href = block.match(/<link>([^<]+)<\/link>/)?.[1]?.trim()
      if (!title || !href?.startsWith('https://')) continue
      const date = new Date(block.match(/<pubDate>([^<]+)<\/pubDate>/)?.[1] ?? '')
      episodes.push({ title: decodeXml(title), href, published: Number.isNaN(date.getTime()) ? '' : date.toISOString() })
      if (episodes.length >= limit) break
    }
    return episodes
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
