// ============================================
// OPTIMAL BREAKS — «¿Cómo funciona esta página?»: un vídeo corto por sección.
// Los presenta un personaje del cómic sentado en el estudio, con la web en pantalla.
// Vídeos en Supabase Storage (bucket público `comic`):
//   secciones/videos/<base>_<ES|EN>[_vertical].mp4 · secciones/posters/<base>_<ES|EN>[_vertical].jpg
// Un vídeo cuenta como publicado cuando su póster existe: subir primero el vídeo y después el póster.
// ============================================

import type { Locale } from '@/lib/i18n-config'

const STORAGE = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')}/storage/v1/object/public/comic/secciones`

type Copy = Record<Locale, string>

export type SectionGuide = {
  /** Nombre base del archivo, sin idioma ni _vertical. */
  base: string
  /** Ruta de la sección (sin idioma). */
  href: string
  /** Otras rutas donde también sale (todas las que empiecen así). */
  match: string[]
  label: Copy
  host: Copy
  text: Copy
  seconds: Record<Locale, number>
}

export function guideVideoUrl(g: SectionGuide, lang: Locale, vertical: boolean) {
  return `${STORAGE}/videos/${g.base}_${lang.toUpperCase()}${vertical ? '_vertical' : ''}.mp4`
}
export function guidePosterUrl(g: SectionGuide, lang: Locale, vertical: boolean) {
  return `${STORAGE}/posters/${g.base}_${lang.toUpperCase()}${vertical ? '_vertical' : ''}.jpg`
}

export const GUIDE_COPY: Record<Locale, { kicker: string; watch: string; close: string; all: string }> = {
  es: { kicker: '¿Cómo funciona esta página?', watch: 'Mira el vídeo', close: 'Cerrar', all: 'Todos los vídeos' },
  en: { kicker: 'How does this page work?', watch: 'Watch the video', close: 'Close', all: 'All the videos' },
}

