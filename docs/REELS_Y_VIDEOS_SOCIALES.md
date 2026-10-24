# Reels y vídeos para redes (botones «R» y «F»)

Herramienta de promo para **admins** y para **artistas con ficha reclamada** (`artists.claimed_by`). Junto al botón de compartir (🔗) y al de Story (**IG**) de cada tema hay dos botones más. Un usuario normal no los ve. El Top 100, la cabecera de cada semana de New Releases y los artículos del blog siguen siendo **solo del admin**.

| Botón | Qué genera | Formato | Qué hace al terminar |
|---|---|---|---|
| **IG** | Story de **Instagram** | Con preview: MP4 **1080×1920** del fotograma de la Story + audio. Sin preview: PNG con el aviso del sticker | Móvil: compartir (o **↗** si el render caducó el gesto). Escritorio: descarga. |
| **R** | Reel para **Instagram** | MP4 vertical **1080×1920**, 30 s, 30 fps, **con el fragmento de audio** si hay preview; mudo si no | Móvil: el botón pasa a **↗**; un segundo toque abre el menú de compartir (Instagram, Guardar vídeo…). Escritorio: descarga el MP4. |
| **F** | Vídeo para **Facebook** | MP4 horizontal **1920×1080**, 30 s, 30 fps, **el mismo fragmento**; mudo si no hay preview | Siempre **descarga** el MP4 (también en móvil; sin menú de compartir). |

Los dos **copian el texto del post** al portapapeles (tema, artistas, sello, fecha, BPM). El de Facebook incluye el enlace del tema; el del reel dice «enlace en la bio».

> Contexto: octubre 2026. Probado en iPhone con Instagram (reel publicado con la música del tema y el artista invitado como colaborador).

## Audio del fragmento (23 oct 2026)

Si el tema tiene preview de Beatport o Bandcamp, o un audio completo alojado (`full_audio_url`), **IG**, **R** y **F** abren `AudioSegmentPicker`: onda del preview, ventana de 30 s arrastrable y arranque sugerido (el tramo con más energía). Hasta el 24 oct 2026 eran 15 s. Instagram admite reels de hasta 3 minutos; 60 s se descartó porque en iPhone la grabación es en tiempo real (y se repite si sale muda) y porque un minuto de un tema ajeno se acerca a la grabación comercial y es más fácil que Instagram lo silencie. `SHARE_SEGMENT_SEC` (`share-audio.ts`) marca la duración de la Story con audio, del reel y del vídeo de Facebook; sesiones y páginas (mudos) siguen en 15 s. Ese arranque se recuerda por tema. El MP4 lleva ese fragmento en AAC (`src/lib/share-audio.ts`, `encodeCanvasVideo`). La Story con audio usa `/api/og/story?audio=1` (mismo diseño, sin el aviso de que el sticker no es el tema).

YouTube y SoundCloud no dan archivo: esos vídeos siguen **mudos** y la Story sigue siendo PNG con el aviso. Si el MP4 se abre y la pista está en silencio, se vuelve a grabar en tiempo real; si el navegador no sabe abrir el vídeo, se queda el archivo (no poder decodificarlo no cuenta como mudo). El aviso de «sale mudo» no sale antes del menú de compartir: en el móvil el botón pasa a **↗** y el cuadro aparece en ese momento.

**Reel mudo en Instagram desde iPhone (23 oct 2026).** El fragmento sonaba bien en el selector y el reel subió mudo a Instagram. La pista AAC entra en el MP4 sin el `meta` del codificador: el iPhone puede dar la configuración sin `description`, y mp4-muxer pisaba con esa ficha vacía la que él ya calcula bien (AAC-LC, 44,1 kHz, estéreo). Safari reproduce ese archivo, pero Instagram no lee la pista. Además se quita la cabecera ADTS si el codificador la mete. No volver a `muxer.addAudioChunk(chunk, meta)`.

