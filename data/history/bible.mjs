/**
 * Historia pública de /history. Fuente en git; la web lee history_entries.
 * Aplicar: node data/history/bible.mjs
 * (en red con inspección SSL: $env:NODE_TLS_REJECT_UNAUTHORIZED='0')
 */
import { existsSync, readFileSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'

const h = (title) =>
  `<p style="font-family:'Unbounded',sans-serif;font-weight:900;font-size:clamp(18px,3vw,26px);text-transform:uppercase;letter-spacing:-0.4px;line-height:1.15;margin:1.7em 0 0.55em;">${title}</p>`

export const chapters = [
  {
    slug: 'origins',
    section: 'origins',
    year_start: 1960,
    year_end: 1972,
    sort_order: 1,
    title_es: 'Antes del breakbeat: funk, soul y el break de batería',
    title_en: 'Before breakbeat: funk, soul and the drum break',
    content_es: `
<p>El breakbeat no empieza como género de club. Empieza como un momento dentro de otra música. En el funk y el soul de finales de los sesenta y principios de los setenta hay pasajes en los que la voz se aparta, los metales esperan y la batería queda al descubierto. Ese fragmento —el break— no era un adorno. Era el punto de más tensión del disco: el sitio donde el cuerpo entendía el ritmo antes que la letra.</p>
<p>La materia prima que luego se samplearía hasta el desgaste ya estaba grabada. James Brown y Clyde Stubblefield dejaron en <em>Funky Drummer</em> (1970) un patrón que el hip hop convertiría en idioma. Lyn Collins, en la órbita de Brown, grabó <em>Think (About It)</em> (1972): de ahí sale el Think break, otro de los cimientos. The Winstons publicaron en 1969 <em>Amen, Brother</em>, cara B de <em>Color Him Father</em>. El solo de Gregory C. Coleman —unos seis segundos— es el Amen break. The Incredible Bongo Band, con <em>Apache</em> (1973), añadió el otro disco que las pistas del Bronx no soltaban.</p>
<p>Nada de eso se llamaba breakbeat. Eran discos de funk, soul y explotación de banda sonora, pensados para bailar enteros. Lo que cambia después no es la batería: es la decisión de quedarse solo con ella, repetirla y hacer de ese corte el tema. Coleman murió en 2006 sin haber cobrado por el loop más reutilizado de la música popular. Conviene recordarlo al principio, no como anécdota triste al final: la historia del break también es una historia de extracción.</p>
<p>En esta fase el break es todavía un recurso, no una escena. La técnica que lo aísla, el baile que le contesta y los géneros que salen de samplearlo llegan en los capítulos siguientes. La nota de al lado —cuando el break se hace cuerpo— explica el paso del fragmento al breaking. Aquí basta el suelo: sin esos discos no hay nada que extender.</p>`.trim(),
    content_en: `
<p>Breakbeat does not begin as a club genre. It begins as a moment inside other music. In late-1960s and early-1970s funk and soul there are passages where the voice steps aside, the horns wait and the drums are left bare. That fragment — the break — was not decoration. It was the record’s point of highest tension: the place where the body understood the rhythm before the lyric.</p>
<p>The raw material later sampled to exhaustion was already on tape. James Brown and Clyde Stubblefield left, on <em>Funky Drummer</em> (1970), a pattern hip hop would turn into a language. Lyn Collins, in Brown’s orbit, cut <em>Think (About It)</em> (1972): the Think break comes from there, another foundation. In 1969 The Winstons released <em>Amen, Brother</em>, the B-side of <em>Color Him Father</em>. Gregory C. Coleman’s solo — about six seconds — is the Amen break. The Incredible Bongo Band’s <em>Apache</em> (1973) became the other record Bronx parties would not let go of.</p>
<p>None of this was called breakbeat. These were funk, soul and soundtrack records, meant to be danced all the way through. What changes later is not the drumming. It is the decision to keep only the drums, loop them and make that cut the track. Coleman died in 2006 without being paid for the most reused loop in popular music. That belongs at the beginning, not as a sad footnote: break history is also a history of extraction.</p>
<p>At this stage the break is still a device, not a scene. The technique that isolates it, the dance that answers it and the genres built by sampling it come in the next chapters. The note beside this one — when the break becomes a body — explains the step from fragment to breaking. Here the ground is enough: without these records there is nothing to extend.</p>`.trim(),
  },
  {
    slug: 'bronx-the-break',
    section: 'origins',
    year_start: 1973,
    year_end: 1983,
    sort_order: 2,
    title_es: 'El Bronx: el break se hace técnica',
    title_en: 'The Bronx: the break becomes a technique',
    content_es: `
<p>En 1973, en el Bronx, DJ Kool Herc —jamaicano de nacimiento— se da cuenta de que la pista reacciona con más fuerza cuando llega el break. No alarga la canción: alarga ese fragmento. Con dos copias del mismo disco espera el golpe, vuelve al principio del break y lo sostiene. Es el merry-go-round. La fiesta que suele fecharse el 11 de agosto de 1973, en el 1520 de Sedgwick Avenue, importa menos como mito de origen único que como escena visible de una práctica que ya estaba en la calle.</p>
<p>Grandmaster Flash afina después la mezcla: cueing, cortes más cortos, el disco como instrumento y no solo como depósito de breaks. Afrika Bambaataa abre el repertorio —rock, electro, funk, lo que la pista aguante— y ayuda a nombrar una cultura, no un solo truco de cabina. Alrededor están el MC, el graffiti y, sobre todo, el breaking: b-boys y b-girls que entran cuando la batería manda. El nombre «breakdance» lo pone luego el mercado. El baile ya existía como respuesta al corte.</p>
<p>Esto es hip hop. No es todavía el breakbeat de club de los noventa, ni Florida breaks, ni nu skool. Confundirlos aplana cincuenta años. Lo que sí se hereda es una lógica: el DJ deja de pasar discos enteros y compone con las partes que hacen bailar; el ritmo roto se vuelve el centro, no el puente; la repetición no es un fallo, es la forma.</p>
<p>Las palabras, a partir de aquí, no son intercambiables. <strong>Break</strong> es el fragmento. <strong>Breakbeat</strong> es el principio rítmico y, después, la familia entera. <strong>Breakbeat hardcore</strong> es solo la rama rave británica de finales de los ochenta. <strong>Breaks</strong> es el nombre de pista desde finales de los noventa, a menudo entre 125 y 140 BPM. <strong>Broken beat</strong> es otra tradición, la del oeste de Londres, y no entra en este árbol. <strong>UK bass</strong> es una etiqueta de tienda más ancha que el género. Optimal usa «breakbeat» para el archivo y «breaks» para la música de club que sale de los noventa. La nota de al lado cuenta el paso del disco al cuerpo; esta lista evita que el resto de la página use un solo nombre para seis cosas.</p>`.trim(),
    content_en: `
<p>In 1973, in the Bronx, DJ Kool Herc — Jamaican-born — notices the floor hits harder when the break arrives. He does not extend the song. He extends that fragment. With two copies of the same record he catches the hit, returns to the top of the break and holds it. That is the merry-go-round. The party usually dated 11 August 1973, at 1520 Sedgwick Avenue, matters less as a single origin myth than as a visible instance of a practice already in the street.</p>
<p>Grandmaster Flash then sharpens the mix: cueing, shorter cuts, the record as an instrument rather than a store of breaks. Afrika Bambaataa opens the repertoire — rock, electro, funk, whatever the floor can take — and helps name a culture, not a single booth trick. Around them are the MC, graffiti and, above all, breaking: b-boys and b-girls who enter when the drums take over. The market later supplies the word “breakdance”. The dance already existed as an answer to the cut.</p>
<p>This is hip hop. It is not yet 1990s club breakbeat, nor Florida breaks, nor nu skool. Confusing them flattens fifty years. What is inherited is a logic: the DJ stops playing records whole and composes with the parts that make people dance; the broken rhythm becomes the centre, not the bridge; repetition is not a mistake, it is the form.</p>
<p>From here the words are not interchangeable. <strong>Break</strong> is the fragment. <strong>Breakbeat</strong> is the rhythmic principle and, later, the whole family. <strong>Breakbeat hardcore</strong> is only the British rave branch of the late 1980s. <strong>Breaks</strong> is the floor name from the late 1990s, often between 125 and 140 BPM. <strong>Broken beat</strong> is another tradition, west London’s, and it does not enter this tree. <strong>UK bass</strong> is a shop tag wider than the genre. Optimal uses “breakbeat” for the archive and “breaks” for the club music that comes out of the 1990s. The note beside this chapter tells the step from the record to the body; this list stops the rest of the page using one name for six things.</p>`.trim(),
  },
  {
    slug: 'electro-samplers',
    section: 'us_breaks',
    year_start: 1982,
    year_end: 1990,
    sort_order: 3,
    title_es: 'Electro, samplers y cajas de ritmo',
    title_en: 'Electro, samplers and drum machines',
    content_es: `
<p>Entre el Bronx y la rave británica no hay un vacío. Hay electro, hay bajo de 808 y hay una máquina que permite dejar de cazar el break en un vinilo y escribirlo. En 1982, Afrika Bambaataa &amp; the Soulsonic Force publican <em>Planet Rock</em>. El modelo es Kraftwerk, la caja es una Roland TR-808 y el resultado ya no es un disco de funk pinchado en dos platos: es una batería electrónica que ocupa el sitio del break. El electro-funk convierte el ritmo roto en producción, no solo en técnica de cabina.</p>
<p>La cultura del sampleo cierra el paso. El sampler —E-mu SP-12, luego el SP-1200, el Akai de los estudios domésticos— permite coger el Amen, el Think o el Funky Drummer, cortarlos en golpes y volver a montarlos. El break deja de ser un fragmento que se alarga y pasa a ser un kit. De ahí salen el hip hop de mediados de los ochenta, el house que a veces se apoya en breaks, y más tarde el hardcore y el jungle. Sin esa herramienta, la historia de los noventa es imposible.</p>
${h('Miami bass, no todavía Florida breaks')}
<p>En el sur de Florida el 808 se vuelve bajo, no solo caja. En 1986, David Noller publica <em>Just Give the DJ a Break</em>, una referencia formativa del Miami bass: el golpe de la caja como línea grave. 2 Live Crew, Maggotron y esa red de Miami convierten el bass en música regional de masas, rápida, explícita y de coche. DJ Magic Mike, desde Orlando, mezcla ese bass con hip hop y turntablism y lo saca del barrio hacia un mercado más ancho.</p>
<p>Eso es la prehistoria del Florida breaks, no el género de club de los noventa. Conviene no adelantar el nombre. Miami bass es electro llevado al bajo y a la calle. El breaks de Orlando y Tampa llega cuando esa memoria se cruza con la rave, el house de piano y una pista que ya no baila solo hip hop. El relato largo está en la escena de <a href="/scenes/us-breaks">breaks americano</a>.</p>`.trim(),
    content_en: `
<p>Between the Bronx and British rave there is no gap. There is electro, there is 808 bass and there is a machine that lets you stop hunting the break on a record and start writing it. In 1982 Afrika Bambaataa &amp; the Soulsonic Force release <em>Planet Rock</em>. The model is Kraftwerk, the machine is a Roland TR-808, and the result is no longer a funk record played on two decks: it is an electronic drum kit sitting where the break sat. Electro-funk turns the broken rhythm into production, not only a booth technique.</p>
<p>Sampling culture closes the step. The sampler — E-mu SP-12, then the SP-1200, the Akai of home studios — lets you take the Amen, the Think or Funky Drummer, chop them into hits and rebuild them. The break stops being a fragment you extend and becomes a kit. Mid-1980s hip hop comes from there, the house that sometimes leans on breaks, and later hardcore and jungle. Without that tool the 1990s are impossible.</p>
${h('Miami bass, not yet Florida breaks')}
<p>In south Florida the 808 becomes bass, not just a drum machine. In 1986 David Noller releases <em>Just Give the DJ a Break</em>, a formative Miami bass record: the machine’s hit used as a low line. 2 Live Crew, Maggotron and that Miami network turn bass into regional pop, fast, explicit and built for cars. DJ Magic Mike, from Orlando, mixes that bass with hip hop and turntablism and takes it beyond the neighbourhood.</p>
<p>That is the prehistory of Florida breaks, not the 1990s club genre. The name should not be pulled forward. Miami bass is electro pushed into bass and the street. Orlando and Tampa breaks arrive when that memory crosses rave, piano house and a floor that is no longer only hip hop. The long account is in the <a href="/scenes/us-breaks">American breaks</a> scene.</p>`.trim(),
  },
  {
    slug: 'uk-rave',
    section: 'uk_breakbeat',
    year_start: 1988,
    year_end: 1994,
    sort_order: 4,
    title_es: 'Rave británica y breakbeat hardcore',
    title_en: 'British rave and breakbeat hardcore',
    content_es: `
<p>A finales de los ochenta el acid house y el techno americanos llegan al Reino Unido y no se quedan quietos. Allí se cruzan con hip hop, electro, dub, soundsystem, synth-pop y new beat. Hacia 1990 esa mezcla ya tiene nombre de pista: breakbeat hardcore. El bombo recto convive con breaks cortados, pianos de house, stabs, sirenas, voces aceleradas y bajos que vienen del reggae. No es una versión británica «del mismo techno». Es otra música.</p>
<p>Londres concentra tiendas, sellos y radio pirata, pero la rave no es una ciudad. Manchester, Bristol, Sheffield, las Midlands y el extrarradio pesan igual. Shut Up and Dance ata hip hop británico, bajos jamaicanos y cultura rave. The Prodigy sale de Essex con esa gramática ya normal: bombos, breaks, ragga, piano y una actitud más cerca del punk que del club elegante. Alrededor, SL2, Altern-8, N-Joi, Acen, The Ragga Twins, 808 State, Renegade Soundwave, The KLF. El hardcore es un circuito, no un grupo.</p>
${h('La ley, el campo y la fractura')}
<p>Tampoco fue solo una fiesta. Warehouses, servicios de autopista, cintas y emisoras pirata sostuvieron una cultura que el Estado trató como desorden. La Criminal Justice and Public Order Act de 1994 dio a la policía herramientas contra las raves al aire libre y se hizo célebre por definir esa música como una «sucesión de ritmos repetitivos». No acabó con el baile. Sí empujó a mucha gente hacia locales con licencia, horarios y puertas, y aceleró la especialización. La rave dejó de ser un solo territorio.</p>
<p>Entre 1992 y 1994 una parte del hardcore se oscurece, se acelera y rompe el Amen en piezas más pequeñas. El subgrave crece. El reggae y el dancehall dejan de ser un sample y pasan a ser estructura. De ahí sale el jungle, y enseguida el drum &amp; bass. No es «el breakbeat que madura». Es una familia que se va. 4hero, Reinforced, Moving Shadow y, en la cara más visible, Goldie cuentan esa salida. El breaks de club de finales de los noventa no desciende en línea recta del jungle: comparte abuelos y luego discute.</p>
<p>El mapa británico, con sus ciudades y sus sellos, está en <a href="/scenes/uk-breakbeat">breakbeat británico</a>.</p>`.trim(),
    content_en: `
<p>In the late 1980s American acid house and techno reach the United Kingdom and do not sit still. They cross hip hop, electro, dub, soundsystem culture, synth-pop and new beat. Around 1990 that mix already has a floor name: breakbeat hardcore. A straight kick lives with chopped breaks, house pianos, stabs, sirens, sped-up vocals and bass that comes from reggae. It is not a British copy of “the same techno”. It is other music.</p>
<p>London concentrates shops, labels and pirate radio, but rave is not one city. Manchester, Bristol, Sheffield, the Midlands and the outskirts weigh as much. Shut Up and Dance binds British hip hop, Jamaican bass and rave culture. The Prodigy come out of Essex with that grammar already normal: kicks, breaks, ragga, piano and an attitude closer to punk than to a polite club. Around them, SL2, Altern-8, N-Joi, Acen, The Ragga Twins, 808 State, Renegade Soundwave, The KLF. Hardcore is a circuit, not a group.</p>
${h('The law, the field and the split')}
<p>It was not only a party. Warehouses, motorway services, tapes and pirate stations carried a culture the state treated as disorder. The Criminal Justice and Public Order Act 1994 gave police tools against outdoor raves and became famous for defining that music as “a succession of repetitive beats”. It did not end the dancing. It did push many people toward licensed rooms, hours and doors, and it sped up specialisation. Rave stopped being one territory.</p>
<p>Between 1992 and 1994 a part of hardcore darkens, speeds up and breaks the Amen into smaller pieces. The sub grows. Reggae and dancehall stop being a sample and become structure. Jungle comes out of that, and soon drum &amp; bass. It is not “breakbeat growing up”. It is a family leaving. 4hero, Reinforced, Moving Shadow and, on the more visible face, Goldie tell that exit. Late-1990s club breaks do not descend in a straight line from jungle: they share grandparents and then argue.</p>
<p>The British map, with its cities and labels, is in <a href="/scenes/uk-breakbeat">British breakbeat</a>.</p>`.trim(),
  },
  {
    slug: 'florida-breaks',
    section: 'us_breaks',
    year_start: 1989,
    year_end: 1996,
    sort_order: 5,
    title_es: 'Estados Unidos construye su propio breaks',
    title_en: 'America builds its own breaks',
    content_es: `
<p>Después del Bronx, Estados Unidos no desaparece de esta historia. Desaparece del relato perezoso, que salta a Londres y no vuelve. En paralelo al hardcore británico, Florida arma una escena de club propia. No es una sucursal del Reino Unido ni la continuación directa de las fiestas de Herc. Es electro, Miami bass, hip hop e importación rave, cocinados en Orlando y Tampa.</p>
${h('Orlando')}
<p>La noche que prepara el sonido es AAHZ, en el Beacham Theatre, con residentes como Kimball Collins y Dave Cannata, entre el final de los ochenta y los primeros noventa. Orlando tiende al piano, al freestyle, al breaks con vocación funky y al impacto del bajo. The Edge, abierto en 1992, convierte el after y la fiesta grande en laboratorio. Allí <a href="/artists/dj-icey">DJ Icey</a> perfila graves rodantes, baterías aceleradas, cortes de hip hop y energía de rave. En 1993 funda <a href="/labels/zone-records">Zone Records</a>: una figura y un catálogo, no un inventor solitario. <a href="/artists/dj-baby-anne">DJ Baby Anne</a> sale del mismo circuito. Club Firestone recoge parte de ese impulso y le sube la escala.</p>
${h('Tampa y la costa Oeste')}
<p>Tampa no es Orlando con otra salida de autopista. El corredor de la I-4 las conecta, pero el acento cambia. Tampa empuja más el reverso psicodélico —Hallucination es el nombre que la escena recuerda— frente al piano y el funky de Orlando. Tratadas como una sola «escena de Florida» se entienden; tratadas como la misma fiesta, no.</p>
<p>En la costa Oeste hay otro foco, más pequeño y más cerca del big beat y de la rave de producción que del Orlando Sound: <a href="/artists/the-crystal-method">The Crystal Method</a> es el caso visible. No hay que estirarlo para rellenar el mapa. Lo que sí recorre el país, ya en los noventa y después, es el disco de breaks como objeto de cabina. <a href="/artists/huda-hudia">Huda Hudia</a>, <a href="/artists/keith-mackenzie">Keith MacKenzie</a>, <a href="/artists/dj-fixx">DJ Fixx</a>, y más tarde el cruce con sellos británicos, prolongan ese idioma. <a href="/artists/deekline">Deekline</a>, desde el Reino Unido, circula por esas pistas sin convertirse en un artista de Florida: influencia de discos y giras, no de padrón.</p>
<p>Florida breaks es una de las genealogías grandes del breaks estadounidense. Que durante años no cupiera en una historia «Bronx → Londres → Andalucía» dice más del mapa que de la música. El capítulo completo está en <a href="/scenes/us-breaks">breaks americano</a>.</p>`.trim(),
    content_en: `
<p>After the Bronx, the United States does not leave this history. It leaves the lazy account, which jumps to London and never comes back. In parallel with British hardcore, Florida builds a club scene of its own. It is not a British branch office and it is not a direct sequel to Herc’s parties. It is electro, Miami bass, hip hop and imported rave, cooked in Orlando and Tampa.</p>
${h('Orlando')}
<p>The night that prepares the sound is AAHZ, at the Beacham Theatre, with residents including Kimball Collins and Dave Cannata, from the late 1980s into the early 1990s. Orlando leans toward piano, freestyle, funky-minded breaks and the impact of the bass. The Edge, opened in 1992, turns the after-hours and the big party into a laboratory. There <a href="/artists/dj-icey">DJ Icey</a> shapes rolling lows, sped-up drums, hip hop cuts and rave energy. In 1993 he founds <a href="/labels/zone-records">Zone Records</a>: a figure and a catalogue, not a lone inventor. <a href="/artists/dj-baby-anne">DJ Baby Anne</a> comes out of the same circuit. Club Firestone picks up part of that push and raises the scale.</p>
${h('Tampa and the West Coast')}
<p>Tampa is not Orlando with a different freeway exit. The I-4 corridor connects them, but the accent changes. Tampa pushes the psychedelic reverse — Hallucination is the name the scene remembers — against Orlando’s piano and funk. Treated as one “Florida scene” they make sense; treated as the same party, they do not.</p>
<p>On the West Coast there is another pocket, smaller and closer to big beat and production rave than to the Orlando Sound: <a href="/artists/the-crystal-method">The Crystal Method</a> is the visible case. It should not be stretched to fill the map. What does travel the country, in the 1990s and after, is the breaks record as a booth object. <a href="/artists/huda-hudia">Huda Hudia</a>, <a href="/artists/keith-mackenzie">Keith MacKenzie</a>, <a href="/artists/dj-fixx">DJ Fixx</a>, and later the crossover with British labels, extend that language. <a href="/artists/deekline">Deekline</a>, from the United Kingdom, moves through those floors without becoming a Florida artist: influence of records and tours, not of a census.</p>
<p>Florida breaks is one of the major genealogies of American breaks. That for years it did not fit a “Bronx → London → Andalusia” history says more about the map than about the music. The full chapter is in <a href="/scenes/us-breaks">American breaks</a>.</p>`.trim(),
  },
  {
    slug: 'andalusian-golden-age',
    section: 'andalusian',
    year_start: 1992,
    year_end: 2002,
    sort_order: 6,
    title_es: 'Andalucía: una cultura de masas',
    title_en: 'Andalusia: a mass breakbeat culture',
    content_es: `
<p>Entre 1992 y 2002 Andalucía hace con el breakbeat algo que casi no tiene equivalente en Europa: lo convierte en cultura popular de una región entera. El hardcore, el electro y el hip hop dejan de sentirse como importación y ordenan fines de semana, carretera, ropa y amistades. No es un nicho de tienda. Es una generación.</p>
<p>La Expo de Sevilla, en 1992, condensa una voluntad de apertura. La A-92, más prosaica, importa tanto: acorta Málaga, Sevilla, Granada y los enlaces hacia Cádiz, Córdoba o Jaén. Viajar pasa a ser parte de la fiesta. Málaga llega antes, por la Costa del Sol y su noche internacional; Sevilla, Cádiz, Huelva y Granada arman el resto de la red. Hay tiendas, cintas, promotores, macrofiestas y una radio que saca el idioma del circuito especializado. Mundo Evassion, en Canal Fiesta / Canal Sur, es el caso extremo: un programa que convoca, emite y se confunde con el negocio de la noche. Esa frontera borrosa —radio pública y promoción privada— es una fuerza y, más tarde, un problema.</p>
<p>La masificación no es solo una cifra de éxito. Convocatorias cada vez mayores, recintos que no dan, menores en la pista, mercado de drogas, botellón, choques entre promotores y un control policial que crece con la visibilidad. La prensa y la calle construyen además una caricatura: el breakbeat queda pegado a una imagen despectiva de la juventud andaluza, el «cani», que dice más del prejuicio de quien mira que de la música. Parte de eso está en la crónica y en los testimonios de quien estuvo. No hace falta exagerarlo para ver que la edad de oro ya venía cargada.</p>
${h('2002 — Martín Carpena')}
<p>El 2 de marzo de 2002, el quinto aniversario de Mundo Evassion llena el Palacio de Deportes José María Martín Carpena, en Málaga. Las crónicas documentaron un aforo autorizado de unas 8.000 personas, superado con holgura, problemas de acceso y una seguridad desbordada. En las horas siguientes murieron dos jóvenes, de 19 y 20 años, después de consumir éxtasis. Otros asistentes acabaron en el hospital, entre ellos una niña de doce años. <a href="https://elpais.com/elpais/2002/03/04/actualidad/1015233423_850215.html" target="_blank" rel="noopener noreferrer">El País</a> lo contó entonces. Fueron dos fallecidos, no tres.</p>
<p>Conviene separar los hechos, porque se pegaron en una sola frase y así se quedaron. Las muertes estuvieron asociadas al consumo. El exceso de aforo y los fallos de organización fueron otros problemas, distintos, que coincidieron esa noche. Su suma convirtió la fiesta en catástrofe y en escándalo. No son la misma causa con tres disfraces.</p>
<p>Lo que vino después sí es de escena, no solo de suceso. Alarma mediática, presión política, Canal Sur apartando el programa y tratando de despegarse de la noche —la relación era más enredada: cuñas, directos, directivos—, cancelaciones y una estigmatización que identificó toda la música con aquella madrugada. Mucha gente que la vivió, y el documental <a href="https://www.filmaffinity.com/es/film126766.html" target="_blank" rel="noopener noreferrer"><em>Break Nation</em></a> (David Pareja, 2023), la recuerda como el punto en que la trayectoria cambió. Eso es compatible con otra frase, que también hace falta: el Martín Carpena no apagó el breakbeat. Cerró su periodo de hegemonía y de masificación institucional.</p>
<p>La prueba está en el calendario. Una semana después, Raveart hace su presentación en la antigua Industrial Copera, en Granada, con menos gente de la esperada y un clima ya hostil. Los años siguientes son de suspensiones, cambios de sala y controles. La promotora sigue. Lo que termina es la etapa en la que el breaks era, en Andalucía, cultura de masas con altavoz de televisión y radio autonómicas. El relato territorial, con nombres y ciudades, está en <a href="/scenes/andalusian-breakbeat">breakbeat andaluz</a>. Canarias, en las mismas décadas, arma otra historia —más old skool, más isla, menos nu skool— y tiene su propia página: <a href="/scenes/canary-breakbeat">breakbeat canario</a>.</p>`.trim(),
    content_en: `
<p>Between 1992 and 2002 Andalusia does something with breakbeat that has almost no equivalent in Europe: it turns it into the popular culture of a whole region. Hardcore, electro and hip hop stop feeling like an import and start organising weekends, roads, clothes and friendships. This is not a shop niche. It is a generation.</p>
<p>The Seville Expo, in 1992, condenses a will to open. The A-92, more prosaic, matters as much: it shortens Málaga, Seville, Granada and the links toward Cádiz, Córdoba or Jaén. Travel becomes part of the party. Málaga arrives earlier, through the Costa del Sol and its international night; Seville, Cádiz, Huelva and Granada build the rest of the network. There are shops, tapes, promoters, macro-parties and a radio that takes the language out of the specialist circuit. Mundo Evassion, on Canal Fiesta / Canal Sur, is the extreme case: a show that convenes, broadcasts and blurs into the business of the night. That blurred border — public radio and private promotion — is a strength and, later, a problem.</p>
<p>Mass scale is not only a success figure. Ever larger crowds, rooms that cannot hold them, minors on the floor, a drug market, street drinking, clashes between promoters and police attention that grows with the visibility. Press and street also build a caricature: breakbeat gets stuck to a contemptuous image of Andalusian youth, the “cani”, which says more about the prejudice of the viewer than about the music. Part of this is in the reporting and in the testimony of people who were there. It does not need exaggerating to see that the golden age was already loaded.</p>
${h('2002 — Martín Carpena')}
<p>On 2 March 2002, the fifth anniversary of Mundo Evassion fills the José María Martín Carpena sports palace in Málaga. Reports documented an authorised capacity of about 8,000, widely exceeded, access problems and security that was overwhelmed. In the hours that followed, two young people, aged 19 and 20, died after taking ecstasy. Others ended up in hospital, including a twelve-year-old girl. <a href="https://elpais.com/elpais/2002/03/04/actualidad/1015233423_850215.html" target="_blank" rel="noopener noreferrer">El País</a> reported it at the time. There were two deaths, not three.</p>
<p>The facts need separating, because they were glued into one sentence and stayed there. The deaths were associated with drug use. The overcrowding and the organisational failures were other problems, distinct, that coincided that night. Added together they turned the party into a catastrophe and a scandal. They are not the same cause in three costumes.</p>
<p>What came next does belong to the scene, not only to the incident. Media alarm, political pressure, Canal Sur pulling the show and trying to detach itself from the night — the relationship was more tangled: spots, live broadcasts, executives — cancellations, and a stigmatisation that identified the whole music with that dawn. Many people who lived it, and the documentary <a href="https://www.filmaffinity.com/es/film126766.html" target="_blank" rel="noopener noreferrer"><em>Break Nation</em></a> (David Pareja, 2023), remember it as the point where the trajectory changed. That is compatible with another sentence, which is also needed: Martín Carpena did not switch breakbeat off. It closed the period of hegemony and institutional mass scale.</p>
<p>The proof is on the calendar. A week later, Raveart holds its presentation at the old Industrial Copera, in Granada, with a smaller crowd than expected and a climate already hostile. The following years are suspensions, room changes and controls. The promoter continues. What ends is the stage in which breaks, in Andalusia, was mass culture with the loudspeaker of regional television and radio. The territorial account, with names and cities, is in <a href="/scenes/andalusian-breakbeat">Andalusian breakbeat</a>. The Canary Islands, in the same decades, build another history — more old skool, more island, less nu skool — and have their own page: <a href="/scenes/canary-breakbeat">Canarian breakbeat</a>.</p>`.trim(),
  },
  {
    slug: 'big-beat-era',
    section: 'uk_breakbeat',
    year_start: 1994,
    year_end: 2000,
    sort_order: 7,
    title_es: 'El big beat se hace mainstream',
    title_en: 'Big beat goes mainstream',
    content_es: `
<p>El big beat no es el hijo único del hardcore ni el padre del nu skool. Es una rama paralela, ruidosa y muy comercial, que entre mediados de los noventa y el cambio de década llena MTV, festivales y listas. The Chemical Brothers salen del eclecticismo de Manchester. Fatboy Slim y Skint convierten Brighton en una marca pop. The Prodigy, que ya venía del rave, cruza al estadio sin soltar el break. The Crystal Method lo hace desde Estados Unidos. Propellerheads apuran el cruce con el cine y la banda sonora.</p>
<p>La receta es reconocible: breaks grandes, bajos de rock, samples de diálogo, estribillos y una portada que cabe en una camiseta. Funcionó. También tapó el resto del árbol. Mientras el big beat ocupaba el prime time seguían sonando acid breaks, progressive breaks, funky breaks, electro breaks, Florida breaks, tech-breaks, el hardcore que quedaba y un jungle que ya no quería compartir cartel. No son etapas de una sola línea. Son músicas contemporáneas que a veces compartían tienda y casi nunca compartían pista.</p>
<p>Hacia 1999 el ciclo pop se agota. El big beat no «evoluciona» hacia el nu skool: se queda como archivo de una cima comercial. El breaks de club que viene después es más seco, más de mezcla larga y menos de estribillo. Quien cuente la historia como hardcore → big beat → nu skool está contando la televisión, no la cabina. Sellos y fichas: <a href="/labels/skint-records">Skint</a>, <a href="/artists/the-chemical-brothers">The Chemical Brothers</a>, <a href="/artists/fatboy-slim">Fatboy Slim</a>, <a href="/artists/the-prodigy">The Prodigy</a>, <a href="/artists/the-crystal-method">The Crystal Method</a>, <a href="/artists/propellerheads">Propellerheads</a>.</p>`.trim(),
    content_en: `
<p>Big beat is not hardcore’s only child and it is not nu skool’s parent. It is a parallel branch, loud and highly commercial, which from the mid-1990s to the turn of the decade fills MTV, festivals and charts. The Chemical Brothers come out of Manchester’s eclecticism. Fatboy Slim and Skint turn Brighton into a pop brand. The Prodigy, already from rave, cross into stadiums without letting go of the break. The Crystal Method do it from the United States. Propellerheads push the crossing with film and soundtrack.</p>
<p>The recipe is recognisable: big breaks, rock bass, dialogue samples, choruses and a sleeve that fits on a T-shirt. It worked. It also covered the rest of the tree. While big beat took prime time, acid breaks, progressive breaks, funky breaks, electro breaks, Florida breaks, tech-breaks, what remained of hardcore and a jungle that no longer wanted the same poster were still playing. These are not stages of one line. They are contemporary musics that sometimes shared a shop and almost never shared a floor.</p>
<p>Around 1999 the pop cycle runs out. Big beat does not “evolve” into nu skool: it stays as the archive of a commercial peak. The club breaks that follow are drier, built for long mixes and less for a chorus. Whoever tells the story as hardcore → big beat → nu skool is telling the television, not the booth. Labels and profiles: <a href="/labels/skint-records">Skint</a>, <a href="/artists/the-chemical-brothers">The Chemical Brothers</a>, <a href="/artists/fatboy-slim">Fatboy Slim</a>, <a href="/artists/the-prodigy">The Prodigy</a>, <a href="/artists/the-crystal-method">The Crystal Method</a>, <a href="/artists/propellerheads">Propellerheads</a>.</p>`.trim(),
  },
  {
    slug: 'nu-skool-birth',
    section: 'uk_breakbeat',
    year_start: 1997,
    year_end: 2001,
    sort_order: 8,
    title_es: 'Del progressive y el acid al nu skool',
    title_en: 'From progressive and acid breaks to nu skool',
    content_es: `
<p>Mientras el big beat sale en la tele, en el club británico se está cerrando otra cosa. A mediados y finales de los noventa conviven acid breaks, progressive breaks y funky breaks: pistas largas, bajos que respiran, menos estribillo y más mezcla. No es un género con manifiesto. Es el sitio donde el break de rave aprende a durar una noche de sala, no un warehouse.</p>
<p>Rennie Pilgrem y TCR —Thursday Club Recordings— están en el centro de ese tránsito. Adam Freeland empuja el progressive hacia una cabina que la radio todavía puede entender. Botchit &amp; Scarper y Marine Parade arman catálogo y estética, no solo singles sueltos. El nu skool no nace el 1 de enero de 2000 por decreto. Se reconoce cuando esa producción ya no cabe en «hardcore», ni en «big beat», ni en «jungle».</p>
${h('No era solo producción más limpia')}
<p>El tópico —«el mismo break, mejor grabado»— se queda corto. Cambia el bajo, más sintético. Entra el electro y el tech-funk. La estructura se hace de club: intros para mezclar, breaks que vuelven, temas de seis minutos que no buscan el estribillo de MTV. Hay una línea más oscura y progresiva, y otra que se roza con el garage y con lo que luego se llamará bass. El tempo de pista se asienta, en mucha de esa música, entre 125 y 135 BPM. No es una ley. Es el rango en el que esas cabinas se entendían.</p>
<p>Ese cambio de milenio es el momento en que «breaks» empieza a ser el nombre de la noche, y «breakbeat» el del árbol entero. Fichas: <a href="/artists/rennie-pilgrem">Rennie Pilgrem</a>, <a href="/artists/adam-freeland">Adam Freeland</a>, <a href="/labels/tcr">TCR</a>, <a href="/labels/botchit-scarper">Botchit &amp; Scarper</a>, <a href="/labels/marine-parade">Marine Parade</a>.</p>`.trim(),
    content_en: `
<p>While big beat is on television, something else is closing in the British club. In the mid and late 1990s, acid breaks, progressive breaks and funky breaks share the floor: long tracks, bass that breathes, less chorus and more mixing. It is not a genre with a manifesto. It is the place where the rave break learns to last a club night, not a warehouse.</p>
<p>Rennie Pilgrem and TCR — Thursday Club Recordings — sit in the middle of that passage. Adam Freeland pushes progressive toward a booth that radio can still understand. Botchit &amp; Scarper and Marine Parade build catalogue and aesthetic, not only loose singles. Nu skool is not born on 1 January 2000 by decree. It is recognised when that production no longer fits “hardcore”, “big beat” or “jungle”.</p>
${h('It was not just cleaner production')}
<p>The cliché — “the same break, better recorded” — falls short. The bass changes, more synthetic. Electro and tech-funk come in. Structure becomes club structure: intros to mix, breaks that return, six-minute tracks that are not chasing an MTV chorus. There is a darker, more progressive line, and another that brushes garage and what will later be called bass. Floor tempo, in a lot of this music, settles between 125 and 135 BPM. It is not a law. It is the range in which those booths understood each other.</p>
<p>That turn of the millennium is when “breaks” starts to be the name of the night, and “breakbeat” the name of the whole tree. Profiles: <a href="/artists/rennie-pilgrem">Rennie Pilgrem</a>, <a href="/artists/adam-freeland">Adam Freeland</a>, <a href="/labels/tcr">TCR</a>, <a href="/labels/botchit-scarper">Botchit &amp; Scarper</a>, <a href="/labels/marine-parade">Marine Parade</a>.</p>`.trim(),
  },
  {
    slug: 'nu-skool',
    section: 'uk_breakbeat',
    year_start: 2000,
    year_end: 2006,
    sort_order: 9,
    title_es: 'La era global del nu-skool breaks',
    title_en: 'The global nu-skool breaks era',
    content_es: `
<p>Entre 2000 y 2006 el nu skool es, por unos años, el centro visible del breaks de club. No el único sitio donde suena un break —Australia, Florida, Andalucía y el este de Europa tienen sus propias noches—, sino el repertorio que viaja, se premia y se edita como escena internacional. Londres sigue siendo el nodo: tiendas, sellos, Fabric, los Breakspoll. No es la capital del mundo. Es la aduana por la que pasa mucho disco.</p>
<p>Finger Lickin' condensa el momento: Plump DJs, una estética de pista y un sello que suena a generación. Stanton Warriors, Krafty Kuts, Freq Nasty, Meat Katie, Elite Force, Hyper, Koma &amp; Bones, Aquasky, Evil Nine, General Midi, The Autobots, BLIM, Soul of Man, Lee Coombs, Dylan Rhymes, Ils, Deekline. La lista no es un canon cerrado. Es el tamaño real del ecosistema. Reducirlo a cuatro nombres —Stanton, Plump, Freeland, Krafty— es contar el cartel de un festival, no la escena.</p>
<p>Dentro de esa lista no todo suena igual. Hay un breaks funky y de himno, el que llena la primera hora y el recopilatorio. Hay otro más seco, oscuro o progresivo, hecho para la madrugada y para mezclar diez minutos sin estribillo. Hay tech-funk y electro breaks, y hay temas que ya se rozan con el garage. Llamarlo todo «nu skool» sirve como época. No sirve como un solo disco.</p>
<p>La infraestructura también es el género. Breakspoll premia lo que las tiendas y las cabinas ya han decidido. Fabric, en esos años, es la sala que convierte un sello pequeño en cita internacional. El circuito de gira —Reino Unido, Australia, Europa— hace que un blanco de Londres suene en Perth la misma temporada. Sin esa red, los nombres de arriba serían discografía. Con ella, son una escena.</p>
<p>Functional Breaks y el circuito del Thursday Club siguen alimentando la otra orilla, más de club de madrugada que de himno. El vinilo, el dubplate y la promo de tienda todavía mandan. Beatport existe, pero no organiza la noche. Quien aprende breaks en estos años lo hace en una cabina, en una radio o en una pila de blancos.</p>
<p>El ciclo se ve fuerte precisamente porque parece un centro. A mediados de la década ese centro se afloja: no porque los discos desaparezcan, sino porque el público, los productores y las salas se parten hacia el electro house, el dubstep y el drum &amp; bass. Eso es el capítulo de la fragmentación, no un fracaso moral del nu skool. Fichas para seguir: <a href="/labels/finger-lickin">Finger Lickin'</a>, <a href="/labels/functional-breaks">Functional Breaks</a>, <a href="/artists/stanton-warriors">Stanton Warriors</a>, <a href="/artists/plump-djs">Plump DJs</a>, <a href="/artists/krafty-kuts">Krafty Kuts</a>, <a href="/artists/evil-nine">Evil Nine</a>, <a href="/artists/deekline">Deekline</a>, <a href="/scenes/uk-breakbeat">la escena británica</a>.</p>`.trim(),
    content_en: `
<p>Between 2000 and 2006 nu skool is, for a few years, the visible centre of club breaks. Not the only place a break is playing — Australia, Florida, Andalusia and eastern Europe have nights of their own — but the repertoire that travels, gets awarded and is released as an international scene. London is still the node: shops, labels, Fabric, the Breakspoll awards. It is not the capital of the world. It is the customs desk a lot of records pass through.</p>
<p>Finger Lickin' condenses the moment: Plump DJs, a floor aesthetic and a label that sounds like a generation. Stanton Warriors, Krafty Kuts, Freq Nasty, Meat Katie, Elite Force, Hyper, Koma &amp; Bones, Aquasky, Evil Nine, General Midi, The Autobots, BLIM, Soul of Man, Lee Coombs, Dylan Rhymes, Ils, Deekline. The list is not a closed canon. It is the real size of the ecosystem. Reducing it to four names — Stanton, Plump, Freeland, Krafty — is telling a festival poster, not the scene.</p>
<p>Inside that list not everything sounds the same. There is a funky, anthemic breaks, the one that fills the first hour and the compilation. There is another, drier, darker or more progressive, built for the small hours and for mixing ten minutes without a chorus. There is tech-funk and electro breaks, and there are tracks that already brush garage. Calling it all “nu skool” works as an era. It does not work as a single record.</p>
<p>Infrastructure is also the genre. Breakspoll awards what the shops and the booths have already decided. Fabric, in those years, is the room that turns a small label into an international date. The tour circuit — the United Kingdom, Australia, Europe — means a London white label can be heard in Perth the same season. Without that network the names above would be a discography. With it, they are a scene.</p>
<p>Functional Breaks and the Thursday Club circuit keep feeding the other shore, more after-hours club than anthem. Vinyl, dubplate and shop promo still rule. Beatport exists, but it does not organise the night. Whoever learns breaks in these years does it in a booth, on a radio or in a stack of white labels.</p>
<p>The cycle looks strong precisely because it looks like a centre. In the middle of the decade that centre loosens: not because the records vanish, but because audiences, producers and rooms split toward electro house, dubstep and drum &amp; bass. That is the fragmentation chapter, not a moral failure of nu skool. Profiles to follow: <a href="/labels/finger-lickin">Finger Lickin'</a>, <a href="/labels/functional-breaks">Functional Breaks</a>, <a href="/artists/stanton-warriors">Stanton Warriors</a>, <a href="/artists/plump-djs">Plump DJs</a>, <a href="/artists/krafty-kuts">Krafty Kuts</a>, <a href="/artists/evil-nine">Evil Nine</a>, <a href="/artists/deekline">Deekline</a>, <a href="/scenes/uk-breakbeat">the British scene</a>.</p>`.trim(),
  },
  {
    slug: 'breaks-international',
    section: 'australian',
    year_start: 2000,
    year_end: 2008,
    sort_order: 10,
    title_es: 'El breaks se hace internacional',
    title_en: 'Breaks goes international',
    content_es: `
<p>El nu skool británico viaja, y al aterrizar no se queda en gira. Entre 2000 y 2008 el breaks deja de tener un solo país de referencia. No hace falta meter aquí la historia entera de cada sitio —para eso están las escenas—. Sí hace falta decir que existen, y que son contemporáneas del supuesto «centro».</p>
${h('Australia')}
<p>Australia es uno de los circuitos más sólidos fuera del Reino Unido. El pico va de finales de los noventa a mediados de los dos mil. No hay una sola escuela: Perth construye comunidad (Boomtick, y desde diciembre de 2001 el Breakfest del Boxing Day); Sídney tiene en <a href="/artists/kid-kenobi">Kid Kenobi</a> la figura pública; Melbourne trabaja un progressive más oscuro y de estudio. Plump DJs, Krafty Kuts, Soul of Man, Stanton Warriors o Freestylers encuentran allí un público que no los trata como visita exótica. <a href="/artists/friendly">Friendly</a> y <a href="/artists/kenny-beeper">Kenny Beeper</a> forman parte de esa continuidad local. A mediados de la década el electro house y el dubstep se llevan público, como en todas partes. La escena no se desmonta: Breakfest sigue siendo memoria activa, y en 2025 una reunión vuelve a juntar aquel cartel con residentes de Perth. El capítulo está en <a href="/scenes/australian-breaks">breaks australiano</a>.</p>
${h('Rusia, el este, España, Estados Unidos')}
<p>Rusia —sobre todo Moscú y San Petersburgo— y algunos nodos de Europa central y oriental arman otra constelación: no una escuela única desde Budapest hasta Moscú, sí una red de hip hop, jungle, radio, importación británica y, más tarde, electro-breaks, psybreaks y breaks con bajo pesado. Hungría es uno de los puntos con proyección internacional clara. El matiz, y los límites del mapa, están en <a href="/scenes/russian-eastern-europe">Rusia y Europa centro-oriental</a>.</p>
<p>En España, Andalucía es el fenómeno de masas, no el único circuito. Canarias sostiene un repertorio más permeable —old skool, hardcore, jungle, breaks— contado en <a href="/scenes/canary-breakbeat">breakbeat canario</a>. En Estados Unidos, Florida ya tenía escena antes de este capítulo; en estos años el disco británico y el de Orlando se cruzan en la misma cabina, sin fundirse. <a href="/scenes/us-breaks">Breaks americano</a> lo separa con calma.</p>`.trim(),
    content_en: `
<p>British nu skool travels, and when it lands it does not stay a tour. Between 2000 and 2008 breaks stops having a single country of reference. The whole history of each place does not belong here — that is what the scene pages are for. What does belong is the fact that they exist, and that they are contemporary with the supposed “centre”.</p>
${h('Australia')}
<p>Australia is one of the most solid circuits outside the United Kingdom. The peak runs from the late 1990s to the mid-2000s. There is no single school: Perth builds community (Boomtick, and from December 2001 the Boxing Day Breakfest); Sydney has <a href="/artists/kid-kenobi">Kid Kenobi</a> as its public figure; Melbourne works a darker, studio-minded progressive. Plump DJs, Krafty Kuts, Soul of Man, Stanton Warriors and Freestylers find an audience there that does not treat them as an exotic visit. <a href="/artists/friendly">Friendly</a> and <a href="/artists/kenny-beeper">Kenny Beeper</a> are part of that local continuity. In the middle of the decade electro house and dubstep take audience, as everywhere. The scene does not come apart: Breakfest remains active memory, and in 2025 a reunion brings that bill back together with Perth residents. The chapter is in <a href="/scenes/australian-breaks">Australian breaks</a>.</p>
${h('Russia, the east, Spain, the United States')}
<p>Russia — especially Moscow and St Petersburg — and some nodes in central and eastern Europe build another constellation: not one school from Budapest to Moscow, but a network of hip hop, jungle, radio, British imports and, later, electro-breaks, psybreaks and heavy-bass breaks. Hungary is one of the points with a clear international projection. The nuance, and the edges of the map, are in <a href="/scenes/russian-eastern-europe">Russia and central-eastern Europe</a>.</p>
<p>In Spain, Andalusia is the mass phenomenon, not the only circuit. The Canary Islands sustain a more permeable repertoire — old skool, hardcore, jungle, breaks — told in <a href="/scenes/canary-breakbeat">Canarian breakbeat</a>. In the United States, Florida already had a scene before this chapter; in these years the British record and the Orlando record cross in the same booth without merging. <a href="/scenes/us-breaks">American breaks</a> separates them carefully.</p>`.trim(),
  },
  {
    slug: 'decline-and-latency',
    section: 'rise_decline_revival',
    year_start: 2006,
    year_end: 2014,
    sort_order: 11,
    title_es: 'Fragmentación y la era bass',
    title_en: 'Fragmentation and the bass era',
    content_es: `
<p>Desde España, y desde el nu skool clásico, estos años pueden sentirse como un declive. El nombre engaña. Lo que ocurre es que el breakbeat deja de tener un centro cultural único. El disco de breaks sigue saliendo. Lo que se acaba es la ilusión de que todos miran al mismo sitio.</p>
<p>El público se parte. Una parte de productores y DJs se va al electro house, al dubstep o al drum &amp; bass, a veces sin volver y a veces publicando en los tres. El dubstep, salido de un circuito del sur de Londres mucho más pequeño que el nu skool, se queda con el bajo y con la atención de la prensa especializada. El electro house se queda con el festival. La bassline, en el norte de Inglaterra, se queda con una pista que el breaks había rozado y no había ocupado. Otra gente se queda en el break y le cambia el acento: tech-funk, electro breaks, breakstep, glitch hop, funky breaks, psybreaks, rave breaks. En Australia, en Florida, en Rusia y en el este de Europa esas músicas no son «lo que quedó del nu skool». Son escenas con su propio calendario. En Andalucía el golpe de 2002 ya había cerrado la masificación; aquí se suma un cambio de mercado que no depende de Málaga.</p>
<p>También se caen infraestructuras. El vinilo deja de ser la única puerta. Cierran o se transforman salas y sellos. Breakspoll se mueve de Fabric a sitios más pequeños: señal de escena viva y, a la vez, de menos foco. No es una traición. Es un cambio de escala. Llamar «el declive» a ocho o trece años enteros borra a quien siguió haciendo la noche en Perth, en Orlando, en Moscú o en una sala de Granada con la mitad de aforo.</p>
<p>La frase justa es esta: el breaks pierde el centro y no desaparece. Se fragmenta, se regionaliza y se mezcla con el resto de la bass music. Las redes que lo sostienen cuando la industria aparta la vista son el capítulo siguiente.</p>`.trim(),
    content_en: `
<p>From Spain, and from classic nu skool, these years can feel like a decline. The name misleads. What happens is that breakbeat stops having a single cultural centre. Breaks records keep coming out. What ends is the illusion that everyone is looking at the same place.</p>
<p>The audience splits. Some producers and DJs move to electro house, dubstep or drum &amp; bass, sometimes without coming back and sometimes releasing in all three. Dubstep, from a south-London circuit much smaller than nu skool, takes the bass and the specialist press. Electro house takes the festival. Bassline, in the north of England, takes a floor that breaks had brushed and had not occupied. Other people stay in the break and change the accent: tech-funk, electro breaks, breakstep, glitch hop, funky breaks, psybreaks, rave breaks.</p>
<p>In Australia, Florida, Russia and eastern Europe those musics are not “what was left of nu skool”. They are scenes with their own calendar. In Andalusia the blow of 2002 had already closed the mass scale; here a market shift is added that does not depend on Málaga.</p>
<p>Infrastructure falls too. Vinyl stops being the only door. Rooms and labels close or change shape. Breakspoll moves from Fabric to smaller places: a sign of a living scene and, at the same time, of less focus. It is not a betrayal. It is a change of scale. Calling eight or thirteen whole years “the decline” erases whoever kept the night going in Perth, Orlando, Moscow or a room in Granada at half capacity.</p>
<p>The accurate sentence is this: breaks loses the centre and does not disappear. It fragments, it becomes regional and it mixes with the rest of bass music. The networks that hold it when the industry looks away are the next chapter.</p>`.trim(),
  },
  {
    slug: 'survival-networks',
    section: 'digital_era',
    year_start: 2010,
    year_end: 2019,
    sort_order: 12,
    title_es: 'Redes de supervivencia',
    title_en: 'Survival networks',
    content_es: `
<p>Cuando el breaks sale del centro, no se guarda en un cajón. Se sostiene en redes más pequeñas que una industria y más tozudas que una moda. Sellos que publican poco y seguido. Radios y podcasts que no esperan a que vuelva el prime time. Promotores que llenan una sala, no un pabellón. Y, cada vez más, plataformas que heredan el trabajo de la cinta y de la pirata.</p>
<p>YouTube, SoundCloud, Mixcloud y Bandcamp no «salvan» el género como si estuviera muerto. Hacen de archivo y de emisora para quien ya no tiene tienda cerca. Antes, descubrir un breaks pasaba por Camden, por una promo, por un blanco sin nombre y por una radio —pirata o no— que convertía ese disco en tema de la semana. Finger Lickin' y el mostrador de tienda eran infraestructura, no folclore. Cuando esa puerta se estrecha, la sesión colgada hereda el trabajo: se puede parar, repetir y mandar. No sustituye a la pista. Evita que la pista se quede sin memoria.</p>
<p><a href="/artists/krafty-kuts">Krafty Kuts</a> sigue sacando sesiones. <a href="/artists/lady-waks">Lady Waks</a> convierte In Da Mix en un archivo hablado de la escena. Beatport mantiene la categoría Breaks / Breakbeat / UK Bass durante todos estos años: continuidad de mercado, con el defecto de meter en un mismo cajón sensibilidades que en la pista no se mezclan. El vinilo no desaparece. Deja de ser obligatorio.</p>
<p>Conviene separar tres grupos, porque se citan juntos y no hicieron lo mismo. Quien siguió en breaks. Quien cambió de género y a veces volvió. Quien publicó menos sin irse del todo. La latencia es real en la prensa y en las listas generales. No es un silencio en la cabina. El puente digital explica por qué, al llegar 2020, hay a quien enseñarle el archivo y a quien seguir la noche. No hubo que inventar el género otra vez.</p>`.trim(),
    content_en: `
<p>When breaks leaves the centre, it does not go in a drawer. It is held by networks smaller than an industry and more stubborn than a fashion. Labels that release little and often. Radios and podcasts that do not wait for prime time to return. Promoters who fill a room, not a sports hall. And, increasingly, platforms that inherit the work of the tape and the pirate station.</p>
<p>YouTube, SoundCloud, Mixcloud and Bandcamp do not “save” the genre as if it were dead. They act as archive and transmitter for whoever no longer has a shop nearby. Before, finding a breaks record meant Camden, a promo, a nameless white label and a radio — pirate or not — that turned that record into the track of the week. Finger Lickin' and the shop counter were infrastructure, not folklore. When that door narrows, the uploaded session inherits the job: it can be stopped, repeated and sent on. It does not replace the floor. It keeps the floor from losing its memory.</p>
<p><a href="/artists/krafty-kuts">Krafty Kuts</a> keeps putting sessions out. <a href="/artists/lady-waks">Lady Waks</a> turns In Da Mix into a spoken archive of the scene. Beatport keeps the Breaks / Breakbeat / UK Bass category through all these years: market continuity, with the flaw of putting in one drawer sensibilities that do not mix on the floor. Vinyl does not disappear. It stops being compulsory.</p>
<p>Three groups need separating, because they get cited together and did not do the same thing. Those who stayed in breaks. Those who changed genre and sometimes came back. Those who released less without leaving altogether. Latency is real in the press and on the general charts. It is not silence in the booth. The digital bridge explains why, by 2020, there is someone to show the archive to and someone to keep the night going. The genre did not have to be invented again.</p>`.trim(),
  },
  {
    slug: 'andalusian-revival-raveart',
    section: 'andalusian',
    year_start: 2015,
    year_end: 2020,
    sort_order: 13,
    title_es: 'Andalucía reconstruye el ecosistema',
    title_en: 'Andalusia rebuilds its ecosystem',
    content_es: `
<p>Desde mediados de los 2010 el sur vuelve a tener una presencia propia, y ya no depende de la radio autonómica. Es una reconstrucción, no una repetición de 1998. Menos masiva, más de festival, de sello y de productor que publica en la misma tienda que Londres.</p>
<p><a href="/festivals/raveart">Raveart</a> —en la base de este sitio como promotora desde 2002— es la continuidad más visible: Summer, Winter, Retro Halloween, ciclos de club con invitados británicos y el sello <a href="/labels/raveart-records">Raveart Records</a>. No está sola. Elektroshok Records y Musication Records arman catálogo. Funktasty y otras promotoras sostienen noches que ya no necesitan un pabellón de 8.000 personas para ser escena.</p>
<p>En cabina y en estudio están <a href="/artists/shade-k">Shade K</a>, <a href="/artists/brainkiller">The Brainkiller</a> y <a href="/artists/colombo">Colombo</a>, entre otros. La producción local mete electro, dubstep, bassline y técnicas de ahora sin soltar el golpe quebrado. La diferencia con los noventa no es de calidad: es de escala y de altavoz. Ya no hay un programa autonómico que convierta un sábado en cultura de masas. Hay festivales, sellos y productores que publican en la misma tienda que el Reino Unido y dialogan con esa cabina de igual a igual. <em>Break Nation</em> (2023) llega cuando esa reconstrucción ya está en marcha: no la causa, la cuenta. El detalle de ciudades y nombres sigue en <a href="/scenes/andalusian-breakbeat">la escena andaluza</a>.</p>`.trim(),
    content_en: `
<p>From the mid-2010s the south has a presence of its own again, and it no longer depends on regional radio. It is a reconstruction, not a repeat of 1998. Less massive, more festival, label and producer releasing in the same shop as London.</p>
<p><a href="/festivals/raveart">Raveart</a> — in this site’s database as a promoter since 2002 — is the most visible continuity: Summer, Winter, Retro Halloween, club cycles with British guests and the label <a href="/labels/raveart-records">Raveart Records</a>. It is not alone. Elektroshok Records and Musication Records build catalogue. Funktasty and other promoters keep nights that no longer need an 8,000-capacity hall to be a scene.</p>
<p>In the booth and the studio are <a href="/artists/shade-k">Shade K</a>, <a href="/artists/brainkiller">The Brainkiller</a> and <a href="/artists/colombo">Colombo</a>, among others. Local production brings in electro, dubstep, bassline and current technique without letting go of the broken hit. The difference from the 1990s is not quality: it is scale and loudspeaker. There is no longer a regional TV and radio show turning a Saturday into mass culture. There are festivals, labels and producers releasing in the same shop as the United Kingdom and talking to that booth as equals. <em>Break Nation</em> (2023) arrives when that reconstruction is already under way: it does not cause it, it tells it. The detail of cities and names stays in <a href="/scenes/andalusian-breakbeat">the Andalusian scene</a>.</p>`.trim(),
  },
  {
    slug: 'digital-era-revival',
    section: 'digital_era',
    year_start: 2020,
    year_end: 2026,
    sort_order: 14,
    title_es: 'La red nueva del breakbeat',
    title_en: 'The new breakbeat network',
    content_es: `
<p>De 2020 a 2026 el breaks no «vuelve» como si se hubiera ido. Se oye dentro de una red más ancha: UK bass, electro, cruces con garage y bassline, y un club que ya no distingue el vinilo del archivo digital por principio. La pandemia cierra las salas y deja en evidencia lo que la década anterior ya había construido: sin pista, la red digital sostiene el contacto, no el baile. Cuando las puertas vuelven a abrir, no hay que refundar el género. Hay que volver a llenarlas. La categoría de Beatport sigue siendo el cajón comercial. La noche es más concreta que esa etiqueta.</p>
<p>En el catálogo de esta web la red tiene nombres y sellos, no solo una tendencia. <a href="/labels/dirty-kitchen-rave">DIRTY KITCHEN RAVE</a>, <a href="/labels/83">83</a>, <a href="/labels/space-pizza-records">SPACE PIZZA</a>, <a href="/labels/br8kn-records">Br8kn</a>, <a href="/labels/samay-records">Samay</a>, <a href="/labels/pata-negra-records">Pata Negra</a>, <a href="/labels/rough-division">Rough Division</a>, junto a Raveart y a lo que queda del circuito británico de los dos mil. No forman un movimiento con manifiesto. Forman el mapa de quien publica breaks ahora y de quien lo pincha.</p>
<p>La geografía se cruza de verdad. En 2026, cabinas andaluzas como Guau y Yo Speed circulan por Australia, el mismo país cuya escena —Kid Kenobi, Kenny Beeper, Breakfest— nunca llegó a apagarse. Eso no es un revival anunciado desde Londres. Es una red sin necesidad de pedir permiso a un solo centro. Los temas de la semana están en <a href="/charts">Tracks</a>; las sesiones, en <a href="/mixes">Mixes</a>.</p>`.trim(),
    content_en: `
<p>From 2020 to 2026 breaks does not “come back” as if it had left. It is heard inside a wider network: UK bass, electro, crossings with garage and bassline, and a club that no longer separates vinyl from the digital archive on principle. The pandemic closes the rooms and shows what the previous decade had already built: without a floor, the digital network holds the contact, not the dancing. When the doors open again, the genre does not have to be refounded. The rooms have to be filled again. The Beatport category is still the commercial drawer. The night is more specific than that tag.</p>
<p>In this site’s catalogue the network has names and labels, not only a trend. <a href="/labels/dirty-kitchen-rave">DIRTY KITCHEN RAVE</a>, <a href="/labels/83">83</a>, <a href="/labels/space-pizza-records">SPACE PIZZA</a>, <a href="/labels/br8kn-records">Br8kn</a>, <a href="/labels/samay-records">Samay</a>, <a href="/labels/pata-negra-records">Pata Negra</a>, <a href="/labels/rough-division">Rough Division</a>, alongside Raveart and what remains of the British 2000s circuit. They do not form a movement with a manifesto. They form the map of who releases breaks now and who plays it.</p>
<p>The geography actually crosses. In 2026, Andalusian booths such as Guau and Yo Speed move through Australia, the same country whose scene — Kid Kenobi, Kenny Beeper, Breakfest — never fully went dark. That is not a revival announced from London. It is a network with no need to ask permission from a single centre. The week’s tracks are in <a href="/charts">Tracks</a>; the sessions, in <a href="/mixes">Mixes</a>.</p>`.trim(),
  },
  {
    slug: 'scene-without-capital',
    section: 'digital_era',
    year_start: 2026,
    year_end: null,
    sort_order: 15,
    title_es: 'Una escena global sin una sola capital',
    title_en: 'A global scene without a single capital',
    content_es: `
<p>La historia que acaba aquí no demuestra que el break «estuviera cargando» en un silencio. Demuestra otra cosa. Dejó de ser una sola escena —la del Bronx, la del rave, la del big beat, la del nu skool, la de la Andalucía masiva— y siguió sonando en varias a la vez. Fragmentarse no es morir. Es perder el privilegio de un único centro y ganar mapa.</p>
<p>En 2026 no hay una capital del breakbeat. Hay Andalucía, el Reino Unido, Australia, Estados Unidos, Europa oriental y central, Canarias, y una capa digital que las pone en la misma tienda sin volverlas la misma fiesta. Optimal Breaks existe para que ese mapa no se vuelva a contar como una línea recta de ocho viñetas.</p>
<p>El árbol, debajo, es el resumen. Cada rama tiene su página. Esta es solo la columna.</p>`.trim(),
    content_en: `
<p>The history that ends here does not prove that the break “was reloading” in a silence. It proves something else. It stopped being a single scene — the Bronx, rave, big beat, nu skool, mass Andalusia — and kept playing in several at once. Fragmenting is not dying. It is losing the privilege of one centre and gaining a map.</p>
<p>In 2026 there is no capital of breakbeat. There is Andalusia, the United Kingdom, Australia, the United States, central and eastern Europe, the Canary Islands, and a digital layer that puts them in the same shop without making them the same party. Optimal Breaks exists so that this map does not get told again as a straight line of eight captions.</p>
<p>The tree below is the summary. Each branch has its page. This one is only the spine.</p>`.trim(),
  },
]

function parseEnv(text) {
  const o = {}
  let t = text
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1)
  for (const line of t.split('\n')) {
    let s = line.trim()
    if (s.startsWith('export ')) s = s.slice(7).trim()
    if (!s || s.startsWith('#')) continue
    const eq = s.indexOf('=')
    if (eq < 0) continue
    const k = s.slice(0, eq).trim()
    let v = s.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    o[k] = v
  }
  return o
}

