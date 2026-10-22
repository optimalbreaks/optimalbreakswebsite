// ============================================
// OPTIMAL BREAKS — /channels
// Cuenta de Spotify, listas, cuenta de YouTube y los vídeos del canal.
// Para publicar un vídeo: pega el id de YouTube en `youtubeId`.
// La portada y el play los pinta LazyYouTubeEmbed (solo al pulsar).
// ============================================

import type { Locale } from '@/lib/i18n-config'

export const YOUTUBE_CHANNEL_URL = 'https://www.youtube.com/@optimalbreaks'

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
  name: string
  text: Copy
  href: string | null
}

export type ChannelSeries = {
  id: string
  title: Copy
  text: Copy
  /** Id del vídeo (`youtube.com/watch?v=`). Null hasta que esté en el canal. */
  youtubeId: string | null
  /** Ficha de la web, si la serie ya vive en otra sección. */
  href?: string
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
      es: 'Una cuenta de YouTube, con varios canales. El que ya está en marcha es @optimalbreaks. Ahí van los vídeos de la escena y, sección por sección, cómo se usa la web.',
      en: 'One YouTube account, with several channels. The one already running is @optimalbreaks. Scene videos go there, and so does a walkthrough of each part of the site.',
    },
    href: YOUTUBE_CHANNEL_URL,
    button: { es: 'Abrir el canal', en: 'Open the channel' },
  },
]

export const CHANNEL_PLAYLISTS: ChannelPlaylist[] = [
  {
    id: 'temazos-2026',
    name: 'Temazos 2026',
    text: {
      es: 'Los temas que destacan en Top novedades: la primavera, el verano y cada quincena. Se van sumando. No se quita lo que ya está.',
      en: 'The tracks Top releases highlights: spring, summer and each fortnight. They keep being added. Nothing already there comes off.',
    },
    href: null,
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
    youtubeId: null,
  },
  {
    id: 'afghan',
    title: { es: 'Afghan Headspin', en: 'Afghan Headspin' },
    text: {
      es: 'Los vídeos de Afghan. Se ven aquí cuando están en el canal.',
      en: 'Afghan’s videos. They show up here once they are on the channel.',
    },
    youtubeId: null,
  },
  {
    id: 'lechon',
    title: { es: 'El cerdito', en: 'The little pig' },
    text: {
      es: 'El cerdito del cómic. Los episodios también se suben al canal.',
      en: 'The little pig from the comic. The episodes go up on the channel too.',
    },
    youtubeId: null,
    href: '/comic',
  },
]

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