Si el tema está en la biblioteca de Instagram o Facebook, quien publica **baja a cero** este audio y pone el oficial: así sale «Artista · Título» y se puede invitar al artista. Si no está en esa biblioteca, se publica con este fragmento. El vídeo sigue latiendo al **BPM real** del tema. Las sesiones, el Top 100, la semana de New Releases y el blog siguen sin audio.

## Flujo de uso

1. En cualquier lista con `TrackShareButton` (charts, New Releases, Beatport Top 10, vinilos…), pulsar **R** o **F**.
2. El botón muestra el progreso **0–100 %** mientras dibuja el vídeo (unos segundos en móvil/PC normales; ~25–30 s en un Chromium sin GPU).
3. **R en móvil:** cuando sale **↗**, tocarlo otra vez → menú de compartir → **Instagram** (elegir Reel o Historia) o **Guardar vídeo**. El segundo toque es obligatorio: el navegador caduca el «gesto del usuario» durante el render y bloquea `navigator.share` sin un toque reciente.
4. En Instagram/Facebook: añadir **Audio** (el tema), texto, colaborador, etc.
5. **Enlace:**
   - En un **reel** de Instagram no se puede poner sticker de enlace (solo en historias; los enlaces clicables en reels son de pago — Meta Verified empresa Plus+ — o con promoción). Por eso el reel lleva el aviso **«LINK IN BIO · OPTIMALBREAKS.COM»**. Para enlace directo: **compartir el reel en la historia** y pegar en el sticker la URL del botón 🔗. Al pulsar R, el portapapeles lleva el texto del post.
   - En **Facebook** el enlace del texto del post sí es clicable → el vídeo horizontal lleva **«LINK IN POST»**.

## Texto del post (se copia solo)

Instagram y Facebook **no aceptan texto precargado** al compartir un vídeo (ignoran el `text` de `navigator.share`). Por eso, al compartir el reel (R) o al descargar el vídeo de Facebook (F), la web **copia al portapapeles el texto del post** y el admin solo tiene que pegarlo en el pie. Lo arma `buildVideoCaption()` (`src/lib/share-track.ts`) en el idioma de la página:

> 🔥 Compartimos este temazo: «Título» de Artista, del sello X, lanzado el 9 de octubre de 2026.
> 🎛️ 135 BPM · C Major
>
> 🎧 Busca el tema en Optimal Breaks: enlace en la bio.   *(F: la URL del tema)*
>
> #breakbeat #breaks #artista #sello #optimalbreaks

Fecha futura → «sale el…». Sin fecha completa → año. Los datos (`label`, `musicKey`, `year`) vienen de `/api/og/story?format=json`. En el móvil se copia en el segundo toque (gesto del usuario, necesario en iOS); también va como `text` en el menú de compartir para apps que sí lo usan (WhatsApp, Telegram).

## Sesiones de festival (/mixes/<slug>)

En la página de cada sesión, junto a «IG» (Story), el admin y el artista reclamado tienen también **R** (reel vertical) y **F** (vídeo horizontal para Facebook), con el mismo flujo que los temas (`ShareButtons.tsx`) pero **diseño propio «pase de festival»** (`src/lib/set-reel-design.ts`, `variant: 'set'`), para que en el muro no se confundan con los reels de temas: fondo = cartel del evento difuminado y **teñido con el color del festival** (sacado del cartel con `dominantColor`, cada festival tiene su tono), «LIVE SET» gigante, foto de la sesión delante del **cartel del evento** ladeado (si falta uno, sale el otro), sello «LIVE ON <fecha>», **entrada troquelada** (festival, edición, fecha, ciudad, DJs, código de barras, FREE DOWNLOAD) y onda de audio con cabezal. El cartel llega sin recortar (`loadPosterDataUrl`, `events.image_url`). Datos: `/api/og/story?play=mix:<slug>&format=json` (`mixStoryResponse`): carátula de SoundCloud o retrato del DJ, título = parte de los DJs (o el evento si el título solo repite los DJs), DJs en la línea de artistas, festival en la cinta, ciudad en la línea de datos y **sello «LIVE ON» con la fecha del evento** (`stampLabel`). Sin BPM → el sello circular muestra «OB».