export const SECTION_GUIDES: SectionGuide[] = [
  {
    base: '01_tracks', href: '/charts', match: ['/charts'],
    label: { es: 'Tracks', en: 'Tracks' },
    host: { es: 'El Futuro del Breakbeat', en: 'The Future of Breakbeat' },
    text: { es: 'Las semanas, el adelanto, «Play all», el «+» para guardar y el archivo desde 1988.', en: 'The weeks, the advance tracks, Play all, the «+» to save and the archive back to 1988.' },
    seconds: { es: 30, en: 31 },
  },
  {
    base: '02_novedades', href: '/topreleases', match: ['/topreleases'],
    label: { es: 'Novedades', en: 'Releases' },
    host: { es: 'El Capitán', en: 'The Captain' },
    text: { es: 'Lo más escuchado de cada quincena, cómo escucharla entera y los artículos de cada temporada.', en: 'The most played tracks every fortnight, how to play it all and each season’s article.' },
    seconds: { es: 25, en: 24 },
  },
  {
    base: '03_top_historico', href: '/topalltimes', match: ['/topalltimes', '/top100'],
    label: { es: 'Top histórico', en: 'All-time' },
    host: { es: 'El del Top 100', en: 'The Top 100 guy' },
    text: { es: 'Cómo sale el Top 100: cada «+» suma. Sin encuestas, sin votos, sin algoritmo.', en: 'How the Top 100 is made: every «+» scores. No polls, no votes, no algorithm.' },
    seconds: { es: 27, en: 24 },
  },
  {
    base: '04_artistas', href: '/artists', match: ['/artists'],
    label: { es: 'Artistas', en: 'Artists' },
    host: { es: 'Mar IA', en: 'Mar IA' },
    text: { es: 'Los atajos, los filtros por género, país y años, las vistas y la ficha de cada artista.', en: 'The shortcuts, filters by genre, country and years, the views and every artist profile.' },
    seconds: { es: 30, en: 29 },
  },
  {
    base: '05_sellos', href: '/labels', match: ['/labels'],
    label: { es: 'Sellos', en: 'Labels' },
    host: { es: 'El Técnico', en: 'The Technician' },
    text: { es: 'Qué dice cada tarjeta, los filtros y la ficha del sello con todos sus temas.', en: 'What each card tells you, the filters and the label page with all its tracks.' },
    seconds: { es: 28, en: 28 },
  },
  {
    base: '06_eventos', href: '/events', match: ['/events'],
    label: { es: 'Eventos', en: 'Events' },
    host: { es: 'El de la Agenda', en: 'The Agenda guy' },
    text: { es: 'La agenda por fechas, el calendario, la ficha de cada evento y cómo marcarlo.', en: 'The agenda by date, the calendar, every event page and how to mark it.' },
    seconds: { es: 30, en: 29 },
  },
  {
    base: '07_festivales', href: '/festivals', match: ['/festivals', '/agenda'],
    label: { es: 'Festivales', en: 'Festivals' },
    host: { es: 'P', en: 'P' },
    text: { es: 'La próxima fecha, todos los festivales de breakbeat y sus ediciones.', en: 'The next date, every breakbeat festival and all its editions.' },
    seconds: { es: 24, en: 22 },
  },
  {
    base: '08_escenas', href: '/scenes', match: ['/scenes'],
    label: { es: 'Escenas', en: 'Scenes' },
    host: { es: 'El padre jabalí', en: 'Dad the wild boar' },
    text: { es: 'Las escenas del breakbeat: su historia, sus artistas y sus sellos.', en: 'The breakbeat scenes: their story, their artists and their labels.' },
    seconds: { es: 26, en: 26 },
  },
  {
    base: '09_mixes', href: '/mixes', match: ['/mixes'],
    label: { es: 'Mixes', en: 'Mixes' },
    host: { es: 'El DJ ídolo', en: 'The idol DJ' },
    text: { es: 'Sesiones completas: filtros, qué dice cada tarjeta y los MP3 descargables.', en: 'Full sessions: filters, what each card tells you and the downloadable MP3s.' },
    seconds: { es: 26, en: 24 },
  },
  {
    base: '10_parkineo', href: '/parkineo', match: ['/parkineo'],
    label: { es: 'Parkineo', en: 'Parkineo' },
    host: { es: 'La choni', en: 'The choni' },
    text: { es: 'Cómo enviar tu sesión si estás empezando, paso a paso.', en: 'How to send your session if you’re starting out, step by step.' },
    seconds: { es: 30, en: 28 },
  },
  {
    base: '11_historia', href: '/history', match: ['/history'],
    label: { es: 'Historia', en: 'History' },
    host: { es: 'La Archivista', en: 'The Archivist' },
    text: { es: 'Los quince capítulos, el índice, las notas Break y el glosario.', en: 'The fifteen chapters, the index, the Break notes and the glossary.' },
    seconds: { es: 27, en: 27 },
  },
  {
    base: '12_blog', href: '/blog', match: ['/blog'],
    label: { es: 'Blog', en: 'Blog' },
    host: { es: 'El señorito del techno', en: 'The posh techno brother' },
    text: { es: 'Qué hay en el blog, lo más leído y cómo moverte por los artículos.', en: 'What’s on the blog, the most read and how to get around the articles.' },
    seconds: { es: 26, en: 25 },
  },
  {
    base: '13_comic', href: '/comic', match: ['/comic'],
    label: { es: 'Cómic', en: 'Comic' },
    host: { es: 'El Pepino del breakbeat', en: 'The Breakbeat Pickle' },
    text: { es: 'Los episodios, el reproductor por idioma y formato, la pandilla y la música de cada uno.', en: 'The episodes, the player by language and format, the gang and each episode’s music.' },
    seconds: { es: 24, en: 24 },
  },
  {
    base: '14_mi_cuenta', href: '/mi-cuenta/tracks', match: ['/mi-cuenta'],
    label: { es: 'Mi cuenta', en: 'My account' },
    host: { es: 'El Novato', en: 'The Rookie' },
    text: { es: 'El «+», Mis Tracks, tu lista pública, Almas Gemelas y tu ADN Breakbeat.', en: 'The «+», My Tracks, your public list, Soulmates and your Breakbeat DNA.' },
    seconds: { es: 26, en: 23 },
  },
]

/** Guía de la página actual (pathname con idioma, p. ej. /es/charts). Solo la portada de cada sección
 *  y sus subpáginas directas de listado; las fichas (artista, sello, evento…) no la llevan. */
export function guideForPath(pathname: string): SectionGuide | null {
  const path = pathname.replace(/^\/(es|en)(?=\/|$)/, '') || '/'
  for (const g of SECTION_GUIDES) {
    for (const m of g.match) {
      if (m === '/mi-cuenta' ? path.startsWith('/mi-cuenta') : path === m || path === `${m}/`) return g
    }
  }
  return null
}
