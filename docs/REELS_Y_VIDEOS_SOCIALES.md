# Reels y vídeos para redes (botones «R» y «F»)

Herramienta de promo para **admins** y para **artistas con ficha reclamada** (`artists.claimed_by`). Junto al botón de compartir (🔗) y al de Story (**IG**) de cada tema hay dos botones más. Un usuario normal no los ve. El Top 100, la cabecera de cada semana de New Releases y los artículos del blog siguen siendo **solo del admin**.

| Botón | Qué genera | Formato | Qué hace al terminar |
|---|---|---|---|
| **IG** | Story de **Instagram** | Con preview: MP4 **1080×1920** del fotograma de la Story + audio. Sin preview: PNG con el aviso del sticker | Móvil: compartir (o **↗** si el render caducó el gesto). Escritorio: descarga. |
| **R** | Reel para **Instagram** | MP4 vertical **1080×1920**, 30 s, 30 fps, **con el fragmento de audio** si hay preview; mudo si no | Móvil: el botón pasa a **↗**; un segundo toque abre el menú de compartir (Instagram, Guardar vídeo…). Escritorio: descarga el MP4. |
| **F** | Vídeo para **Facebook** | MP4 horizontal **1920×1080**, 30 s, 30 fps, **el mismo fragmento**; mudo si no hay preview | Siempre **descarga** el MP4 (también en móvil; sin menú de compartir). |

Los dos **copian el texto del post** al portapapeles (tema, artistas, sello, fecha, BPM). El de Facebook incluye el enlace del tema; el del reel dice «enlace en la bio». En Instagram, justo antes de ese enlace, va siempre la llamada a compartir: darle al sobre de enviar y mandárselo a la gente. Eso lo añade la web (`withInstagramShareCta`), no el modelo.

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

Instagram y Facebook **no aceptan texto precargado** al compartir un vídeo (ignoran el `text` de `navigator.share`). Por eso, al compartir el reel (R) o al descargar el vídeo de Facebook (F), la web **copia al portapapeles el texto del post** y quien publica solo tiene que pegarlo en el pie. Lo escribe GPT (`/api/admin/share-caption`); si falla o tarda más de 55 s, entra la plantilla (`buildVideoCaption` en un tema, `buildMixVideoCaption` en una sesión, `buildPageVideoCaption` en una página, `buildGiftVideoCaption` en el regalo). Español arriba y, tras «🇬🇧 EN», el bloque en inglés, también si se pulsa desde `/en`. Los rótulos del vídeo siguen en inglés.

El cuerpo **nombra** al artista y al sello («de Devis Hard», «en DIRTY KITCHEN RAVE»). El modelo no escribe @. La web, al final del pie y en los dos botones, añade el @ de Instagram **si la ficha lo tiene**. Los hashtags son como mucho 5, genéricos (`#breakbeat #breaks #newmusic…`). Nunca el nombre de un artista, un sello, un festival ni Optimal Breaks. En el móvil se copia en el segundo toque (gesto del usuario, necesario en iOS); también va como `text` en el menú de compartir para apps que sí lo usan (WhatsApp, Telegram).

El detalle del pie y de los @ está más abajo (*Texto del post con GPT* y *Menciones @*).

## Sesiones de festival (/mixes/<slug>)

En la página de cada sesión, junto a «IG» (Story), el admin y el artista reclamado tienen también **R** (reel vertical) y **F** (vídeo horizontal para Facebook), con el mismo flujo que los temas (`ShareButtons.tsx`) pero **diseño propio «pase de festival»** (`src/lib/set-reel-design.ts`, `variant: 'set'`), para que en el muro no se confundan con los reels de temas: fondo = cartel del evento difuminado y **teñido con el color del festival** (sacado del cartel con `dominantColor`, cada festival tiene su tono), «LIVE SET» gigante, foto de la sesión delante del **cartel del evento** ladeado (si falta uno, sale el otro), sello «LIVE ON <fecha>», **entrada troquelada** (festival, edición, fecha, ciudad, DJs, código de barras, FREE DOWNLOAD) y onda de audio con cabezal. El cartel llega sin recortar (`loadPosterDataUrl`, `events.image_url`). Datos: `/api/og/story?play=mix:<slug>&format=json` (`mixStoryResponse`): carátula de SoundCloud o retrato del DJ, título = parte de los DJs (o el evento si el título solo repite los DJs), DJs en la línea de artistas, festival en la cinta, ciudad en la línea de datos y **sello «LIVE ON» con la fecha del evento** (`stampLabel`). Sin BPM → el sello circular muestra «OB».