Texto del post (`buildMixVideoCaption`, se copia solo):

> 🔥 Compartimos la sesión de Godino vs Paket ft. Dohiser MC en Olibass Open Air (Torredonjimeno), grabada en directo el 19 de septiembre de 2026.
>
> ⬇️ Descárgala gratis y completa en Optimal Breaks: enlace en la bio.   *(F: la URL de la sesión; sin descarga: «Busca la sesión…»)*
>
> #breakbeat #breaks #djset #godino #paket #dohiser #olibassmusicfestival #optimalbreaks

## Diseño (estética fanzine)

Mismos colores que la Story IG (`#e8dcc8` papel, `#1a1a1a` tinta, `#d62828` rojo, `#f4c430` amarillo) y fuentes del sitio (**Unbounded 900** y **Courier Prime**). Todo el texto del vídeo está **siempre en inglés** (público internacional), sea cual sea el idioma de la web.

Elementos y animación (30 s en los temas; el tramo central con el beat se alarga y el cierre sigue siendo los últimos 3,6 s):

| Tiempo | Qué pasa |
|---|---|
| 0–1 s | Barra roja, fondo (carátula desenfocada + semitono + viñeta) y cabecera **OPTIMAL BREAKS** con desfase de color; kicker (`40 BREAKS VITALES`, `NEW RELEASES`, `BEATPORT TOP 10`, `RETRO VINYL PICKS`) en cinta roja; marquesina amarilla. |
| 0,8–2 s | La **funda** (carátula) cae con rebote; dos **cintas adhesivas** la pegan. |
| 1,9–3 s | Sale el **vinilo** girando (galleta = carátula) y entra el **brazo del tocadiscos**; etiqueta **● NOW PLAYING** parpadea al beat. |
| desde 3 s | **Título** en tiras de papel (una línea por golpe, máx. 3 líneas con «…»), **artistas** a máquina con cursor, **sello · año · BPM** (con fecha completa: **sello · BPM**); **sello circular con el BPM** girando sobre la esquina de la funda; **LINK IN BIO / LINK IN POST**; ecualizador LED fino; marquesina roja (artista • título). |
| todo el rato | Golpe de cámara en cada beat, sacudida de la funda cada compás, glitch de franjas cada 8 golpes, letras fantasma «BREAKS», grano de papel. |
| últimos 3,6 s | El título se desvanece y cae el sello **LISTEN NOW** con salpicaduras de tinta + **OPTIMALBREAKS.COM**. |

**Fecha de release:** si el tema tiene `release_date` (charts, New Releases y Beatport Top 10), a los ~2,2 s cae un **sello de tinta roja** sobre la esquina superior derecha de la funda («RELEASED · 12 SEP 2026», o «OUT ON» si la fecha es futura) que se queda hasta el final, y la fecha se añade también a la **marquesina amarilla** superior. Los vinilos (solo año) no llevan sello y mantienen el año en la línea de datos. Funciones: `releaseStamp()` y `drawDateStamp()` en `reel-renderer.ts`.

**Adhesivo de estado (24 oct 2026):** a los ~2,5 s cae al pie de la funda, centrado, una cartela según la fecha de lanzamiento (calendario de Madrid): **COMING SOON** («OUT IN 6 DAYS», amarilla) si aún no ha salido; **NEW RELEASE** («OUT NOW», roja) hasta 150 días (~5 meses) después; **ARCHIVE PICK** («FROM 2019», negra) a partir de ahí. Un vinilo con solo el año es ARCHIVE PICK si el año es anterior al actual; sin fecha ni año no hay adhesivo. La palabra va también en la marquesina superior. Solo R y F de temas (no sesiones ni Story fija). Funciones: `releaseBadge()` (en `share-track.ts`, la usan vídeo y texto) y `drawReleaseBadge()`; el corte es `NEW_RELEASE_DAYS`.

