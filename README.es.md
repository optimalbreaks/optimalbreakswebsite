# OPTIMAL BREAKS — La biblia del breakbeat

> Archivo, revista, guía, agenda y memoria de escena. Proyecto dedicado a preservar y celebrar la cultura breakbeat en todo el mundo.

La documentación técnica completa está en inglés en [**README.md**](./README.md). Aquí va un resumen en español **y el flujo recomendado para actualizar artistas**.

**Raíz del repositorio:** Abre en el IDE (y usa como cwd en terminal) la carpeta donde está **`package.json`** en la raíz (en muchos equipos se llama **`web optimalbreaks`**). Ahí está el `.git` y deben ejecutarse **`npm install`**, **`npm run dev`**, scripts de base de datos y el fichero **`.env.local`**. Una carpeta padre que solo envuelva el proyecto no es la raíz Git/npm.

---

## Qué es

Plataforma web **bilingüe (ES/EN)** sobre historia, artistas, sellos, eventos, escenas y cultura del **breakbeat**. Incluye un **DJ deck** interactivo (audio real y scratch), estética fanzine/club, y secciones editoriales y de referencia.

**Organizaciones y Raveart:** existe la tabla **`organizations`** (promotora, roles, enlaces). Los **sellos** pueden enlazar a una organización (`labels.organization_id`) y los **eventos** a la promotora (`events.promoter_organization_id`). Ficha pública: `/[lang]/organizations/[slug]` (p. ej. `raveart`). Datos sembrados y ampliados con las migraciones **`010_raveart_organizations.sql`** y **`011_raveart_gallery_events.sql`** (alineación con la [galería oficial](https://www.raveart.es/galeria/)). Detalle técnico y tabla de migraciones en [README.md](./README.md).

**Eventos:** se crean **manualmente** desde el panel admin (`/administrator/events/new`), pidiendo al agente Cursor, o con el **agente conversacional admin** (solo admin): widget flotante 💬 (`AdminCaptureFab`) / `/[lang]/administrator/chat` — foto/texto/link → tools OpenAI → **Confirmar** → UPSERT (si el cartel no trae año, fecha = próxima ocurrencia futura) → enrich + cartel oficial. Guía: **[`docs/ADMIN_CHAT_CAPTURA.md`](./docs/ADMIN_CHAT_CAPTURA.md)**. También sirve para **sellos, artistas, mixes, New Releases, vinyl**, CRUD admin y SQL (con confirmación). Para completar una ficha ya existente: `npm run db:events:enrich -- <slug> [--with-poster]` (prompt: **`scripts/prompts/evento-enriquecer-system.txt`**). El cartel se elige por **visión/OCR** (`db:events:poster` / API `event-poster`), no solo por títulos de Google Imágenes.

**Índice general de prompts y agentes IA** (archivos `.txt`, variables `OPENAI_*`, modelos por defecto, APIs): **[`docs/AI_PROMPTS_AND_AGENTS.md`](./docs/AI_PROMPTS_AND_AGENTS.md)**. Agente chat admin: [`docs/ADMIN_CHAT_CAPTURA.md`](./docs/ADMIN_CHAT_CAPTURA.md). Agente de **artistas**: [`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md). **Mapa de toda la documentación Markdown y auditoría:** [`docs/README.md`](./docs/README.md).

**Imágenes (WebP, `public/images` vs Supabase Storage):** [`docs/IMAGES_AND_WEBP.md`](./docs/IMAGES_AND_WEBP.md). **Qué puede hacer el usuario:** [`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md). **Estrellas 1–5 solo** para **experiencias a las que puedes ir**: **artistas** (visto en vivo) y **eventos** (fui). Sellos, mixes, etc.: solo favoritos/guardados, sin puntuación.

**Fechas de release con día (YYYY-MM-DD):** todas las listas de canciones (40 Breaks Vitales, New Releases, Retro Vinyl Picks, Top 10 de Beatport en artistas/sellos, **Mis Tracks** propio y público, Top de la Comunidad, Almas Gemelas, panel admin de Tracks y buscador ⌘K) muestran el **día completo** cuando se conoce, con fallback al año. Migración **`057_chart_featured_tracks_release_date.sql`** añade `chart_featured_tracks.release_date DATE`; la columna existe también en `chart_tracks.release_date` y dentro del JSONB `beatport_top_tracks` (artistas/sellos). Scrapers (Beatport `__NEXT_DATA__.publish_date`, Bandcamp `data-tralbum.album_release_date`) integrados en `chart-featured-upsert.mjs --enrich-release-dates`, `chart-40-breaks.mjs`, `beatport-top-tracks.mjs`. Para snapshots ya guardados: `scripts/saved-tracks-backfill.mjs` rellena `release_date` de forma **aditiva** (`mergeSnapshotAdditive`); flag `--scrape-beatport` para huérfanos. Helpers en `src/lib/share-track.ts` (`formatTrackReleaseDisplay`, `effectiveReleaseYear`, `releaseSortTimestampMs`). Detalle EN: [README.md — Track release dates](./README.md#track-release-dates-full-day-vs-year).

**Veto editorial — DistroKid / TuneCore / agregadores:** son **distribuidoras**, no sellos de escena. La cadena puede aparecer en picks de Beatport, pero **no** se crea fila en `labels` ni ficha `/labels/…`. Tampoco se dan de alta majors genéricos (Polydor, Columbia, OWSLA/Atlantic, etc.) solo por frecuencia en charts. Lista completa: [README.md — Editorial vetoes](./README.md#editorial-vetoes-entities-not-to-create); ampliar **solo** tras confirmación explícita.

**Descubrimiento desde charts (umbrales editoriales):** cruzar **40 Breaks Vitales** + **New Releases** (ediciones publicadas; Retro Vinyl fuera). **Artistas:** alta con agente si tienen **≥ 3** créditos y aún no están en `data/artists/` (`npm run db:chart:artists:agent -- --bootstrap-min-freq=3 --bootstrap-only`). **Sellos reales:** alta solo con **≥ 10** apariciones del string `label` (excluyendo DistroKid/TuneCore/majors); por debajo se aparca. Detalle EN + comandos: [README.md — Discovering artists & labels from charts](./README.md#discovering-artists--labels-from-charts). Regla Cursor: `.cursor/rules/charts-catalog-discovery.mdc`.

**Correos de autenticación (plantillas HTML para Supabase):** [`mailing/supabase/README.md`](./mailing/supabase/README.md) — confirmación de registro, invitación, magic link, cambio de correo, recuperación de contraseña, reautenticación. Flujo técnico actualizado en [README.md — Authentication](README.md#authentication-supabase-auth-and-email-templates).

---

## Stack principal

- **Next.js 14** (App Router), **TypeScript**, **Tailwind** 3.4
- **Supabase**: PostgreSQL + autenticación + **Storage** (bucket público `media` para fotos de contenido)
- **Analítica (opcional)**: **Google Analytics 4** con el paquete oficial **`@next/third-parties/google`** y **Consent Mode v2** enlazado al banner de cookies (`CookieBanner` + `GoogleAnalytics`). Detalle en [README.md — Analytics](./README.md#analytics-google-analytics-4) y en la sección [Analítica (GA4)](#analítica-ga4) de este archivo.
- Rutas `/es` y `/en` con middleware propio; al cambiar de idioma se **remonta** el layout `[lang]` (incluido **`LazyDeckAudioProvider`**) — la sesión en memoria no cruza locales
- Tipografías **self-hosted** (`@fontsource`, sin CDN de Google Fonts): en el camino crítico solo **Unbounded latin 700/900** + **preload** del `.woff2` del 900 (H1 de portada / LCP); **Special Elite**, Courier, Darker Grotesque y Unbounded 400 vía **`DeferredFonts`**. Detalle: [README.md — Performance & Core Web Vitals](./README.md#performance--core-web-vitals)

---

## Home — línea temporal «Historia del break» (`section_history`)

El bloque oscuro **Timeline** de la portada (`src/components/Timeline.tsx`) toma los datos de **`home.section_history.items`** en `src/dictionaries/es.json` y `en.json`. Cada fila tiene un **`year`** de pantalla (a menudo un rango), **`title`** y **`desc`**.

**No hay ordenación automática en código** (ni por año de inicio, fin o punto medio). El orden del array es **manual y editorial**: hilo narrativo (orígenes → UK → …), **apartados** comparativos (p. ej. EE. UU. como otro mapa) y un **cierre** (p. ej. era digital global al final, como capa que convive en el tiempo con otros capítulos). Es normal que los periodos se solapen; la posición obedece al **relato**, no a una regla numérica única. Para reordenar, edita `items` en **ambos** idiomas. Detalle en inglés: [README.md — Home — history timeline](./README.md#home--history-timeline-section_history).

**Tira de eventos en portada:** hasta **4** filas con **`date_start` ≥ hoy** (día local), orden **ascendente** por fecha. Si no hay resultados, se muestran los **4 eventos más recientes** por **`date_start` DESC**; si la tabla está vacía, entran placeholders estáticos **`FALLBACK_HOME_EVENTS`**. Implementación: `src/app/[lang]/page.tsx`.

---

## Rendimiento y Core Web Vitals (resumen)

Optimizaciones para **Lighthouse móvil** (LCP, CLS, JS no usado) sin cambiar el comportamiento tras pulsar Play.

- **Audio global diferido:** **`LazyDeckAudioProvider`** en el layout; **`DeckAudioProvider`** solo se importa al **primer Play** (deck, mix, preview) o si **`sessionStorage`** (`ob_audio_active`) indica sesión activa. Hooks **`usePreviewAudioGated`** / **`useMixAudioGated`** en charts, Top 10, mixes y Mis Tracks; cabina home con controles offline hasta el primer gesto. El provider mantiene un **shell estable** alrededor de `{children}` (no remonta el árbol de la página al cargar el motor — el acordeón de `/charts` no se colapsa al primer play) y **portala** el reproductor a `<div id="ob-audio-overlays">` bajo `document.body` para que `position: fixed` siempre ancle al viewport real. Tanto **`MiniPlayerShell`** como **`BackToTop`** compensan el **`visualViewport`** en **PWA iOS** (`resize` / `scroll` / `pageshow`) para que tras bloquear/desbloquear el móvil sigan pegados al borde inferior visible.
- **Fuentes:** subsets **latin** de Unbounded en layout + **preload** del woff2 del 900; Special Elite fuera del CSS bloqueante (`DeferredFonts`).
- **Otros:** `DjDeck` con `dynamic()`; modal de charts solo tras engagement (2ª página o 40 s); GA/SW/BackToTop dinámicos; **`/history`** con revalidate 300; quitado `force-dynamic` del layout global.
- **Caché de lecturas públicas de Supabase (Disk IO, agosto 2026):** la instancia agotó su **Disk IO Budget** (cada visita, bots incluidos, lanzaba todas las consultas del catálogo sin caché y el middleware llamaba a Auth sin timeout) y el sitio entero cayó con **504 `MIDDLEWARE_INVOCATION_TIMEOUT`**. Solución: compute **Nano → Micro** y, en la app, **`createCachedSupabase()`** (`src/lib/supabase-server.ts`) — cliente sin cookies cuyas lecturas van a la **Data Cache** de Next/Vercel con `revalidate` **300 s** — en todo el catálogo público (home, charts, artists, labels, events, mixes, scenes, blog, history, organizations, sitemap, buscador y OG de Stories). El **middleware** solo llama a Auth si hay cookies de sesión y aborta a los **2,5 s**. Los cambios en BD tardan **≤ ~5 min** en verse en la web pública (el admin ve datos vivos). **No** volver a `createServerSupabase()` en páginas públicas ni usar el cliente cacheado para datos por-usuario o escrituras. Regla: `.cursor/rules/supabase-cache-lecturas-publicas.mdc`.
- **SEO home:** metadatos y H2 orientados a **breakbeat** (mayo 2026).

Detalle técnico en inglés: **[README.md — Performance & Core Web Vitals](./README.md#performance--core-web-vitals)**.

---

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
- Código: **`src/components/GoogleAnalytics.tsx`** (componente `GoogleAnalytics` de `@next/third-parties/google` + script previo de consentimiento; import dinámico) y **`src/components/CookieBanner.tsx`** (evento `ob-cookie-consent`; barra inferior **diferida** tras LCP — `PerformanceObserver` o máx. ~4,5 s — para no competir con el primer render).

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
- Rutas **`/artists`**: leen Supabase vía **`createCachedSupabase()`** (Data Cache, `revalidate` 300 s) — lo publicado en BD tarda **≤ ~5 min** en verse en la web pública. Se mantienen las cabeceras **`no-store`** en `next.config.js` (el HTML no se queda viejo en CDN) y el **service worker** sigue sin guardar HTML de `/artists`. El antiguo `revalidate 0` + `fetchCache force-no-store` se retiró en agosto 2026: hacía que cada visita golpease Supabase y contribuyó a agotar el Disk IO Budget (504 en todo el sitio).

### Agente de biografías (OpenAI)

Por defecto **hace UPSERT en Supabase** (misma credencial que `db:artist`). Opcional **`--json-only`** solo archivo; **`--save-json`** BD + copia en `data/artists/`.

Documentación detallada: **[`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md)**. Prompt del sistema: **`scripts/prompts/artista-agente-system.txt`**. Resto de agentes y defaults de modelo: **[`docs/AI_PROMPTS_AND_AGENTS.md`](./docs/AI_PROMPTS_AND_AGENTS.md)**.

```bash
npm run db:artist:agent -- plump-djs "Plump DJs"
npm run db:artist:agent:all                                    # regenera cada fila en BD (coste API)
npm run db:artist:ensure -- data/artists/deekline.json         # comprobar JSON vs BD y sincronizar si difiere
```

Necesitas **`OPENAI_API_KEY`**. Por defecto **`gpt-5.6-terra`** con **web_search**; **`OPENAI_MODEL`** lo sobrescribe. Opcional **`SERPAPI_API_KEY`** (respaldo web e imágenes). Revisa siempre hechos antes de publicar.

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

## New Releases (novedades editoriales en `/charts`)

> **Regla invariante:** los picks se **clasifican por semana según la fecha de release del tema en la tienda** (para Beatport: el día que esa tienda muestra como release / `publish_date` en scrape). **`week_date` en JSON = lunes ISO de esa semana de release.** Nada más (ni el día en que pegas URLs ni “la siguiente fila temporal del repo”) determina esa semana; ver `.cursor/rules/charts-new-releases-supabase.mdc`.

- **Qué muestra producción:** filas **`chart_featured_tracks`** en Supabase (por **`chart_editions.week_date`**). La ruta **`/[lang]/charts` no lee** `data/charts/picks/*.json`.
- **Qué fichero usar:** la **`week_date`** de la edición es el **lunes** de la **semana del release en Beatport** (campo día del lanzamiento que devuelve la tienda). **No** se elige por la fecha del chat ni por «incrementar una semana respecto al último JSON**.
- **Solo disco / repo:** editar **`data/charts/picks/<semana>.json`** o ejecutar **`scripts/_append-batch-nr-from-releases.mjs`** (URLs Beatport → singles; puede escribir **uno o más** `<lunes>.json`): **solo actualiza Git**, no las filas que ve la web.
- **Publicar en Supabase (obligatorio para que el sitio muestre los nuevos picks):** **`npm run db:chart:featured -- data/charts/picks/<semana>.json`** (equiv.: `node scripts/guia-base-datos.mjs run chart-featured-file …`). Opciones en `chart-featured-upsert.mjs`: **`--create-edition`**, **`--enrich-release-dates --write-json`**, etc. En red con SSL inspection usa **`node --use-system-ca scripts/chart-featured-upsert.mjs …`** (`NODE_OPTIONS` con `--use-system-ca` rompe npm).
- **Sin paso JSON:** importación Beatport en **`/[lang]/administrator/tracks`** (API **`/api/admin/featured-import`**): escribe directamente en **`chart_featured_tracks`**.
- **Viernes (día de lanzamientos):** Beatport lleva **mucho más tráfico**; Cloudflare y límites suelen **fallar más** (`403`, timeouts). Suele ir mejor **al día siguiente** o con **`BEATPORT_BATCH_PAUSE_MS`** más alto; no es necesariamente un fallo del código.
- **Otros comandos relacionados:** **`npm run db:chart:vinyl`** (vinilos retrospectivos desde JSON); **`npm run db:chart:backfill-new-releases`** (relleno histórico desde 40 Breaks). Más contexto en inglés: [README.md — Beatport (incluye New Releases)](./README.md#beatport-weekly-chart-vs-top-10-on-profiles).

### Enlaces «Abrir en Spotify» / «Abrir en TIDAL» en `/charts`

Cada fila de **40 Breaks Vitales** y **New Releases** muestra un botón **SPOTIFY** (`SpotifyLinkButton` en `ChartView.tsx`): quien tenga cuenta de Spotify puede escuchar el tema completo allí (no podemos alojar audio íntegro por derechos). Dos modos:

- **Enlace verificado** — columna **`spotify_url`** en `chart_tracks` + `chart_featured_tracks` (migración **`066_charts_spotify_url.sql`**), rellenada por **`npm run db:chart:spotify`** (`scripts/spotify-match-charts.mjs`): búsqueda en la Web API de Spotify con **client credentials** (`SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`; desde feb-2026 el dueño de la app necesita Premium, pero no hay OAuth por usuario). Matching conservador (título normalizado + al menos un artista; «Original Mix» cuenta como sin sufijo); ante ambigüedad queda `NULL`.
- **Fallback de búsqueda** — sin `spotify_url`, el botón enlaza a `open.spotify.com/search/<artistas título>`, así funciona aunque el matching no se haya ejecutado.

**TIDAL** funciona igual con `--service=tidal` (`npm run db:chart:tidal`, columna **`tidal_url`**, migración **`067_charts_tidal_url.sql`**, env `TIDAL_CLIENT_ID` + `TIDAL_CLIENT_SECRET` de developer.tidal.com — sin requisito Premium ni cuota diaria observada; endpoint `GET /v2/searchResults?filter[query]=…&include=tracks.artists`, JSON:API). Diferencia editorial (deliberada, aprobada por el usuario): el **botón TIDAL solo sale con enlace verificado** — sin fallback de búsqueda — porque su catálogo de breaks es más limitado y un tercer botón fijo cargaría las filas.

**Botones** en `TrackShareButton.tsx` (`SpotifyLinkButton`, `TidalLinkButton`, `BeatportLinkButton`): **circulares con logo de marca en móvil Y escritorio** (34px / 30px, paths oficiales de simple-icons, tooltip = nombre del servicio; Spotify = verde oficial `#1ED760` con logo negro según su branding, Beatport = negro con «b» `#01FF95`, TIDAL = papel con rombo negro). Se usan en `/charts` (40 Breaks + New Releases), **Top 10 de Beatport** de artista/sello (`BeatportTopTracks.tsx`; allí Spotify usa fallback de búsqueda porque el snapshot JSONB no tiene columnas), **New Releases del artista** (`ArtistFeaturedTracks.tsx`) y **Mis Tracks** propia y lista pública (`TracksSection.tsx` + `/api/public/user-tracks`). Las filas de vinilo no llevan botón Spotify/TIDAL a propósito.

**App vs. web (no «arreglarlo» con deep links):** todos los botones usan URLs `https://` a propósito. El propio SO abre la app nativa si está instalada y el navegador si no — no existe API web para detectar apps instaladas, y forzar URIs `spotify:` saca diálogos feos del navegador a quien no la tiene. Limitación conocida de Spotify: la página del **fallback de búsqueda** (`open.spotify.com/search/…`) en web móvil **sin sesión iniciada** muestra «búsquedas recientes/explorar» en vez de resultados; los enlaces directos a track funcionan bien sin sesión. Se cura solo conforme el matching convierte fallbacks en enlaces directos.

Los syncs semanales **no** pisan los matches: la RPC del 40 (`apply_chart_tracks_row_updates`) no incluye las columnas y `chart-featured-upsert.mjs` solo envía `spotify_url` / `tidal_url` si vienen en el JSON. **Tras publicar cada edición nueva:** `npm run db:chart:spotify -- --week=<lunes>` **y** `npm run db:chart:tidal -- --week=<lunes>`. Spotify (Development Mode) tiene **cuota diaria por cuenta** (~1.300 búsquedas): ante 429 `QUOTA_EXCEEDED` el script corta limpio con resumen y al reejecutarlo continúa donde quedó (solo procesa filas NULL). El OAuth por usuario (añadir a playlist, reproducción completa embebida) queda **descartado**: desde feb/mar-2026 las apps en Development Mode admiten máx. 5 usuarios en allowlist y el Extended Quota Mode exige organizaciones con ≥250k usuarios activos mensuales.

---

## Descubrir artistas y sellos desde los charts

Crecimiento editorial del catálogo a partir de ediciones **publicadas** de **40 Breaks Vitales** (`chart_tracks`) + **New Releases** (`chart_featured_tracks`). **Retro Vinyl no cuenta** para estos umbrales.

### Artistas — umbral **≥ 3** apariciones

1. Contar créditos de artista en todas las ediciones publicadas (unión 40 Breaks + New Releases).
2. Cruzar con `data/artists/` (nombre / nombre sin paréntesis / slug; alias en `CHART_NAME_TO_SLUG`).
3. Con **≥ 3** apariciones y **sin** JSON local → crear con el agente:
   ```bash
   npm run db:chart:artists:agent -- --bootstrap-min-freq=3 --bootstrap-only --dry-run
   npm run db:chart:artists:agent -- --bootstrap-min-freq=3 --bootstrap-only
   ```
4. Fotos opcionales: `npm run db:artist:photo -- <slug>`. Si Serp/Instagram fallan, dejar `image_url` null.
5. Alternativa (todos los nombres del chart, sin filtro de frecuencia): `npm run db:chart:artists -- --all-published` y luego enriquecer starters. Para tandas de descubrimiento preferir el bootstrap **≥ 3**.

### Sellos — umbral **≥ 10** apariciones (solo imprints reales)

1. Contar el string `label` en las mismas tablas.
2. Cruzar con `data/labels/`.
3. **Excluir** DistroKid, TuneCore y el resto de [vetos editoriales](./README.md#editorial-vetoes-entities-not-to-create).
4. Barra actual: **solo** crear fichas con **≥ 10** apariciones. Los de 5–9 / 3–4 / 1–2 quedan aparcados hasta que se baje el umbral a propósito.
5. No hay script `chart-labels` aún; alta por sello:
   ```bash
   node scripts/guia-base-datos.mjs run label-agent -- <slug> "Nombre del sello" --save-json
   node scripts/guia-base-datos.mjs run label-photo -- <slug>   # logo opcional
   ```

Regla para agentes Cursor: `.cursor/rules/charts-catalog-discovery.mdc`. Detalle en inglés: [README.md — Discovering artists & labels from charts](./README.md#discovering-artists--labels-from-charts).

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

Si Beatport responde **`403` (Cloudflare «Un momento…»)** — típico tras un batch grande que deja la IP marcada varias horas — añade **`--headless`** para que el script abra Chrome con Playwright y pase el challenge JS:

```bash
npm i -D playwright && npx playwright install chrome
npm run db:beatport:top -- artist ed209 24421 --headless
```

Si la IP del runner está fuertemente bloqueada por CF, el `--headless` también puede recibir el challenge sin resolverlo: en ese caso esperar varias horas y reintentar (la propia IP del usuario suele estar limpia y resuelve en segundos).

**TLS `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ("fetch failed" en Node)** — En redes con **SSL inspection** (típico en oficinas: Acttax, VPN/firewall corporativos), el certificado que ve Node está re-firmado por una CA interna. Node 20+ **no usa el truststore del SO por defecto**, así que `fetch` muere con `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (visible como **"fetch failed"**) en scripts hacia Beatport / Supabase / OpenAI: `chart-40-breaks`, `beatport-top-tracks`, `chart-featured-upsert`, `enrich-chart-artists-agent`, `generar-sello-agente`, etc. **Solución limpia:** **`node --use-system-ca`** (disponible desde **Node ≥ 22.15**).

- Invocar con `node` directo: `node --use-system-ca scripts/<archivo>.mjs …`
- **`NODE_OPTIONS=--use-system-ca` rompe `npm`**. Preferir invocar el script con `node --use-system-ca …` o **`NODE_EXTRA_CA_CERTS`** al `.pem` del proxy.
- **`guia-base-datos.mjs`** añade `--use-system-ca` a los hijos si Node major ≥ 20. Si tu build **rechaza** el flag (p. ej. **22.14**), usa **`OB_NO_SYSTEM_CA=1`** y, solo en esa sesión si hace falta, **`NODE_TLS_REJECT_UNAUTHORIZED=0`**.
- **No recomendado como default permanente:** `NODE_TLS_REJECT_UNAUTHORIZED=0`.

El script lee el HTML de Beatport, parsea **`__NEXT_DATA__`** y hace **`UPDATE`** por `slug` en la tabla correspondiente. **Guía:** `node scripts/guia-base-datos.mjs run beatport-top artist <slug> <id>`.

4. **Opcional en JSON** — Puedes añadir **`beatport_id`** y **`beatport_url`** en `data/artists/*.json` (o JSON de sellos) para que **`npm run db:artist`** / **`db:label`** los guarden; el **listado Top 10** no va en el JSON: se rellena solo con **`db:beatport:top`**.
5. **Web** — Si `beatport_top_tracks` tiene entradas, en el **hero** de la ficha aparece el acordeón **`BeatportTopTracks`** (previews vía **`/api/audio-proxy`**). Si está vacío, no se muestra bloque. Las filas de cada track son **visualmente idénticas** a las del chart semanal (`PositionBadge`, artwork, título/artista/sello/año, badges BPM/key, botón BEATPORT). Al pulsar play (individual o "Play All"), se activa la **`MiniPreviewBar` global del `DeckAudioProvider`**: transporte, progreso seekable, info del track. El reproductor usa el modo global **`preview`** (vía **`usePreviewAudioGated`** → `playPreviewQueue` una vez cargado el motor), por lo que se excluye mutuamente con el deck de la home y los mixes, y **sigue sonando al navegar** a otras páginas (ver sección [Sistema de audio global](#sistema-de-audio-global-lazydeckaudioprovider--deckaudioprovider)).

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

**ADN breakbeatero (`breakbeat_profiles`).** El bloque de análisis del dashboard genera (y relee) **una fila por usuario**. Es **privado**: no se comparte en Almas Gemelas, Top de la Comunidad ni en `/u/<id>/tracks`. Migración **`064_breakbeat_profiles_rls.sql`**: RLS activado; `authenticated` solo SELECT/INSERT/UPDATE/DELETE de su propia fila (`auth.uid() = user_id`); **`anon` sin grants**. Escritura vía JWT del usuario (`POST /api/breakbeat-profile` + hook `useBreakbeatProfile`), no `service_role`. Detalle: **[`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md)** (*Breakbeat DNA*).

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

**Top de la Comunidad (`/[lang]/top100`).** Página propia (en `/charts` solo queda una tarjeta que enlaza). **`CommunityMonthlyTop`** pide **`GET /api/public/charts/community-monthly?limit=100`**. Ranking **all-time** de cada **"+"** en Mis Tracks: **top 10 artistas** y **top 100 temas** salen del mismo recuento. Agrupación canónica como el panel admin de Tracks; temas ordenados por **usuarios únicos → total de saves → reproducciones → save más reciente → alfabético**. Las lecturas de filas origen (`chart_tracks` / `chart_featured_tracks` / `chart_vinyl_tracks`) van en **trozos de 200 IDs** (`.in()`): un solo filtro con cientos de UUIDs de New Releases recorta metadatos y tira saves antiguos **sin `snapshot`** (agosto 2026: la web mostraba ~803 saves con ~968 filas en BD). El slug `community-monthly` se conserva por compatibilidad (nació mensual; all-time desde abril 2026). Detalle: **[`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md)** (*Community Top*) y [README.md — User engagement](./README.md#user-engagement-my-breaks).

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

**Cartel siempre actualizado (URL OG versionada).** El cartel vive en una ruta **fija** de Storage (`media/events/<slug>/poster.*`, sobrescrito con `upsert`), así que su URL no cambia al reemplazar el flyer — y Facebook/WhatsApp cachean la tarjeta **por URL**. Desde la migración `065_events_updated_at.sql`, `events.updated_at` (trigger `events_updated_at`) hace de versión de caché: `generateImageMetadata` en `opengraph-image.tsx` mete su epoch **en el path de la imagen emitida** (`…/opengraph-image/<epoch>?<hash>`), de modo que cada edición de la fila genera una URL de og:image nueva. (Un `openGraph.images` explícito en `generateMetadata` **no** sirve aquí: la convención de archivo del mismo segmento siempre lo pisa — comprobado en Next 14.2.) Dentro de la ruta OG el cartel también se baja con `?v=<epoch>`, invalidando la Data Cache de Vercel y el CDN de Supabase — el antiguo `cache: 'force-cache'` sin versión congelaba el cartel para siempre. `/events` y la ficha versionan igual el `image_url` visible (`imageCacheVersion` / `versionedImageUrl` en `src/lib/image-url.ts`). Todo se refresca en ≤ ~5 min (Data Cache) tras editar la fila; para enlaces **ya escrapeados por Facebook**, fuerza un refresco una vez con el [Sharing Debugger](https://developers.facebook.com/tools/debug/).

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

**Mixes (`MixesExplorer`, `/[lang]/mixes`):** Filtros por **año**, **plataforma** (YouTube, SoundCloud, …) y **búsqueda** en título + artista. La lógica de filtrado para el usuario es la misma; por debajo se mantiene **montado todo el catálogo** y las filas que no cumplen el filtro usan la clase **`hidden` de Tailwind** (no basta el atributo HTML `hidden` en el mismo nodo que `display: flex`, porque el estilo del autor gana y pueden seguir viéndose tarjetas incorrectas). Así los **embeds no se destruyen** al quitar filtros. SoundCloud sigue el player visual (URLs como en `SoundCloudVisualEmbed`; el envoltorio lazy está en `MixesExplorer`), montado bajo demanda con `IntersectionObserver`. En el DOM los años van **de más reciente a más antiguo**.

**Tarjetas de YouTube — portada (facade) + miniatura vía proxy (`LazyYouTubeEmbed` en `src/components/YouTubeEmbed.tsx`):** las tarjetas de YouTube **no** montan el reproductor solas. Cada tarjeta muestra una **portada** (la miniatura del vídeo) con un play rojo, y el iframe pesado `youtube.com/embed/…` se monta **solo al pulsar play** (entonces `autoplay=1`, exclusivo vía el coordinador de reproducción). Esto es **deliberado** y **no debe volver a auto-montar muchos iframes a la vez**:

- **Por qué no se auto-montan:** montar ~10 iframes de YouTube a la vez (p. ej. una sección de año llena de sesiones de YouTube arriba del todo) **pillaba** la página, sobre todo en redes/adblockers que bloquean `i.ytimg.com` (cada iframe se quedaba colgado esperando al CDN de imágenes de Google). Con click-to-play hay como mucho un iframe montado a la vez.
- **Por qué la miniatura va por proxy:** la portada se pide a **nuestro propio dominio** vía **`/api/og/image-proxy?src=…`** (el servidor baja `https://i.ytimg.com/vi/<id>/hqdefault.jpg` y la reenvía). Cargar `i.ytimg.com` directo desde el navegador deja la portada **en negro** en proxies corporativos / extensiones de privacidad (uBlock EasyPrivacy, Brave Shields, SSL inspection de Acttax…) que tratan `ytimg.com` como tracker. La lista de hosts permitidos del proxy está en `src/app/api/og/image-proxy/route.ts` (`i.ytimg.com`, `img.youtube.com`). Si el proxy también falla, la portada cae a un **placeholder a rayas con el título** del mix legible.
- **La prop `autoplay` se salta el facade:** las filas que ya tienen su propio botón ▶ (`/charts` vinilo, **Mis Tracks**, **Community Top**) y el buscador global (⌘K, deep-link `?play=1`) pasan `autoplay`, que monta el iframe directamente — esos flujos no cambian.
- **Aviso en local:** en `localhost` el proxy corre dentro de tu propia red, así que si esa red bloquea `i.ytimg.com` la portada sale como placeholder a rayas en local; en producción (Vercel no está bloqueado) se ve bien. Prueba las portadas en la web desplegada, no en local.

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

Aplica las migraciones SQL de `supabase/migrations/` **en orden alfabético** en el panel de Supabase, o `npm run db:migrate` si tienes URI de Postgres configurada (en proyectos **ya inicializados**, re-ejecutar `001` puede fallar). La tabla de referencia (parcial) está en [README.md — SQL migrations](./README.md#sql-migrations-reference); incluye **`064_breakbeat_profiles_rls.sql`** (RLS del ADN breakbeatero). Para aplicar **solo** Raveart sin tocar el resto:

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

## Sistema de audio global (`LazyDeckAudioProvider` + `DeckAudioProvider` + `claimAudio`)

La app tiene **tres modos de audio** que nunca suenan a la vez, gestionados por **`DeckAudioProvider`**, cargado **en diferido** vía **`LazyDeckAudioProvider`** en `src/app/[lang]/layout.tsx`. Hasta que el motor carga, la UI usa hooks **con gate** (`usePreviewAudioGated`, `useMixAudioGated`, cabina offline en `DjDeck`) que encolan la primera acción con **`requestLoad`**.

| Modo | Origen | Componente visible |
|------|--------|--------------------|
| `deck` | DJ deck de la home (4 pads) | `DJDeck` + mini-barra del provider |
| `mix` | SoundCloud / YouTube de un mix | mini-barra del provider |
| `preview` | Previews de canciones: chart semanal (40 Breaks + Novedades), Top 10 Beatport en ficha de artista/sello, **Mis Tracks** (propia o compartida) | `MiniPreviewBar` del provider (persistente entre rutas) |

### Persistencia entre rutas

El modo **`preview` es global**: la cola (`PreviewTrack[]`), el índice, el `<audio>` real y toda la UI viven dentro de `DeckAudioProvider`. Los componentes consumidores (`ChartView`, `BeatportTopTracks`, `TracksSection`, `CommunityMonthlyTop`) ya **no tienen `<audio>` propio** ni barra flotante local — llaman a `playPreviewQueue` / `togglePreview` / `stopPreview` vía **`usePreviewAudioGated`** (que delega en **`usePreviewAudio`** cuando el motor está montado). Resultado: si empiezas a escuchar un track en `/es/artists/adam-freeland` y navegas a `/es/charts` o a `/es/mi-cuenta/tracks`, el audio **sigue sonando** y la `MiniPreviewBar` sigue visible (Beatport y Bandcamp). Los vídeos de YouTube (vinilos) siguen parándose al navegar porque son iframes ajenos.

### Exclusión mutua

Al reclamar audio el provider llama internamente a **`claimAudio(source)`** (y acepta aliases retrocompatibles `chart-preview` / `chart-playall` / `beatport-top` / `my-tracks`, todos mapean a `preview`). Esto dispara el evento **`ob-audio-claim`** en `window`, que pausa los otros modos. Solo suena **uno** a la vez sin importar desde dónde se pulsó play.

### El Play/Pausa de cada fila es un toggle real (no reinicia)

**Invariante (agosto 2026):** el botón ▶ de una fila que pasa a **`❚❚`** debe **pausar** de verdad — al pulsarlo otra vez, reanuda desde la misma posición. **Nunca** debe re-lanzar la cola (eso reinicia el tema desde 0:00 y parece que "el botón de pausa no detiene la reproducción"). El fallo se reportó en Firefox pero era de todos los navegadores: el handler de la fila siempre llamaba a `playPreviewQueue` en vez de hacer toggle.

- **Patrón correcto:** si la fila pulsada es la que suena en este grupo (`previewGroupKey === sectionKey && previewQueue[previewIndex]?.rowKey === rowKey`), llamar a **`togglePreview()`**; si no, `playPreviewQueue(bundle, idx, groupKey)`. El icono `❚❚` solo se muestra con `isActive && previewPlaying` (en pausa → `▶`).
- **Superficies que deben mantenerlo:** `ChartView` (40 Breaks + Novedades), `CommunityMonthlyTop` (`/top100`), `BeatportTopTracks` (Top 10 de artista/sello), `ArtistFeaturedTracks` (Novedades en ficha). `TracksSection` (Mis Tracks) y `ArtistShowcase` ya hacían toggle y son la implementación de referencia.
- **Tarjetas de mix** (`MixesExplorer.MixPlayButton`, dashboard `DashboardMixPlayButton`): la etiqueta **`■ STOP`** debe llamar a **`stopMix()`** (no a `playMix` otra vez). `useMixAudioGated` expone `stopMix` / `toggleMixPlayback` para ello.

### Coordinador de embeds y consistencia en móvil (`src/lib/youtube-play-coordinator.ts`)

Los iframes de terceros (vinilos YouTube, tarjetas de `/mixes`, mixes guardados del dashboard, **widgets visuales de SoundCloud**) viven fuera del provider; un singleton a nivel de módulo coordina los dos mundos — **una sola fuente audible en todo el sitio**. Invariantes añadidos en agosto 2026 con los arreglos de consistencia en móvil/PWA (sonaba otro tema, dos fuentes a la vez al volver del background, la lockscreen abría otra app):

- **Todo embed pasa por el coordinador.** YouTube vía `requestYouTubePlay` / `registerYouTubeEmbed` (todos los montajes con `autoplay` llaman antes a `requestYouTubePlay`); los widgets visuales de SoundCloud vía **`useSoundCloudExclusivePlayback`** (`SoundCloudVisualEmbed.tsx`): el evento `PLAY` de la Widget API reclama el slot y registra un stopper que hace `pause()`. El `YouTubeIframe` del dashboard (`user/shared.tsx`) delega en `LazyYouTubeEmbed` — **no** reintroducir `<iframe>` en crudo sin coordinar.
- **Carrera request→mount cerrada.** `stopAllYouTube()` recuerda qué slot desalojó el reproductor global; si ese iframe se registra *tarde*, se para a sí mismo en vez de volver a silenciar el preview que el usuario acababa de arrancar (siempre gana la última acción del usuario).
- **Los keepers del preview respetan los embeds.** El resume de `visibilitychange`, el intervalo de 10 s y el watchdog de arranque en `DeckAudioProvider` consultan **`getActiveYouTubePlayId()`** y nunca auto-reanudan el `<audio>` del preview por encima de un embed activo.
- **Exclusión entre ventanas (`BroadcastChannel('ob-playback-claim')`).** Cuando cualquier pestaña / ventana PWA del origen arranca reproducción (`claimAudio`, claims de YouTube/SC, resume de preview/mix), emite un claim y el resto de clientes se silencia — estilo Spotify; arregla el bug de "dos listas a la vez" cuando convivían el icono PWA y una pestaña de Safari.
- **Media Session:** el effect del deck **no** debe limpiar metadata/handlers de `mediaSession` con `mode === 'preview'` (antes lo hacía y dejaba la lockscreen de iOS huérfana). El preview gestiona su propia sesión en `loadAndPlayPreviewAt` + su effect de handlers.
- **Manifest PWA** (`public/manifest.json`) declara `id: "/"`, `scope: "/"` y `launch_handler.client_mode: "focus-existing"` para que los controles del sistema / lanzamientos reutilicen la ventana existente en vez de abrir otra instancia. El manifest está precacheado por `public/sw.js` — **bumpear `CACHE_NAME`** cada vez que cambie (actualmente `ob-v5`).

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
- **PWA iOS (standalone)** — La barra está **portalada a `document.body`** (`#ob-audio-overlays`) para que ningún wrapper del lazy load rompa `position: fixed`, y su `bottom` se ajusta dinámicamente con el hook compartido **`useViewportBottomOffset`** (`src/hooks/useViewportBottomOffset.ts`): escucha `visualViewport.resize` / `scroll`, `pageshow`, `focus`, `orientationchange` y `visibilitychange`, y re-mide a 80/250/600/1200 ms tras cada "despertar" (iOS necesita unos frames para reportar el viewport real al volver al primer plano). Además **descarta mediciones transitorias** tomadas con la página oculta o con un desfase >40% de la altura (solo ocurren con un overlay nativo — hoja de compartir, teclado — encima) y, mientras el offset aplicado sea >0, **se auto-cura re-midiendo en un intervalo corto** hasta volver a 0, porque iOS a veces no emite ningún evento al cerrar la hoja de compartir y el offset se quedaba congelado. Sin esto, tras **compartir un enlace por Web Share a Facebook/WhatsApp/etc. y volver** a la PWA, o tras bloquear/desbloquear el móvil, el reproductor quedaba "flotando" en mitad de la pantalla con canciones por debajo. La misma compensación se aplica en **`BackToTop`**.

### Navegación segura con la música sonando

El mini reproductor es un overlay `position: fixed` que **persiste entre rutas** (renderizado con `createPortal` en `<div id="ob-audio-overlays">` bajo `document.body`, con su propio `DeckAudioContext.Provider`). Esa persistencia provocaba tres clases de bug que ya están corregidas:

- **Pointer capture pegado (menú/footer dejaban de responder).** Antes la barra de seek llamaba a `setPointerCapture(pointerId)` en cada `pointerdown`. Si una navegación de Next.js (o un cambio de pestaña / iOS WebView) reemplazaba el árbol React **antes** de que llegara `pointerup`, la captura quedaba viva sobre el `<div>` del seek y **todos** los clicks siguientes iban a parar ahí en vez de a la página: el síntoma era "los enlaces del menú no van, tengo que pulsar STOP para que vuelvan". **Solución:** la barra ya no usa `setPointerCapture`; en `pointerdown` registra `pointermove`/`pointerup`/`pointercancel` sobre `document` con el `pointerId` del gesto, y los desmonta al terminar. Una segunda red de seguridad (`visibilitychange` / `pagehide` / `blur`) aborta el drag si la pestaña se oculta.
- **Lluvia de re-renders del rAF que bloqueaba las transiciones de `next/link`.** El tick de progreso usaba `requestAnimationFrame` con `setPreviewProgress(audio.currentTime)` ~60 veces por segundo. Como `previewProgress` forma parte del valor del contexto, **cada consumidor de `useDeckAudio` se re-renderizaba en cada frame** (`TracksSection`, `ChartView`, `BeatportTopTracks`, `BackToTop`…). En React 18 + App Router las navegaciones de `next/link` viven dentro de una transición interrumpible: si llegan `setState`s de alta prioridad más rápido de lo que el árbol nuevo puede comprometer, la transición se reinicia indefinidamente y la página de destino **nunca llega a montar**. El síntoma exacto era *"sigue sonando la música, el menú no responde, en cuanto le doy a STOP la página a la que quería navegar carga de golpe"*. **Solución:** el rAF de preview tira `setState` como mucho cada ~120 ms (≈8 fps, más que suficiente para una barra fina); el del deck hace lo mismo con `setProgressA/B` (la rotación del plato sí sigue a 60 fps porque solo se ve en `/`). Con ~7× menos updates de contexto, el scheduler de transiciones tiene tiempo de respirar y las rutas se montan limpiamente mientras la música sigue sonando.
- **Reproductor flotando a mitad de pantalla en PWA iOS.** En modo standalone (PWA), el *layout viewport* y el *visual viewport* pueden desincronizarse (cambio de altura de la barra del sistema, bloqueo/desbloqueo, status bar y sobre todo **compartir por Web Share a Facebook/WhatsApp y volver**). Un `position: fixed; bottom: 0` puro acababa pintando la barra en mitad de la página con canciones visibles por debajo. **Solución:** `MiniPlayerShell` y `BackToTop` usan el hook compartido **`useViewportBottomOffset`**, que escucha `visualViewport.resize` / `scroll`, `pageshow`, `focus`, `orientationchange` y `visibilitychange`, y re-mide a 80/250/600/1200 ms tras cada despertar porque iOS tarda algunos frames en reportar el viewport real al recuperar el foco. El hook suma `innerHeight − (vv.height + vv.offsetTop)` al `bottom`, **descarta mediciones transitorias** (página oculta o desfase >40% de la altura, que solo ocurre con la hoja de compartir / teclado encima) y **se auto-cura**: mientras el offset aplicado sea >0 sigue re-midiendo en un intervalo corto hasta volver a 0, cubriendo el caso en que iOS no emite ningún evento al cerrar la hoja de compartir. Combinado con el portal a `<body>`, la barra se mantiene pegada al borde visible en cualquier estado del viewport (PWA, navegador, tras sleep/wake, tras share-and-return).

Todo está en `src/components/DeckAudioProvider.tsx` (función `MiniPlayerShell` para el pointer, los dos `useEffect` con `requestAnimationFrame` para el throttle).

### `PreviewAutoplayOverlay` (autoplay con enlace compartido)

Si `loadAndPlayPreviewAt` recibe **`NotAllowedError`** (política de autoplay al abrir Whatsapp/enlace en pestaña nueva), el provider pone **`previewBlocked`** y muestra un modal a pantalla: una sola tarjeta **▶ TOCA PARA ESCUCHAR** que llama a **`togglePreview()`** con el primer gesto del usuario. La carátula usa **`next/image`** vía **`/_next/image`** para evitar el **403** de hotlink de Beatport que provocaría un `<img>` directo. Si la imagen falla, placeholder **♪**. Se limpia al reproducir correctamente o al **`stopPreview`**. Código en `DeckAudioProvider.tsx`.

La barra sigue emitiendo `OB_CHART_PLAYALL_BAR_EVENT` para que `BackToTop` suba su botón de scroll mientras está visible (su offset también lleva los `+10px` para encajar con la nueva altura). Además, `BackToTop` aplica la **misma compensación de `visualViewport`** que el reproductor para no quedar flotando a mitad de pantalla en PWA iOS.

Detalle técnico y tabla de archivos en [README.md — Global audio system](./README.md#global-audio-system-lazydeckaudioprovider--deckaudioprovider).

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

Al navegar entre **`/en` y `/es`**, se **remonta** el segmento `[lang]` (incluido **`LazyDeckAudioProvider`**). El estado de reproducción en memoria no se conserva entre locales; si `sessionStorage` marca sesión activa, el bundle de audio puede volver a cargarse en el nuevo idioma sin restaurar la cola anterior automáticamente.

---

## Roadmap (resumen)

Hecho: Supabase en listados, miniaturas y Storage, auth (login, **`/auth/confirm`**, callback OAuth, recuperación → **`/reset-password`**, plantillas en `mailing/supabase/`), dashboard, **JSON + `db:artist`**, **`/administrator`**, **vistas de listado** en las cinco secciones de referencia, **sitemap + robots** (`sitemap.ts`, `robots.ts`), segmento `/artists` sin caché agresiva de HTML, **GA4** (`@next/third-parties/google` + Consent Mode y cookies), **optimización CWV** (audio lazy, fuentes diferidas, preload Unbounded 900, banner cookies/modal charts fuera del LCP, SEO home breakbeat).  
Pendiente: RSS, modo oscuro, etc. Ya hechos: **Búsqueda global** (*Buscador global*), **OG por sección** — home/mixes/charts (screenshots), **eventos = cartel a pantalla completa**, y overrides por canción (ver *Open Graph*).

---

## Licencia

Todos los derechos reservados © 2026 Optimal Breaks.