const isDirect = process.argv[1] && process.argv[1].replace(/\\/g, '/').endsWith('data/history/bible.mjs')
if (isDirect) {
  const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
  const env = {
    ...(existsSync(join(root, '.env')) ? parseEnv(readFileSync(join(root, '.env'), 'utf8')) : {}),
    ...(existsSync(join(root, '.env.local')) ? parseEnv(readFileSync(join(root, '.env.local'), 'utf8')) : {}),
  }
  const url = env.NEXT_PUBLIC_SUPABASE_URL
  const key = env.SUPABASE_SERVICE_ROLE_KEY || env.SUPABASE_SECRET_KEY
  if (!url || !key) {
    console.error('Faltan NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  const words = (html) => html.replace(/<[^>]+>/g, ' ').split(/\s+/).filter(Boolean).length
  let esW = 0
  let enW = 0
  for (const c of chapters) {
    esW += words(c.content_es)
    enW += words(c.content_en)
  }
  console.log('CHAPTERS', chapters.length, 'ES', esW, 'EN', enW)
  const rows = chapters.map((c) => ({
    slug: c.slug,
    section: c.section,
    year_start: c.year_start,
    year_end: c.year_end,
    sort_order: c.sort_order,
    title_es: c.title_es,
    title_en: c.title_en,
    content_es: c.content_es,
    content_en: c.content_en,
  }))
  const res = await fetch(url + '/rest/v1/history_entries?on_conflict=slug', {
    method: 'POST',
    headers: {
      apikey: key,
      Authorization: 'Bearer ' + key,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates,return=representation',
    },
    body: JSON.stringify(rows),
  })
  const body = await res.text()
  if (!res.ok) {
    console.error(res.status, body.slice(0, 800))
    process.exit(1)
  }
  const saved = JSON.parse(body)
  console.log('UPSERT', saved.length)
  for (const row of saved) {
    console.log(row.sort_order, row.slug, (row.content_es || '').length, (row.content_en || '').length)
  }
}
