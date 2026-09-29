// ============================================
// OPTIMAL BREAKS — Guía pilar «Qué es el breakbeat» (/[lang]/breakbeat)
// ----------------------------------------------
// Página de referencia que concentra las búsquedas «qué es el breakbeat»,
// «breakbeat», «what is breakbeat», «qué significa breakbeat»… Sustituye al
// post del blog con el mismo tema (redirección 301 en next.config.js), para
// que home, blog, /history y /en dejen de competir entre sí.
//
// Enlaces internos: sintaxis [texto](/ruta) SIN idioma; la página antepone
// /es o /en. Solo se enlazan rutas que existen (fichas verificadas).
// Editar aquí el texto; la estructura (TOC, FAQ, JSON-LD) sale sola.
// ============================================

export type GuideSection = { id: string; title: string; paragraphs: string[] }
export type GuideFaq = { question: string; answer: string }
export type BreakbeatGuide = {
  title: string
  metaTitle: string
  metaDescription: string
  kicker: string
  lead: string[]
  sections: GuideSection[]
  faq: GuideFaq[]
  tocTitle: string
  faqTitle: string
  updatedLabel: string
}

/** Fecha de la última revisión editorial (ISO). Actualizar al cambiar el texto. */
export const GUIDE_UPDATED = '2026-09-29'
export const GUIDE_PUBLISHED = '2026-09-29'