**Texto del post de un tema (24 oct 2026):** sigue el mismo estado. GPT (`/api/admin/share-caption`) recibe `releaseStatus` (`coming_soon` / `new_release` / `archive_pick`), `daysSinceRelease` y el texto del adhesivo, y escribe un pie largo, de 1.000 a 1.800 caracteres (Instagram corta en 2.200), en párrafos cortos: gancho de ≤ 90 caracteres, datos, por qué escucharlo según el estado, línea para DJs (BPM y tonalidad), pregunta para comentar, «enlace en la bio» y 5 hashtags genéricos. Por salir: expectación y días que faltan, nunca «ya disponible». Archivo: rescate, no novedad. El resto de tipos (sesión, Top 100, semana, blog, agenda) va de 500 a 1.200 caracteres, también con palabras de búsqueda y sin inventar ambiente ni anécdotas. Una sesión con MP3 gratis lo dice arriba. La plantilla sin IA (`buildVideoCaption`) tiene la misma estructura y los hashtags cambian por estado (#comingsoon / #newrelease / #throwback). Un tema de tienda anterior a 2026 lleva el rótulo **ARCHIVE PICKS** en vez de NEW RELEASES (`/api/og/story`), igual que en `/charts`.

El ritmo usa el **`bpm`** del tema (si 60 < bpm < 200); si no hay, 132 BPM y el sello muestra «OB» en vez del número. «Original Mix» se omite del título.

### Zona segura (vertical)

Instagram **amplía el 9:16** en móviles más alargados (iPhone 19,5:9 → recorta ~100 px por lado) y tapa la derecha (iconos) y el pie (usuario, música, texto). Por eso en vertical **todo el diseño va a escala 0,8 y centrado** dentro de un **marco de papel**; solo el fondo llega a sangre. El marco queda centrado en vertical (≈ 280 px de margen arriba y abajo). Comprobado simulando el recorte de un iPhone (x ≈ 97–983 px).

### Horizontal (Facebook)

Funda + vinilo + sello BPM a la izquierda; cabecera, título, artistas, metadatos, «LINK IN POST», ecualizador y sello final en la columna derecha; marquesinas y marco a lo ancho. Escala 0,94 (Facebook no recorta el 16:9).

## Arquitectura técnica

**Sin servidor de vídeo y sin coste por vídeo.** El MP4 lo dibuja y codifica **el navegador de quien pulsa el botón**. No se usa Runway ni ninguna IA (ver *Runway* abajo).

| Pieza | Archivo | Qué hace |
|---|---|---|
| Datos del tema | `src/app/api/og/story/route.tsx` | Con **`format=json`** devuelve `{ title, artists, meta, kicker, artwork, bpm, releaseDate, label, musicKey, year, lang, audio }` usando la misma lógica que la imagen de Story (incluido `from=artists|labels/<slug>` y el snapshot `storyMeta` para Beatport Top 10). `artwork` es un **data URL** (sharp, 900 px, ya recortado) → sin problemas de CORS en el canvas. `audio` es una URL del mismo origen (audio alojado, `/api/bandcamp-preview` o `/api/audio-proxy` del sample de Beatport) o `null`. Añade `bpm` y `release_date` a las consultas de `chart_tracks` / `chart_featured_tracks` y al Top 10 de Beatport (los vinilos no tienen BPM). `Cache-Control: private, no-store`. `?audio=1` quita el aviso del sticker en la PNG, que entonces es el fotograma del MP4. |
| Render | `src/lib/reel-renderer.ts` | `renderReel(data, { format: 'vertical' \| 'horizontal', audio })` y `renderStillVideo` (Story fija). Canvas 2D dibuja cada fotograma (`drawReelFrame`) y **WebCodecs `VideoEncoder` (H.264)** + **`AudioEncoder` AAC** + **`mp4-muxer`** lo empaquetan más rápido que tiempo real. Si no hay H.264 prueba VP9 en MP4; si no hay WebCodecs (o no hay AAC), cae a **`MediaRecorder`** (tiempo real, lo que dure el vídeo; puede salir WebM). El fondo se **pre-hornea** una vez (carátula desenfocada + semitono + viñeta) para que cada fotograma sea barato en móvil. Dos layouts (`VERTICAL`, `HORIZONTAL`) con todas las posiciones; el lienzo `W/H` lo fija `renderReel`. |
| Audio | `src/lib/share-audio.ts`, `src/components/AudioSegmentPicker.tsx` | Descarga y decodifica el preview una vez, propone el tramo con más energía y recuerda el arranque (`localStorage`, clave `play=`). Al pulsar ▶ Escuchar reclama el slot `ob-share-segment` del coordinador (para el resto de la web). |
| Botones | `src/components/TrackShareButton.tsx` | **IG**, **R** (`onReelClick`) y **F** (`onFacebookClick`), si `isAdmin` o `isClaimedArtist` y hay `play=` resoluble (`chart:` / `featured:` / `vinyl:` / `beatport:`). El renderer se importa **dinámicamente** al pulsar (no pesa en la carga de la página). **Un render cada vez**: mientras uno trabaja, los otros quedan desactivados. |
| Dependencia | `package.json` | **`mp4-muxer` 5.2.1** (exacta). Su autor la marca como sustituida por **Mediabunny**; funciona, pero conviene migrar algún día. |

### Estados del botón

`R` / `F` → `0…100%` → **R:** `↗` (listo, toca para compartir; solo móvil con share de archivos) → `✓` · **F:** `✓` (descargado) · `✕` si falla (detalle en consola: `[reel]` / `[facebook video]`).

## Cambiar el diseño

Todo está en `src/lib/reel-renderer.ts`:

- **Posiciones / tamaños:** objetos `VERTICAL` y `HORIZONTAL` (tipo `Layout`). Ojo con `SAFE_SCALE` / `SAFE_SHIFT_Y` en vertical (zona segura de Instagram).
- **Duración / fps:** opciones `durationSec` (15 por defecto) y `fps` (30) de `renderReel`.
- **Textos fijos:** `LINK_BIG` del layout, `LISTEN NOW`, `NOW PLAYING`, anillo del sello BPM.
- **Colores:** constantes `PAPER`, `INK`, `RED`, `YELLOW`.

Para revisar cambios sin desplegar se puede montar una página que importe `renderReel` con datos de prueba y descargar el MP4 (así se validó en Chromium headless con Playwright; en Chromium sin H.264 sale VP9 y se convierte con ffmpeg para verlo).

## QA

- [ ] R en **iPhone** (Safari) y **Android** (Chrome): progreso, `↗`, menú de compartir con **Instagram** (Reel e Historia) y **Guardar vídeo**.
- [ ] F en móvil y escritorio: descarga `optimal-breaks-facebook.mp4` y el enlace queda copiado.
- [ ] El vídeo se ve **entero** en un reel de Instagram (marco visible, nada cortado por los lados) y **centrado**.
- [ ] Sello de fecha correcto (día, mes en inglés, año) en vertical y horizontal; vinilos sin sello.
- [ ] Carátula real, texto en inglés, BPM correcto; título largo → máximo 3 líneas con «…».
- [ ] Probar los cuatro orígenes: `chart`, `featured`, `vinyl` (sin BPM → «OB») y `beatport` (con `from=` y con snapshot).
- [ ] Con preview: el selector sale en IG, R y F, el fragmento se oye en el MP4 y el arranque se recuerda. Sin preview: IG sigue siendo PNG con el aviso y R/F salen mudos.
- [ ] ▶ Escuchar en el selector para el tema que estuviera sonando en la web.

## Runway (IA) — no se usa aquí

Runway (vía MCP en el escritorio) se probó para generar imagen + vídeo con IA. **Coste API: 0,01 $ por crédito** (oct 2026): Nano Banana Pro 20 créditos/imagen (0,20 $); Seedance 2 a 720p 36 créditos/s (≈ 1,80 $ por 5 s); Gen-4.5 12 créditos/s; Gen-4 Turbo 5 créditos/s. Descartado para estos vídeos porque **deforma el texto** (los carteles y títulos son lo principal), tarda minutos y cuesta créditos. Si algún día se quiere «dar vida» a la carátula, la idea sería un modo opcional que anime solo la carátula con Runway y meta ese clip dentro de este mismo diseño. Precios: <https://docs.dev.runwayml.com/guides/pricing>.

## Vídeos de página: Top 100, New Releases y blog (oct 2026)

Botones **R** (vertical 1080×1920) y **F** (horizontal 1920×1080), solo admins, en:

- `/top100`: barra superior de la lista. Cuenta atrás del 10 al 2 con reproductor y el #1 al final.
- `/charts`: cabecera de cada semana de New Releases. Estantería de portadas 3×3 que se van «reproduciendo», sello con el nº de temas.
- `/blog/<slug>`: fila de compartir de arriba. Título con subrayado, funda con vinilo girando y reproductor que recorre los temas del álbum (sin álbum: extracto).
- Artículos de quincena, trimestre y semana (los de `/topreleases`, con `digest`): vídeo de datos `animFortnight`, **60 s** (28 s hasta el 24 oct 2026, iba precipitado). Escenas de ~7 s: intro con cifras, más escuchados, más votados, quién sacó más, estrellas del Top 100, sellos, BPM y muro de portadas. Las entradas del contenido van a `FN_PACE` (1,8× más lentas que el titular; el ranking entra del 5 al 1). Cada escena lleva un recuadro **WHAT YOU SEE** que explica en una frase qué se ve (`fnNoteText`; p. ej. que solo cuentan las escuchas de optimalbreaks.com). En vertical ocupa el hueco bajo los datos (S de 820 px de alto); en horizontal, la columna izquierda bajo el titular.

Piezas:

- `src/lib/page-reel-design.ts`: diseño y animación (14 s, pulso a 135 BPM). Cada página tiene su color dominante para que no parezcan el mismo reel en el muro.
- `src/lib/page-reel.ts`: `renderPageReel(input, format)`. Codifica con `encodeCanvasVideo` (extraído de `reel-renderer.ts`, común a todos los vídeos).
- `src/app/api/admin/share-reel-images`: carátulas como data URL cuadradas (500 px) para el canvas (evita CORS).
- `src/components/VideoShareButtons.tsx`: botones R/F genéricos (estado, %, compartir/descargar, portapapeles). También los usan las sesiones.

## Texto del post con GPT‑5.6 (todos los R/F)

`/api/admin/share-caption` escribe el pie con GPT‑5.6 (`OPENAI_SHARE_CAPTION_MODEL` u `OPENAI_MODEL`) con un tono por tipo (`track`, `set`, `top100`, `week`, `blog`, `events`, `digest`). **`digest` (24 oct 2026)** es el resumen de `/topreleases` (quincena, trimestre o adelantos de la semana): recibe las cifras del vídeo (temas, artistas, sellos, periodo anterior, top 5 de escuchas y de «+», artistas y sellos más activos, estrellas del Top 100, BPM, tonalidad, debutantes) y escribe un pie largo como el de un tema. Antes iba como `blog` con solo título y extracto, y el texto no decía nada de los datos. En todos: gancho en la primera línea, datos reales, llamada a comentar/guardar, «enlace en la bio» (IG) o la URL (FB) y **máx. 5 hashtags genéricos de gran difusión**. Nunca hashtags de artistas, sellos, festivales ni de Optimal Breaks (se filtran también en el servidor): esos los etiqueta quien publica, a mano. El admin puede pedir los cinco tipos. Un artista reclamado solo `track` y `set`.

Se pide en paralelo al render; si falla o tarda más de 55 s se copia la plantilla (`share-track.ts` / `share-caption.ts`), que ya sigue la misma regla de hashtags.
