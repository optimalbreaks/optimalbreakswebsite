#!/usr/bin/env node
/**
 * Añade filas nuevas a Table 1-Grid view.csv (una sola ejecución).
 */
import { readFileSync, appendFileSync, existsSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')
const CSV = join(ROOT, 'Table 1-Grid view.csv')

function q(s) {
  return `"${String(s).replace(/"/g, '""')}"`
}

function parseCsv(text) {
  const rows = []
  let row = []
  let cur = ''
  let inQ = false
  for (let i = 0; i < text.length; i++) {
    const c = text[i]
    const n = text[i + 1]
    if (inQ) {
      if (c === '"' && n === '"') {
        cur += '"'
        i++
        continue
      }
      if (c === '"') {
        inQ = false
        continue
      }
      cur += c
      continue
    }
    if (c === '"') {
      inQ = true
      continue
    }
    if (c === ',' && !inQ) {
      row.push(cur)
      cur = ''
      continue
    }
    if ((c === '\n' || (c === '\r' && n === '\n')) && !inQ) {
      if (c === '\r') i++
      row.push(cur)
      cur = ''
      if (row.some((x) => x.length)) rows.push(row)
      row = []
      continue
    }
    if (c === '\r') continue
    cur += c
  }
  if (cur.length || row.length) {
    row.push(cur)
    if (row.some((x) => x.length)) rows.push(row)
  }
  return rows
}

const FECHA = '1/4/2026 11:15pm'

const NUEVOS = [
  {
    titulo: 'Breakbeat en bandas sonoras, cine y videojuegos: cuando el ritmo roto sale del club',
    articulo: `Breakbeat en bandas sonoras, cine y videojuegos: cuando el ritmo roto sale del club

Muchas veces el breakbeat se explica solo como “música de club”. Pero el mismo lenguaje rítmico —baterías troceadas, tensión en el groove, sensación de urgencia— ha aparecido en películas, series y videojuegos que buscaban transmitir velocidad, caos urbano o futuro cercano. No siempre se etiqueta como “breakbeat” en los créditos, pero la lógica del break está ahí.

---

## Por qué el break encaja en narrativas visuales

El breakbeat rompe la regularidad del 4/4 y crea microsorpresas en el cuerpo: el oyente no puede “apoyarse” del todo en un pulso predecible. En una escena de persecución, de multitud o de ciudad nocturna, eso se traduce en inestabilidad controlada. Por eso productores y directores de sonido lo han usado como puente entre electrónica, hip hop y rock procesado.

---

## Videojuegos: futurismo, velocidad y “mundo adulto”

En la cultura de los 90 y 2000, varios títulos asociaron electrónica agresiva y ritmos rotos con ciencia ficción, carreras y metrópolis. El breakbeat —o parentescos cercanos— funcionaba como señal de modernidad ruda, no de sofisticación lounge. Hoy, con OST enormes en streaming, conviene volver a esas bandas sonoras como documento cultural: no solo como nostalgia, sino como mapa de cómo se imaginaba el futuro.

---

## Cine y series: licencias, temp tracks y cultura de sample

En imagen real, el breakbeat a veces llega como needle drop (una canción concreta) y otras como score original inspirado en breaks. Detrás suele haber decisiones prácticas: derechos, referencias a una época, o la voluntad de sonar “underground” sin citar un género con palabras. Para el oyente entrenado, basta con un patrón de batería y un diseño de bajo para reconocer la familia sonora.

---

## Cómo escuchar con oído de archivo

Si quieres profundizar, no busques solo la palabra “breakbeat” en los créditos: busca compositores y DJs que movieron entre club y media, y reescucha escenas con atención al bombo-caja y a los cortes. Luego vuelve a la sección History del sitio: el break en pantalla y el break en pista comparten historia, aunque raramente se cuenten juntos.`,
    ingles: `Breakbeat in soundtracks, film and video games: when broken rhythm leaves the club

Breakbeat is often explained only as “club music”. But the same rhythmic language — chopped drums, tension in the groove, a feeling of urgency — has shown up in films, series and games that wanted to communicate speed, urban chaos or a near future. It is not always labelled “breakbeat” in credits, but the logic of the break is there.

---

## Why broken rhythm fits visual storytelling

Breakbeat disrupts the regularity of straight 4/4 and creates micro-surprises in the body: the listener cannot fully lean on a predictable pulse. In a chase, a crowd scene or a night city sequence, that becomes controlled instability. Sound designers and producers have used it as a bridge between electronics, hip hop and processed rock.

---

## Games: futurism, velocity and “grown-up world”

In 90s and 2000s culture, several titles linked aggressive electronics and broken rhythms with sci-fi, racing and megacities. Breakbeat —or close relatives— worked as a signal of rough modernity, not lounge sophistication. Today, with huge OST playlists on streaming, those scores are worth revisiting as cultural documents: not only nostalgia, but a map of how the future was imagined.

---

## Film and TV: licensing, temp tracks and sample culture

In live action, breakbeat sometimes arrives as a needle drop (a specific track) and sometimes as original score inspired by breaks. Behind it there are practical choices: rights, period references, or the wish to sound “underground” without naming a genre out loud. For a trained ear, a drum pattern and bass design are often enough to place the sound family.

---

## Listening like an archivist

To go deeper, do not only search the word “breakbeat” in credits: look for composers and DJs who moved between club and media, and re-watch key scenes focusing on kick–snare patterns and edits. Then return to the site’s History section: the break on screen and the break on the floor share history, even if they are rarely told together.`,
    prompt: `Imagen fotográfica hiperrealista de calidad editorial.

Sujeto:
Interior de cine vacío o sala de proyección en penumbra; en primer plano una butaca y el reflejo azulado de una imagen en movimiento en la pantalla lejana. Sugiere banda sonora y noche sin mostrar rostros.

Encuadre y composición:
Plano medio desde el pasillo entre filas, profundidad de campo que enfoca textura de tela y polvo en el haz de proyector.

Iluminación y color:
Contraluz del proyector, tonos fríos cian y negro profundo, algún punto cálido residual.

Ambiente y detalle:
Polvo en el aire, detalle analógico, sensación de archivo y cultura nocturna.

Estilo:
Fotoperiodismo cultural, nitidez selectiva, mood cinematográfico.`,
  },
  {
    titulo: 'Bootlegs, mashups y economía del remix en la cultura breakbeat',
    articulo: `Bootlegs, mashups y economía del remix en la cultura breakbeat

El breakbeat nació en parte de cortar, repetir y reorganizar material existente. Cuando la escena creció, el bootleg y el mashup no fueron un capítulo menor: fueron una forma de circulación, de broma técnica y, a veces, de conflicto con derechos. Entender esa economía informal ayuda a entender por qué el género sonaba siempre “en construcción”.

---

## Qué distingue un bootleg de un remix oficial

Un remix oficial cuenta con permisos, stems o acuerdos con sello y autores. Un bootleg suele nacer en la cabina o en el estudio casero: una capa nueva sobre un tema reconocible, a veces solo para probar reacción en pista. La frontera se difumó con internet: archivos compartidos, foros, páginas de DJs. La escena aprendió a convivir con el riesgo legal y con la fama instantánea de un “tema del verano” no licenciado.

---

## Mashup: humor, tensión y memoria colectiva

Juntar dos mundos —rock y breaks, pop y amen, electro y vocal de otro contexto— crea un efecto de reconocimiento inmediato en la pista. Eso tiene valor social: compartir risa, sorpresa o “¿cómo coño ha mezclado esto?”. En breakbeat, donde el groove ya es híbrido, el mashup fue terreno fértil.

---

## Hoy: plataformas, strikes y cultura de archivo

Las plataformas cambiaron las reglas del juego. Lo que antes vivía en cinta o en MP3 anónimo ahora choca con algoritmos de detección. Aun así, la lógica creativa sigue: reordenar cultura sonora para crear nueva energía. Quien estudia breakbeat no puede ignorar ese circuito semioculto.

---

## Lectura recomendada en el sitio

Cruza este texto con la cronología de History y con artículos sobre sample y cultura rave: el bootleg es el hermano conflictivo del canon.`,
    ingles: `Bootlegs, mashups and the economy of remix in breakbeat culture

Breakbeat was born partly from cutting, repeating and rearranging existing material. As the scene grew, bootlegs and mashups were not a footnote: they were a circulation strategy, a technical joke and sometimes a rights conflict. Understanding that informal economy explains why the genre always sounded “under construction”.

---

## What separates a bootleg from an official remix

An official remix has permissions, stems or agreements with label and writers. A bootleg often starts in the booth or a home studio: a new layer on a recognisable track, sometimes only to test floor reaction. The line blurred with the internet: shared files, forums, DJ pages. The scene learned to live with legal risk and with instant fame for an unlicensed “summer tune”.

---

## Mashup: humour, tension and collective memory

Merging two worlds —rock and breaks, pop and amen, electro and a vocal from another context— creates instant recognition on the floor. That has social value: shared laughter, surprise or “how did they blend this?”. In breakbeat, where the groove is already hybrid, mashups were fertile ground.

---

## Today: platforms, strikes and archive culture

Platforms changed the rules. What once lived on tape or anonymous MP3 now collides with detection algorithms. Still, the creative logic remains: reorder sonic culture to make new energy. Anyone studying breakbeat cannot ignore that semi-hidden circuit.

---

## Reading on this site

Cross-read this with the History timeline and articles on sampling and rave culture: the bootleg is the conflicted sibling of the canon.`,
    prompt: `Imagen fotográfica hiperrealista de calidad editorial.

Sujeto:
Mesa de trabajo con dos vinilos superpuestos parcialmente, rotulador y funda genérica sin logotipos legibles; sensación de edición y collage físico.

Encuadre y composición:
Plano cenital ligeramente inclinado, profundidad de campo corta en el centro del surco.

Iluminación y color:
Luz de flexo cálida sobre superficie fría, sombras duras, atmósfera de estudio nocturno.

Ambiente y detalle:
Cable suelto, polvo fino, textura papel y vinilo.

Estilo:
Documental íntimo, hiperrealismo editorial.`,
  },
  {
    titulo: 'BPM, energía y decisión de pista: cómo el breakbeat juega con el tempo sin ser un género de un solo pulso',
    articulo: `BPM, energía y decisión de pista: cómo el breakbeat juega con el tempo sin ser un género de un solo pulso

A diferencia de estilos donde el oyente asocia un rango de BPM casi con religión, el breakbeat es más plural. Eso genera confusión en quien busca una regla simple, pero es una ventaja creativa: el “feel” del break puede funcionar a distintas velocidades según diseño de batería, swing y peso del bajo.

---

## Tempo y sensación: no siempre lo mismo

Dos temas cercanos en BPM pueden sentirse uno nervioso y otro pesado según subdivisión, sample y eq. En breakbeat, la sensación de velocidad viene a menudo del contraste entre golpes secos y silencios, no solo del metrónomo.

---

## Cabina: subir o bajar sin traicionar el groove

El DJ de breaks a veces ajusta pitch para encajar con el sistema, la hora de la noche o el tema anterior. La pregunta no es solo “¿cuántos BPM?”, sino “¿sigue sintiéndose break?”: es decir, ¿se mantiene la tensión rítmica y el balance entre sorpresa y empuje?

---

## Producción: tempo como marco, no como jaula

Muchos productores prueban la misma idea a varios BPM antes de fijarla. En géneros vecinos (big beat, nu skool, breaks más housy) el tempo es una decisión estética ligada a club, radio o festival. Por eso mapas rígidos suelen fallar: el breakbeat es familia de actitudes rítmicas más que de un único número.

---

## Para seguir

Si vienes de house o techno, prueba a escuchar el mismo artista en distintas épocas: notarás cómo el tempo acompaña el contexto sin anular la identidad del sonido.`,
    ingles: `BPM, energy and floor decisions: how breakbeat plays with tempo without being a one-pulse genre

Unlike styles where listeners associate a BPM range almost like dogma, breakbeat is more plural. That confuses anyone looking for a simple rule, but it is a creative advantage: the “feel” of a break can work at different speeds depending on drum design, swing and bass weight.

---

## Tempo and feel: not always the same thing

Two tracks close in BPM can feel one nervous and one heavy depending on subdivision, sample and EQ. In breakbeat, the sense of speed often comes from contrast between dry hits and gaps, not only the metronome.

---

## Booth: pitch up or down without betraying the groove

Break DJs sometimes adjust pitch to match the system, the time of night or the previous tune. The question is not only “how many BPM?” but “does it still feel like breaks?”: does rhythmic tension remain, and the balance between surprise and push?

---

## Production: tempo as frame, not cage

Many producers try the same idea at several BPMs before locking. In neighbouring genres (big beat, nu skool, housier breaks) tempo is an aesthetic choice tied to club, radio or festival. That is why rigid maps often fail: breakbeat is a family of rhythmic attitudes more than a single number.

---

## Next steps

If you come from house or techno, try listening to the same artist across eras: you will hear how tempo follows context without cancelling sonic identity.`,
    prompt: `Imagen fotográfica hiperrealista de calidad editorial.

Sujeto:
Detalle de metrónomo analógico o display de BPM en equipo DJ ligeramente fuera de foco; manos borrosas al fondo, sin rostro.

Encuadre y composición:
Macro en el centro del encuadre, fondo con bokeh de leds de club.

Iluminación y color:
Rojo y ámbar sobre metal y plástico mate, reflejos puntualizados.

Ambiente y detalle:
Sensación de cabina, precisión y presión sonora sugerida sin mostrar público.

Estilo:
Hiperrealismo técnico, textura metálica y digital.`,
  },
  {
    titulo: 'Breakbeat y algoritmos: etiquetas equivocadas, listas raras y cómo buscar bien en plataformas',
    articulo: `Breakbeat y algoritmos: etiquetas equivocadas, listas raras y cómo buscar bien en plataformas

Escuchar breakbeat hoy implica navegar plataformas donde el género a menudo está mal clasificado. Temas de breaks aparecen bajo “electrónica”, “dance” o etiquetas de moda; otros sonidos cuatro por cuatro se etiquetan como break por error. Eso altera recomendaciones y da la sensación de que el género “no existe”, cuando lo que falla es el etiquetado.

---

## Por qué el algoritmo se pierde con el break

Los sistemas de recomendación premian afinidades masivas y metadatos consistentes. El breakbeat, por su historia híbrida y sus cruces con big beat, electro, jungle y bass, es difícil de reducir a una etiqueta única. Resultado: ruido en los datos.

---

## Estrategias de búsqueda que sí funcionan

Combina nombres de sellos, compilaciones clave, DJs de referencia y palabras asociadas (nu skool breaks, big beat, UK breaks) en lugar de confiar solo en el género automático. Las listas hechas por humanos —radio, blogs, documentales— siguen siendo brújula.

---

## El archivo vivo frente al catálogo frío

Optimal Breaks apuesta por contexto: cronología, escenas, etiquetas reales de época. Usa las plataformas como reproductor, pero el mapa conceptual lo aporta la lectura y la memoria de escena.

---

## Conclusión

El breakbeat no ha desaparecido de internet: a veces está mal nombrado. Recuperarlo es un acto de curaduría, no solo de un clic.`,
    ingles: `Breakbeat and algorithms: wrong tags, odd playlists and how to search well on platforms

Listening to breakbeat today means navigating platforms where the genre is often misclassified. Breaks tracks appear under “electronic”, “dance” or trendy tags; other four-on-the-floor sounds get labelled break by mistake. That skews recommendations and makes it feel like the genre “does not exist”, when the real issue is metadata.

---

## Why algorithms struggle with break

Recommendation systems reward mass affinities and consistent metadata. Breakbeat, because of its hybrid history and overlaps with big beat, electro, jungle and bass, is hard to reduce to one tag. Result: noisy data.

---

## Search strategies that work

Combine label names, key compilations, reference DJs and associated keywords (nu skool breaks, big beat, UK breaks) instead of relying only on automatic genre tags. Human-made lists —radio, blogs, documentaries— remain a compass.

---

## Living archive vs cold catalogue

Optimal Breaks bets on context: timeline, scenes, era-accurate tags. Use platforms as a player, but let reading and scene memory supply the conceptual map.

---

## Conclusion

Breakbeat has not vanished from the internet: it is sometimes misnamed. Recovering it is an act of curation, not only a click.`,
    prompt: `Imagen fotográfica hiperrealista de calidad editorial.

Sujeto:
Smartphone sobre mesa mostrando interfaz de app de música genérica (sin logos legibles), reflejo de luces de ciudad en la pantalla.

Encuadre y composición:
Plano inclinado, dedos fuera de foco sugiriendo scroll.

Iluminación y color:
Luz nocturna fría con acentos magenta y azul de neón difuminado.

Ambiente y detalle:
Sensación de búsqueda, saturación de opciones, ciudad al fondo.

Estilo:
Editorial tech-nocturno, hiperrealismo.`,
  },
  {
    titulo: 'Noches solidarias, colectivos y política en la pista: el breakbeat más allá del entretenimiento',
    articulo: `Noches solidarias, colectivos y política en la pista: el breakbeat más allá del entretenimiento

La cultura de club a veces se cuenta solo como escape. Pero en muchas ciudades, las noches de electrónica —incluidas salas y fiestas ligadas al breakbeat y a familias afines— han sido también espacios de organización: beneficio para causas, visibilidad colectiva, apoyo mutuo. No es teoría abstracta: es logística de puerta, carteles, reparto de agua y redes que sostienen a gente real.

---

## Colectivos: trabajo invisible

Detrás de un cartel hay horas de conversación, riesgo económico y cuidado del espacio. Cuando un colectivo apuesta por line-ups diversos o por precios accesibles, está tomando una decisión política sobre quién puede estar dentro.

---

## Breakbeat como banda sonora, no como slogan

El género no lleva una doctrina escrita, pero su historia conecta con culturas urbanas, clase trabajadora y autoproducción. Eso facilita que conviva con discursos de justicia espacial, feminismos y antirracismo en la noche, sin necesidad de convertir cada track en un manifiesto.

---

## Memoria que no entra en la foto principal

Las fotos oficiales de festival suelen mostrar el pico de multitud; la memoria de escena incluye quien montó, quien limpió y quien cuidó a alguien en el baño. Leer breakbeat también es reconocer ese trabajo.

---

## Cierre

Si te interesa el género solo como sonido, perfecto; si además te interesa como cultura, estas capas son parte del mapa completo.`,
    ingles: `Benefit nights, collectives and politics on the floor: breakbeat beyond entertainment

Club culture is sometimes told only as escape. But in many cities, electronic nights —including rooms and parties tied to breakbeat and related families— have also been organising spaces: fundraising, collective visibility, mutual aid. This is not abstract theory: it is door logistics, posters, water distribution and networks that sustain real people.

---

## Collectives: invisible labour

Behind a flyer lie hours of conversation, economic risk and care for the space. When a collective books diverse line-ups or keeps prices accessible, it is making a political decision about who can be inside.

---

## Breakbeat as soundtrack, not slogan

The genre does not carry a written doctrine, but its history connects with urban culture, working-class life and self-production. That makes it easier to coexist with discourses on spatial justice, feminisms and anti-racism at night, without turning every track into a manifesto.

---

## Memory that does not make the main photo

Official festival shots often show the crowd peak; scene memory includes who built, who cleaned and who looked after someone in the toilet. Reading breakbeat is also recognising that labour.

---

## Closing

If you care about the genre only as sound, fine; if you also care about it as culture, these layers are part of the full map.`,
    prompt: `Imagen fotográfica hiperrealista de calidad editorial.

Sujeto:
Interior de sala de ensayo o espacio comunitario con luces cálidas; pancartas o telas colgadas sin texto legible, sillas apiladas, sensación de antes/después del evento.

Encuadre y composición:
Plano amplio con profundidad, nadie en primer plano o solo siluetas lejanas.

Iluminación y color:
Mezcla de tungsteno y verde residual, atmósfera íntima.

Ambiente y detalle:
Cables, mesa con vasos recogidos, humanidad sin retrato heroico.

Estilo:
Fotoperiodismo social, hiperrealismo cálido.`,
  },
]

function rowToLine(cols) {
  return cols.map(q).join(',') + '\r\n'
}

if (!existsSync(CSV)) {
  console.error('No existe:', CSV)
  process.exit(1)
}

const existing = parseCsv(readFileSync(CSV, 'utf8'))
const header = existing[0]?.map((c) => c.replace(/^\uFEFF/, '')) || []
const ti = header.indexOf('Titulo')
const existingTitles = new Set(
  ti >= 0 ? existing.slice(1).map((r) => (r[ti] || '').trim()).filter(Boolean) : [],
)

let added = 0
let skipped = 0
for (const a of NUEVOS) {
  if (existingTitles.has(a.titulo.trim())) {
    console.log('Ya existe (omitido):', a.titulo.slice(0, 65) + '…')
    skipped++
    continue
  }
  const line = rowToLine([
    a.titulo,
    FECHA,
    a.articulo,
    a.ingles,
    a.prompt,
    '',
    '',
    '',
  ])
  appendFileSync(CSV, line, 'utf8')
  existingTitles.add(a.titulo.trim())
  added++
  console.log('Añadido:', a.titulo.slice(0, 70) + '…')
}

console.log(`\nAñadidos: ${added}, omitidos (ya en CSV): ${skipped}`)