Texto del post (`buildMixVideoCaption`, se copia solo):

> 🔥 Compartimos la sesión de Godino vs Paket ft. Dohiser MC en Olibass Open Air (Torredonjimeno), grabada en directo el 19 de septiembre de 2026.
>
> ⬇️ Descárgala gratis y completa en Optimal Breaks: enlace en la bio.   *(F: la URL de la sesión; sin descarga: «Busca la sesión…»)*
>
> #breakbeat #djset #breaks #livemusic #electronicmusic

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
| últimos 3,6 s | El título se desvanece y cae el sello **LISTEN NOW** con salpicaduras de tinta + **OPTIMALBREAKS.COM**. En una exclusiva el sello dice **FULL TRACK**. |

**Fecha de release:** si el tema tiene `release_date` (charts, New Releases y Beatport Top 10), a los ~2,2 s cae un **sello de tinta roja** sobre la esquina superior derecha de la funda («RELEASED · 12 SEP 2026», o «OUT ON» si la fecha es futura) que se queda hasta el final, y la fecha se añade también a la **marquesina amarilla** superior. Los vinilos (solo año) no llevan sello y mantienen el año en la línea de datos. Funciones: `releaseStamp()` y `drawDateStamp()` en `reel-renderer.ts`.

**Banner de exclusiva de streaming (4 nov 2026):** si `full_audio_url` está relleno y el tema **no** es una descarga (Kritycal System, Kaos Beat, BrainBass), a los ~1,7 s cae un banner amarillo en el **centro de la funda**: **TEMA ENTERO / GRATIS EN NUESTRA WEB** (en inglés **FULL TRACK / FREE STREAMING ON OUR SITE**; «gratis» desde el 7 nov 2026). Se queda todo el vídeo, en R y en F. El sello final pasa de ESCÚCHALO a **ENTERO Y GRATIS**. En un artículo del blog (molde de álbum) con el tema sonando entero, adhesivo **FULL TRACK · FREE ON OUR SITE** sobre el reproductor. El regalo dice **DESCARGA GRATIS EN LA WEB**. El JSON de la story lleva `fullTrack: true` y el texto del post lo dice en las dos primeras líneas. Un preview de tienda no lo lleva. Función: `drawFullTrackBanner()` en `reel-renderer.ts`. El caso **descarga** (hoy *Gone Gone Gone*) no usa ese banner: R y F dibujan `animGift`.

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
| Datos del tema | `src/app/api/og/story/route.tsx` | Con **`format=json`** devuelve `{ title, artists, meta, kicker, artwork, bpm, releaseDate, label, musicKey, year, lang, audio, fullTrack }` usando la misma lógica que la imagen de Story (incluido `from=artists|labels/<slug>` y el snapshot `storyMeta` para Beatport Top 10). `artwork` es un **data URL** (sharp, 900 px, ya recortado) → sin problemas de CORS en el canvas. `audio` es una URL del mismo origen (audio alojado, `/api/bandcamp-preview` o `/api/audio-proxy` del sample de Beatport) o `null`. Añade `bpm` y `release_date` a las consultas de `chart_tracks` / `chart_featured_tracks` y al Top 10 de Beatport (los vinilos no tienen BPM). `Cache-Control: private, no-store`. `?audio=1` quita el aviso del sticker en la PNG, que entonces es el fotograma del MP4. |
| Render | `src/lib/reel-renderer.ts` | `renderReel(data, { format: 'vertical' \| 'horizontal', audio })` y `renderStillVideo` (Story fija). Canvas 2D dibuja cada fotograma (`drawReelFrame`) y **WebCodecs `VideoEncoder` (H.264)** + **`AudioEncoder` AAC** + **`mp4-muxer`** lo empaquetan más rápido que tiempo real. Si no hay H.264 prueba VP9 en MP4; si no hay WebCodecs (o no hay AAC), cae a **`MediaRecorder`** (tiempo real, lo que dure el vídeo; puede salir WebM). El fondo se **pre-hornea** una vez (carátula desenfocada + semitono + viñeta) para que cada fotograma sea barato en móvil. Dos layouts (`VERTICAL`, `HORIZONTAL`) con todas las posiciones; el lienzo `W/H` lo fija `renderReel`. |
| Audio | `src/lib/share-audio.ts`, `src/components/AudioSegmentPicker.tsx` | Descarga y decodifica el preview una vez, propone el tramo con más energía y recuerda el arranque en la web (`share_segment_starts`, 11 nov 2026) y en el navegador. Clave de un tema: `play=`. Del día: `day:<AAAA-MM-DD>:<audio>`. ▶ Escuchar suena en un `<audio>`: en el iPhone, la URL del preview desde el segundo elegido (el Web Audio quedaba mudo); en el resto, un WAV de ese tramo. Al pulsar reclama el slot `ob-share-segment` del coordinador (para el resto de la web). |
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
- `/blog/<slug>` con tracklist de álbum: el mismo molde que `/topreleases` (`animAlbum`, 60 s). Cinta arriba, escenas (portada y cifras, orden del disco con BPM, muro de carátulas), recuadro «LO QUE VES · WHAT YOU SEE» y, si hay preview, selector de 60 s y reproductor abajo. Sin tracklist: título con subrayado, funda con vinilo girando y extracto.
- Artículos de quincena, trimestre y semana (los de `/topreleases`, con `digest`): vídeo de datos `animFortnight`, **60 s** (28 s hasta el 24 oct 2026, iba precipitado). Escenas de ~7 s: intro con cifras, más escuchados, más votados, quién sacó más, estrellas del Top 100, sellos, BPM y muro de portadas. Las entradas del contenido van a `FN_PACE` (1,8× más lentas que el titular; el ranking entra del 5 al 1). Cada escena lleva un recuadro **WHAT YOU SEE** que explica en una frase qué se ve (`fnNoteText`; p. ej. que solo cuentan las escuchas de optimalbreaks.com). En vertical ocupa el hueco bajo los datos (S de 720 px de alto, recuadro de 322); en horizontal, la columna izquierda bajo el titular. **Bilingüe (25 oct 2026):** la frase en español va grande (36/32 px) y la inglesa debajo, en gris y más pequeña, también desde `/en`; el rótulo dice «LO QUE VES · WHAT YOU SEE». Frases cortas: si no caben, la letra baja hasta 24 px. **Audio (25 oct 2026):** R y F abren el mismo selector de fragmento que los temas (`AudioSegmentPicker`, ventana de 60 s = lo que dura el vídeo) con el n.º 1 de «más escuchados»; si ese no tiene audio del mismo origen, el siguiente que lo tenga (más votados, selección de la semana, lanzados). Sin ningún audio, el vídeo sale mudo como antes. Con audio, el pie lleva un **reproductor** abajo a la izquierda (`fnPlayer`): carátula, «SUENA · NOW PLAYING», título y artistas, ecualizador movido por el volumen real del fragmento (`audioEnvelope` en `page-reel.ts`) y barra de progreso del vídeo; la marca pasa a la derecha, más pequeña. El artículo de álbum usa el mismo audio (primer corte con preview). El resto de vídeos de página (Top 100, semana, blog sin tracklist, agenda) sigue sin audio.

