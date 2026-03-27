// ============================================
// OPTIMAL BREAKS — Cronología de artistas (fuente: Historia del break.txt)
// Mapa curado por lustros; nombres propios sin traducir.
// ============================================

import type { Locale } from './i18n-config'

export type ArtistEra = {
  id: string
  period: string
  blurbs: Record<Locale, string>
  names: readonly string[]
}

export const ARTIST_ERAS: readonly ArtistEra[] = [
  {
    id: '1970-1974',
    period: '1970–1974',
    blurbs: {
      es: 'Aún no hay «escena breakbeat» de club: es el material genético — funk, soul y breaks de batería que después se samplearán sin parar.',
      en: 'No club \"breakbeat scene\" yet — the genetic material: funk, soul and drum breaks that would be sampled endlessly.',
    },
    names: [
      'DJ Kool Herc',
      'James Brown',
      'The Incredible Bongo Band',
      'The Winstons',
      'Lyn Collins',
      'Jimmy Castor Bunch',
      'Sly & The Family Stone',
      'MFSB',
      'Dennis Coffey',
      'Booker T. & the M.G.’s',
      'Babe Ruth',
      'Billy Squier',
      'Kool & The Gang',
      'The Isley Brothers',
      'Curtis Mayfield',
    ],
  },
  {
    id: '1975-1979',
    period: '1975–1979',
    blurbs: {
      es: 'Aparece la lógica del break extendido y el DJ como arquitecto del groove en block parties y primer hip hop.',
      en: 'The extended break and the DJ as groove architect emerge via block parties and early hip hop.',
    },
    names: [
      'DJ Kool Herc',
      'Grandmaster Flash',
      'Afrika Bambaataa',
      'Grandmaster Flowers',
      'Lovebug Starski',
      'The Incredible Bongo Band',
      'The Winstons',
      'Chic',
      'Bob James',
      'Parliament',
      'Funkadelic',
      'Cameo',
      'War',
      'Mandrill',
      'Liquid Liquid',
    ],
  },
  {
    id: '1980-1984',
    period: '1980–1984',
    blurbs: {
      es: 'Electro y hip hop: el break se convierte en lenguaje urbano moderno y electrónico.',
      en: 'Electro and hip hop: breaks become modern urban electronic language.',
    },
    names: [
      'Grandmaster Flash & The Furious Five',
      'Afrika Bambaataa & The Soulsonic Force',
      'Run-D.M.C.',
      'Herbie Hancock',
      'Hashim',
      'Newcleus',
      'Egyptian Lover',
      'Mantronix',
      'Malcolm McLaren',
      'Art of Noise',
      'Jonzun Crew',
      'Kurtis Blow',
      'UTFO',
      'Whodini',
      'The Beastie Boys',
    ],
  },
  {
    id: '1985-1989',
    period: '1985–1989',
    blurbs: {
      es: 'Reino Unido empieza a mutar house, hip hop y sampleo: se prepara el terreno para la rave británica.',
      en: 'The UK begins mutating house, hip hop and sampling — groundwork for British rave.',
    },
    names: [
      'Coldcut',
      'Bomb the Bass',
      'S’Express',
      'Renegade Soundwave',
      '808 State',
      'A Guy Called Gerald',
      'Meat Beat Manifesto',
      'Shut Up and Dance',
      'De La Soul',
      'Public Enemy',
      'N.W.A.',
      'Fast Eddie',
      'Tyree',
      'The KLF',
      'Orbital',
    ],
  },
  {
    id: '1990-1994',
    period: '1990–1994',
    blurbs: {
      es: 'Explosión UK: hardcore, rave, jungle temprano y breakbeat de club reconocible.',
      en: 'UK explosion: hardcore, rave, early jungle and recognisable club breakbeat.',
    },
    names: [
      'The Prodigy',
      'SL2',
      'Altern-8',
      'Shut Up and Dance',
      'Acen',
      'N-Joi',
      '4hero',
      'The Ragga Twins',
      'Orbital',
      'Renegade Soundwave',
      'Goldie',
      'Foul Play',
      'LTJ Bukem',
      'Rebel MC / Congo Natty',
      'The Freestylers',
    ],
  },
  {
    id: '1995-1999',
    period: '1995–1999',
    blurbs: {
      es: 'Big beat, funky breaks y primeras «instituciones» del sonido; el mapa se ensancha hacia EE. UU. y sellos clave.',
      en: 'Big beat, funky breaks and early sound institutions; the map widens toward the US and key labels.',
    },
    names: [
      'The Chemical Brothers',
      'Fatboy Slim',
      'The Prodigy',
      'The Crystal Method',
      'Freestylers',
      'Plump DJs',
      'Tipper',
      'Soul of Man',
      'Cut La Roc',
      'Rennie Pilgrem',
      'Propellerheads',
      'Stanton Warriors',
      'Meat Katie',
      'Adam Freeland',
      'Hybrid',
    ],
  },
  {
    id: '2000-2004',
    period: '2000–2004',
    blurbs: {
      es: 'Edad dorada del nu skool breaks: Finger Lickin’, Marine Parade, Botchit, TCR y el ecosistema Breakspoll.',
      en: 'Nu skool breaks golden age: Finger Lickin’, Marine Parade, Botchit, TCR and the Breakspoll ecosystem.',
    },
    names: [
      'Stanton Warriors',
      'Plump DJs',
      'Krafty Kuts',
      'Freestylers',
      'Adam Freeland',
      'Soul of Man',
      'Atomic Hooligan',
      'Hyper',
      'The Breakfastaz',
      'Aquasky',
      'Rennie Pilgrem',
      'Meat Katie',
      'Deekline',
      'DJ Icey',
      'Annie Nightingale',
    ],
  },
  {
    id: '2005-2009',
    period: '2005–2009',
    blurbs: {
      es: 'La escena sigue fuerte; Breakspoll mantiene en el centro a referencias UK mientras compite con otros sonidos bass y electro.',
      en: 'The scene stays strong; Breakspoll keeps UK names central while competing bass and electro sounds rise.',
    },
    names: [
      'Stanton Warriors',
      'Plump DJs',
      'Krafty Kuts',
      'Lady Waks',
      'Aquasky',
      'Deekline & Ed Solo',
      'Freestylers',
      'Atomic Hooligan',
      'Far Too Loud',
      'Freq Nasty',
      'Evil Nine',
      'The Breakfastaz',
      'A.Skillz',
      'Hybrid',
      'Marten Hørger',
    ],
  },
  {
    id: '2010-2014',
    period: '2010–2014',
    blurbs: {
      es: 'Menos centralidad mainstream, pero festivales, radio, sellos pequeños y comunidad online mantienen el breaks vivo.',
      en: 'Less mainstream centrality, but festivals, radio, small labels and online community keep breaks alive.',
    },
    names: [
      'Stanton Warriors',
      'Krafty Kuts',
      'Lady Waks',
      'Deekline',
      'A.Skillz',
      'Marten Hørger',
      'Colombo',
      'Featurecast',
      'Slynk',
      'BadboE',
      'WBBL',
      'Beatman & Ludmilla',
      'Calvertron',
      'Keith Mackenzie',
      'DJ Fixx',
    ],
  },
  {
    id: '2015-2019',
    period: '2015–2019',
    blurbs: {
      es: 'Latencia resistente: más nicho, más mezcla con UK bass y sonidos de club derivados.',
      en: 'Resistant latency: more niche, more blend with UK bass and related club sounds.',
    },
    names: [
      'Stanton Warriors',
      'Krafty Kuts',
      'Lady Waks',
      'Deekline',
      'Marten Hørger',
      'WBBL',
      'Slynk',
      'Colombo',
      'Beatman & Ludmilla',
      'BadboE',
      'Guau',
      'Shade K',
      'Rasco',
      'Left/Right',
      'Ondamike',
    ],
  },
  {
    id: '2020-2024',
    period: '2020–2024',
    blurbs: {
      es: 'Reactivación parcial: veteranos y perfiles breaks / UK bass híbridos; Beatport mantiene categoría activa.',
      en: 'Partial reactivation: veterans and hybrid breaks / UK bass profiles; Beatport keeps an active category.',
    },
    names: [
      'Stanton Warriors',
      'Krafty Kuts',
      'Lady Waks',
      'Deekline',
      'Marten Hørger',
      'Guau',
      'Shade K',
      'Ondamike',
      'Bad Legs',
      'Perfect Kombo',
      'Denham Audio',
      'DJ Cosworth',
      'Keith Mackenzie',
      'Left/Right',
      'AK Sports',
    ],
  },
  {
    id: '2025-now',
    period: '2025 →',
    blurbs: {
      es: 'Tradición + presente: nombres que sostienen la escena y otros visibles en charts recientes de breaks / UK bass.',
      en: 'Tradition plus now: names holding the scene and others visible in recent breaks / UK bass charts.',
    },
    names: [
      'Krafty Kuts',
      'Stanton Warriors',
      'Lady Waks',
      'Deekline',
      'Marten Hørger',
      'Denham Audio',
      'YOKIZ',
      'Olivia Rose',
      'Eloquin',
      'DJ Cosworth',
      'Guau',
      'Shade K',
      'AK Sports',
      'Left/Right',
      'Ondamike',
    ],
  },
] as const