const es: BreakbeatGuide = {
  kicker: 'GUÍA · EL GÉNERO',
  title: '¿Qué es el breakbeat?',
  metaTitle: 'Qué es el breakbeat: significado, origen, BPM y subgéneros',
  metaDescription:
    'El breakbeat es música electrónica construida sobre ritmos de batería rotos y sincopados, nacida de los «breaks» del funk. Origen, cómo suena, BPM, subgéneros y escena andaluza.',
  tocTitle: 'En esta guía',
  faqTitle: 'Preguntas frecuentes sobre el breakbeat',
  updatedLabel: 'Revisado',
  lead: [
    'El breakbeat es un estilo de música electrónica construido sobre ritmos de batería «rotos»: patrones sincopados, normalmente sacados o inspirados en los breaks de discos de funk y soul, en lugar del bombo constante en cada tiempo (el four-on-the-floor) del house y el techno.',
    'El término nombra a la vez una técnica (usar y manipular breaks de batería) y una familia de géneros: del hip-hop temprano al hardcore rave británico, el big beat, el nu skool breaks, el Florida breaks o el breakbeat andaluz. Suele moverse entre 120 y 140 BPM.',
  ],
  sections: [
    {
      id: 'significado',
      title: 'Qué significa «breakbeat»',
      paragraphs: [
        'En un disco de funk o soul, el «break» es el momento en que la canción se abre y queda casi solo la batería. «Breakbeat» es literalmente el ritmo de ese break. Traducido de forma libre sería «ritmo roto» o «ritmo del break», y de ahí viene la expresión «ritmos rotos» con la que también se conoce al género en español.',
        'Esos pocos segundos de percusión desnuda eran los favoritos de la pista, y los DJs aprendieron a aislarlos y alargarlos. Todo lo demás parte de esa idea.',
      ],
    },
    {
      id: 'origen',
      title: 'Dónde nació: el Bronx de 1973',
      paragraphs: [
        'El punto de partida más citado es la fiesta que DJ Kool Herc pinchó el 11 de agosto de 1973 en el 1520 de Sedgwick Avenue, en el Bronx. Herc usaba dos copias del mismo disco para repetir el break una y otra vez, una técnica que llamó merry-go-round. Los bailarines que entraban con más fuerza en ese momento eran los b-boys y b-girls: el breaking nace del break. Más sobre él en la ficha de [DJ Kool Herc](/artists/dj-kool-herc).',
        'Algunos breaks se convirtieron en materia prima de décadas de música: «Amen, Brother» de The Winstons (1969), el famoso Amen break; «Funky Drummer» de James Brown (1970), con Clyde Stubblefield a la batería; «Apache» de la Incredible Bongo Band (1973) o «Think (About It)» de Lyn Collins (1972).',
        'A finales de los 80, los samplers como el E-mu SP-1200 o el Akai MPC permitieron cortar esos breaks en golpes sueltos y reordenarlos. El break dejó de ser un fragmento que se repetía y pasó a ser un material que se reprogramaba: ahí empieza el breakbeat como música electrónica.',
      ],
    },
    {
      id: 'como-suena',
      title: 'Cómo suena: características del breakbeat',
      paragraphs: [
        'Ritmo sincopado. En lugar de un bombo en cada tiempo, el bombo y la caja se desplazan: la caja cae en el 2 y el 4, pero el bombo va a contratiempo y hay golpes fantasma entre medias. Por eso el cuerpo lo baila de forma distinta a un 4x4.',
        'Tempo medio-alto. La mayoría del breakbeat de pista va entre 120 y 140 BPM; el nu skool breaks se asienta alrededor de 130–135. Cuando los breaks se aceleran por encima de 160 BPM se entra en terreno de jungle y drum and bass, que son hijos directos del breakbeat.',
        'Bajos gruesos y samples. Líneas de bajo potentes (a menudo con herencia del electro y del Miami bass), stabs de sintetizador, voces sampleadas y mucho trabajo de edición sobre la batería.',
      ],
    },
    {
      id: 'evolucion',
      title: 'Evolución: del rave británico a la era digital',
      paragraphs: [
        'Reino Unido, finales de los 80 y primeros 90. El acid house y el techno se mezclan con breaks en warehouses y radios piratas: nace el breakbeat hardcore. De su aceleración salen el jungle y el drum and bass; de su cara más rave, grupos como [The Prodigy](/artists/the-prodigy).',
        'Big beat, mediados y finales de los 90. [The Chemical Brothers](/artists/the-chemical-brothers), Fatboy Slim y sellos como Skint llevan el break a los festivales, la MTV y las listas de éxitos. Es el pico comercial del ritmo roto.',
        'Nu skool breaks, finales de los 90 y 2000. Un sonido más limpio y tecnológico, pensado para la pista: [Stanton Warriors](/artists/stanton-warriors), Plump DJs, Adam Freeland, Rennie Pilgrem o [Krafty Kuts](/artists/krafty-kuts). Lo contamos en detalle en [cómo se reinventó el nu skool breaks](/blog/nu-skool-breaks-como-se-reinvento-el-sonido-para-una-nueva-generacion).',
        'Estados Unidos. Mismo ADN, otro mapa: el Florida breaks de Orlando (con DJ Icey como referencia), el Miami bass y el electro de la costa oeste. Una escena potente pero más fragmentada que la británica.',
        'Era digital. Desde finales de los 2000 el género pierde el centro del mainstream, pero sigue vivo en clubs, radio y comunidades online, con DJs como [Lady Waks](/artists/lady-waks). Hoy convive con el UK bass, el garage y el tech house, y tiene categoría propia en tiendas como Beatport. La cronología completa está en la [historia del breakbeat](/history).',
      ],
    },
    {
      id: 'andalucia',
      title: 'El breakbeat en España: el caso andaluz',
      paragraphs: [
        'En los 90 y primeros 2000, Andalucía convirtió el breakbeat en un fenómeno de masas sin equivalente en Europa: radio, macrofiestas, discotecas de carretera y una cultura de fin de semana propia. Una noche en el Palacio de Deportes Martín Carpena de Málaga, en 2002, se recuerda como el punto de inflexión de aquella etapa.',
        'Desde mediados de los 2010 hay un resurgir claro en el sur, con promotoras, festivales y una nueva generación de DJs y productores. Lo explicamos en [la escena del breakbeat andaluz](/scenes/andalusian-breakbeat) y en [cómo el sur de España creó una escena propia](/blog/el-auge-del-breakbeat-andaluz-como-el-sur-de-espana-creo-una-escena-propia).',
      ],
    },
    {
      id: 'subgeneros',
      title: 'Subgéneros del breakbeat',
      paragraphs: [
        'Breakbeat hardcore: el rave británico de 1990–1993, acelerado y lleno de samples; antecesor del jungle.',
        'Big beat: breaks gruesos, guitarras, rock y actitud de festival (Chemical Brothers, Fatboy Slim).',
        'Nu skool breaks: producción limpia, bajos potentes y energía de club; el sonido de los 2000.',
        'Florida breaks: la escena de Orlando y Miami, con fuerte influencia del electro y el Miami bass.',
        'Acid breaks, progressive breaks y breakstep: variantes que cruzan el break con el acid house, el trance progresivo o el dubstep.',
        'Breakbeat andaluz: la lectura del sur de España, masiva en los 90 y de nuevo en auge.',
      ],
    },
    {
      id: 'escuchar',
      title: 'Por dónde empezar a escuchar',
      paragraphs: [
        'Si partes de cero: una selección de [artistas esenciales del breakbeat](/blog/artistas-esenciales-del-breakbeat-que-hay-que-conocer), los [sellos que construyeron el género](/blog/los-sellos-discograficos-que-construyeron-el-breakbeat), el [Top 100 de la comunidad](/top100) con lo que más guarda la gente, los [lanzamientos de cada semana](/charts) y [sesiones completas](/mixes).',
        'Y para vivirlo en directo: la [agenda breakbeat por ciudad y mes](/agenda) y los [festivales](/festivals).',
      ],
    },
  ],
  faq: [
    {
      question: '¿Qué significa breakbeat en español?',
      answer:
        'Literalmente, «el ritmo del break»: el fragmento de un disco en el que solo suena la batería. En español se habla también de «ritmos rotos», porque el patrón de batería está sincopado en lugar de marcar cada tiempo.',
    },
    {
      question: '¿Dónde nació el breakbeat?',
      answer:
        'En el Bronx (Nueva York) en los años 70. La referencia más citada es la fiesta de DJ Kool Herc del 11 de agosto de 1973, donde alargaba los breaks de discos de funk con dos platos. Como música electrónica se desarrolló sobre todo en Reino Unido a finales de los 80 y en los 90.',
    },
    {
      question: '¿A cuántos BPM va el breakbeat?',
      answer:
        'Normalmente entre 120 y 140 BPM; el nu skool breaks suele ir a 130–135. Por encima de 160 BPM, con breaks acelerados, se habla ya de jungle o drum and bass.',
    },
    {
      question: '¿Qué diferencia hay entre breakbeat y techno o house?',
      answer:
        'El house y el techno usan un bombo en cada tiempo (four-on-the-floor). El breakbeat rompe ese patrón: bombo y caja se desplazan y aparecen golpes a contratiempo, lo que da un groove sincopado.',
    },
    {
      question: '¿Es lo mismo breakbeat que drum and bass?',
      answer:
        'No, aunque son familia. El drum and bass nace de acelerar los breakbeats del hardcore británico hasta 160–180 BPM, con un protagonismo enorme del bajo. El breakbeat de pista suele ir más lento, a 120–140 BPM.',
    },
    {
      question: '¿Qué es el Amen break?',
      answer:
        'Un solo de batería de unos seis segundos del tema «Amen, Brother» de The Winstons (1969). Es probablemente el break más sampleado de la historia y la base de buena parte del jungle, el drum and bass y el breakbeat.',
    },
    {
      question: '¿Qué es el breakbeat andaluz?',
      answer:
        'La escena de breakbeat del sur de España, que en los 90 y primeros 2000 llegó a ser un fenómeno de masas con radio, macrofiestas y cultura de fin de semana propia. Desde mediados de los 2010 vive un resurgir con nuevos festivales, promotoras y artistas.',
    },
  ],
}