Piezas:

- `src/lib/page-reel-design.ts`: diseño y animación (14 s, pulso a 135 BPM). Cada página tiene su color dominante para que no parezcan el mismo reel en el muro.
- `src/lib/page-reel.ts`: `renderPageReel(input, format)`. Codifica con `encodeCanvasVideo` (extraído de `reel-renderer.ts`, común a todos los vídeos).
- `src/app/api/admin/share-reel-images`: carátulas como data URL cuadradas (500 px) para el canvas (evita CORS).
- `src/components/VideoShareButtons.tsx`: botones R/F genéricos (estado, %, compartir/descargar, portapapeles). También los usan las sesiones.

## Reel del día (`/topreleases/dia`, 6 nov 2026)

R y F del artículo del día usan el mismo vídeo. Suenan **hasta 8** (`DAY_MAX_TRACKS`; hasta el 11 nov 2026, 5), en este orden (6 nov 2026):

1. **Guardado por la cuenta editorial** (`EDITOR_USER_ID` en `loadDayReleases`). Sin ese «+» el tema no entra, aunque sea del mismo día. El noveno guardado se queda en el artículo y en el texto.
2. **De esos, los de más votos y más escuchas del resto de la web.** Primero los «+» de otra gente; a igualdad, las escuchas de otra gente. El «+» de la casa no desempata, porque todos los candidatos lo tienen. Tampoco cuentan el auto-voto de un fichado, un familiar o un reclamado, ni una lista privada. Si nadie más ha guardado ni escuchado, el orden es por nombre. La lista del artículo no se reordena.