export function artistSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

export type FeaturedCategory = 'pioneers' | 'uk' | 'us' | 'andalusia' | 'current'

export type FeaturedArtist = {
  name: string
  slug: string
  category: FeaturedCategory
  genres: string[]
  era: string
}

/** Selección de cabina enlazable; prioriza el mapa del documento de historia. */
export const FEATURED_ARTISTS: readonly FeaturedArtist[] = [
  { name: 'DJ KOOL HERC', slug: 'dj-kool-herc', category: 'pioneers', genres: ['Hip Hop', 'Breaks'], era: '1970s' },
  { name: 'PUBLIC ENEMY', slug: 'public-enemy', category: 'pioneers', genres: ['Hip Hop', 'Sample culture'], era: '1980s' },
  { name: 'RENEGADE SOUNDWAVE', slug: 'renegade-soundwave', category: 'uk', genres: ['Electro', 'Breaks'], era: '1980s' },
  { name: 'SHUT UP AND DANCE', slug: 'shut-up-and-dance', category: 'uk', genres: ['Hardcore', 'Rave'], era: '1990s' },
  { name: 'ALTERN-8', slug: 'altern-8', category: 'uk', genres: ['Rave', 'Hardcore'], era: '1990s' },
  { name: 'THE PRODIGY', slug: 'the-prodigy', category: 'uk', genres: ['Big Beat', 'Rave'], era: '1990s' },
  { name: '4HERO', slug: '4hero', category: 'uk', genres: ['Jungle', 'DnB'], era: '1990s' },
  { name: 'GOLDIE', slug: 'goldie', category: 'uk', genres: ['Jungle', 'DnB'], era: '1990s' },
  { name: 'ORBITAL', slug: 'orbital', category: 'uk', genres: ['Techno', 'Rave'], era: '1990s' },
  { name: 'THE CHEMICAL BROTHERS', slug: 'the-chemical-brothers', category: 'uk', genres: ['Big Beat', 'Electronic'], era: '1990s' },
  { name: 'FATBOY SLIM', slug: 'fatboy-slim', category: 'uk', genres: ['Big Beat', 'Funk'], era: '1990s' },
  { name: 'FREESTYLERS', slug: 'freestylers', category: 'uk', genres: ['Breaks', 'Hip Hop'], era: '1990s' },
  { name: 'PLUMP DJS', slug: 'plump-djs', category: 'uk', genres: ['Nu Skool', 'Breaks'], era: '2000s' },
  { name: 'STANTON WARRIORS', slug: 'stanton-warriors', category: 'uk', genres: ['Nu Skool', 'Bass'], era: '2000s' },
  { name: 'KRAFTY KUTS', slug: 'krafty-kuts', category: 'uk', genres: ['Breaks', 'Hip Hop'], era: '2000s' },
  { name: 'ADAM FREELAND', slug: 'adam-freeland', category: 'uk', genres: ['Breaks', 'Progressive'], era: '2000s' },
  { name: 'SOUL OF MAN', slug: 'soul-of-man', category: 'uk', genres: ['Breaks', 'Finger Lickin’'], era: '2000s' },
  { name: 'DEEKLINE', slug: 'deekline', category: 'uk', genres: ['Breaks', 'Jungle'], era: '2000s' },
  { name: 'DJ ICEY', slug: 'dj-icey', category: 'us', genres: ['Florida Breaks', 'Electro'], era: '2000s' },
  { name: 'PENDULUM', slug: 'pendulum', category: 'current', genres: ['DnB', 'Australia → UK'], era: '2000s' },
  { name: 'LADY WAKS', slug: 'lady-waks', category: 'current', genres: ['Breaks', 'Radio / mixes'], era: '2010s' },
  { name: 'ESCENA ANDALUZA', slug: 'escena-andaluza', category: 'andalusia', genres: ['Breakbeat', 'Makina crossover'], era: '1992–2002' },
]
