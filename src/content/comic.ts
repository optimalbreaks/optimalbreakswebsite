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
    file: { es: 'lechon_halloween_v2_ES', en: 'lechon_halloween_v2_EN' },
    title: { es: 'Especial Halloween: la noche de los retrosos', en: 'Halloween special: night of the retro-heads' },
    duration: '66 s',
    music: 'IVORY Specimen A – Boogeyman',
    text: {
      es: 'El padre jabalí se lleva a toda la familia a la fiesta retro. A medianoche suena el clásico y el lechón se transforma… con sus hermanos convertidos en los Chicos Maravilla. Al amanecer, el que no se quiere ir es el padre.',
      en: 'Dad the wild boar drags the whole family to the retro party. At midnight the classic drops and the pig transforms… with his brothers turned into the Wonder Boys. At dawn, the one who won’t leave is Dad.',
    },
  },
  {
    file: { es: 'lechon_conoce_mar_ia_ES', en: 'how_the_pig_met_mar_ia_EN' },
    title: { es: 'Cómo el Lechón conoció a Mar IA', en: 'How the Pig met Mar IA' },
    duration: '66 s',
    music: 'Future Funk Squad – Same Frequency (Aggresivnes Remix)',
    text: {
      es: 'Aquella noche, en un festival gigante de breakbeat, el lechón llegó pisando fuerte y se hizo Super Lechón al primer temazo. Hasta los canis le hicieron corro. Entonces llegó ella: «Ese tema no lo conozco.» —«Está en Optimal Breaks.» La subió al escenario, cerraron la fiesta… y lo que pasa en la camper de P, se queda en la camper.',
      en: 'That night, at a massive breakbeat festival, the pig rolled in like a boss and became Super Pig at the first banger. Even the canis gathered round. Then she arrived: “I don’t know this track.” — “It’s on Optimal Breaks.” He pulled her on stage, they closed the party… and what happens in P’s camper stays in the camper.',
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
    img: 'pm_lechon.jpg', fit: 'cover', big: true,
    name: { es: 'El Lechón', en: 'The Pig' },
    role: { es: 'El protagonista', en: 'The hero (sort of)' },
    text: {
      es: 'Gordo del musicón: cuanta más música le das, más engorda. Va de enterao: te hace spoiler del set, te explica el cartel tres veces y presume de mil temas… que le pasó un colega. Lo graba todo para no verlo nunca. ¿Bailar? «¿Pa qué? Ya lo tengo en Spotify».',
      en: 'Fat on good music: the more you feed him, the fatter he gets. A know-it-all: he spoils the set, explains the line-up to you three times and boasts about a thousand tracks… that a mate sent him. He films everything and never watches it. Dancing? “What for? I’ve got it on Spotify.”',
    },
    alt: { es: 'El lechón grabando con el móvil y levantando el dedo, con gafas de sol, cascos y riñonera', en: 'The pig filming on his phone with a finger raised, wearing sunglasses, headphones and a bum bag' },
    quote: { es: 'Ahora pone el de 2003. Luego el remix. Fijo.', en: 'Now he’ll play the 2003 one. Then the remix. Bet you.' },
    more: {
      label: { es: 'Más sobre él', en: 'More about him' },
      items: {
        es: [
          'Entre semana dice que el breakbeat no le gusta tanto. El viernes de botellón lo consume a mansalva.',
          'Ha empezado mil módulos y no ha acabado ninguno. «Pero todo suma.»',
          'En Instagram es un lechón famoso… pero lechón.',
          'Le da la murga al Pepino 200 km seguidos. Y luego la vuelta.',
          'Mira a los canis por encima del hombro: «estos no tienen cultura break».',
          'En el fondo es un crack con clase musical, pero lo tiene reprimido. Cuando se suelta… ¡¡ZAS!!',
        ],
        en: [
          'On weekdays he says he’s not that into breakbeat. By Friday night he can’t get enough.',
          'He has started a thousand courses and finished none. “But it all adds up.”',
          'On Instagram he’s a famous pig… but still a pig.',
          'He talks the Pickle’s ear off for 200 km straight. Then the drive home.',
          'He looks down on the canis: “they’ve got no breaks culture”.',
          'Deep down he has real taste, but he keeps it locked up. When he lets go… ZAP!!',
        ],
      },
    },
  },
  {
    img: 'pm_chato_murciano.jpg', fit: 'cover', big: true,
    name: { es: 'El Chato Murciano', en: 'The Murcian Black Pig' },
    role: { es: 'El Lechón, desde que volvió del Caribe', en: 'The Pig, ever since he got back from the Caribbean' },
    text: {
      es: 'Se fue al Caribe con Mar IA, se tumbó en la hamaca con su cóctel y dijo: «¿Crema? ¿Pa qué? Yo ya estoy morenito». Se durmió. Se despertó negro como el carbón, con el antifaz de las gafas y la marca de la riñonera. Desde entonces es un chato murciano de pura raza: el cerdo negro de Murcia. Y así se queda. Él dice que es «bronceado de festival».',
      en: 'He went to the Caribbean with Mar IA, lay down on the hammock with his cocktail and said: “Sun cream? What for? I’m already tanned.” He fell asleep. He woke up black as coal, with a pink sunglasses mask and a bum-bag strap line. Since then he’s a pure-bred chato murciano, the black pig of Murcia. And that’s how he’s staying. He calls it a “festival tan”.',
    },
    alt: { es: 'El lechón quemado y negro en una playa del Caribe, con gafas en la mano, cascos, riñonera y un cóctel', en: 'The pig burnt black on a Caribbean beach, holding his sunglasses, with headphones, bum bag and a cocktail' },
    quote: { es: '¿Crema? ¿Pa qué?', en: 'Sun cream? What for?' },
    more: {
      label: { es: 'Más sobre él', en: 'More about him' },
      items: {
        es: ['Cuando se quita las gafas, se le ve el antifaz rosa. No le hace gracia.', 'Ahora se pone de negro también el Super Lechón: negro con traje amarillo. «Combina».', 'En Murcia le paran por la calle para hacerse fotos. Él cree que es por famoso.'],
        en: ['When he takes his sunglasses off you can see the pink mask. He doesn’t find it funny.', 'Super Pig is black now too: black with the yellow suit. “It matches.”', 'In Murcia people stop him in the street for photos. He thinks it’s because he’s famous.'],
      },
    },
  },
  {
    img: 'pm_super_lechon.jpg', fit: 'cover', big: true, tone: 'yellow',
    name: { es: 'Super Lechón', en: 'Super Pig' },
    role: { es: 'Cuando se suelta', en: 'When he lets go' },
    text: {
      es: 'El lechón cuando por fin se permite ser libre: el amante del breakbeat número uno. Baila desde el primer tema, hace breakdance, se sube al escenario y hasta los canis le hacen corro. Su superpoder: decidir qué suena. Su kriptonita: Mar IA con dos dedos apuntándole a los ojos.',
      en: 'The pig when he finally lets himself be free: breakbeat lover number one. He dances from the first track, breakdances, jumps on stage and even the canis gather round. His superpower: deciding what plays. His kryptonite: Mar IA pointing two fingers at her eyes.',
    },
    alt: { es: 'Super Lechón con el puño en alto, capa roja, rayos y vinilos volando', en: 'Super Pig with his fist raised, red cape, lightning and flying records' },
    quote: { es: 'Esta noche les enseño yo lo que es música.', en: 'Tonight I’ll show them what real music is.' },
    more: {
      label: { es: 'Qué le hace transformarse', en: 'What sets him off' },
      items: {
        es: ['Votar: pulsar su primer «+».', 'Que su colega el Pepino se suba al escenario.', 'Poner un temazo de la web delante de los canis.', 'Que suene el clásico a medianoche… y entonces arrastra a sus hermanos.', 'Llegar pisando fuerte: la noche que conoció a Mar IA le bastó el primer temazo.'],
        en: ['Voting: hitting his first «+».', 'His mate the Pickle jumping on stage.', 'Playing a banger from the site in front of the canis.', 'The classic dropping at midnight… and then his brothers come along.', 'Arriving with a swagger: the night he met Mar IA, the first banger was enough.'],
      },
    },
  },
  {
    img: 'pm_pepino.jpg', fit: 'cover',
    name: { es: 'El Pepino del breakbeat', en: 'The Breakbeat Pickle' },
    role: { es: 'Su colega', en: 'His mate' },
    text: {
      es: 'Es todo lo que el lechón no es: baila desde el primer tema, no presume, no hace spoilers y aporta. Conduce, pone la gasolina y aguanta 200 km de murga sin pestañear. Y casi siempre es él quien, sin querer, provoca la transformación: se sube al escenario y el lechón ya no puede aguantarse.',
      en: 'He is everything the pig is not: he dances from the first track, never shows off, never spoils the set and gives back. He drives, pays for the petrol and takes 200 km of chatter without blinking. And he’s nearly always the one who, without meaning to, sets off the transformation: he jumps on stage and the pig just can’t hold back.',
    },
    alt: { es: 'El Pepino bailando con los brazos en alto, llaves del coche y una barra de luz', en: 'The Pickle dancing with his arms up, car keys and a glow stick' },
    more: {
      label: { es: 'Más sobre él', en: 'More about him' },
      items: {
        es: [
          'En los carteles nunca sale su nombre: es «su colega». Y tan contento.',
          'Se lleva bien con todo el mundo, canis incluidos. Con todo el mundo menos con Mar IA.',
          'Mar IA no le traga: sabe que con él cerca el lechón se transforma en dos temas.',
        ],
        en: [
          'His name never appears on the captions: he’s just “his mate”. And he’s happy with that.',
          'He gets on with everyone, canis included. Everyone except Mar IA.',
          'Mar IA can’t stand him: she knows that with him around the pig transforms within two tracks.',
        ],
      },
    },
  },
  {
    img: 'pm_mar_ia.jpg', fit: 'cover',
    name: { es: 'Mar IA', en: 'Mar IA' },
    role: { es: 'La mujer del lechón', en: 'The pig’s wife' },
    text: {
      es: 'Se sabe TODOS los temas. Todos. El único que la ha pillado en su vida se lo puso el Super Lechón la noche que se conocieron… y ahí cayó. Desde entonces lo prefiere lechón: así no se le escapa entre fans. Trabaja en un stand de móviles del centro comercial y de ahí no se le escapa nadie.',
      en: 'She knows EVERY track. Every single one. The only one that ever caught her out was the one Super Pig played her the night they met… and that was it for her. Since then she prefers him as a pig: that way he won’t run off with the fans. She works at a phone stand in the shopping centre, and nobody escapes her there either.',
    },
    alt: { es: 'Mar IA haciendo el gesto de «te estoy vigilando» con dos dedos', en: 'Mar IA doing the “I’m watching you” gesture with two fingers' },
    quote: { es: 'Ese tema no lo conozco.', en: 'I don’t know this track.' },
    more: {
      label: { es: 'Por qué le vigila', en: 'Why she keeps an eye on him' },
      items: {
        es: ['A veces le acompaña al festi solo para cortarle el rollo en cuanto empieza a brillar.', 'Su gesto: dos dedos a los ojos. Te estoy vigilando.', 'Al Pepino no lo traga. Ni con candelabro.', 'Dice que en casa manda ella. El lechón dice que también. Gana ella.'],
        en: ['Sometimes she goes to the festival just to kill the vibe the moment he starts to shine.', 'Her move: two fingers to her eyes. I’m watching you.', 'She can’t stand the Pickle. Not even with the candelabra.', 'She says she’s the boss at home. The pig says so too. She wins.'],
      },
    },
  },
  {
    img: 'pm_padre.jpg', fit: 'cover',
    name: { es: 'El padre jabalí', en: 'Dad the wild boar' },
    role: { es: 'El retroso de toda la vida', en: 'Retro-head for life' },
    text: {
      es: 'Treinta años de Monegros en las piernas y solo escucha retro: de lo demás, pasa. Lleva y recoge al lechón de las fiestas sin hacerle mucho caso («le ha salido el pequeño muy Mr. Fly»). Pero que nadie se engañe: la noche de Halloween el que no se quería ir era él.',
      en: 'Thirty years of Monegros in his legs and he only listens to retro: anything else, he couldn’t care less. He drops the pig off at parties and picks him up without paying him much attention (“the little one turned out a right Mr. Fly”). But make no mistake: on Halloween night he was the one who wouldn’t leave.',
    },
    alt: { es: 'El padre jabalí con radiocasete al hombro y una cinta en la mano', en: 'Dad the wild boar with a boombox on his shoulder and a cassette in his hand' },
    quote: { es: 'Muy bien. Me importa una mierda… si no ponen retro.', en: 'Fine. I couldn’t give a damn… if they don’t play retro.' },
    more: {
      label: { es: 'Batallitas', en: 'War stories' },
      items: {
        es: ['Viene de Cerro Murciano y de Monegros: tiene batallitas para tres vidas.', 'De la madre solo dice que «la mataron a disgustos».', 'Al amanecer de Halloween, sus hijos esperando en el coche y él: «¡Cinco minutos más!».'],
        en: ['He came up through Cerro Murciano and Monegros: he has war stories for three lifetimes.', 'About their mum he only says “they drove her to her grave”.', 'Halloween at dawn, his kids waiting in the car, and him: “Five more minutes!”.'],
      },
    },
  },
  {
    img: 'pm_hermano_heavy.jpg', fit: 'cover',
    name: { es: 'El hermano heavy', en: 'The metalhead brother' },
    role: { es: 'Vive con los cascos puestos', en: 'Lives with his headphones on' },
    text: {
      es: 'Va a su rollo, siempre con los cascos puestos. No le hace ni caso a su hermano, pero sin maldad: le saluda con los cuernos sin levantar la vista. Si en casa hay bronca, él ni se entera. En Halloween acabó de Chico Maravilla sin saber muy bien cómo.',
      en: 'Does his own thing, headphones always on. He ignores his brother, but without malice: he greets him with devil horns without looking up. If there’s a row at home, he doesn’t even notice. On Halloween he ended up as a Wonder Boy without quite knowing how.',
    },
    alt: { es: 'El hermano heavy con cascos, melena al viento y los cuernos en alto', en: 'The metalhead brother with headphones, hair flying and devil horns up' },
  },
  {
    img: 'pm_senorito.jpg', fit: 'cover',
    name: { es: 'El señorito del techno', en: 'The posh techno brother' },
    role: { es: 'El pijo de la familia', en: 'The family snob' },
    text: {
      es: 'Pegado al móvil y con el meñique levantado. Mira la música de su hermano por encima del hombro y el breakbeat le parece de pueblo… hasta que en Halloween un rayo le convirtió en Chico Maravilla. No lo ha vuelto a mencionar.',
      en: 'Glued to his phone, pinky raised. He looks down on his brother’s music and thinks breakbeat is for yokels… until on Halloween a lightning bolt turned him into a Wonder Boy. He has never mentioned it since.',
    },
    alt: { es: 'El hermano señorito mirando el móvil con desdén y una copita en la mano', en: 'The posh brother looking at his phone with disdain, holding a tiny glass' },
    quote: { es: '¿Breakbeat? Qué hortera.', en: 'Breakbeat? How tacky.' },
  },
  {
    img: 'pm_canis.jpg', fit: 'cover',
    name: { es: 'Los canis', en: 'Los canis' },
    role: { es: 'La calle', en: 'The street' },
    text: {
      es: 'Los que de verdad mueven el breakbeat, con el maletero lleno de altavoces. Para ellos el lechón no existe… hasta que se vuelve Super Lechón: entonces le hacen corro y le tienen envidia, por este orden.',
      en: 'The ones who really keep breakbeat alive, boot full of speakers. To them the pig doesn’t exist… until he becomes Super Pig: then they gather round and get jealous, in that order.',
    },
    alt: { es: 'Los canis: el chinitín delante señalando, y detrás el pitbull, el galgo, el bulldog y la choni', en: 'The canis: the little chihuahua pointing in front, with the pitbull, greyhound, bulldog and choni behind' },
    quote: { es: 'Venga, listo. Pon tú uno.', en: 'Go on, genius. You play one.' },
    more: {
      label: { es: 'La pandilla', en: 'The gang' },
      items: {
        es: [
          'El pitbull: el jefe. Habla poco; el subwoofer habla por él.',
          'El galgo: el primero en llegar al parking y el último en irse.',
          'El bulldog: brazos cruzados hasta que suena el temazo. Entonces, el primero.',
          'La choni: pompa de chicle y se las sabe todas. ¿Rival de Mar IA? Ya se verá.',
          'El chinitín: el más pequeño y el que tiene la última palabra.',
        ],
        en: [
          'The pitbull: the boss. Says little; the subwoofer does the talking.',
          'The greyhound: first to arrive at the car park, last to leave.',
          'The bulldog: arms crossed until the banger drops. Then he’s first on the floor.',
          'The choni: bubblegum bubble and knows every track. A rival for Mar IA? We’ll see.',
          'The little chihuahua: the smallest one, and the one who gets the last word.',
        ],
      },
    },
  },
  {
    img: 'pm_p_v2.jpg', fit: 'cover',
    name: { es: 'P', en: 'P' },
    role: { es: 'El colega loco', en: 'The crazy mate' },
    text: {
      es: 'El colega que te encuentras en todos los festivales. A todo dice que sí: ¿otra? «¡Venga, sí!» ¿Escalar después de la fiesta? «¡Me apunto!» Breakbeatero de los de toda la vida: lleva veinte años yendo a las fiestas con el mismo chaleco reflectante de obra, firmado a la espalda por todos los DJs que se ha cruzado. Escalador, va dejando todo blanco de magnesio. Con esa pinta nadie lo diría, pero todo el mundo sabe que tiene cuartos: solo hay que ver su camper.',
      en: 'The mate you bump into at every festival. He says yes to everything: another one? “Sure, why not!” Climbing after the party? “I’m in!” An old-school breakbeat head: for twenty years he’s worn the same hi-vis work vest to every party, its back signed by every DJ he’s ever met. A climber, he leaves everything white with chalk. You’d never guess it, but everyone knows he’s loaded: just look at his camper.',
    },
    alt: { es: 'P, una cabra con chaleco reflectante amarillo firmado, con los pulgares arriba y las manos blancas de magnesio', en: 'P, a goat in a signed yellow hi-vis vest, giving two thumbs up with chalk-white hands' },
    quote: { es: '¡Venga, sí!', en: 'Sure, why not!' },
    more: {
      label: { es: 'Más sobre él', en: 'More about him' },
      items: {
        es: ['Está como una cabra. Literalmente.', 'Le dejó la camper al Super Lechón la noche que conoció a Mar IA. Sin hacer preguntas.', 'Su chaleco reflectante tiene más firmas que el libro de visitas de una cabina.',
          'Si te da un abrazo, sales con una mano blanca en la espalda.', 'Tiene muchísimo potencial. Nadie sabe todavía para qué.'],
        en: ['He’s as mad as a goat. Literally.', 'He lent Super Pig the camper the night he met Mar IA. No questions asked.', 'His hi-vis vest has more signatures than a DJ booth guestbook.',
          'If he hugs you, you walk off with a white handprint on your back.', 'He has huge potential. Nobody knows for what yet.'],
      },
    },
  },
  {
    img: 'pm_dj_idolo.jpg', fit: 'cover',
    name: { es: 'El DJ ídolo', en: 'The idol DJ' },
    role: { es: 'Cabeza de cartel', en: 'The headliner' },
    text: {
      es: 'El ídolo absoluto del lechón, que llora de emoción en primera fila con un cartel de corazón. Showman de los de antes: altavoz a la espalda, plato al pecho y armónica, pinchando y tocando a la vez… y en mitad del set se marca un freeze de b-boy. El día que el lechón por fin le conozca, ya veremos quién se transforma.',
      en: 'The pig’s absolute idol: he cries with emotion in the front row holding a heart sign. An old-school showman: speaker on his back, turntable on his chest and a harmonica, mixing and playing at once… and mid-set he throws a b-boy freeze. The day the pig finally meets him, we’ll see who transforms.',
    },
    alt: { es: 'El DJ ídolo señalando al público con el plato al pecho y el altavoz a la espalda', en: 'The idol DJ pointing at the crowd, turntable on his chest and speaker on his back' },
  },
  {
    img: 'pm_sujetavelas.jpg', fit: 'cover',
    name: { es: 'El sujetavelas', en: 'The third wheel' },
    role: { es: 'El Pepino, cuando aparece Mar IA', en: 'The Pickle, whenever Mar IA turns up' },
    text: {
      es: 'En cuanto aparece Mar IA, al Pepino le aparece un candelabro en la mano. Nadie sabe de dónde sale. Se queda detrás, compungido, mirando para otro lado y silbando, a ver si así ella no le echa la culpa de la próxima transformación. La noche que se conocieron, la pasó entera de guardia junto a la camper.',
      en: 'The moment Mar IA turns up, a candelabra turns up in the Pickle’s hand. Nobody knows where it comes from. He stays behind, sheepish, looking the other way and whistling, hoping she won’t blame him for the next transformation. The night they met, he spent the whole night on guard outside the camper.',
    },
    alt: { es: 'El Pepino con un candelabro, mirando a otro lado y silbando', en: 'The Pickle holding a candelabra, looking away and whistling' },
  },
  {
    img: 'pm_colectivo_v2.jpg', fit: 'cover', big: true,
    name: { es: 'El Colectivo Optimal Breaks', en: 'The Optimal Breaks Collective' },
    role: { es: 'Los que eligen la música', en: 'The ones who pick the music' },
    text: {
      es: 'De día, uno es asesor fiscal, otro mecánico, otro reponedor del súper… Al caer la noche se ponen las gafas de sol, suena un «clic» en el pinganillo y se convierten en las máquinas de la música: escuchan cientos de lanzamientos cada semana y eligen de oído el breakbeat de verdad. Siempre al fondo, en fila, sin abrir la boca. Cuando el lechón hace spoiler del set, ellos ya lo sabían hace tres semanas.',
      en: 'By day, one is a tax adviser, another a mechanic, another works the supermarket till… When night falls they put on their sunglasses, there’s a «click» in the earpiece and they become music machines: they listen to hundreds of releases every week and pick the real breakbeat by ear. Always at the back, in a row, never saying a word. When the pig spoils the set, they knew it three weeks ago.',
    },
    alt: { es: 'El Colectivo Optimal Breaks: cinco hombres y una mujer trajeados, con gafas de sol y pinganillo, en formación', en: 'The Optimal Breaks Collective: five men and one woman in suits, with sunglasses and earpieces, in formation' },
    more: {
      label: { es: 'Lo poco que se sabe de ellos', en: 'The little we know about them' },
      items: {
        es: [
          'El Capitán es asesor fiscal; el Técnico, mecánico; la Archivista (la única chica), bibliotecaria; el de la Agenda conduce el autobús; el del Top 100 da clase de mates; el Novato trabaja en el súper.',
          'El lechón le compra las patatas al Novato, le lleva el coche al Técnico y el Capitán le hace la renta… y no sabe que son ellos.',
          'No hablan. Se tocan el pinganillo y asienten.',
          'Cuando cae el drop, cabecean todos a la vez. Una sola vez. Es lo más cerca que han estado de bailar.',
          'Los canis los confunden con seguratas.',
          'El lechón no los ha visto nunca. Mar IA, sí.',
          'El chaleco de P tiene la firma de todos los DJs… menos la del Capitán.',
          'El Novato es el único al que, a veces, se le escapa una sonrisa.',
        ],
        en: [
          'The Captain is a tax adviser; the Technician, a mechanic; the Archivist (the only woman), a librarian; the Agenda guy drives a city bus; the Top 100 guy teaches maths; the Rookie works at the supermarket.',
          'The pig buys his crisps from the Rookie, takes his car to the Technician and gets his taxes done by the Captain… and has no idea it’s them.',
          'They don’t talk. They touch their earpiece and nod.',
          'When the drop hits, they all nod at once. Just once. It’s the closest they’ve ever come to dancing.',
          'The canis mistake them for bouncers.',
          'The pig has never noticed them. Mar IA has.',
          'P’s vest has every DJ’s signature… except the Captain’s.',
          'The Rookie is the only one who sometimes lets a smile slip.',
        ],
      },
    },
  },
]