La despedida puede enseñar hasta 8 carátulas de temas de ese día que la cuenta **no** ha guardado (`rest` en `dayReelOf`). Esas no suenan. El 6 nov 2026 había 19 temas en el catálogo y 13 guardados. Las cinco fueron AndrewFx — *Infinity (Breaks)* (6 votos de otros, 58 escuchas), Orebeat y Xwile — *Deja Vu* (4 y 31), FM-3 y Rhades — *Like It Hot* (3 y 35), Nosk — *Rider* (3 y 27) y Belforg — *We Are One* (3 y 15). PERCYBASS — *Egypt Mess* (Dirty Kitchen Rave) salió ese día y no estaba guardado: puede verse en el cierre y no entra en las cinco. Percibes no tenía tema ese día. Contar también el «+» de la casa no cambia esas cinco. Funciones: `loadDayReleases`, `rankDayReelTracks`.

Hasta el 6 nov 2026 el archivo duraba **94 segundos** (portada 4, lista 5, cinco fichas de 15, estantería del resto 5,4 y despedida 4,6). Instagram, en su guía de Reels ([How to make Instagram Reels](https://about.instagram.com/blog/tips-and-tricks/how-to-make-instagram-reels)), pone el punto dulce para que un vídeo se vea entero y llegue a quien no sigue la cuenta en **15 a 60 segundos**. De 3 a 15 es un chiste o una tendencia. De 1 a 3 minutos lo reserva para un relato largo, y ahí se acaba menos. El 6 nov Narciso pidió cerrar como mucho en un minuto y seguir con las cinco canciones. El 11 nov pidió 8, a minuto y medio (abajo). La otra forma de no pasar del minuto, tres canciones a 15 segundos, se dejó.

| Tramo | Tiempo |
|---|---|
| Portada negra | 3 s |
| Lista de los que van a sonar | 3 s |
| Primera ficha | 9 s |
| Fichas del medio | 10 s |
| Última ficha | 11 s |
| Despedida | 4 s |
| **Ocho temas** | **90 s** |
| Cinco temas | 60 s |

Lo que se oye, con preview (11 nov 2026, Narciso): la primera **15 s** (portada, lista y su ficha), las del medio **10 s**, la última **15 s** (su ficha y la despedida). Ocho temas = minuto y medio; un día con menos dura menos, no se rellena. Los rótulos llegan a «octavo / eighth» y la lista de entrada enseña hasta 8 filas. En iPhone la grabación es en tiempo real: 90 s de espera. Hasta el 11 nov las fichas eran todas de 9 s (55 s; se oía 15 / 9 / 9 / 9 / 13). Un día de un solo tema usa una ficha de 12 s y ese tema suena el vídeo entero (22 s).

El 11 nov 2026 había 14 temas y 8 guardados. Con el tope de 5 sonaban 936 — *Your Face* y DataFunk — *Bounce* (4 «+» de otros), THE RETURN GOOD — *Change* y Zzeta — *Police* (2) y Keith Mackenzie — *Body Ctrl* (1, gana el empate por escuchas; el MP4 de producción lo confirma). Loca, Out Of Time y Trip To Mars se quedaron fuera. El «1» de los 14 es la misma cuenta: **zarzote** (colaborador, 263 «+» desde el 27 sep), que guarda todo lo del día. No cambia el orden de arriba, pero hace que el último hueco se decida por el alfabeto. Con el tope de 8, ese día suenan los 8.

**Revisión fotograma a fotograma (F de ese día, 11 nov 2026).** Audio continuo, sin silencios; los cambios caen donde deben. Dos fallos de imagen, corregidos: (1) la cortinilla roja acaba justo en el corte y cada ficha arrancaba en papel vacío ~0,2 s antes de que entraran título y carátula (parpadeo en cada cambio): ahora la ficha entra con 0,3 s de ventaja (`la = lt + 0.3` en `animDay`). (2) El cierre repetía carátulas (dos temas del mismo EP, o el EP de una ficha): `dayReelOf` quita carátulas repetidas y las de los temas que suenan. «Y EL RESTO DEL DÍA» va centrado sobre la fila.

**R del mismo día (iPhone) frente al F (PC).** Mismos fallos de imagen. El audio no casaba: cada tema sonaba desde otro punto (1–5 s de diferencia; *Police* abría con 1,7 s casi mudos), porque el arranque elegido vivía en el `localStorage` de cada navegador. Desde el 11 nov 2026 se guarda en la web: tabla `share_segment_starts` (migración 109, sin acceso `anon`/`authenticated`), API `/api/admin/share-segment` (GET `?keys=`, POST `{ key, start }`, solo admins). El selector la lee al abrir y escribe al confirmar; si falla, vale lo del navegador. Clave del día: `day:<AAAA-MM-DD>:<audio>` (antes llevaba la fecha traducida y el puesto, y cambiaba con el idioma o el orden). Tramos elegidos antes del cambio siguen solo en el navegador donde se eligieron.

**Zona segura del vertical.** El bloque de abajo (frase «Este es el…», barra de avance y reproductor) sube 140 px: el reproductor acaba en ~1590 px y deja libres los ~330 px donde Instagram pinta pie, cuenta y botones (`dayLayout`). La carátula de la ficha encoge para caber; título y artista de arriba no se mueven (no todas las carátulas los llevan escritos). En el cierre, cartel y fila del resto van juntos y centrados (`dayEndPoster` devuelve su alto). Las carátulas del cierre, hasta 8, son temas de ese día que la cuenta no ha guardado. Llevan «Y EL RESTO DEL DÍA» y no tienen escena propia. Un MP4 ya bajado sigue en 1:34 hasta que se genera otra vez.

Constantes: `DAY_TITLE`, `DAY_INTRO`, `DAY_OUTRO`, `dayCardSeconds`, `dayReelDuration` y `dayAudioSlots` en `src/lib/page-reel-design.ts`. El render es `renderDayReel` en `src/lib/page-reel.ts`. Se pinta en el navegador al pulsar: no hay MP4 previo.

El @ del día sale igual que en el resto de R y F: al final del pie, solo si la ficha lo tiene (*Menciones @*). Ya no se fabrica un @ con el nombre.

## Texto del post con GPT‑5.6 (todos los R/F)

`/api/admin/share-caption` escribe el pie con GPT‑5.6 (`OPENAI_SHARE_CAPTION_MODEL` u `OPENAI_MODEL`) con un tono por tipo (`track`, `set`, `top100`, `week`, `blog`, `events`, `digest`, `day`, `gift`). **`digest` (24 oct 2026)** es el resumen de `/topreleases` (quincena, trimestre o adelantos de la semana): recibe las cifras del vídeo (temas, artistas, sellos, periodo anterior, top 5 de escuchas y de «+», artistas y sellos más activos, estrellas del Top 100, BPM, tonalidad, debutantes) y escribe un pie largo como el de un tema. Antes iba como `blog` con solo título y extracto, y el texto no decía nada de los datos. **Pie bilingüe (25 oct 2026):** español arriba y, tras «🇬🇧 EN», un bloque en inglés con su propio gancho, datos clave y pregunta. Siempre en ese orden, también si se genera desde `/en`: el público y los artistas son sobre todo españoles (decisión de Narciso). Los rótulos del vídeo de tema y de sesión siguen en inglés. Tema y resumen: 1.100–1.300 + 500–600 caracteres (≤ 2.050 con hashtags; Instagram corta en 2.200). El resto: 450–550 cada idioma. Enlace («🔗 Enlace en la bio · Link in bio») y hashtags una sola vez, al final. Se eligió frente a publicar dos veces (Instagram resta alcance al contenido repetido y reparte la interacción) y frente a 50/50 (señal de idioma difusa; el público es sobre todo español). La plantilla sin IA se monta igual (`bilingualCaption` en `share-caption.ts`). En todos: gancho en la primera línea, datos reales, llamada a comentar/guardar, «enlace en la bio» (IG) o la URL (FB) y **máx. 5 hashtags genéricos de gran difusión**. Nunca hashtags de artistas, sellos, festivales ni de Optimal Breaks (se filtran también en el servidor). El cuerpo nombra artistas y sellos sin @. El admin puede pedir todos los tipos. Un artista reclamado solo `track` y `set`.

Se pide en paralelo al render; si falla o tarda más de 55 s se copia la plantilla (`share-track.ts` / `share-caption.ts`), que ya sigue la misma regla de hashtags. En Instagram, justo antes del enlace, la web añade sola la llamada al sobre de enviar (`withInstagramShareCta`).

## Menciones @ de Instagram (10 nov 2026)

El @ no lo escribe el modelo. Lo añade la web al final del pie, una cuenta por línea, en la **R** y en la **F**, mientras quepan en 2.200 caracteres (`captionInstagramMentions` + `captionWithMentions`). Solo entra una cuenta que ya está guardada. Sin ficha, o con ficha sin Instagram, el nombre se queda escrito y no hay @. No se fabrica un @ a partir del nombre: eso etiquetaría a otra cuenta.

| Quién | De dónde sale el @ |
|---|---|
| **Artista** | `artists.socials.instagram`, si es una URL de Instagram. A 10 nov 2026 lo tienen 103 fichas. 19 se copiaron ese día desde los textos de los reels de Godino, donde el @ ya se había comprobado a mano y el nombre casaba con una sola ficha. |
| **Sello** | La web de la ficha, si es un Instagram, o el Instagram de la organización vinculada (`labels.organization_id`). La ficha de sello no tiene un campo de redes propio. A 10 nov 2026 ninguna de las 166 guardaba un Instagram en la web. |
| **Regalo de Woter** | Además, `@optimal.breaks` y `@woter_dj`, dentro del texto y al final: son el requisito de la descarga. `@optimalbreaks` sin punto es otra cuenta y no vale. |

Vale para un tema, una sesión, el día, la semana, el Top histórico, un artículo, la agenda y el resumen. En el día y en la semana se citan los artistas y sellos de los temas del contexto; en la agenda, el cartel. Los `INSTAGRAM.txt` de los vídeos de Godino (factoría) no son este pie.

## Quién pinta el vídeo (10 nov 2026)

Casi todo se dibuja en el navegador de quien pulsa, en ese momento. No hay servidor de vídeo. R es 1080×1920; F es 1920×1080. El texto del post se pide a la vez, aunque el MP4 ya exista.

**En código, al pulsar** (`reel-renderer` para un tema o una sesión; `page-reel` para una página):

- Cada tema, en cualquier lista (charts, ficha, Top 10 de Beatport, Mis Tracks, Top histórico). El regalo de Woter en la fila usa `animGift`.
- Cada sesión, en `/mixes/<slug>`.
- La cabecera de cada semana de New Releases, en `/charts`.
- El botón de la página del Top histórico.
- El artículo del día, en `/topreleases/dia`.
- Un artículo del blog que todavía no tiene `reel_url`: disco, quincena, mes, trimestre, agenda, regalo y exclusiva. La exclusiva, si el artículo no tiene archivo de la fábrica, es el mismo reel que la R de su fila.

**Ya renderizado.** Solo la **R** de un artículo del blog cuando `blog_posts.reel_url` apunta al MP4 del bucket público `blog-reels`. Lo graba el PC (cola `fabrica.optimal_reel`, cada 10 min), no el botón: vertical de 60 s, sin voz, diseño A · Fanzine. Entra cada artículo publicado desde el 8 nov 2026. Uno anterior no lo tiene hasta `reel_status = pedir`. Al pulsar R se baja ese archivo (`cache: no-store`) y no se abre el selector de fragmento (`reelReady`). Si la descarga falla, la R lo pinta en el navegador como antes. La **F** de ese mismo artículo no está hecha: se sigue generando en horizontal. El pie se escribe igual, en el momento.

`makeVideo` en `ShareButtons.tsx` mira primero el vertical con `reel_url`. Si no hay, y el artículo es una exclusiva (`trackPlay`), pinta el reel del tema. Si no, pinta el de la página. Una sesión no tiene `reel_url`: siempre el pase de festival.
