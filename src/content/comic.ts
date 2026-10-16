// ============================================
// OPTIMAL BREAKS — /comic: «Las aventuras del Lechón y el Pepino»
// Textos ES/EN, personajes y episodios. Los vídeos viven en Supabase Storage
// (bucket público `comic`): videos/<base>[_vertical].mp4 y posters/<base>[_vertical].jpg
// ============================================

import type { Locale } from '@/lib/i18n-config'

const STORAGE = `${(process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/\/+$/, '')}/storage/v1/object/public/comic`

export const COMIC_IMG = '/images/comic'

export function comicVideoUrl(base: string, vertical: boolean) {
  return `${STORAGE}/videos/${base}${vertical ? '_vertical' : ''}.mp4`
}
export function comicPosterUrl(base: string, vertical: boolean) {
  return `${STORAGE}/posters/${base}${vertical ? '_vertical' : ''}.jpg`
}

export type ComicEpisode = {
  /** Nombre base del vídeo por idioma (sin _vertical ni extensión). */
  file: Record<Locale, string>
  title: Record<Locale, string>
  text: Record<Locale, string>
  duration: string
  music: string
}

export const COMIC_EPISODES: ComicEpisode[] = [
  {
    file: { es: 'super_lechon_ES', en: 'super_pig_EN' },
    title: { es: 'Super Lechón', en: 'Super Pig' },
    duration: '59 s',
    music: 'Kritycal System – Take My Home',
    text: {
      es: 'Documental de naturaleza: un lechón gordo que escucha todo gratis y no vota nunca. Hasta que su tema favorito desaparece del Top 100 porque nadie lo votó. Pulsa su primer «+»… y nace Super Lechón.',
      en: 'A nature documentary: a fat little pig who listens to everything for free and never votes. Until his favourite track drops out of the Top 100 because nobody voted for it. He hits his first «+»… and Super Pig is born.',
    },
  },
  {
    file: { es: 'lechon_festival_ES', en: 'festival_pig_EN' },
    title: { es: 'El lechón de festival', en: 'The festival pig' },
    duration: '64 s',
    music: 'Kritycal System – Caught Up',
    text: {
      es: 'Llega en coche ajeno dando la murga, se sabe el cartel entero y lo graba todo sin mover un pie. Hasta que su colega el Pepino se sube al escenario. ¡¡ZAS!! Breakdance hasta el amanecer y, en el bus de vuelta, vota.',
      en: 'He turns up in someone else’s car, talks non-stop, knows the whole line-up and films everything without moving a foot. Until his mate the Pickle jumps on stage. ZAP!! Breakdancing till sunrise and, on the bus home, he votes.',
    },
  },
  {
    file: { es: 'lechon_botellon_ES', en: 'car_park_pig_EN' },
    title: { es: 'El botellón', en: 'The car park' },
    duration: '60 s',
    music: 'Afghan Headspin – Wildcat',
    text: {
      es: 'Se va de botellón y acaba en la rave de los canis del parking. «Estos no tienen cultura break.» Para ellos no existe… hasta que saca el móvil y pone un temazo de la web.',
      en: 'He heads out for a drink and ends up at the canis’ car park rave. “These guys have no breaks culture.” To them he doesn’t exist… until he pulls out his phone and drops a banger from the site.',
    },
  },
  {
    file: { es: 'lechon_halloween_ES', en: 'lechon_halloween_EN' },
    title: { es: 'Especial Halloween: la noche de los retrosos', en: 'Halloween special: night of the retro-heads' },
    duration: '66 s',
    music: 'IVORY Specimen A – Boogeyman',
    text: {
      es: 'El padre jabalí se lleva a toda la familia a la fiesta retro. A medianoche suena el clásico y el lechón se transforma… con sus hermanos convertidos en los Chicos Maravilla. Al amanecer, el que no se quiere ir es el padre.',
      en: 'Dad the wild boar drags the whole family to the retro party. At midnight the classic drops and the pig transforms… with his brothers turned into the Wonder Boys. At dawn, the one who won’t leave is Dad.',
    },
  },
]

