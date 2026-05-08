# OPTIMAL BREAKS — La biblia del breakbeat

> Archivo, revista, guía, agenda y memoria de escena. Proyecto dedicado a preservar y celebrar la cultura breakbeat en todo el mundo.

La documentación técnica completa está en inglés en [**README.md**](./README.md). Aquí va un resumen en español **y el flujo recomendado para actualizar artistas**.

**Raíz del repositorio:** Abre en el IDE (y usa como cwd en terminal) la carpeta donde está **`package.json`** en la raíz (en muchos equipos se llama **`web optimalbreaks`**). Ahí está el `.git` y deben ejecutarse **`npm install`**, **`npm run dev`**, scripts de base de datos y el fichero **`.env.local`**. Una carpeta padre que solo envuelva el proyecto no es la raíz Git/npm.

---

## Qué es

Plataforma web **bilingüe (ES/EN)** sobre historia, artistas, sellos, eventos, escenas y cultura del **breakbeat**. Incluye un **DJ deck** interactivo (audio real y scratch), estética fanzine/club, y secciones editoriales y de referencia.

**Organizaciones y Raveart:** existe la tabla **`organizations`** (promotora, roles, enlaces). Los **sellos** pueden enlazar a una organización (`labels.organization_id`) y los **eventos** a la promotora (`events.promoter_organization_id`). Ficha pública: `/[lang]/organizations/[slug]` (p. ej. `raveart`). Datos sembrados y ampliados con las migraciones **`010_raveart_organizations.sql`** y **`011_raveart_gallery_events.sql`** (alineación con la [galería oficial](https://www.raveart.es/galeria/)). Detalle técnico y tabla de migraciones en [README.md](./README.md).

**Eventos:** se crean **manualmente** desde el panel admin (`/administrator/events/new`) o pidiendo al agente Cursor. Para completar la ficha (fecha, lineup, descripción, venue, tags, etc.) se usa el **agente enriquecedor**: `npm run db:events:enrich -- <slug> [--with-poster]`. SerpAPI busca en la web y OpenAI completa los campos vacíos. El prompt de sistema del enriquecedor está en **`scripts/prompts/evento-enriquecer-system.txt`**.

**Índice general de prompts y agentes IA** (archivos `.txt`, variables `OPENAI_*`, modelos por defecto, APIs): **[`docs/AI_PROMPTS_AND_AGENTS.md`](./docs/AI_PROMPTS_AND_AGENTS.md)**. La guía detallada del agente de **artistas** sigue en [`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md). **Mapa de toda la documentación Markdown y auditoría:** [`docs/README.md`](./docs/README.md).

**Imágenes (WebP, `public/images` vs Supabase Storage):** [`docs/IMAGES_AND_WEBP.md`](./docs/IMAGES_AND_WEBP.md). **Qué puede hacer el usuario:** [`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md). **Estrellas 1–5 solo** para **experiencias a las que puedes ir**: **artistas** (visto en vivo) y **eventos** (fui). Sellos, mixes, etc.: solo favoritos/guardados, sin puntuación.

**Fechas de release con día (YYYY-MM-DD):** todas las listas de canciones (40 Breaks Vitales, New Releases, Retro Vinyl Picks, Top 10 de Beatport en artistas/sellos, **Mis Tracks** propio y público, Top de la Comunidad, Almas Gemelas, panel admin de Tracks y buscador ⌘K) muestran el **día completo** cuando se conoce, con fallback al año. Migración **`057_chart_featured_tracks_release_date.sql`** añade `chart_featured_tracks.release_date DATE`; la columna existe también en `chart_tracks.release_date` y dentro del JSONB `beatport_top_tracks` (artistas/sellos). Scrapers (Beatport `__NEXT_DATA__.publish_date`, Bandcamp `data-tralbum.album_release_date`) integrados en `chart-featured-upsert.mjs --enrich-release-dates`, `chart-40-breaks.mjs`, `beatport-top-tracks.mjs`. Para snapshots ya guardados: `scripts/saved-tracks-backfill.mjs` rellena `release_date` de forma **aditiva** (`mergeSnapshotAdditive`); flag `--scrape-beatport` para huérfanos. Helpers en `src/lib/share-track.ts` (`formatTrackReleaseDisplay`, `effectiveReleaseYear`, `releaseSortTimestampMs`). Detalle EN: [README.md — Track release dates](./README.md#track-release-dates-full-day-vs-year).

**Veto editorial — DistroKid:** distribuidor masivo, **no** se crea como sello (`labels`). La cadena `"DistroKid"` aparece en muchos JSON de picks porque Beatport la reporta como label de auto-publicados, pero no se genera fila ni `/labels/distrokid`. Lista de vetos completa en [README.md — Editorial vetoes](./README.md#editorial-vetoes-entities-not-to-create); ampliar **solo** tras confirmación explícita.

**Correos de autenticación (plantillas HTML para Supabase):** [`mailing/supabase/README.md`](./mailing/supabase/README.md) — confirmación de registro, invitación, magic link, cambio de correo, recuperación de contraseña, reautenticación. Flujo técnico actualizado en [README.md — Authentication](README.md#authentication-supabase-auth-and-email-templates).

---

## Stack principal

- **Next.js 14** (App Router), **TypeScript**, **Tailwind** 3.4
- **Supabase**: PostgreSQL + autenticación + **Storage** (bucket público `media` para fotos de contenido)
- **Analítica (opcional)**: **Google Analytics 4** con el paquete oficial **`@next/third-parties/google`** y **Consent Mode v2** enlazado al banner de cookies (`CookieBanner` + `GoogleAnalytics`). Detalle en [README.md — Analytics](./README.md#analytics-google-analytics-4) y en la sección [Analítica (GA4)](#analítica-ga4) de este archivo.
- Rutas `/es` y `/en` con middleware propio; el audio global del **deck / mixes** se **reinicia** al cambiar de idioma (`DeckAudioProvider` con `key={lang}` en `[lang]/layout.tsx`), una sesión por idioma
- Tipografías: Unbounded, Courier Prime, Special Elite, Darker Grotesque

---

## Home — línea temporal «Historia del break» (`section_history`)

El bloque oscuro **Timeline** de la portada (`src/components/Timeline.tsx`) toma los datos de **`home.section_history.items`** en `src/dictionaries/es.json` y `en.json`. Cada fila tiene un **`year`** de pantalla (a menudo un rango), **`title`** y **`desc`**.

**No hay ordenación automática en código** (ni por año de inicio, fin o punto medio). El orden del array es **manual y editorial**: hilo narrativo (orígenes → UK → …), **apartados** comparativos (p. ej. EE. UU. como otro mapa) y un **cierre** (p. ej. era digital global al final, como capa que convive en el tiempo con otros capítulos). Es normal que los periodos se solapen; la posición obedece al **relato**, no a una regla numérica única. Para reordenar, edita `items` en **ambos** idiomas. Detalle en inglés: [README.md — Home — history timeline](./README.md#home--history-timeline-section_history).

**Tira de eventos en portada:** hasta **4** filas con **`date_start` ≥ hoy** (día local), orden **ascendente** por fecha. Si no hay resultados, se muestran los **4 eventos más recientes** por **`date_start` DESC**; si la tabla está vacía, entran placeholders estáticos **`FALLBACK_HOME_EVENTS`**. Implementación: `src/app/[lang]/page.tsx`.

---

## Autenticación y correos (Supabase)

- **`/{lang}/login`** — registro, entrada y «¿Olvidaste tu contraseña?» (Supabase envía el correo).
- **`/{lang}/reset-password`** — pantalla donde el usuario **escribe la contraseña nueva** tras un enlace de recuperación válido (es el destino final del flujo).
- **`/{lang}/auth/confirm`** (Route Handler en servidor) — recibe `token_hash` y `type` en la query, llama a **`verifyOtp`**, fija la sesión en cookies y redirige: **`type=recovery`** → `reset-password`; alta y otros tipos → `login` (u otra ruta interna segura).
- **`/{lang}/auth/callback`** (página cliente) — sobre todo **OAuth (Google)** con `?code=` (`exchangeCodeForSession`). Si el correo antiguo o una redirección rara lleva aquí **sin** `code` pero con datos de verificación (p. ej. `token_hash` metido dentro de `next`), la app **redirige a** `/auth/confirm` para no quedarse colgada en «Confirmando sesión…».
- **`/api/auth/callback`** — legado; redirige al callback con idioma preservando parámetros.

**Desde la app:** `emailRedirectTo` y `redirectTo` apuntan a **`https://…/{lang}/auth/confirm`** (no al callback). En **URL Configuration** de Supabase deben estar permitidos el origen de producción y local (`https://www.optimalbreaks.com/**`, `http://localhost:3000/**`, etc.).

**Plantillas HTML** en [`mailing/supabase/`](./mailing/supabase/): el botón principal usa **`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=…`** para que el primer clic vaya a **tu** `/auth/confirm`. Cópialas en **Authentication → Email**. Detalle: [`mailing/supabase/README.md`](./mailing/supabase/README.md).

**SMTP propio (OVH, etc.):** opcional; desactiva el tracking de enlaces que reescriba URLs.

Documentación en inglés: [README.md — Authentication](README.md#authentication-supabase-auth-and-email-templates).

---

## Analítica (GA4)

- Variable **`NEXT_PUBLIC_GA_MEASUREMENT_ID`** (ID de medición `G-…`): en `.env.local` y en **Vercel → Environment Variables** para que producción cargue gtag. Si no está definida, no se carga Google Analytics.
- Código: **`src/components/GoogleAnalytics.tsx`** (componente `GoogleAnalytics` de `@next/third-parties/google` + script previo de consentimiento) y **`src/components/CookieBanner.tsx`** (evento `ob-cookie-consent` al aceptar o rechazar cookies analíticas).

Más contexto (CSP, flujo): [README.md — Analytics](./README.md#analytics-google-analytics-4).

---

## Actualizar artistas (forma recomendada)

Los archivos **`data/artists/*.json`** están en **`.gitignore`** (la web en vivo solo lee **Supabase**). Genera o edita JSON en local para upserts o salida del agente; un `git clone` deja la carpeta vacía salvo `.gitkeep`.

No hace falta escribir SQL a mano para crear o refrescar fichas de **artistas**:

1. **Migración** — Aplica en Supabase `supabase/migrations/006_artist_extended_fields.sql` si aún no está (añade `real_name`, `labels_founded`, `key_releases` en `artists`).
2. **JSON** — Crea o edita un archivo en **`data/artists/`**, por ejemplo `data/artists/deekline.json`. Ese archivo sirve de **plantilla**: bios EN/ES, estilos, tracks esenciales, sellos fundados, lanzamientos clave, `socials`, `website`, `category`, etc. En **`bio_en`** y **`bio_es`**, deja **una línea en blanco entre párrafos** (en JSON: `\n\n`) para que la ficha muestre párrafos y no un solo bloque.
3. **Comando**:

```bash
npm run db:artist -- data/artists/tu-slug.json
```

El script hace **UPSERT por `slug`**: si el artista existe, lo actualiza; si no, lo inserta.

Para rellenar la base con **todos los nombres de la cronología por lustros** de la página `/artists` (mismo origen que `src/lib/artists-timeline.ts`), sin pegar SQL en el editor:

```bash
npm run db:timeline
```

Usa la **API de Supabase** con la clave de servicio y solo **inserta** filas cuyo `slug` aún no exista. Opcional: `npm run db:timeline:sql` regenera la migración `009_*.sql` por si quieres versionarla.

**Listado extendido de nombres** (`sync-user-list-artists.mjs`): crea filas mínimas con **texto placeholder** (ES/EN) para muchos artistas. Para una ficha completa, genera JSON con el agente y ejecuta **`npm run db:artist`** (o edita en el panel admin).

```bash
npm run db:user-list
```

### Volcar todos los JSON a la base (bulk)

Desde la raíz del repo. **PowerShell:**

```powershell
Get-ChildItem "data\artists\*.json" | ForEach-Object { npm run db:artist -- ("data/artists/" + $_.Name) }
```

**Git Bash:**

```bash
for f in data/artists/*.json; do npm run db:artist -- "$f"; done
```

### Cómo se conecta el script

| Modo | Cuándo |
|------|--------|
| **API de Supabase** | Siempre para `npm run db:artist` / `lib/artist-upsert.mjs`: `NEXT_PUBLIC_SUPABASE_URL` + **`SUPABASE_SERVICE_ROLE_KEY`** o **`SUPABASE_SECRET_KEY`**. No se usa Postgres directo (`pg`) en estos upserts. |

La clave **anon** o **publishable** (`sb_publishable_*`) **no sirve** para escribir en `artists`. **`DATABASE_URL` / contraseña de Postgres** solo hacen falta para **`npm run db:migrate`** / **`db:seed`** (SQL local), no para agentes ni `db:artist`.

### Estructura del proyecto (artistas)

- `data/artists/*.json` — datos por artista
- `scripts/actualizar-artista.mjs` — lógica del upsert
- `scripts/ensure-artist-json-in-db.mjs` — comprobar JSON vs fila en BD y sincronizar si difiere (`npm run db:artist:ensure`)
- `src/lib/artist-entity-match.ts` — enlazar nombres en `related_artists` (y similares) a slugs internos en las fichas
- [`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md) — guía completa del **agente IA** (español e inglés): batch, variables, sync con Supabase, API admin

Más detalle y tabla de migraciones SQL en [README.md](./README.md).

### Ficha en la web: qué manda y la caché

- La web lee **`artists` en Supabase** (misma URL que `NEXT_PUBLIC_SUPABASE_URL` en Vercel). **Git/commit no actualiza la bio** hasta que haya un UPSERT en ese proyecto (`db:artist`, agente CLI por defecto, o panel admin).
- Si ves el texto corto tipo *«Incluido en el listado extendido…»*, la fila viene de **`db:user-list`** (o equivalente); sustitúyela con JSON + **`db:artist`**.
- Rutas **`/artists`**: el layout del segmento fuerza datos frescos (`revalidate` 0, `fetchCache` sin store), cabeceras **`no-store`** en `next.config.js` y el **service worker** no guarda HTML de URLs con `/artists`, para que tras publicar en BD no se quede una página vieja en CDN o PWA.

### Agente de biografías (OpenAI)

Por defecto **hace UPSERT en Supabase** (misma credencial que `db:artist`). Opcional **`--json-only`** solo archivo; **`--save-json`** BD + copia en `data/artists/`.

Documentación detallada: **[`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md)**. Prompt del sistema: **`scripts/prompts/artista-agente-system.txt`**. Resto de agentes y defaults de modelo: **[`docs/AI_PROMPTS_AND_AGENTS.md`](./docs/AI_PROMPTS_AND_AGENTS.md)**.

```bash
npm run db:artist:agent -- plump-djs "Plump DJs"
npm run db:artist:agent:all                                    # regenera cada fila en BD (coste API)
npm run db:artist:ensure -- data/artists/deekline.json         # comprobar JSON vs BD y sincronizar si difiere
```

Necesitas **`OPENAI_API_KEY`**. Por defecto **`gpt-5.4`**; **`OPENAI_MODEL`** lo sobrescribe. Opcional **`SERPAPI_API_KEY`**. Revisa siempre hechos antes de publicar.

### Fotos de artista (otro flujo: imágenes, no biografías)

SerpAPI (Google Imágenes) + OpenAI eligen candidato; el script **descarga** la imagen, la **valida** (no HTML) y la sube a **Storage**; actualiza **`image_url`** en JSON y Supabase.

```bash
npm run db:artist:photo -- tu-slug
npm run db:artist:photo:repair              # cola en BD: sin foto https o URL rota; si no hay resultado → image_url null (fallback punk en la web)
npm run db:artist:photo -- --repair --limit=10 --dry-run
npm run db:artist:sync-public-portraits     # retratos ya en public/images/artists + mapa → poner /images/artists/… en BD
```

Los slugs con retrato en **`public/images/artists`** según **`data/artist-public-portrait-map.json`** **no** se buscan en internet (ahorro de API) salvo **`--force-rephoto`**. Detalle: **[`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md)** — sección *Fotos de artista*.

---

## Beatport: Top 10 en fichas de artista y sello

Distinto del **chart semanal** (“40 Breaks Vitales”, `npm run db:chart` / `chart-40-breaks.mjs`): aquí se guarda el **Top 10 de ventas** que Beatport muestra en la ficha de un **artista** o **sello**.

1. **Migración** — Aplica **`supabase/migrations/046_beatport_top_tracks.sql`** en Supabase (columnas `beatport_id`, `beatport_url`, `beatport_top_tracks`, `beatport_top_tracks_updated_at` en `artists` y `labels`).
2. **ID en la URL de Beatport** — La ficha canónica es `https://www.beatport.com/artist/<slug>/<id>` o `/label/<slug>/<id>`. El `<slug>` debe ser el mismo que en Optimal Breaks; el `<id>` es el número final (ej.: Deekline → `deekline` + `3171`).
3. **Actualizar datos** — Con **`NEXT_PUBLIC_SUPABASE_URL`** + **`SUPABASE_SERVICE_ROLE_KEY`** (o secret):

```bash
npm run db:beatport:top -- artist deekline 3171
npm run db:beatport:top -- label <slug-sello> <id-beatport>
npm run db:beatport:top -- --all-artists            # todas las filas con beatport_id
npm run db:beatport:top -- --all-artists --missing-only  # solo lista Top 10 vacía
npm run db:beatport:top -- --fill-missing-artists   # rellena vacíos + busca Beatport si falta id
npm run db:beatport:top -- --fill-missing-artists --limit=20  # prueba en lote corto
npm run db:beatport:top -- --dry-run artist deekline 3171
```

El script lee el HTML de Beatport, parsea **`__NEXT_DATA__`** y hace **`UPDATE`** por `slug` en la tabla correspondiente. **Guía:** `node scripts/guia-base-datos.mjs run beatport-top artist <slug> <id>`.

4. **Opcional en JSON** — Puedes añadir **`beatport_id`** y **`beatport_url`** en `data/artists/*.json` (o JSON de sellos) para que **`npm run db:artist`** / **`db:label`** los guarden; el **listado Top 10** no va en el JSON: se rellena solo con **`db:beatport:top`**.
5. **Web** — Si `beatport_top_tracks` tiene entradas, en el **hero** de la ficha aparece el acordeón **`BeatportTopTracks`** (previews vía **`/api/audio-proxy`**). Si está vacío, no se muestra bloque. Las filas de cada track son **visualmente idénticas** a las del chart semanal (`PositionBadge`, artwork, título/artista/sello/año, badges BPM/key, botón BEATPORT). Al pulsar play (individual o "Play All"), se activa la **`MiniPreviewBar` global del `DeckAudioProvider`**: transporte, progreso seekable, info del track. El reproductor usa el modo global **`preview`** (vía `usePreviewAudio` → `playPreviewQueue`), por lo que se excluye mutuamente con el deck de la home y los mixes, y **sigue sonando al navegar** a otras páginas (ver sección [Sistema de audio global](#sistema-de-audio-global-deckaudioprovider--claimaudio)).

Detalle técnico y relación con el chart semanal: **[README.md — Beatport: weekly chart vs Top 10 on profiles](./README.md#beatport-weekly-chart-vs-top-10-on-profiles)**.

---

## Variables de entorno (resumen)

Copia `.env.local.example` → `.env.local`.

- **Cliente (navegador):** `NEXT_PUBLIC_SUPABASE_URL` + **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** *o* **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** (`sb_publishable_*`).
- **Solo servidor** (Storage admin, **todos** los upserts CLI `db:artist` / `db:label` / agentes / fotos, **`npm run media:upload`**): **`SUPABASE_SERVICE_ROLE_KEY`** *o* **`SUPABASE_SECRET_KEY`** (`sb_secret_*`). Nunca en `NEXT_PUBLIC_*`.
- **Postgres** (opcional, **solo** `db:migrate` / `db:seed` con `seed-supabase.mjs`): ver `.env.local.example`. No se usa para rellenar artistas/sellos desde scripts.
- **Agente de bios** (opcional): `OPENAI_API_KEY`, opcionalmente `OPENAI_MODEL`, y si quieres búsqueda web `SERPAPI_API_KEY` (ver `.env.local.example` y [`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md)).
- **Google Analytics 4** (opcional): `NEXT_PUBLIC_GA_MEASUREMENT_ID=G-…` (público; sin ella no se carga GA).

---

## Imágenes

Guía detallada: **[`docs/IMAGES_AND_WEBP.md`](./docs/IMAGES_AND_WEBP.md)**. Retratos locales de artistas y mapa: **`public/images/README.md`**.

- Cada entidad relevante tiene **`image_url`** en la base de datos (artistas: a menudo **Storage** `https://…` o ruta **`/images/artists/…`** si el retrato vive en `public`).
- **Artistas:** **`displayArtistImageUrl`** (`src/lib/artist-public-portrait.ts`) — prioridad: URL remota en BD → retrato del **mapa** `data/artist-public-portrait-map.json` → ruta `/images/artists/` en BD; si no hay imagen válida, **`CardThumbnail`** usa **fallback punk** (también si la URL remota falla al cargar).
- **Resto de entidades:** **`displayImageUrl()`** (`src/lib/image-url.ts`) solo reescribe **rutas locales** `/images/*.jpg|png` → `.webp`. Las URLs de **Storage** se usan **tal cual** en la BD.
- El componente **`CardThumbnail`** aplica la normalización que corresponda y muestra **placeholder** (iniciales / rayas) donde no aplique el fallback punk.
- Si el padre usa **`group/link`** (p. ej. tarjetas de **`EventsExplorer`**), pasa **`groupHoverGroup="link"`** en **`CardThumbnail`** para que el zoom del cartel use **`group-hover/link:`** y coincida con el pie y la franja del cartel.
- Se usa en listados, fichas, home, blog y dashboard.

### My Breaks / interacción del usuario

Política: **valoración con estrellas solo en artistas y eventos** (experiencias presenciales). Todo lo demás es **favorito / guardar** binario. **[`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md)**. Migración **`032_event_ratings_attendance_fields.sql`** para campos extra en valoración de eventos.

**Arquitectura de páginas (abril 2026):** antes era un único `/[lang]/dashboard` con pestañas; ahora hay **página de resumen** (`/[lang]/dashboard`: tarjetas + análisis *Breakbeat DNA*) y **una página por sección** bajo `/[lang]/mi-cuenta/<slug>` (`favoritos`, `vistos-en-vivo`, `eventos`, `resenas`, `mixes`, `tracks`, `almas-gemelas`, `perfil`). Las URLs antiguas `?tab=xxx` redirigen automáticamente. La shell compartida vive en `src/components/user/UserSectionShell.tsx`.

**Mis Tracks (`/[lang]/mi-cuenta/tracks`)**. Nueva sección que permite guardar canciones de cualquiera de los tres bloques de `/charts`:

- **40 Breaks Vitales** (`chart_tracks`, preview Beatport)
- **New Releases** (`chart_featured_tracks`, Beatport o Bandcamp)
- **Retro Vinyl Picks** (`chart_vinyl_tracks`, reproducción por YouTube)

La tabla **`saved_chart_tracks`** (migraciones **`053_saved_chart_tracks.sql`** + **`054_saved_chart_tracks_beatport_top.sql`**) es **polimórfica**: guarda `(user_id, track_source, track_id)` con `track_source ∈ {chart, featured, vinyl, beatport_top}` y `UNIQUE (user, source, id)`. La migración 054 añade además `canonical_url` (URL normalizada de la canción) y `snapshot` (JSONB) para cubrir casos como el **Top 10 de Beatport** en fichas de artista/sello, que vive como **JSONB** dentro de `artists.beatport_top_tracks` y no tiene fila propia en ninguna tabla de charts. Un backfill del mismo script rellena `canonical_url` para los saves antiguos de `chart / featured / vinyl`.

El botón **`SaveTrackButton`** ("+") aparece en cada fila del chart y también en cada fila del **Top 10 de Beatport** en `/[lang]/artists/[slug]` y `/[lang]/labels/[slug]`. Por dentro usa `useSavedChartTracks()` (`src/hooks/useUserData.ts`), que es un **store compartido a nivel módulo** — todas las instancias del botón en la página se pintan sincronizadas sin round-trips.

**Agrupación canónica (canción = URL externa = vídeo de YouTube).** Una misma canción puede aparecer como fila en varias tablas y varias semanas, **o como entrada del Top 10 de un artista / sello**. Para que el botón trate todas esas filas como la misma canción (y al desmarcar borre todas), `ChartView.tsx`, `TracksSection.tsx` y el propio hook construyen una **clave canónica** por track:

| Fuente | Clave |
|--------|-------|
| `chart` | URL de Beatport normalizada (`host + pathname`) |
| `featured` | URL externa normalizada (Beatport / Bandcamp) |
| `vinyl` | **ID del vídeo de YouTube** (`yt:<id>` vía `extractYouTubeId`). **No** se usa `discogs_url`, porque un mismo release de Discogs contiene varias pistas (A1/A2/B1…) y cada una es su propia fila. Usar la URL de Discogs colapsaría canciones distintas en un único grupo y al guardar una, las demás se pisarían. |
| `beatport_top` | URL de Beatport normalizada del track (almacenada en `canonical_url` + metadatos en `snapshot`; sin fila en ninguna tabla origen). |

Fallback cuando falta URL: `nm:<título>|<mix>|<artistas>`.

**Cross-source real por URL.** El hook expone `isSavedByUrl(url)` y `toggleByUrl(url, {trackId, snapshot})`, usados por el "+" del Top 10 de Beatport: si ya guardaste esa canción desde un chart (40 Breaks / Novedades / Vinilo), el botón aparece ya en verde en el Top 10 **y viceversa**; al desmarcar se borran todas las filas (`chart` + `featured` + `vinyl` + `beatport_top`) que comparten esa URL canónica.

**Página /mi-cuenta/tracks:** orden por artista / título / fecha de release / fecha de guardado; **Play all** + **Shuffle** sobre la cola de audio (Beatport + Bandcamp) usando la `MiniPreviewBar` global — si sales de la página, **la música sigue sonando** porque el `<audio>` vive en `DeckAudioProvider`; filtro **multiselección** por fuente real de reproducción (Beatport / Bandcamp / YouTube); dedupe cruzado para que una canción aparezca **una sola vez** aunque esté guardada desde dos fuentes. Los vídeos de YouTube se reproducen con el embed aparte (iframe de YouTube requiere pantalla visible), así que no entran en la cola de audio y sí se paran al navegar.

**Lista pública compartible**: botón **🔗 COMPARTIR** copia `/[lang]/u/<userId>/tracks`. Otra persona puede reproducir, ordenar y filtrar esa lista en modo lectura; puede guardar canciones pero **a su propia cuenta**, no edita la del dueño. Si no tiene sesión, sale modal para registrarse. Backend: `/api/public/user-tracks` (service-role, bypasa RLS).

**Compartir una canción concreta (abre y suena en Optimal Breaks).** Cada fila de canción — en `ChartView` (40 Breaks + New Releases), en `TracksSection` (propia y la pública `/u/<userId>/tracks`) y en el Top 10 de Beatport de artistas/sellos (`BeatportTopTracks`) — tiene un botón 🔗 compacto (`src/components/TrackShareButton.tsx`) que prioriza `navigator.share` en móvil y copia al portapapeles como fallback con feedback ✓. Esquema de URLs:

- `/[lang]/charts?week=<YYYY-MM-DD>&play=chart:<uuid>` → fila de **40 Breaks Vitales** en esa edición.
- `/[lang]/charts?week=<YYYY-MM-DD>&play=featured:<uuid>` → fila de **New Releases** en esa edición.
- `/[lang]/artists/<slug>?play=beatport:<beatportId>` / `/[lang]/labels/<slug>?play=beatport:<beatportId>` → fila dentro del **Top 10 de Beatport** de esa ficha (el `beatportId` se extrae de `beatport_url`).

Helpers y parser en **`src/lib/share-track.ts`** (`buildTrackSharePath`, `buildBeatportSharePath`, `parsePlayParam`). Al abrir el enlace, `ChartView` o `BeatportTopTracks` detectan `?play=` al montar, abren el acordeón correcto, hacen scroll a la fila, la destacan y lanzan `playPreviewQueue` en la cola global. Los vinilos **no** se comparten así (mantienen enlace externo a Discogs/YouTube porque el iframe no admite autoplay arbitrario).

**OG dinámico por track.** `generateMetadata` en `charts/page.tsx`, `artists/[slug]/page.tsx` y `labels/[slug]/page.tsx` lee el `?play=` en SSR: si resuelve a un track real, sobreescribe `og:title` (`"Título (Mix) — Artistas"`), `og:description` (`"Escucha este track en Optimal Breaks · Sello · Año"`) y `og:image` (el `artwork_url` del tema). Así los previews de WhatsApp/X muestran la canción concreta y no una tarjeta genérica de chart o ficha. Detalle en **`docs/USER_ENGAGEMENT.md`** (*Track-level deep-linking*).

**Fallback de autoplay.** Chrome/Safari bloquean `audio.play()` con `NotAllowedError` cuando se abre un link compartido en pestaña nueva (no hay gesto del usuario en esa pestaña). `DeckAudioProvider` detecta ese error concreto y activa `previewBlocked` (también en `usePreviewAudio().previewBlocked`); entonces pinta un overlay a pantalla completa **`PreviewAutoplayOverlay`** con **carátula + título + artista** y el botón "▶ TOCA PARA ESCUCHAR". Un toque llama a `togglePreview()` ya con gesto válido → el audio arranca y el overlay se cierra solo. Otros errores (URL rota, CORS…) no disparan el overlay.

**Portada en el overlay.** Las URLs de carátulas de Beatport no deben cargarse con `<img>` plano: el CDN suele devolver **403** (bloqueo de hotlink por `Referer`). En el overlay se usa **`next/image`** (`fill`, `sizes`) para pasar por **`/_next/image`**, igual que en filas de chart y `BeatportTopTracks`. Los host deben seguir en `next.config.js` → `images.remotePatterns`. Si la imagen falla igual, `onError` muestra un placeholder **♪** en lugar del icono de imagen rota.

**Admin Tracks.** `/[lang]/administrator/tracks` agrega las estadísticas de guardado de **todos los usuarios** (top tracks, sellos, artistas) aplicando la misma dedupe canónica que la UI de usuario. Backend: `src/app/api/admin/tracks/route.ts`. Resumen en el dashboard del admin.

**Top de la Comunidad (`/[lang]/charts`).** Tras la sección *Retro Vinyl Picks*, **`CommunityMonthlyTop`** pide datos a **`GET /api/public/charts/community-monthly`** (`limit` opcional, default 40). Ranking **all-time** (sin ventana mensual) con agrupación canónica idéntica al panel admin de Tracks; orden por **usuarios únicos → total de saves → save más reciente → alfabético**. El slug `community-monthly` se conserva por compatibilidad: nació como ranking mensual pero se rediseñó a *all-time* en abril de 2026 porque los meses calendario «secaban» el ranking en cuanto la comunidad activa agotaba el catálogo del mes. Detalle en inglés: [README.md — User engagement](./README.md#user-engagement-my-breaks).

**Almas Gemelas (`/[lang]/mi-cuenta/almas-gemelas`).** **`GET /api/breakbeat/soulmates`** (sesión autenticada) calcula similitud **Jaccard** sobre claves canónicas frente a otros usuarios que siguen en el cómputo; umbral mínimo de saves en perfil; recomendaciones cruzadas. Migración **`056_community_top_and_soulmates.sql`**: columna **`profiles.is_tracks_public`** (por defecto activa; si es `FALSE`, el usuario no entra en los cruces ni en el top de la comunidad agregado). Toggle en **`/mi-cuenta/perfil`**. Documentación completa: **`docs/USER_ENGAGEMENT.md`** (*Community Top*, *Soulmates*).

### Vistas de listado (grande / compacto / lista)

En **Artistas**, **Sellos**, **Eventos**, **Escenas** y **Mixes** (cuando hay filas en Supabase) puedes cambiar la disposición de las tarjetas:

- **Grande** — rejilla amplia (o tarjetas estilo flyer en eventos y mixes).
- **Compacto** — rejilla densa; es la **vista por defecto** al cargar (no se guarda en URL ni `localStorage`).
- **Lista** — filas con miniatura cuadrada.

Componentes: `ViewToggle.tsx` más `ArtistsExplorer`, `LabelsExplorer`, `EventsExplorer`, `ScenesExplorer`, `MixesExplorer` en `src/components/`. Textos en `src/dictionaries/es.json` y `en.json` (`view_large`, `view_compact`, `view_list`).

**Eventos (`EventsExplorer`, `/[lang]/events`):** El pie de tarjeta funciona como **semáforo** por día calendario: **pasados** (último día `date_end` o `date_start` anterior a hoy, medianoche local) van en **`var(--red)`** con texto **blanco**; **próximos** usan el **amarillo de marca** **`var(--yellow)`** (mismo token que logo/navbar) con **`var(--ink)`**. El **hover** aclara el pie con `color-mix` hacia blanco; la **franja detrás del cartel** refuerza el estado (mezcla con rojo si pasó, amarillo sólido si es próximo). El `<Link>` es **`group/link`** y el pie usa **`group-hover/link:`** para reaccionar al pasar por la imagen (y al revés). **`CardThumbnail`** lleva **`groupHoverGroup="link"`** para el zoom. Rejilla con **`items-stretch`**, enlace **`h-full`** y pie con **`flex-1`** / **`min-h-*`** para **alinear alturas de pie** en cada fila. **Vista calendario por año:** cada día con eventos va en **rojo** si todos los eventos que tocan ese día están **pasados**, en **amarillo** si queda alguno **próximo** (misma regla `isEventPast`); leyendas **`calendar_legend_past`** / **`calendar_legend_upcoming`**. Al **pulsar un día** se abre un **modal** (cartel, fechas, ubicación, lineup resumido, texto breve y enlace a la ficha; no se navega directo desde la celda). Textos **`calendar_modal_*`** en diccionarios.

**Ficha de evento (`/[lang]/events/[slug]`):** CTA ancha de compra en el **hero** si hay URL de entradas o web, el evento **no está pasado** por fecha (último día del evento antes que hoy) y además **`event_type === 'upcoming'`** o el enlace es **MonsterTicket** (`monsterticket.com` / `.es` y subdominios). Se prioriza URL MonsterTicket. Textos acordados para MonsterTicket: **«Compra de entradas»** / **«Buy tickets»**; enlaces genéricos: **«Comprar entradas»** / **«Get tickets»**. Detalle en inglés: [README.md — Directory listing views](./README.md#directory-listing-views-artists-labels-events-scenes-mixes).

---

## Open Graph (previews en redes)

Todas las imágenes OG son **PNG 1200 × 630** (tamaño recomendado por Meta, `1.91:1`). Fuentes:

| Ruta | Componente / origen | Notas |
|------|---------------------|-------|
| `/:lang/opengraph-image` | `DefaultOgImage` (`src/lib/DefaultOgImage.tsx`) | Tarjeta fanzine de marca — home + fallback cuando una página no sobreescribe OG. Es JSX de Satori: **todo `<div>` con varios hijos necesita `display: flex`** (sin eso la ruta devuelve 500). |
| `/:lang/events/[slug]/opengraph-image` | `EventOgImage` (`src/lib/EventOgImage.tsx`) | **El propio cartel del evento**. 1200×630 con el cartel mostrado vía `object-fit: contain` sobre fondo INK (`#1a1a1a`), así **nunca se recortan** flyers cuadrados, verticales u horizontales. **Sin texto compuesto con Satori** — fecha, recinto y lineup salen en la descripción OG (meta) y en la ficha HTML. Pipeline `sharp`: WebP/AVIF → PNG, `resize({ width: 1200, height: 630, fit: 'inside' })` para respetar el aspect ratio y reducir el peso del data URL. |
| `/:lang/<charts\|mixes>` (estática) | `public/images/opengraph/sections/<charts\|mixes>-screenshot.png` | Capturas generadas con `npm run og:sections`. Textos en `seo.charts` / `seo.mixes` de los diccionarios. |
| `/:lang/<charts\|artists\|labels>?play=…` | Sobreescritura dinámica en `generateMetadata` (ver **Compartir canción**) | Reescribe `og:title` / `og:description` / `og:image` al track compartido (artwork de Beatport). |

**Meta description del evento.** `generateMetadata` en `src/app/[lang]/events/[slug]/page.tsx` compone `"FECHA · RECINTO, CIUDAD, PAÍS — descripción"`:

- `metaDateLabel(date_start, date_end, lang)` → rango corto: `"5 sept 2026"` o `"5–7 sept 2026"` (locale equivalente al de la UI).
- `metaPlaceLabel(venue, city, country)` → deduplicado por minúsculas (evita `"Granada, Granada, Spain"` si `venue` ya contiene la ciudad).
- Descripción larga = `description_es` / `description_en`.
- `detailPageMetadata` aplica **`smartTruncate(160)`** sin cortar palabras: la **cabecera fecha+lugar siempre se conserva** y solo se recorta la cola de la descripción larga.

### Firewall de Vercel: *System Bypass* para scrapers OG

Aunque `robots.txt` permita a `facebookexternalhit`, el **Sharing Debugger de Meta** seguirá mostrando **403** si **DDoS Mitigation** (siempre activo en Vercel) o **Bot Protection** (opcional) consideran las IPs del scraper como tráfico automatizado. **Esto no se arregla con código** — es una excepción en el panel de Vercel, gratuita y permanente:

1. Proyecto → **Settings → Firewall → Add New… → System Bypass** (cupo `0 / 25`).
2. Grupo `Matches any`, una fila por UA con `Request Header` · `User-Agent` · `Contains`: `facebookexternalhit`, `Facebot`, `meta-externalagent`, `WhatsApp`, `Twitterbot`, `LinkedInBot`, `Slackbot-LinkExpanding`, `TelegramBot`, `Discordbot` (o una sola fila `Matches Regex` si tu plan lo permite).
3. Guardar. **`System Bypass`** es la acción correcta: salta **managed rulesets** (DDoS + Bot Protection) sin desactivarlos para el resto del tráfico. Un `Rule` con acción `Bypass` también vale; `Rule` con acción `Log` / `Allow` / `Challenge` **no** arreglan el 403 de DDoS Mitigation.
4. Tras guardar, re-ejecutar [Meta Sharing Debugger](https://developers.facebook.com/tools/debug/) y pasar las URLs afectadas por el [Batch Invalidator](https://developers.facebook.com/tools/debug/sharing/batch/) para forzar re-scrape.

La misma lista de UAs está reflejada en `robots.txt` (`src/app/robots.ts` → `OG_CRAWLER_USER_AGENTS`) para que ambas capas coincidan.

**Mixes (`MixesExplorer`, `/[lang]/mixes`):** Filtros por **año**, **plataforma** (YouTube, SoundCloud, …) y **búsqueda** en título + artista. La lógica de filtrado para el usuario es la misma; por debajo se mantiene **montado todo el catálogo** y las filas que no cumplen el filtro usan la clase **`hidden` de Tailwind** (no basta el atributo HTML `hidden` en el mismo nodo que `display: flex`, porque el estilo del autor gana y pueden seguir viéndose tarjetas incorrectas). Así los **embeds no se destruyen** al quitar filtros. **YouTube y SoundCloud** se cargan **bajo demanda** con `IntersectionObserver` cuando la tarjeta se acerca al viewport (en el DOM los años van **de más reciente a más antiguo**); el iframe lleva `loading="lazy"`. SoundCloud sigue el player visual (URLs como en `SoundCloudVisualEmbed`; el envoltorio lazy está en `MixesExplorer`).

---

## Storage en Supabase

1. Aplica la migración **`supabase/migrations/005_storage_media.sql`** en tu proyecto.
2. Sube archivos al bucket **`media`** (panel de Supabase, código servidor con **service role** / **secret key**, o CLI del repo).
3. Guarda la URL pública en la columna **`image_url`** correspondiente.

**Desde tu máquina (archivo local → bucket):** con `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` o `SUPABASE_SECRET_KEY` en `.env.local`:

```bash
npm run media:upload -- ./portada.webp events/raveart-summer-festival-2025/cover.webp
```

El script [`scripts/upload-storage-media.mjs`](./scripts/upload-storage-media.mjs) imprime la URL pública y un ejemplo de `UPDATE` para `image_url`. Respeta **derechos de imagen**: solo sube material propio, con licencia o con permiso explícito.

Helpers en código: `src/lib/supabase-storage.ts`, `src/lib/supabase-admin.ts`.

---

## Puesta en marcha (rápida)

Desde la **raíz del repo** (misma carpeta que `package.json`; ver nota arriba).

```bash
npm install
cp .env.local.example .env.local
# Rellena URL + anon O publishable; para db:artist sin Postgres: service_role O secret
# Copia los MP3 a public/music/ (ver README.md)
npm run dev
```

Aplica las migraciones SQL de `supabase/migrations/` **en orden alfabético** en el panel de Supabase, o `npm run db:migrate` si tienes URI de Postgres configurada (en proyectos **ya inicializados**, re-ejecutar `001` puede fallar). Para aplicar **solo** Raveart sin tocar el resto:

```bash
npm run db:migrate:raveart
```

(Requiere `DATABASE_URL` u otra URI, o `SUPABASE_DB_PASSWORD` + `NEXT_PUBLIC_SUPABASE_URL`, en `.env.local` — igual que `db:migrate`.)

Tras el núcleo (`001`–`006`): **`007`** rol admin, **`008`–`009`** artistas destacados y timeline; **`010`** tabla **`organizations`**, FKs en **`labels`** / **`events`**, siembra Raveart + Raveart Records + primer lote de festivales; **`011`** más eventos alineados con la [galería oficial de Raveart](https://www.raveart.es/galeria/). Tabla archivo a archivo en [README.md](./README.md).

---

## Buscador global (⌘K / Ctrl+K)

El `CommandPalette` (icono de lupa en el header, atajo **⌘K** / **Ctrl+K**) consulta **`/api/search`** (`src/app/api/search/route.ts`) y mezcla resultados de **nueve orígenes** en una sola lista. El objetivo es **favorecer la reproducción de música**: si buscas un artista, deben aparecer sus tracks dondequiera que estén en los charts para que puedas ir a oírlos.

### Qué busca y dónde

| Tipo | Tabla / origen | Campos consultados (`ilike`) |
|------|----------------|------------------------------|
| `artist` | `artists` | `name`, `name_display`, `slug` |
| `track` | `chart_tracks` | `title`, `mix_name`, `label`, `artist_names_text` ([migración **051**](./supabase/migrations/051_chart_tracks_artist_names_text.sql)) |
| `track` | `chart_featured_tracks` (New Releases) | mismos campos |
| `track` | `chart_vinyl_tracks` (Retro Vinyl Picks) | mismos campos |
| `mix` | `mixes` | `title`, `artist` |
| `event` | `events` | `title`, `slug`, `city`, `venue`, `lineup_text` ([migración **052**](./supabase/migrations/052_events_lineup_text.sql): aplana `lineup text[]` + `stages[].lineup` en una columna `STORED GENERATED`) |
| `label` | `labels` | `name`, `slug` |
| `scene` | `scenes` | `title`, `slug`, `city` |
| `post` | `posts` | `title`, `slug` |
| `organization` | `organizations` | `name`, `slug` |

### Reglas de presentación

- **Orden de grupos en la UI** (favorece la música): `artist → track → mix → event → label → scene → post → organization`.
- **Eventos futuros vs. pasados:** los **pasados se descartan por defecto**. Sólo se muestran si la búsqueda es **claramente de eventos** (p. ej. buscas "Winter Festival" y **todos** los otros resultados están vacíos): en ese caso sí aparecen también los pasados. Si hay cualquier otro tipo de resultado (un track, un artista…), sólo se muestran eventos **futuros** (`date_start >= hoy`, orden ascendente).
- **Chip de fecha en eventos:** junto al chip de tipo se pinta `formatEventDate` en **amarillo** para próximos (`is_upcoming: true`) y **rojo** para pasados.
- **Deduplicado de tracks:** una misma canción puede estar en varias ediciones del chart. Se deduplica con la clave `normalize(title) | normalize(mix_name) | normalize(primer_artista)` y se **prioriza `chart_tracks` > `chart_featured_tracks` > `chart_vinyl_tracks`**. Dentro de cada tabla, las filas vienen ordenadas por **`chart_editions.week_date` DESC** primero y `position` ASC después, así la ocurrencia que sobrevive al dedupe es siempre la de la **edición más reciente** (la que /charts renderiza arriba). Esto garantiza que el `href` del resultado apunte a una fila que **sí existe** en el DOM, para que el deep-link + autoplay no fallen.
- **Carátulas:**
  - **Tracks** → `next/image` con la `artwork_url` de Beatport (proxy de Next.js para sortear hotlink/CSP).
  - **Mixes** → se **ignora** la portada propia del mix (YouTube/SoundCloud) y siempre se usa primero la foto del artista; si no hay, fallback a **`/images/disco_optimal_breaks.webp`**.
  - **Artistas** → `displayArtistImageUrl` (mismo helper que el resto del sitio).
- **Rate limit:** 120 peticiones / minuto por IP (instancia), respuesta `429` si se excede.

### Deep-linking al hacer clic

Los `href` que devuelve la API llevan **hash + `?play=1`** para que la vista destino abra el acordeón correcto, haga scroll a la fila exacta y arranque reproducción:

- `/{lang}/charts#chart-row-<id>?play=1` — 40 Breaks Vitales y New Releases (`ChartView`).
- `/{lang}/charts#chart-vinyl-row-<id>?play=1` — Retro Vinyl Picks (YouTube autoplay del iframe).
- `/{lang}/mixes#mix-<id>?play=1` — `MixesExplorer` (MP3/SoundCloud directos, YouTube vía autoplay).

El `useEffect` de `ChartView.tsx` escucha el hash y el parámetro `play`, expande el acordeón de año/semana correspondiente, hace scroll, destaca la fila y lanza play. Al terminar, limpia `?play=1` con `history.replaceState` para que un refresh no vuelva a dispararlo.

### Ficheros clave

- `src/app/api/search/route.ts` — API REST del buscador (queries paralelas, dedupe, orden).
- `src/components/CommandPalette.tsx` — UI del palette (atajos de teclado, grupos, render).
- `supabase/migrations/051_chart_tracks_artist_names_text.sql` — `artist_names_text` generado a partir del JSONB `artists` en las tres tablas de charts.
- `supabase/migrations/052_events_lineup_text.sql` — `lineup_text` generado a partir de `events.lineup` + `events.stages[].lineup`.

---

## Sistema de audio global (`DeckAudioProvider` + `claimAudio`)

La app tiene **tres modos de audio** que nunca suenan a la vez, todos gestionados por **`DeckAudioProvider`** (montado en el layout raíz `[lang]/layout.tsx`):

| Modo | Origen | Componente visible |
|------|--------|--------------------|
| `deck` | DJ deck de la home (4 pads) | `DJDeck` + mini-barra del provider |
| `mix` | SoundCloud / YouTube de un mix | mini-barra del provider |
| `preview` | Previews de canciones: chart semanal (40 Breaks + Novedades), Top 10 Beatport en ficha de artista/sello, **Mis Tracks** (propia o compartida) | `MiniPreviewBar` del provider (persistente entre rutas) |

### Persistencia entre rutas

El modo **`preview` es global**: la cola (`PreviewTrack[]`), el índice, el `<audio>` real y toda la UI viven dentro de `DeckAudioProvider`. Los componentes consumidores (`ChartView`, `BeatportTopTracks`, `TracksSection`) ya **no tienen `<audio>` propio** ni barra flotante local — sólo llaman a `playPreviewQueue(queue, index, groupKey)` / `togglePreview()` / `stopPreview()` vía el hook **`usePreviewAudio`**. Resultado: si empiezas a escuchar un track en `/es/artists/adam-freeland` y navegas a `/es/charts` o a `/es/mi-cuenta/tracks`, el audio **sigue sonando** y la `MiniPreviewBar` sigue visible (Beatport y Bandcamp). Los vídeos de YouTube (vinilos) siguen parándose al navegar porque son iframes ajenos.

### Exclusión mutua

Al reclamar audio el provider llama internamente a **`claimAudio(source)`** (y acepta aliases retrocompatibles `chart-preview` / `chart-playall` / `beatport-top` / `my-tracks`, todos mapean a `preview`). Esto dispara el evento **`ob-audio-claim`** en `window`, que pausa los otros modos. Solo suena **uno** a la vez sin importar desde dónde se pulsó play.

### `MiniPreviewBar`

Renderizada por el provider cuando `previewQueue.length > 0` (antes se montaba en cada página). Diseño idéntico al antiguo:

- Barra de progreso seekable (clic + arrastre con listeners en `document`, sin `setPointerCapture` — ver [Navegación segura con la música sonando](#navegación-segura-con-la-música-sonando) más abajo para el porqué).
- Transporte Anterior `⏮` / Play-Pause `▶ ❚❚` / Stop `■` / Siguiente `⏭`.
- Título + artista (si `domId` está presente y la vista actual tiene esa fila, hacer clic **hace scroll** a ella).
- Tiempo actual / duración e `índice / total`.
- **Botón guardar (`+` / ✓)** — mismo `SaveTrackButton` (tamaño `sm`) que aparece en cada fila de chart / Top 10 / Mis Tracks, ahora también a la derecha del contador de tiempo del reproductor. Cada `PreviewTrack` lleva su propio `save` (`mode: 'ref'` para tracks con fila propia en `chart_*_tracks`, `mode: 'url'` para entradas del Top 10 de Beatport que viven solo como JSONB), así el botón opera sobre la misma agrupación canónica que la fila origen y se mantiene sincronizado vía el store compartido `useSavedChartTracks`. Permite añadir/quitar la canción que está sonando sin tener que volver a su fila.
- `navigator.mediaSession` configurado con metadatos y handlers `play` / `pause` / `previoustrack` / `nexttrack` para auriculares, lockscreen y Bluetooth.
- **Pantalla de bloqueo / “Reproduciendo ahora”** — La web solo puede enviar a iOS/Android los campos estándar de `MediaMetadata` (`title`, `artist`, `album`, `artwork`) y el estado de posición para la barra. **No existe un campo de “año de publicación”** para el sistema. Para que el año saliera habría que meterlo dentro del título o del artista, con **mucho truncado** en pantallas pequeñas. **Decisión:** dejamos esas cadenas limpias; año y fecha completos siguen en la **propia web** (`MiniPreviewBar`, filas del chart), no duplicados en `mediaSession`.
- **Safe area móvil** — `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 10px)` para que en iPhones los botones de transporte no rocen la home-bar (la `safe-area` por sí sola los dejaba demasiado pegados al borde inferior). El wrapper de la página reserva la misma altura con `pb-[calc(4.75rem+env(safe-area-inset-bottom,0px)+10px)]` para que la última fila no quede tapada.

### Navegación segura con la música sonando

El mini reproductor es un overlay `position: fixed` que **persiste entre rutas** (vive dentro de `DeckAudioProvider`, fuera de `<main>`). Esa persistencia provocaba dos clases de bug que ya están corregidas:

- **Pointer capture pegado (menú/footer dejaban de responder).** Antes la barra de seek llamaba a `setPointerCapture(pointerId)` en cada `pointerdown`. Si una navegación de Next.js (o un cambio de pestaña / iOS WebView) reemplazaba el árbol React **antes** de que llegara `pointerup`, la captura quedaba viva sobre el `<div>` del seek y **todos** los clicks siguientes iban a parar ahí en vez de a la página: el síntoma era "los enlaces del menú no van, tengo que pulsar STOP para que vuelvan". **Solución:** la barra ya no usa `setPointerCapture`; en `pointerdown` registra `pointermove`/`pointerup`/`pointercancel` sobre `document` con el `pointerId` del gesto, y los desmonta al terminar. Una segunda red de seguridad (`visibilitychange` / `pagehide` / `blur`) aborta el drag si la pestaña se oculta.
- **Lluvia de re-renders del rAF que bloqueaba las transiciones de `next/link`.** El tick de progreso usaba `requestAnimationFrame` con `setPreviewProgress(audio.currentTime)` ~60 veces por segundo. Como `previewProgress` forma parte del valor del contexto, **cada consumidor de `useDeckAudio` se re-renderizaba en cada frame** (`TracksSection`, `ChartView`, `BeatportTopTracks`, `BackToTop`…). En React 18 + App Router las navegaciones de `next/link` viven dentro de una transición interrumpible: si llegan `setState`s de alta prioridad más rápido de lo que el árbol nuevo puede comprometer, la transición se reinicia indefinidamente y la página de destino **nunca llega a montar**. El síntoma exacto era *"sigue sonando la música, el menú no responde, en cuanto le doy a STOP la página a la que quería navegar carga de golpe"*. **Solución:** el rAF de preview tira `setState` como mucho cada ~120 ms (≈8 fps, más que suficiente para una barra fina); el del deck hace lo mismo con `setProgressA/B` (la rotación del plato sí sigue a 60 fps porque solo se ve en `/`). Con ~7× menos updates de contexto, el scheduler de transiciones tiene tiempo de respirar y las rutas se montan limpiamente mientras la música sigue sonando.

Todo está en `src/components/DeckAudioProvider.tsx` (función `MiniPlayerShell` para el pointer, los dos `useEffect` con `requestAnimationFrame` para el throttle).

### `PreviewAutoplayOverlay` (autoplay con enlace compartido)

Si `loadAndPlayPreviewAt` recibe **`NotAllowedError`** (política de autoplay al abrir Whatsapp/enlace en pestaña nueva), el provider pone **`previewBlocked`** y muestra un modal a pantalla: una sola tarjeta **▶ TOCA PARA ESCUCHAR** que llama a **`togglePreview()`** con el primer gesto del usuario. La carátula usa **`next/image`** vía **`/_next/image`** para evitar el **403** de hotlink de Beatport que provocaría un `<img>` directo. Si la imagen falla, placeholder **♪**. Se limpia al reproducir correctamente o al **`stopPreview`**. Código en `DeckAudioProvider.tsx`.

La barra sigue emitiendo `OB_CHART_PLAYALL_BAR_EVENT` para que `BackToTop` suba su botón de scroll mientras está visible (su offset también lleva los `+10px` para encajar con la nueva altura).

Detalle técnico y tabla de archivos en [README.md — Global audio system](./README.md#global-audio-system-deckaudioprovider--claimaudio).

---

## Secciones del sitio

Inicio, historia, artistas, sellos, **organizaciones** (`/organizations/[slug]`), eventos, escenas, blog, mixes, about, **login** (auth y recuperación por correo), **reset-password** (tras enlace de Supabase), **dashboard** (usuario), **`/administrator`** (solo `profiles.role = admin`: CRUD + imágenes; sin enlace en el menú público), páginas legales. En **inicio**: hasta **4 eventos próximos** (`date_start` ≥ hoy) y fallback si no hay datos (ver sección *Home — línea temporal* arriba). Listados desde Supabase en artistas, sellos, eventos, escenas y mixes: **tres vistas** (grande / compacto / lista; por defecto compacto). En **eventos**: pie semáforo, hover y CTA MonsterTicket en ficha (ver *Vistas de listado*). En **mixes**: filtros y **carga perezosa de embeds** (ver sección *Vistas de listado* arriba y [README.md](./README.md)).

### Migraciones SQL (resumen)

Aplica `supabase/migrations/` en **orden alfabético**. El README en inglés incluye una tabla **parcial** (001–011); hay **muchas más** (charts, mixes, OG, escenas, engagement, lotes de contenido…): lista completa en la carpeta del repo.

---

## Cabecera y ancho en móvil

- En **`globals.css`**, `html` y `body` llevan `max-width: 100%` y `overflow-x: hidden` (o `clip`) para evitar scroll horizontal fantasma.
- El **`<header>`** no usa `overflow-x: hidden`, para que los paneles en posición absoluta (menú hamburguesa, **desplegable de cuenta** tras el avatar) no queden recortados. Z-index alto en esos paneles respecto a la barra sticky.

---

## Deck e idioma

Al navegar entre **`/en` y `/es`**, el proveedor de audio se **vuelve a montar** (`key={lang}`): se para el sonido del idioma anterior y el mini reproductor coincide con la sesión actual (mismo criterio si había un mix en curso).

---

## Roadmap (resumen)

Hecho: Supabase en listados, miniaturas y Storage, auth (login, **`/auth/confirm`**, callback OAuth, recuperación → **`/reset-password`**, plantillas en `mailing/supabase/`), dashboard, **JSON + `db:artist`**, **`/administrator`**, **vistas de listado** en las cinco secciones de referencia, **sitemap + robots** (`sitemap.ts`, `robots.ts`), segmento `/artists` sin caché agresiva de HTML, **GA4** (`@next/third-parties/google` + Consent Mode y cookies).  
Pendiente: RSS, modo oscuro, etc. Ya hechos: **Búsqueda global** (*Buscador global*), **OG por sección** — home/mixes/charts (screenshots), **eventos = cartel a pantalla completa**, y overrides por canción (ver *Open Graph*).

---

## Licencia

Todos los derechos reservados © 2026 Optimal Breaks.
