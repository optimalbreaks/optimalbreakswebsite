# Reels y vídeos para redes (botones «R» y «F»)

Herramienta de promo **solo para admins**: junto al botón de compartir (🔗) y al de Story (**IG**) de cada tema hay dos botones más:

| Botón | Qué genera | Formato | Qué hace al terminar |
|---|---|---|---|
| **R** | Reel para **Instagram** | MP4 vertical **1080×1920**, 15 s, 30 fps, **sin audio** | Móvil: el botón pasa a **↗**; un segundo toque abre el menú de compartir (Instagram, Guardar vídeo…). Escritorio: descarga el MP4. |
| **F** | Vídeo para **Facebook** | MP4 horizontal **1920×1080**, 15 s, 30 fps, **sin audio** | Siempre **descarga** el MP4 (también en móvil; sin menú de compartir). |

Los dos **copian el enlace del tema** al portapapeles (igual que IG), para pegarlo en el sticker de enlace (historia) o en el texto del post (Facebook).

> Contexto: octubre 2026. Probado en iPhone con Instagram (reel publicado con la música del tema y el artista invitado como colaborador).

## Por qué sin audio

El admin añade la **música oficial del tema desde la biblioteca de Instagram/Facebook**. Así el post queda vinculado al tema y al artista (aparece «Artista · Título» bajo el usuario, se puede invitar al artista como colaborador) y no hay problemas de derechos. El vídeo solo marca el ritmo visualmente con el **BPM real** del tema.

## Flujo de uso

1. En cualquier lista con `TrackShareButton` (charts, New Releases, Beatport Top 10, vinilos…), pulsar **R** o **F**.
2. El botón muestra el progreso **0–100 %** mientras dibuja el vídeo (unos segundos en móvil/PC normales; ~25–30 s en un Chromium sin GPU).
3. **R en móvil:** cuando sale **↗**, tocarlo otra vez → menú de compartir → **Instagram** (elegir Reel o Historia) o **Guardar vídeo**. El segundo toque es obligatorio: el navegador caduca el «gesto del usuario» durante el render y bloquea `navigator.share` sin un toque reciente.
4. En Instagram/Facebook: añadir **Audio** (el tema), texto, colaborador, etc.
5. **Enlace:**
   - En un **reel** de Instagram no se puede poner sticker de enlace (solo en historias; los enlaces clicables en reels son de pago — Meta Verified empresa Plus+ — o con promoción). Por eso el reel lleva el aviso **«LINK IN BIO · OPTIMALBREAKS.COM»**. Para enlace directo: **compartir el reel en la historia** y añadir ahí el sticker de enlace (el enlace ya está copiado).
   - En **Facebook** el enlace del texto del post sí es clicable → el vídeo horizontal lleva **«LINK IN POST»**.

## Diseño (estética fanzine)

Mismos colores que la Story IG (`#e8dcc8` papel, `#1a1a1a` tinta, `#d62828` rojo, `#f4c430` amarillo) y fuentes del sitio (**Unbounded 900** y **Courier Prime**). Todo el texto del vídeo está **siempre en inglés** (público internacional), sea cual sea el idioma de la web.

Elementos y animación (15 s):

| Tiempo | Qué pasa |
|---|---|
| 0–1 s | Barra roja, fondo (carátula desenfocada + semitono + viñeta) y cabecera **OPTIMAL BREAKS** con desfase de color; kicker (`40 BREAKS VITALES`, `NEW RELEASES`, `BEATPORT TOP 10`, `RETRO VINYL PICKS`) en cinta roja; marquesina amarilla. |
| 0,8–2 s | La **funda** (carátula) cae con rebote; dos **cintas adhesivas** la pegan. |
| 1,9–3 s | Sale el **vinilo** girando (galleta = carátula) y entra el **brazo del tocadiscos**; etiqueta **● NOW PLAYING** parpadea al beat. |
| desde 3 s | **Título** en tiras de papel (una línea por golpe, máx. 3 líneas con «…»), **artistas** a máquina con cursor, **sello · año · BPM** (con fecha completa: **sello · BPM**); **sello circular con el BPM** girando sobre la esquina de la funda; **LINK IN BIO / LINK IN POST**; ecualizador LED fino; marquesina roja (artista • título). |
| todo el rato | Golpe de cámara en cada beat, sacudida de la funda cada compás, glitch de franjas cada 8 golpes, letras fantasma «BREAKS», grano de papel. |
| últimos 3,6 s | El título se desvanece y cae el sello **LISTEN NOW** con salpicaduras de tinta + **OPTIMALBREAKS.COM**. |