type Copy = {
  kicker: string
  heroTitle: [string, string]
  heroText: string
  ctaEpisodes: string
  ctaCast: string
  heroAlt: string
  ogAlt: string
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
    ogAlt: 'El Lechón y el Pepino del breakbeat sentados en un altavoz al amanecer, al terminar la fiesta. Las aventuras del Lechón y el Pepino: no seas lechón.',
    ctaCast: 'Conoce a la pandilla',
    heroAlt: 'El lechón con los brazos cruzados, le cae un rayo y se convierte en Super Lechón con traje amarillo y capa roja',
    storyTitle: ['Especie detectada:', 'el lechón'],
    storyLead: 'Escucha todo gratis y no aporta nada. Va de enterao, hace spoilers del set y lo graba todo… pero no baila. Cuanta más música le das, más gordo se pone.',
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
      { title: 'Super Lechón', text: 'Se suelta: baila desde el primer tema, hace breakdance, hasta los canis le hacen corro… y por fin vota.' },
    ],
    castTitle: 'La pandilla',
    castText: 'Cada uno es una tribu de la escena. Seguro que reconoces a alguno. O te reconoces.',
    epsTitle: 'Episodios',
    epsText: 'En el móvil se ven en vertical y en el ordenador en horizontal. También puedes cambiarlo tú.',
    soonTitle: 'Próximamente',
    soonText: 'Mar IA vigila · El ídolo · La caravana de P',
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
    ogAlt: 'The Pig and the Breakbeat Pickle sitting on a speaker at sunrise as the party ends. The adventures of the Pig and the Pickle: don’t be a suckling pig.',
    ctaCast: 'Meet the gang',
    heroAlt: 'The pig with his arms crossed is struck by lightning and turns into Super Pig in a yellow suit and red cape',
    storyTitle: ['Species spotted:', 'the suckling pig'],
    storyLead: 'He streams everything for free and gives nothing back. A know-it-all who spoils the set and films everything… but never dances. The more music you feed him, the fatter he gets.',
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
      { title: 'Super Pig', text: 'He lets go: dances from the first track, breakdances, even the canis gather round… and he finally votes.' },
    ],
    castTitle: 'The gang',
    castText: 'Each one is a tribe from the scene. You’ll recognise someone. Or yourself.',
    epsTitle: 'Episodes',
    epsText: 'On your phone they play vertical, on a computer horizontal. You can switch it yourself too.',
    soonTitle: 'Coming soon',
    soonText: 'Mar IA is watching · The idol · P’s camper',
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