const en: BreakbeatGuide = {
  kicker: 'GUIDE · THE GENRE',
  title: 'What is breakbeat?',
  metaTitle: 'What is breakbeat? Meaning, origins, BPM and subgenres',
  metaDescription:
    'Breakbeat is electronic music built on broken, syncopated drum patterns that grew out of the drum "breaks" of funk records. Origins, sound, BPM, subgenres and scenes.',
  tocTitle: 'In this guide',
  faqTitle: 'Breakbeat FAQ',
  updatedLabel: 'Reviewed',
  lead: [
    'Breakbeat is a style of electronic music built on "broken" drum rhythms: syncopated patterns usually taken from, or inspired by, the drum breaks of funk and soul records, instead of the steady kick on every beat (four-on-the-floor) of house and techno.',
    'The word names both a technique (sampling and reshaping drum breaks) and a family of genres, from early hip-hop to UK rave hardcore, big beat, nu skool breaks, Florida breaks and Andalusian breakbeat. It usually sits between 120 and 140 BPM.',
  ],
  sections: [
    {
      id: 'meaning',
      title: 'What "breakbeat" means',
      paragraphs: [
        'On a funk or soul record, the "break" is the moment the song opens up and little but the drums is left. A breakbeat is, quite literally, the beat of that break.',
        'Those few seconds of bare percussion were what dancers waited for, and DJs learned to isolate and extend them. Everything else grows from that idea.',
      ],
    },
    {
      id: 'origins',
      title: 'Where it began: the Bronx, 1973',
      paragraphs: [
        'The most cited starting point is the party DJ Kool Herc played on 11 August 1973 at 1520 Sedgwick Avenue in the Bronx. Herc used two copies of the same record to repeat the break over and over, a technique he called the merry-go-round. The dancers who went hardest in that moment were the b-boys and b-girls: breaking was born from the break. More on him in the [DJ Kool Herc](/artists/dj-kool-herc) profile.',
        'A handful of breaks became raw material for decades of music: "Amen, Brother" by The Winstons (1969), the famous Amen break; James Brown\'s "Funky Drummer" (1970) with Clyde Stubblefield on drums; the Incredible Bongo Band\'s "Apache" (1973) and Lyn Collins\' "Think (About It)" (1972).',
        'In the late 80s, samplers such as the E-mu SP-1200 and the Akai MPC made it possible to chop those breaks into single hits and rearrange them. The break stopped being a loop and became something you reprogrammed: that is where breakbeat as electronic music begins.',
      ],
    },
    {
      id: 'sound',
      title: 'What it sounds like',
      paragraphs: [
        'Syncopated rhythm. Instead of a kick on every beat, kick and snare shift around: the snare lands on 2 and 4 while the kick falls off the beat, with ghost notes in between. That is why it moves the body differently from a 4/4 groove.',
        'Mid-to-high tempo. Most club breakbeat sits between 120 and 140 BPM, with nu skool breaks around 130–135. Push breaks above 160 BPM and you are in jungle and drum and bass territory, both direct descendants of breakbeat.',
        'Heavy bass and samples. Big basslines (often inherited from electro and Miami bass), synth stabs, sampled vocals and a lot of editing on the drums.',
      ],
    },
    {
      id: 'evolution',
      title: 'Evolution: from UK rave to the digital era',
      paragraphs: [
        'UK, late 80s and early 90s. Acid house and techno collide with breaks in warehouses and on pirate radio: breakbeat hardcore is born. Speeding it up produced jungle and drum and bass; its rave side produced acts like [The Prodigy](/artists/the-prodigy).',
        'Big beat, mid-to-late 90s. [The Chemical Brothers](/artists/the-chemical-brothers), Fatboy Slim and labels such as Skint took the break to festivals, MTV and the charts: the commercial peak of broken beats.',
        'Nu skool breaks, late 90s and 2000s. A cleaner, more technological, club-focused sound: [Stanton Warriors](/artists/stanton-warriors), Plump DJs, Adam Freeland, Rennie Pilgrem and [Krafty Kuts](/artists/krafty-kuts). The full story is in [how nu skool breaks reinvented the sound](/blog/nu-skool-breaks-como-se-reinvento-el-sonido-para-una-nueva-generacion).',
        'United States. Same DNA, different map: Florida breaks from Orlando (with DJ Icey as a reference point), Miami bass and West Coast electro. A strong scene, but more fragmented than the UK one.',
        'Digital era. From the late 2000s the genre lost its mainstream centre, but it stayed alive in clubs, on radio and in online communities, with DJs like [Lady Waks](/artists/lady-waks). Today it sits alongside UK bass, garage and tech house and has its own category in stores such as Beatport. The full timeline is in the [history of breakbeat](/history).',
      ],
    },
    {
      id: 'andalusia',
      title: 'Breakbeat in Spain: the Andalusian case',
      paragraphs: [
        'In the 90s and early 2000s, Andalusia turned breakbeat into a mass phenomenon with no real equivalent in Europe: radio, mega-parties, roadside clubs and its own weekend culture. A night at the Palacio de Deportes Martín Carpena in Málaga in 2002 is remembered as the turning point of that era.',
        'Since the mid-2010s there has been a clear revival in the south, with new promoters, festivals and a new generation of DJs and producers. Read more about [the Andalusian breakbeat scene](/scenes/andalusian-breakbeat).',
      ],
    },
    {
      id: 'subgenres',
      title: 'Breakbeat subgenres',
      paragraphs: [
        'Breakbeat hardcore: UK rave from 1990–1993, fast and sample-heavy; the ancestor of jungle.',
        'Big beat: fat breaks, guitars, rock energy and festival attitude (The Chemical Brothers, Fatboy Slim).',
        'Nu skool breaks: clean production, heavy bass and club energy; the sound of the 2000s.',
        'Florida breaks: the Orlando and Miami scene, strongly shaped by electro and Miami bass.',
        'Acid breaks, progressive breaks and breakstep: variants that cross the break with acid house, progressive trance or dubstep.',
        'Andalusian breakbeat: southern Spain\'s take, huge in the 90s and on the rise again.',
      ],
    },
    {
      id: 'listen',
      title: 'Where to start listening',
      paragraphs: [
        'Starting from zero: the [essential breakbeat artists](/blog/artistas-esenciales-del-breakbeat-que-hay-que-conocer), the [labels that built the genre](/blog/los-sellos-discograficos-que-construyeron-el-breakbeat), the [community Top 100](/top100), [new releases every week](/charts) and [full DJ sets](/mixes).',
        'To experience it live: [breakbeat listings by city and month](/agenda) and the [festivals](/festivals).',
      ],
    },
  ],
  faq: [
    {
      question: 'What does breakbeat mean?',
      answer:
        'Literally, "the beat of the break": the part of a record where only the drums play. The word covers both the technique of sampling and reshaping those breaks and the family of electronic genres built on them.',
    },
    {
      question: 'Where did breakbeat originate?',
      answer:
        'In the Bronx, New York, in the 1970s. The most cited reference is DJ Kool Herc\'s party of 11 August 1973, where he extended the breaks of funk records using two turntables. As electronic music it developed mainly in the UK in the late 80s and 90s.',
    },
    {
      question: 'What BPM is breakbeat?',
      answer:
        'Usually between 120 and 140 BPM, with nu skool breaks typically at 130–135. Above 160 BPM, with sped-up breaks, you are into jungle or drum and bass.',
    },
    {
      question: 'What is the difference between breakbeat and house or techno?',
      answer:
        'House and techno put a kick on every beat (four-on-the-floor). Breakbeat breaks that pattern: kick and snare move around and off-beat hits appear, creating a syncopated groove.',
    },
    {
      question: 'Is breakbeat the same as drum and bass?',
      answer:
        'No, although they are related. Drum and bass came from speeding up UK hardcore breakbeats to 160–180 BPM, with the bassline taking centre stage. Club breakbeat is usually slower, at 120–140 BPM.',
    },
    {
      question: 'What is the Amen break?',
      answer:
        'A drum solo of roughly six seconds from "Amen, Brother" by The Winstons (1969). It is probably the most sampled break in history and underpins much of jungle, drum and bass and breakbeat.',
    },
  ],
}

export function breakbeatGuide(lang: 'es' | 'en'): BreakbeatGuide {
  return lang === 'es' ? es : en
}