**Fecha de release:** si el tema tiene `release_date` (charts, New Releases y Beatport Top 10), a los ~2,2 s cae un **sello de tinta roja** sobre la esquina superior derecha de la funda («RELEASED · 12 SEP 2026», o «OUT ON» si la fecha es futura) que se queda hasta el final, y la fecha se añade también a la **marquesina amarilla** superior. Los vinilos (solo año) no llevan sello y mantienen el año en la línea de datos. Funciones: `releaseStamp()` y `drawDateStamp()` en `reel-renderer.ts`.

El ritmo usa el **`bpm`** del tema (si 60 < bpm < 200); si no hay, 132 BPM y el sello muestra «OB» en vez del número. «Original Mix» se omite del título.

### Zona segura (vertical)

Instagram **amplía el 9:16** en móviles más alargados (iPhone 19,5:9 → recorta ~100 px por lado) y tapa la derecha (iconos) y el pie (usuario, música, texto). Por eso en vertical **todo el diseño va a escala 0,8 y centrado** dentro de un **marco de papel**; solo el fondo llega a sangre. El marco queda centrado en vertical (≈ 280 px de margen arriba y abajo). Comprobado simulando el recorte de un iPhone (x ≈ 97–983 px).

### Horizontal (Facebook)

Funda + vinilo + sello BPM a la izquierda; cabecera, título, artistas, metadatos, «LINK IN POST», ecualizador y sello final en la columna derecha; marquesinas y marco a lo ancho. Escala 0,94 (Facebook no recorta el 16:9).

## Arquitectura técnica

**Sin servidor de vídeo y sin coste por vídeo.** El MP4 lo dibuja y codifica **el navegador de quien pulsa el botón**. No se usa Runway ni ninguna IA (ver *Runway* abajo).

| Pieza | Archivo | Qué hace |
|---|---|---|
| Datos del tema | `src/app/api/og/story/route.tsx` | Con **`format=json`** devuelve `{ title, artists, meta, kicker, artwork, bpm, releaseDate, lang }` usando la misma lógica que la imagen de Story (incluido `from=artists|labels/<slug>` y el snapshot `storyMeta` para Beatport Top 10). `artwork` es un **data URL** (sharp, 900 px, ya recortado) → sin problemas de CORS en el canvas. Añade `bpm` y `release_date` a las consultas de `chart_tracks` / `chart_featured_tracks` y al Top 10 de Beatport (los vinilos no tienen BPM). `Cache-Control: private, no-store`. Sin `format=json` la PNG de la Story sigue igual. |
| Render | `src/lib/reel-renderer.ts` | `renderReel(data, { format: 'vertical' \| 'horizontal' })`. Canvas 2D dibuja cada fotograma (`drawReelFrame`) y **WebCodecs `VideoEncoder` (H.264)** + **`mp4-muxer`** lo empaquetan más rápido que tiempo real. Si no hay H.264 prueba VP9 en MP4; si no hay WebCodecs, cae a **`MediaRecorder`** (tiempo real, 15 s; puede salir WebM). El fondo se **pre-hornea** una vez (carátula desenfocada + semitono + viñeta) para que cada fotograma sea barato en móvil. Dos layouts (`VERTICAL`, `HORIZONTAL`) con todas las posiciones; el lienzo `W/H` lo fija `renderReel`. |
| Botones | `src/components/TrackShareButton.tsx` | **R** (`onReelClick`) y **F** (`onFacebookClick`), solo si `isAdmin` y hay `play=` resoluble (`chart:` / `featured:` / `vinyl:` / `beatport:`). El renderer se importa **dinámicamente** al pulsar (no pesa en la carga de la página). **Un render cada vez**: mientras R o F trabajan, el otro queda desactivado (el renderer usa estado de módulo para el lienzo). |
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
- [ ] El botón **IG** (PNG de Story) sigue funcionando igual.

## Runway (IA) — no se usa aquí

Runway (vía MCP en el escritorio) se probó para generar imagen + vídeo con IA. **Coste API: 0,01 $ por crédito** (oct 2026): Nano Banana Pro 20 créditos/imagen (0,20 $); Seedance 2 a 720p 36 créditos/s (≈ 1,80 $ por 5 s); Gen-4.5 12 créditos/s; Gen-4 Turbo 5 créditos/s. Descartado para estos vídeos porque **deforma el texto** (los carteles y títulos son lo principal), tarda minutos y cuesta créditos. Si algún día se quiere «dar vida» a la carátula, la idea sería un modo opcional que anime solo la carátula con Runway y meta ese clip dentro de este mismo diseño. Precios: <https://docs.dev.runwayml.com/guides/pricing>.