export type ComicCharacter = {
  img: string
  /** `contain` para fichas con varias poses; `cover` para escenas. */
  fit: 'contain' | 'cover'
  big?: boolean
  tone?: 'yellow'
  name: Record<Locale, string>
  role: Record<Locale, string>
  text: Record<Locale, string>
  alt: Record<Locale, string>
  quote?: Record<Locale, string>
  more?: { label: Record<Locale, string>; items: Record<Locale, string[]> }
}

export const COMIC_CHARACTERS: ComicCharacter[] = [
  {
    img: 'lechon_en_casa.jpg', fit: 'cover', big: true,
    name: { es: 'El Lechón', en: 'The Pig' },
    role: { es: 'El protagonista', en: 'The hero (sort of)' },
    text: {
      es: 'Gordo del musicón. Mira a los canis por encima del hombro, empieza módulos que nunca acaba y en Instagram es un lechón famoso… pero lechón.',
      en: 'Fat on good music. Looks down on the canis, starts courses he never finishes and is a famous pig on Instagram… but still a pig.',
    },
    alt: { es: 'El lechón tirado en el sofá con cascos, vinilos y bolsas de patatas', en: 'The pig slumped on the sofa with headphones, records and crisp bags' },
    quote: { es: 'Esta noche les enseño yo lo que es música.', en: 'Tonight I’ll show them what real music is.' },
    more: {
      label: { es: 'Más sobre él', en: 'More about him' },
      items: {
        es: ['Gafas de sol, cascos rojos al cuello, camiseta negra y riñonera roja cruzada.', 'Entre semana dice que el breakbeat no le gusta tanto. El viernes lo consume a mansalva.', 'Le llaman lechoso, retroso y retrógrado.'],
        en: ['Sunglasses, red headphones round his neck, black tee and a red bum bag across the chest.', 'On weekdays he says he’s not that into breakbeat. By Friday he can’t get enough.', 'Friends call him piggy, retro-head and dinosaur.'],
      },
    },
  },
  {
    img: 'super_lechon.jpg', fit: 'contain', big: true, tone: 'yellow',
    name: { es: 'Super Lechón', en: 'Super Pig' },
    role: { es: 'Cuando se suelta', en: 'When he lets go' },
    text: {
      es: 'El amante del breakbeat número uno. Cuando aparece, la pista explota y los canis, por primera vez, le miran. Con envidia.',
      en: 'Breakbeat lover number one. When he shows up the floor explodes and, for the first time, the canis look at him. With envy.',
    },
    alt: { es: 'Super Lechón con traje amarillo y capa roja sobre una montaña de vinilos', en: 'Super Pig in a yellow suit and red cape on a pile of records' },
    more: {
      label: { es: 'Cómo se transforma', en: 'How he transforms' },
      items: {
        es: ['Episodio 1: pulsa su primer «+».', 'Episodio 2: su colega el Pepino se sube al escenario.', 'Episodio 3: pone un temazo de la web en la rave de los canis.', 'Episodio 4: a medianoche suena el clásico… y arrastra a sus hermanos.'],
        en: ['Episode 1: he hits his first «+».', 'Episode 2: his mate the Pickle jumps on stage.', 'Episode 3: he plays a banger from the site at the canis’ rave.', 'Episode 4: the classic drops at midnight… and drags his brothers along.'],
      },
    },
  },
  {
    img: 'pepino_del_breakbeat_ficha.jpg', fit: 'contain',
    name: { es: 'El Pepino del breakbeat', en: 'The Breakbeat Pickle' },
    role: { es: 'Su colega', en: 'His mate' },
    text: {
      es: 'Conduce, aguanta la murga 200 km y baila desde el primer tema. Bañador amarillo de una pieza y gafas de sol, aunque sea de noche.',
      en: 'Drives, puts up with 200 km of chatter and dances from the very first track. Yellow one-piece swimsuit and sunglasses, even at night.',
    },
    alt: { es: 'El Pepino del breakbeat en tres poses, con bañador amarillo y gafas de sol', en: 'The Breakbeat Pickle in three poses, in a yellow swimsuit and sunglasses' },
  },
  {
    img: 'mar_ia.jpg', fit: 'contain',
    name: { es: 'Mar IA', en: 'Mar IA' },
    role: { es: 'La mujer del lechón', en: 'The pig’s wife' },
    text: {
      es: 'Se sabe todos los temas y lo controla todo. Lo conoció siendo Super Lechón, pero lo prefiere lechón: así no se le escapa entre fans.',
      en: 'Knows every track and runs the show. She met him as Super Pig, but she prefers him as a pig: that way he won’t run off with the fans.',
    },
    alt: { es: 'Mar IA en tres poses, con bómber verde, minifalda y neones', en: 'Mar IA in three poses, with a green bomber, mini skirt and neon tubes' },
    more: {
      label: { es: 'Por qué le vigila', en: 'Why she keeps an eye on him' },
      items: {
        es: ['A veces le acompaña al festi solo para que no se transforme.', 'Su gesto: dos dedos a los ojos. Te estoy vigilando.'],
        en: ['Sometimes she goes to the festival just to stop him transforming.', 'Her move: two fingers to her eyes. I’m watching you.'],
      },
    },
  },
  {
    img: 'familia_padre.jpg', fit: 'contain',
    name: { es: 'El padre jabalí', en: 'Dad the wild boar' },
    role: { es: 'El retroso de toda la vida', en: 'Retro-head for life' },
    text: {
      es: 'Camisa militar abierta, gorro de legionario y radiocasete al hombro. Treinta años de Monegros en las piernas. Solo escucha retro.',
      en: 'Open army shirt, legionnaire cap and a boombox on his shoulder. Thirty years of Monegros in his legs. Only listens to retro.',
    },
    alt: { es: 'El padre jabalí con radiocasete al hombro', en: 'Dad the wild boar with a boombox on his shoulder' },
    quote: { es: 'Muy bien. Me importa una mierda… si no ponen retro.', en: 'Fine. I couldn’t give a damn… if they don’t play retro.' },
  },
  {
    img: 'familia_heavy.jpg', fit: 'contain',
    name: { es: 'El hermano heavy', en: 'The metalhead brother' },
    role: { es: 'Vive con los cascos puestos', en: 'Lives with his headphones on' },
    text: {
      es: 'Melena negra, muñequeras de pinchos y cuernos con la mano. Ni se quita los cascos para hablar con su hermano.',
      en: 'Long black hair, studded wristbands and devil horns. Won’t even take his headphones off to talk to his brother.',
    },
    alt: { es: 'El hermano heavy con melena negra', en: 'The metalhead brother with long black hair' },
  },
  {
    img: 'familia_pijo.jpg', fit: 'contain',
    name: { es: 'El señorito del techno', en: 'The posh techno brother' },
    role: { es: 'El pijo de la familia', en: 'The family snob' },
    text: {
      es: 'Polo pastel, jersey anudado a los hombros y mocasines sin calcetín. Mira el breakbeat con la nariz arriba.',
      en: 'Pastel polo, jumper knotted over his shoulders and loafers with no socks. Looks down his nose at breakbeat.',
    },
    alt: { es: 'El hermano señorito con polo pastel y jersey a los hombros', en: 'The posh brother in a pastel polo with a jumper over his shoulders' },
    quote: { es: '¿Breakbeat? Qué hortera.', en: 'Breakbeat? How tacky.' },
  },
  {
    img: 'canis.jpg', fit: 'cover',
    name: { es: 'Los canis', en: 'Los canis' },
    role: { es: 'La calle', en: 'The street' },
    text: {
      es: 'El pitbull, el galgo, el chinitín, el bulldog y la choni. Los que de verdad mueven el breakbeat, con el maletero lleno de altavoces.',
      en: 'The pitbull, the greyhound, the little chihuahua, the bulldog and the choni. The ones who really keep breakbeat alive, boot full of speakers.',
    },
    alt: { es: 'Los canis: pitbull, galgo, chihuahua, bulldog y caniche con chándales junto a un coche tuneado', en: 'The canis: pitbull, greyhound, chihuahua, bulldog and poodle in tracksuits by a modified car' },
    quote: { es: 'Venga, listo. Pon tú uno.', en: 'Go on, genius. You play one.' },
  },
  {
    img: 'dj_idolo.jpg', fit: 'contain', big: true,
    name: { es: 'El DJ ídolo', en: 'The idol DJ' },
    role: { es: 'Cabeza de cartel', en: 'The headliner' },
    text: {
      es: 'Hombre orquesta: altavoz a la espalda, armónica, platillos en las rodillas y platos colgados del pecho. El lechón llora en primera fila.',
      en: 'A one-man band: speaker on his back, harmonica, cymbals on his knees and decks hanging from his chest. The pig cries in the front row.',
    },
    alt: { es: 'El DJ ídolo, hombre orquesta con un altavoz a la espalda y platos al pecho', en: 'The idol DJ, a one-man band with a speaker on his back and decks on his chest' },
  },
  {
    img: 'pepino_sujetavelas.jpg', fit: 'contain', big: true,
    name: { es: 'El sujetavelas', en: 'The third wheel' },
    role: { es: 'El Pepino, cuando aparece Mar IA', en: 'The Pickle, whenever Mar IA turns up' },
    text: {
      es: 'Candelabro en mano, mirando para otro lado y silbando. Intenta pasar desapercibido para que ella no le eche la culpa de la próxima transformación.',
      en: 'Candelabra in hand, looking the other way and whistling. He tries to go unnoticed so she won’t blame him for the next transformation.',
    },
    alt: { es: 'El Pepino sujetando un candelabro y silbando mientras Mar IA pasea con el lechón', en: 'The Pickle holding a candelabra and whistling while Mar IA walks with the pig' },
  },
]

type Copy = {
  kicker: string
  heroTitle: [string, string]
  heroText: string
  ctaEpisodes: string
  ctaCast: string
  heroAlt: string
  storyTitle: [string, string]
  storyLead: string
  storyText: string
  fieldNo: string
  fieldTitle: string
  fieldLatin: string
  fieldYes: string[]
  fieldNo1: string
  stamp: string
  steps: { title: string; text: string }[]
  castTitle: string
  castText: string
  epsTitle: string
  epsText: string
  soonTitle: string
  soonText: string
  voteTitle: string
  voteText: string
  voteCta: string
  player: {
    episode: string
    music: string
    language: string
    format: string
    auto: string
    horizontal: string
    vertical: string
    list: string
  }
}

export const COMIC_COPY: Record<Locale, Copy> = {
  es: {
    kicker: 'Las aventuras del Lechón y el Pepino',
    heroTitle: ['No seas', 'lechón.'],
    heroText: 'Escucha todo gratis, se baja las sesiones, se sabe el cartel de memoria… y no vota nunca. Hasta que suena el temazo.',
    ctaEpisodes: 'Ver los episodios',
    ctaCast: 'Conoce a la pandilla',
    heroAlt: 'El lechón con los brazos cruzados, le cae un rayo y se convierte en Super Lechón con traje amarillo y capa roja',
    storyTitle: ['Especie detectada:', 'el lechón'],
    storyLead: 'Un cerdito rosa con gafas de sol, cascos rojos y riñonera. Va de enterao, hace spoilers del set y lo graba todo. Cuanta más música le das, más gordo se pone.',
    storyText: 'En el fondo es un crack con clase musical, pero lo tiene reprimido. Solo cuando se suelta —cuando vota, cuando su colega se sube al escenario, cuando pone un tema de la web— se convierte en Super Lechón. Su superpoder: decidir qué suena.',
    fieldNo: 'FICHA DE CAMPO Nº 001',
    fieldTitle: 'Qué hace',
    fieldLatin: 'Sus lechonis vulgaris',
    fieldYes: ['Escucha los charts gratis', 'Se baja las sesiones', 'Pilla los estrenos'],
    fieldNo1: '¿Aporta algo?',
    stamp: 'NADA',
    steps: [
      { title: 'El lechón', text: 'Tirado en el sofá entre vinilos y bolsas de patatas. «Ya votará otro.»' },
      { title: 'El rayo', text: 'Suena el temazo y le cae un rayo dorado en forma de «+». Revienta la camiseta y sale volando la riñonera.' },
      { title: 'Super Lechón', text: 'Traje amarillo, capa roja y el cuadrado con el «+» en el pecho. Baila, hace breakdance y por fin vota.' },
    ],
    castTitle: 'La pandilla',
    castText: 'Cada uno es una tribu de la escena. Seguro que reconoces a alguno. O te reconoces.',
    epsTitle: 'Episodios',
    epsText: 'En el móvil se ven en vertical y en el ordenador en horizontal. También puedes cambiarlo tú.',
    soonTitle: 'Próximamente',
    soonText: 'Mar IA vigila · El ídolo · Los tres cerditos',
    voteTitle: 'Vota y suéltate.',
    voteText: 'Cada «+» que pulsas en los charts es un voto. Los temas que nadie vota desaparecen del Top 100. No esperes a que vote otro: el otro también es un lechón.',
    voteCta: 'Ir a votar en los charts',
    player: {
      episode: 'Episodio',
      music: 'Música',
      language: 'Idioma',
      format: 'Formato',
      auto: 'Automático',
      horizontal: 'Horizontal',
      vertical: 'Vertical',
      list: 'Lista de episodios',
    },
  },
  en: {
    kicker: 'The adventures of the Pig and the Pickle',
    heroTitle: ['Don’t be a', 'suckling pig.'],
    heroText: 'Streams everything for free, downloads every set, knows the line-up by heart… and never votes. Until the banger drops.',
    ctaEpisodes: 'Watch the episodes',
    ctaCast: 'Meet the gang',
    heroAlt: 'The pig with his arms crossed is struck by lightning and turns into Super Pig in a yellow suit and red cape',
    storyTitle: ['Species spotted:', 'the suckling pig'],
    storyLead: 'A pink little pig with sunglasses, red headphones and a bum bag. A know-it-all who spoils the set and films everything. The more music you feed him, the fatter he gets.',
    storyText: 'Deep down he’s got real taste, but he keeps it locked up. Only when he lets go —when he votes, when his mate jumps on stage, when he plays a track from the site— does he become Super Pig. His superpower: deciding what plays.',
    fieldNo: 'FIELD NOTES Nº 001',
    fieldTitle: 'What it does',
    fieldLatin: 'Sus suckleus vulgaris',
    fieldYes: ['Streams the charts for free', 'Downloads the sets', 'Grabs the new releases'],
    fieldNo1: 'Gives anything back?',
    stamp: 'NOTHING',
    steps: [
      { title: 'The pig', text: 'Slumped on the sofa among records and crisp bags. “Someone else will vote.”' },
      { title: 'The lightning', text: 'The banger drops and a golden «+» bolt hits him. His tee bursts and the bum bag goes flying.' },
      { title: 'Super Pig', text: 'Yellow suit, red cape and the square with the «+» on his chest. He dances, breakdances and finally votes.' },
    ],
    castTitle: 'The gang',
    castText: 'Each one is a tribe from the scene. You’ll recognise someone. Or yourself.',
    epsTitle: 'Episodes',
    epsText: 'On your phone they play vertical, on a computer horizontal. You can switch it yourself too.',
    soonTitle: 'Coming soon',
    soonText: 'Mar IA is watching · The idol · The three little pigs',
    voteTitle: 'Vote and let go.',
    voteText: 'Every «+» you hit in the charts is a vote. Tracks nobody votes for drop out of the Top 100. Don’t wait for someone else to vote: someone else is a suckling pig too.',
    voteCta: 'Go vote in the charts',
    player: {
      episode: 'Episode',
      music: 'Music',
      language: 'Language',
      format: 'Format',
      auto: 'Automatic',
      horizontal: 'Horizontal',
      vertical: 'Vertical',
      list: 'Episode list',
    },
  },
}
