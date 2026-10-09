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

**Fechas de release con día (YYYY-MM-DD):** todas las listas de canciones (New Releases, Selecciones de archivo, Top 10 de Beatport en artistas/sellos, **Mis Tracks** propio y público, Top de la Comunidad, Almas Gemelas, panel admin de Tracks y buscador ⌘K) muestran el **día completo** cuando se conoce, con fallback al año. Migración **`057_chart_featured_tracks_release_date.sql`** añade `chart_featured_tracks.release_date DATE`; la columna existe también en `chart_tracks.release_date` y dentro del JSONB `beatport_top_tracks` (artistas/sellos). Scrapers (Beatport `__NEXT_DATA__.publish_date`, Bandcamp `data-tralbum.album_release_date`) integrados en `chart-featured-upsert.mjs --enrich-release-dates`, `chart-40-breaks.mjs`, `beatport-top-tracks.mjs`. Para snapshots ya guardados: `scripts/saved-tracks-backfill.mjs` rellena `release_date` de forma **aditiva** (`mergeSnapshotAdditive`); flag `--scrape-beatport` para huérfanos. Helpers en `src/lib/share-track.ts` (`formatTrackReleaseDisplay`, `effectiveReleaseYear`, `releaseSortTimestampMs`). Detalle EN: [README.md — Track release dates](./README.md#track-release-dates-full-day-vs-year).

**Veto editorial — DistroKid / TuneCore / agregadores:** son **distribuidoras**, no sellos de escena. La cadena puede aparecer en picks de Beatport, pero **no** se crea fila en `labels` ni ficha `/labels/…`. Tampoco se dan de alta majors genéricos (Polydor, Columbia, OWSLA/Atlantic, etc.) solo por frecuencia en charts. **Vazteria X:** pidió no formar parte de la web; las **canciones sí**, la **ficha no**. No recrear `/artists/vazteria-x` ni proponerlo en auditorías de «artistas sin ficha» aunque salga arriba en los saves del admin (`contacto@eskaladigital.com`). Lista completa: [README.md — Editorial vetoes](./README.md#editorial-vetoes-entities-not-to-create); detalle operativo: [`docs/USER_ENGAGEMENT.md` — Artist profile opt-outs](./docs/USER_ENGAGEMENT.md#artist-profile-opt-outs-no-artists-ficha). Ampliar **solo** tras confirmación explícita.

**Descubrimiento desde charts (umbrales editoriales):** cruzar las filas históricas de **`chart_tracks`** (40 Breaks; la lista ya no es pública) + **New Releases** (ediciones publicadas; el archivo YouTube no cuenta). **Artistas:** alta con agente si tienen **≥ 3** créditos y aún no están en `data/artists/` (`npm run db:chart:artists:agent -- --bootstrap-min-freq=3 --bootstrap-only`). **Sellos reales:** alta solo con **≥ 10** apariciones del string `label` (excluyendo DistroKid/TuneCore/majors); por debajo se aparca. Detalle EN + comandos: [README.md — Discovering artists & labels from charts](./README.md#discovering-artists--labels-from-charts). Regla Cursor: `.cursor/rules/charts-catalog-discovery.mdc`.

**Correos de autenticación (plantillas HTML para Supabase):** [`mailing/supabase/README.md`](./mailing/supabase/README.md) — confirmación de registro, invitación, magic link, cambio de correo, recuperación de contraseña, reautenticación. Flujo técnico actualizado en [README.md — Authentication](README.md#authentication-supabase-auth-and-email-templates).

**Campañas (Mis Tracks, avisos de producto):** SMTP OVH + `npm run mail:campaign`. Diseño, JPEG incrustado, bilingüe, `--test` antes de `--send`. Guía: [`docs/GUIA_MAILS.md`](./docs/GUIA_MAILS.md).

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

### Miniaturas del catálogo con `next/image` (`CardThumbnail`, sep 2026)

Carteles, retratos y logos se guardan a tamaño original (medido el 28 sep 2026: **114 carteles de eventos = 38,6 MB**, media 340 KB, dos de más de 1 MB) y se pintaban con `<img>` crudo en tarjetas de 56–400 px: `/events` bajaba ~39 MB. `src/components/CardThumbnail.tsx` (eventos, artistas, sellos, escenas, blog, home, favoritos…) pinta ahora **`next/image` con `fill` + `sizes`**: Vercel Image Optimization sirve la anchura que necesita la tarjeta, en WebP, cacheada en el edge (`images.minimumCacheTTL: 86400`; los carteles de eventos llevan `?v=updated_at`, así que un reemplazo no se queda atrapado en esa caché).

- **`sizes`** por defecto = tarjeta del catálogo (`100vw / 50vw / 400px`). Pásalo más ajustado donde el marco es menor: `EventsExplorer` usa `LARGE_POSTER_SIZES`, `COMPACT_POSTER_SIZES` (10 columnas → `10vw`), `LIST_POSTER_SIZES` (`56px`) y `CALENDAR_MODAL_POSTER_SIZES`. Un `sizes` mal puesto = otra vez la descarga completa.
- **`preload`** (nombre en Next 16; `priority` está deprecado) en las primeras tarjetas del primer grupo de año (5 en grande, 10 en compacto) para el LCP; el resto sigue `loading="lazy"`.
- Hosts fuera de `images.remotePatterns` (`next.config.js`) caen solos a `unoptimized` (`canOptimize`) en vez de un 400 del optimizador. Si añades un CDN de imágenes, amplía la config y `OPTIMIZABLE_HOST`.
- URLs rotas (404 en Storage) siguen cayendo al placeholder de marca (`onError`).
- Página `/events`: la cabecera sale al instante y el listado llega por streaming dentro de `<Suspense fallback={<LoadingBreaks/>}>` (mismo patrón que `/charts` y `/top100`).

No volver a `<img>` en `CardThumbnail` ni poner `unoptimized` global.

- **Audio global diferido:** **`LazyDeckAudioProvider`** en el layout; **`DeckAudioProvider`** solo se importa al **primer Play** (deck, mix, preview) o si **`sessionStorage`** (`ob_audio_active`) indica sesión activa. Hooks **`usePreviewAudioGated`** / **`useMixAudioGated`** en charts, Top 10, mixes y Mis Tracks; cabina home con controles offline hasta el primer gesto. El provider mantiene un **shell estable** alrededor de `{children}` (no remonta el árbol de la página al cargar el motor — el acordeón de `/charts` no se colapsa al primer play) y **portala** el reproductor a `<div id="ob-audio-overlays">` bajo `document.body` para que `position: fixed` siempre ancle al viewport real. Tanto **`MiniPlayerShell`** como **`BackToTop`** compensan el **`visualViewport`** en **PWA iOS** (`resize` / `scroll` / `pageshow`) para que tras bloquear/desbloquear el móvil sigan pegados al borde inferior visible.
- **Fuentes:** subsets **latin** de Unbounded en layout + **preload** del woff2 del 900; Special Elite fuera del CSS bloqueante (`DeferredFonts`).
- **Otros:** `DjDeck` con `dynamic()`. **Tracks** (URL `/charts`, mismo nombre que el menú) y **Top 100** son las dos puertas: van las primeras en el menú (amarillo y rojo), en una franja bajo la cabecera en el resto de páginas públicas (no en la home, ni en esas dos rutas, ni en el admin), en dos franjas de la home, en el cierre rojo y en una banda negra del pie. No quitarlos. Modal de charts solo tras engagement (2ª página o 40 s). Invitados: como mucho cada 24 h. Logueados: cada 3,5 días. Nunca en `/charts`. El cartel pide el **+** (esos saves arman el Top de temas y el de artistas). GA/SW/BackToTop dinámicos; **`/history`** con revalidate 300; quitado `force-dynamic` del layout global.
- **Caché de lecturas públicas de Supabase (Disk IO, agosto 2026):** la instancia agotó su **Disk IO Budget** (cada visita, bots incluidos, lanzaba todas las consultas del catálogo sin caché y el middleware llamaba a Auth sin timeout) y el sitio entero cayó con **504 `MIDDLEWARE_INVOCATION_TIMEOUT`**. Solución: compute **Nano → Micro** y, en la app, **`createCachedSupabase()`** (`src/lib/supabase-server.ts`) — cliente sin cookies cuyas lecturas van a la **Data Cache** de Next/Vercel con `revalidate` **300 s** — en todo el catálogo público (home, charts, artists, labels, events, mixes, scenes, blog, history, organizations, sitemap, buscador y OG de Stories). El **middleware** solo llama a Auth si hay cookies de sesión y aborta a los **2,5 s**. Los cambios en BD tardan **≤ ~5 min** en verse en la web pública (el admin ve datos vivos). **No** volver a `createServerSupabase()` en páginas públicas ni usar el cliente cacheado para datos por-usuario o escrituras. Regla: `.cursor/rules/supabase-cache-lecturas-publicas.mdc`.
- **Lecturas paginadas (`src/lib/supabase-paginate.ts`, 28 sep 2026).** PostgREST corta en silencio a **1.000 filas** y la Data Cache **tira las entradas de más de 2 MB**. `fetchAllPages` (artistas, eventos, mixes, mapas de slugs de `/charts`) y `fetchAllPagesParallel` (el esquema de `/charts`) leen **páginas de 500** con un `ORDER BY` estable: no se pierde nada y cada página cabe en la caché. No sustituirlos por un `select` sin tope.
- **Índices de crecimiento (migración `082_growth_indexes.sql`, aplicada).** `release_year` / `release_date` en featured, `year` en vinilo, ediciones publicadas por semana, `events.date_start`, `mixes (year, created_at)`, `saved_chart_tracks (user_id, created_at)`. Sin ellos el archivo por año y los listados por fecha recorren la tabla entera.
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

**SMTP propio (OVH, etc.):** Auth (opcional en el dashboard) y **campañas** (`SMTP_*` en `.env.local`, `npm run mail:campaign`). Desactiva el tracking de enlaces que reescriba URLs. Campañas: [`docs/GUIA_MAILS.md`](./docs/GUIA_MAILS.md).

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
- Rutas **`/artists`**: leen Supabase vía **`createCachedSupabase()`** (Data Cache, `revalidate` 300 s) — lo publicado en BD tarda **≤ ~5 min** en verse en la web pública. Se mantienen las cabeceras **`no-store`** en `next.config.js` (el HTML no se queda viejo en CDN) y el **service worker** sigue sin guardar HTML de `/artists`. El antiguo `revalidate 0` + `fetchCache force-no-store` se retiró en agosto 2026: hacía que cada visita golpease Supabase y contribuyó a agotar el Disk IO Budget (504 en todo el sitio). El acordeón **En Optimal Breaks** (`ArtistFeaturedTracks`) lista New Releases, archivo digital (Beatport/Bandcamp anterior a 2026) y archivo YouTube (`chart_vinyl_tracks`). No lista los 40 Breaks. El nombre cuenta si está en `artists[]` **o** es el remixer (`mix_name` / `remixers[]` de Beatport); ver [Remixer = crédito de artista](#new-releases-novedades-editoriales-en-charts). Es una **lista única**: mismo título + artistas = una fila, aunque el tema esté como single y como corte de álbum (IDs Beatport distintos) o como Original Mix e Instrumental. **No se borran** filas del catálogo (los «+» siguen en su UUID); el merge guarda todas las copias en `relatedRefs` para que el botón las cubra. Un remix con nombre no se fusiona. El «+» del **Top 10 de Beatport** de la misma ficha usa esas refs (`collectSaveRefsFromOnSitePicks`): si el tema ya está guardado en En Optimal Breaks, el del Top 10 sale marcado, también cuando el save no tiene `canonical_url`.

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

## Cómo entran las canciones

Hay dos vías. No entra ninguna otra en el catálogo público.

1. **Top 10 de la ficha.** Al dar de alta o refrescar un artista o un sello se guarda el Top 10 de ventas de Beatport (`artists.beatport_top_tracks` / `labels.beatport_top_tracks`). Solo se ve en esa ficha. Si alguien pulsa «+», Mis Tracks lo guarda con origen `beatport_top`: la URL y un snapshot van en el propio save. No se crea una fila de chart.
2. **Enlaces que pasa el equipo.** Beatport o Bandcamp van a `chart_featured_tracks`. Si el enlace es de YouTube, primero se busca el mismo tema en Beatport o Bandcamp. YouTube (`chart_vinyl_tracks`) solo cuando no hay ficha usable en tienda (histórico, white label, bootleg o rip). Un **tema suelto** que el artista solo comparte por SoundCloud también va a `chart_featured_tracks`: no es sesión y no entra en `/mixes`.

La fecha de lanzamiento decide dónde se ve en `/charts`. No manda el día en que se pega el enlace.

- Tienda, lanzamiento **desde el 1 de enero de 2026**: **New Releases**, en el lunes ISO de la semana del release.
- **Adelanto:** si Beatport ya lista el tema con fecha futura, entra en esa semana aunque todavía no haya salido. La fila lleva fondo amarillo y el banner «ADELANTO — SALE EL …» (lo mismo en la ficha del artista). En esa fila no hay Spotify ni TIDAL: solo Beatport. El día del release el destaque se quita solo y vuelven los botones de streaming. La chapa **ACTUAL** es la semana que contiene hoy, no la más lejana. No se borran.
- Tienda, lanzamiento **anterior a 2026**: **Selecciones de archivo**, cada año en su grupo (2004, 2022, 2025…), misma tabla `chart_featured_tracks`.
- YouTube sin tienda: **siempre** Selecciones de archivo, por el año del tema, aunque el lanzamiento sea de 2026. No entra en la lista semanal.
- **Tema de SoundCloud** (sin Beatport ni Bandcamp): misma regla de semana que una tienda (`platform: "soundcloud"`). `link_url` es el permalink humano. Si el tema es privado (`/s-TOKEN`), `sample_url` es la URL de API del oEmbed (`https://api.soundcloud.com/tracks/<id>?secret_token=s-…`); el permalink responde 404 dentro del widget. El ▶ usa la **misma barra de abajo** que Beatport (`MiniPreviewBar`, `PreviewTrack.soundCloudUrl`, widget oculto `SoundCloudWidget`). No debe abrir «Toca para escuchar»: el clic de la fila ya es el gesto. En `next.config.js`, `script-src` y `connect-src` tienen que permitir `https://w.soundcloud.com` (y `api.soundcloud.com` en `connect-src`); si no, `player/api.js` no carga, el iframe puede sonar y la barra se queda en 0:00. Ejemplo: WeZ WhaTevR — *I Need You* (Zero Dark, lanzamiento 2026-10-02, semana `2026-09-28`). Estuvo un momento dado de alta como mix y se quitó.

Una misma canción puede estar a la vez en un Top 10 y en New Releases. El «+» se reconoce por la URL de Beatport y no duplica el voto.

**40 Breaks Vitales** (`chart_tracks`) no es una vía de entrada. Desde el 27 sep 2026 no se lista en la web. Las filas siguen en la base por los saves antiguos y los enlaces `?play=chart:`. Los temas que solo estaban ahí se copiaron a New Releases o al archivo según su fecha de lanzamiento.

### Pase diario de Beatport — 12:05 Madrid (desde el 8 oct 2026)

Un solo trabajo, dos vías, en este orden. Código: `src/lib/beatport-genre-import.ts` (`runBeatportGenreImport`). Programador: **GitHub Actions**, `.github/workflows/beatport-daily.yml` → `scripts/beatport-daily-import.ts` (desde el 9 oct 2026; ver *Dónde corre*). Admin: `/administrator/imports` + `src/app/api/admin/imports/route.ts`. Tablas: `chart_import_queue` (cada decisión), `chart_import_runs` (una fila por pase). Migración `089`.

1. **Artistas del Top 100 → publicados.** Por cada artista del tablero Top 100 (`loadTopArtistKeys`, 100 nombres) con `artists.beatport_id`, el pase lee `beatport.com/artist/<slug>/<id>/tracks?publish_date=2026-10-08:` — **cualquier género**, fechas futuras incluidas. Todo lo nuevo se inserta en `chart_featured_tracks` en la semana ISO de su release y queda apuntado como `approved / auto_top100`. Nunca aparece en Imports.
2. **Lista de Breaks → pendientes.** Después, `genre/breaks-breakbeat-uk-bass/9/tracks?publish_date=2026-10-08:`. Cada tema se identifica por su **id de Beatport** y por su **identidad de canción** (`trackDisplayIdentityKey`: título + versión + artistas). Si ya está en el catálogo, ya está en la cola, ya lo trajo la vía 1 o es **la misma canción resubida con otro id → se descarta** (`skipped_known`). Thierry D resubió el 8 oct 2026 catorce cortes que estaban en la web desde abril–agosto; el chequeo solo por id los dejó pasar a la cola y se descartaron a mano. Lo que sobrevive entra en `chart_import_queue` como `pending`: el editor lo incluye o lo descarta en `/administrator/imports`. Si en los créditos (artista, crédito partido o remixer en `mix_name`) va alguien del Top 100 — un artista sin ficha de Beatport, p. ej. Hatstandy — se publica directo.

La página pública de Breaks con la que se compara es la de **releases**; el pase lee **tracks**. Un release con siete remezclas sale una vez allí y aquí una fila por cada corte etiquetado Breaks (Budakid — *Dreams Stretched Beyond Remixes*: solo *Is No Ova (Fort Romeau Remix)* es Breaks, así que solo ese entra en la cola).

**Por qué a las 12:05.** Beatport publica la tienda del día sobre las 09:00 GMT (11:00 en España en verano). A las 00:10 la lista pública de Breaks del día aún no existe; las fichas de artista ya enseñan las fechas programadas, así que la vía 1 correría y la vía 2 no encontraría nada. El workflow lleva dos horas UTC (`5 10` verano, `5 11` invierno) y el script solo sigue si `madridHour() === 12`; la otra sale sin escribir pase. Un salto por hora **no deja fila** en `chart_import_runs`; un fallo deja `ok = false` con la primera línea del error.

**Dónde corre (9 oct 2026).** El pase lee ~100 fichas del Top 100 más el listado de Breaks con un navegador de verdad, un contexto nuevo por página por Cloudflare: **unos 3 minutos con Chrome**, más con el Chromium de Sparticuz en una lambda. Vercel mata la función a los **300 s**. El cron de las 12:05 en Vercel del 9 oct arrancó, no terminó y lo cortaron a media lectura: sin `finished_at`, nada escrito, y la fila abierta bloqueó cualquier otro pase durante 15 minutos (`already-running`). Así que el pase programado se fue a **GitHub Actions** (`.github/workflows/beatport-daily.yml`): `ubuntu-latest` trae Google Chrome, no hay tope de 5 minutos y el paso lanza el mismo `scripts/beatport-daily-import.ts` con los dos secretos del repo `NEXT_PUBLIC_SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (puestos con `gh secret set` desde el token de optimalbreaks). `vercel.json` ya **no tiene `crons`** y la ruta `/api/cron/beatport-releases` se borró. Verificado el mismo día con un lanzamiento manual: 98 fichas + listado leídos desde GitHub en 3 minutos, Cloudflare dejó pasar, `ok = true`. Pases: [Actions → Pase diario de Beatport](https://github.com/optimalbreaks/optimalbreakswebsite/actions/workflows/beatport-daily.yml); ahí **Run workflow** es el disparo manual (`force` = saltar la puerta de la hora). Solo **«Traer ahora»** sigue en Vercel (`/api/admin/imports`, 300 s): ahora lleva `budgetMs: 230_000`, deja de leer cuando se le acaba, guarda lo leído y cierra el pase con `ok = false` y *Tiempo agotado: leídas N de M fichas…* — parcial a propósito; el pase de GitHub lo completa.

**Navegador en Vercel** (ya solo «Traer ahora»). `playwright-core` 1.49 + `@sparticuz/chromium` 131 (`serverExternalPackages` + `outputFileTracingIncludes` en `next.config.js`, 2048 MB / 300 s en `vercel.json`). Dos trampas, las dos sufridas el 8 oct 2026:
- Fluid Compute no pone `AWS_LAMBDA_JS_RUNTIME`, así que Sparticuz no descomprime `al2023.tar.br` y el binario muere por `libnss3.so`. `openBrowserReader` fija `AWS_LAMBDA_JS_RUNTIME=nodejs22.x` antes de importarlo y borra un `/tmp/chromium` a medias si no existe `/tmp/al2023/lib/libnss3.so`.
- Los `args` de Sparticuz son para Puppeteer: `--single-process` y un `--headless='shell'` con comillas. Con Playwright el proceso arranca y muere en el primer `newContext` (*Target page, context or browser has been closed* — el cron de las 10:10 UTC). El lanzador ahora quita las dos y pasa `--headless=shell` con `headless: false`, para que Playwright no añada el flag del headless nuevo que el binario shell no sabe correr.
En local el pase usa el Chrome instalado (`channel: 'chrome'`), no Sparticuz. Beatport responde 403 (Cloudflare) al `fetch` plano; la vía que funciona es el navegador.

**Pases del 8 oct 2026.** 06:35 UTC recuperación local: 193 vistos / 15 publicados (Ravesta, 9 oct) / 0 en cola. 06:43 UTC «Traer ahora» en Vercel: libnss3. 10:10 UTC cron: navegador cerrado. 11:44 UTC local `--force`: **267 vistos / 3 publicados / 51 pendientes / 213 conocidos**. Comprobado ese mismo día con el matching del propio importador: **0 de los 51 pendientes acreditan a un artista del Top 100.**

**Pases del 9 oct 2026.** 10:05 UTC cron de Vercel: cortado a los 300 s, fila cerrada a mano. 10:13 UTC local `--force` (recuperación): **461 vistos / 16 publicados / 153 pendientes / 292 conocidos** (el viernes es día de lanzamientos). 10:19 UTC lanzamiento manual en GitHub Actions: 379 vistos, todos conocidos, `ok = true` — la tubería desde GitHub funciona. Desde el 10 oct el pase de las 12:05 es el de GitHub.

Si aun así un día falla (pase en rojo en Actions, o ninguna fila de hoy en `chart_import_runs`), o se pulsa **Run workflow** en Actions o se lanza desde un PC:

```powershell
$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npx tsx scripts/beatport-daily-import.ts --force
```

**Dónde se ve lo publicado.** Un tema que entra por el pase o por «Incluir» es una fila normal de `chart_featured_tracks`: sale en `/charts` (su semana) **y** en el acordeón «En Optimal Breaks» de la ficha del artista y del sello (`fetchArtistFeaturedPicks`, por `artist_names_text` y remixer). Las dos lecturas van por la Data Cache con tags distintos (`public-charts` y `public-catalog`); el import y `decideImport` invalidan **los dos**. Hasta el 9 oct 2026 solo invalidaban el de charts, y la ficha tardaba hasta 5 min en enseñar el tema (Dub Elements — *Poisioned By Bass*). El script de GitHub pasa por `/api/revalidate` con `catalog: true`, que ya cubría ambos.

**Es la misma alta de siempre.** `publishFeaturedPick` hace el mismo `insert` que el import de enlaces del admin (`featured-import`): mismos campos, semana por fecha de release, remixer en `artists[]`, `spotify_url`/`tidal_url` a `null`. Lo único que el flujo antiguo tenía como paso manual era el matching de streaming después de publicar una semana. Desde el 9 oct 2026 lo hace el mismo workflow tras el pase: `spotify-match-charts.mjs --service=spotify|tidal --table=featured --from=<hoy−14 d> --until=<mañana>` (secretos `SPOTIFY_*` / `TIDAL_*` en el repo). Solo temas ya a la venta: un adelanto no está en las tiendas y la regla `charts-enlaces-streaming` ya le quita los botones. Los que la tienda aún no tenía se reintentan cada día durante dos semanas. Esos pasos van con `continue-on-error`: un 429 de cuota de Spotify no pone el pase en rojo.

`--force` salta la puerta de la hora y apunta `trigger = manual`. Se puede repetir: los ids e identidades conocidos se saltan. Si una fila de pase se queda abierta (sin `finished_at`, más de 15 minutos), el siguiente pase la ignora; si es más reciente, se cierra a mano antes de repetir.

**No:** filtrar `release_date > hoy` (los adelantos son una función), borrar filas de la cola «para limpiar», devolver el cron a medianoche, volver a programarlo en Vercel (300 s), volver a meter `--single-process`, inferir la semana por la fecha del pegado, ni esperar temas del Top 100 en Imports: ya están en `/charts`.

## `/charts` — carga progresiva (sep 2026)

**Por qué.** A finales de septiembre de 2026 el catálogo de `/charts` eran ~36 semanas de New Releases más **989 ediciones de archivo** (~11.200 filas, ~10 MB de JSON de PostgREST). La página lo bajaba y lo pintaba todo en cada visita: Vercel devolvía **5xx** en `/es/charts` y, cuando sobrevivía, abrir un año de ~1.900 filas dejaba la pestaña bloqueada. Arreglado el 28 sep 2026 (`5b13320f`, `e2ac4a89`).

**Modelo.** El servidor pinta solo el **esquema**; los temas de cada sección se piden cuando se abre o se reproduce esa sección.

| Pieza | Dónde | Qué hace |
|---|---|---|
| `loadChartsOutline(supabase)` | `src/lib/charts-sections.ts` | Selects finos (`id, link_url, release_date, release_year, chart_edition_id`) sobre ediciones publicadas → `pickWeeks[]` (semana, **recuento**, nº de edición, `isLatest`) y `archiveYears[]` (año, **recuento**, vinilo + digital deduplicados igual que el render completo). Los números de cada cabecera son reales sin enviar filas. |
| `loadPickWeek(supabase, week)` | ídem | Filas completas de una semana de New Releases (`select('*')`, solo picks no-archivo). |
| `loadArchiveYear(supabase, yearKey)` | ídem | Featured cuyo release cae en ese año (rango `release_date` **o** `release_year`) + `chart_vinyl_tracks.year`, deduplicados (`vinylTrackDedupKey` / `link_url` en minúsculas) y devueltos como `ArchiveSectionRow[]` (`{kind:'vinyl'\|'featured', …, weekDate}`). `__unknown_year__` = filas sin fecha. |
| `locateChartTrack(supabase, id)` | ídem | Dado un UUID featured o vinyl devuelve `{kind:'picks', week}` o `{kind:'archive', year}`. Lo usan los deep-links. |
| `GET /api/public/charts/section` | `src/app/api/public/charts/section/route.ts` | `?kind=picks&week=YYYY-MM-DD` → `{tracks}`; `?kind=archive&year=YYYY\|__unknown_year__` → `{rows}`; `?kind=locate&id=<uuid>` → `{target}`. Lee con **`createCachedSupabase(300, [PUBLIC_CHARTS_CACHE_TAG])`** (Data Cache, misma política de 5 min que toda lectura pública). |
| `src/app/[lang]/charts/page.tsx` | | Pinta **h1 + subtítulo al instante** y hace streaming del cuerpo: `<Suspense fallback={<LoadingBreaks/>}><ChartsBody/></Suspense>`, donde `ChartsBody` (server component async) llama a `loadChartsOutline` + mapas de slugs de artistas/sellos y monta `<ChartView hideHeader sharedLandingHandled>`. Un `?play=` compartido se resuelve en la misma petición (`resolveSharedLanding`) y **`SharedTrackLanding` se pinta antes de ese Suspense**, así que el emergente va en el HTML inicial, por encima de «Cargando los charts». Mismo aspecto que `/top100` (cabecera arriba, cargador fanzine debajo). Sin `loading.tsx` de ruta a propósito: metería un destello del cargador solo antes de la cabecera. Sigue con `dynamic = 'force-dynamic'` (`?week=`, `?play=`). |
| `ChartView.tsx` | | Estado cliente: `pickByWeek`, `archiveByYearLoaded` (guardado **ya ordenado** A–Z), `pickPhase` / `archivePhase` (`loading` / `error` + botón reintentar), `archiveVisible` (filas pintadas por año), `pendingPlayAll`. |

**Comportamiento en cliente.**

- **Abrir una semana / un año** → `loadPicks(week)` / `loadArchive(year)`: un fetch por sección, con un `Set` en ref para no pedir dos veces la misma. «Cargando temas…» mientras llega; «No se han podido cargar. Reintentar.» si falla.
- **Los años del archivo se pintan por tramos de `ARCHIVE_PAGE = 60`.** Un pie `RevealMoreRows` (`IntersectionObserver`, `rootMargin: 400px`) pinta los 60 siguientes según bajas y sirve a la vez de botón «Ver más (N restantes)». Se ordena una sola vez al recibir las filas; el bundle de «reproducir todo» y el mapa fila→índice se memorizan por año (`archiveBundles`), no se recalculan en cada render. Eso es lo que quitó el bloqueo.
- **▶ Reproducir todo sin expandir.** Toda cabecera de semana/año con `count > 0` muestra el botón aunque sus filas no existan aún. Al pulsarlo se fija `pendingPlayAll = 'archive-<año>' | 'picks-<semana>'`, se pide la sección y, al llegar, un efecto la abre, llama `playFromIndex(sección, bundle, 0)` y arma el modal «Toca para escuchar» de respaldo (patrón ⌘K: el `play()` ya no corre dentro del gesto del clic, así que WebKit móvil puede bloquearlo; el modal se cierra solo si el audio arrancó). «Reproducir todo» encola la sección **entera**, no solo las 60 filas pintadas.
- **Los deep-links siguen funcionando** sin el catálogo en memoria. Un `?play=featured:|chart:|vinyl:<id>` compartido ya enseña **`SharedTrackLanding`** en el HTML inicial (ver *Aterrizaje directo en `/charts`* más abajo). ChartView sigue llamando a `?kind=locate`, abre la semana/año (mostrando las semanas ocultas tras las 10 primeras si hace falta), la pide, **revela filas hasta el destino** (`revealArchiveRow`), hace scroll + destello y quita `?play=`. Con `sharedLandingHandled` solo **amplía la cola** (`extendPreviewQueue`, mismo `src`, sin reiniciar) y **no** arma un segundo modal de tap. ⌘K `#chart-row-<id>` / `#chart-vinyl-row-<id>` + `?play=1` no cambia: intento de play y, si el navegador lo bloquea, el overlay del provider. Los formatos de URL de compartir no cambian.
- **La agrupación de saves entre secciones** (`canonicalGroups` → `SaveTrackButton relatedRefs`) se calcula sobre las secciones cargadas hasta el momento.

**No** volver a meter el fetch del catálogo completo en `page.tsx`, ni sacar la API de secciones del cliente cacheado, ni pintar un año entero de golpe, ni meter `SharedTrackLanding` dentro del Suspense de los charts, ni armar `TapToPlayOverlay` en un enlace que el aterrizaje de servidor ya ha pintado. Si un año vuelve a ir lento, se ajusta `ARCHIVE_PAGE`, no la arquitectura. Reglas Cursor que siguen vigentes: `supabase-cache-lecturas-publicas`, `reproductor-exclusion-audio` (enlaces compartidos → modal, portal por encima del banner de cookies), `charts-ids-inmutables-saves`.

**Dev en local detrás del proxy Acttax:** Node no fía el certificado del proxy (SSL inspection) y todos los `fetch` a Supabase fallan con `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (`/charts` lanza el error; la home lo traga y sale vacía). Arrancar con `$env:NODE_TLS_REJECT_UNAUTHORIZED='0'; npm run dev`. No es un bug del repo ni ocurre en Vercel.

## Verificación en local — 28 sep 2026 (noche)

Ronda de auditoría del reproductor, de la carga de `/charts`, `/events` y `/mixes`, y de la paginación de PostgREST. El código ya estaba escrito; esta pasada lo compiló, ajustó el lint de esos archivos y lo probó en `http://localhost:3000`. **No se ha hecho push.** La migración `082_growth_indexes.sql` ya estaba aplicada en Supabase y no se ha vuelto a tocar. Los watchdogs de autoplay del preview no se han modificado.

### Compilación

| Comprobación | Resultado |
|---|---|
| `npm run build` (Next 16.3.3, Turbopack) | OK antes de los retoques de lint: TypeScript 12,4 s, 134 páginas. |
| `npx tsc --noEmit` | OK después de esos retoques. No se relanzó `next build` con el dev server abierto: Dropbox bloquea el renombre de `.next` (`EPERM`). |
| ESLint de los archivos de la ronda | 0 errores y 0 avisos. |
| `npm run lint` del repo entero | Sigue en rojo: **172 errores previos**, ninguno en los archivos de esta ronda (`admin-chat.ts`, `supabase.ts`, banner de cookies, etc.). No se han tocado. |

Un intento de lint con `-f unix` sale con código 2 porque ese formateador ya no viene con ESLint. No es un fallo del código.

### Ajustes de lint (el comportamiento se queda)

El compilador de React (`react-hooks/set-state-in-effect`, `immutability`, `preserve-manual-memoization`) marcaba los archivos de la ronda. No se ha revertido ninguna optimización para callar el aviso.

- **`DeckAudioProvider`:** `isPlaying` y `currentTrack` se derivan del crossfader y de `playingA` / `playingB` (mismo resultado, en el mismo render). El índice inicial del deck sigue en un efecto: si se calculara en el render, el HTML del servidor no coincidiría con el cliente. `stopMixInternal` va **antes** de `togglePlaySide` (antes se usaba sin estar declarado). El preload de la pista **siguiente** usa `assignAudioSrc` (`src/lib/audio-unlock.ts`); el `<audio>` que ya suena no pasa por ahí, así que un `src` igual no corta el audio arrancado en el gesto.
- **`proxy.ts`:** los tres `includes` de idioma usan el guard `isLocale()`, sin `as any`. Si `getClaims` no existe en el cliente instalado, el código sigue cayendo a `getUser()`.
- **`useUserData.ts`:** las filas de favoritos tienen tipo concreto. La carga al cambiar de usuario sigue en `useEffect`.
- **`EventsExplorer` / `YouTubeEmbed`:** el reset al cambiar filtro o al soltar el autoplay ocurre durante el render. El portal del calendario y `embedSrc` (necesita `window.location.origin`) siguen en efecto.
- **`artists/page.tsx`:** el select `bp_first:beatport_top_tracks->0` ya tipaba con cast. No se ha quitado.

### Pruebas (dev, anónimo)

| Prueba | Resultado |
|---|---|
| `/es/charts` semana 2026-09-21 | OK. Acordeón, Body Control y Nose Bleed. Petición `kind=picks&week=2026-09-21`. |
| Archivo 2024 | OK. `kind=archive&year=2024`, 1825 filas. |
| ▶ / siguiente / anterior | OK. Nose Bleed → Off the Rails → Nose Bleed. |
| `Cache-Control` de `/api/public/charts/section` | OK. `public, s-maxage=300, stale-while-revalidate=600`. |
| `/api/audio-proxy` con `Range: bytes=0-1` | OK. **206**, `Content-Range: bytes 0-1/1440899`, `audio/mpeg`. Sample de Beatport. |
| Portadas YouTube en `/es/mixes` | OK. `loading="lazy"`. El `src` es `/api/og/image-proxy?src=https://i.ytimg.com/...`. El navegador no pide `i.ytimg.com` directo. |
| SoundCloud | OK. Cero iframes al entrar. Al pulsar la portada monta `w.soundcloud.com/player` con `visual=true` y `auto_play=true`. |
| «Ver más» en mixes | OK. 74 tarjetas → 98 (+24, `MIXES_PAGE`). |
| Mix MP3 con URL rota | No ejecutable. Las 105 filas de `/es/mixes` traen `audio_url` nulo. El aviso y el reintento están en la mini-barra (`mixError` → ▶ llama otra vez a `playMix`). |
| «Ver más» en `/es/events` | OK. 2026 arranca en 40 (`EVENTS_PAGE`) y sigue por tramos de 40. |
| Calendario de eventos | OK. Sin «Ver más». 2026: 58 días con eventos. Es el año entero. |
| Una sola petición a `saved_mixes` | No ejecutable sin sesión. Sin usuario, `useFavoriteToggle` no pide nada. Con usuario, el almacén de módulo hace **una** consulta en vuelo por tipo (artista, sello, evento, mix), compartida por todas las tarjetas. |
| Portada, deck y crossfader | OK. ▶ en el deck A deja ■ STOP en el mismo tema (EPIC ODYSSEY) y `document.title` pasa a ese tema. El deck B no arranca. El crossfader se queda en **0** (el reposo ya no es 50: saltaba al cargar el motor). |
| Service worker | Revisión de código OK, sin `npm start`. En dev no se registra. Audio, vídeo, cabecera `Range`, `/music/`, extensiones de audio y peticiones cross-origin salen del `fetch` **antes** de cualquier `respondWith`. `CACHE_NAME` = `ob-v6`. |

### Lo que queda anotado y no se ha cambiado

- El deep-link `#mix-<id>?play=1` espera un frame y **160 ms** antes de buscar la tarjeta. Si ese render tarda más, el scroll no ocurre.
- En el calendario de 2026 había unos 90 nombres distintos en los `aria-label` y 88 en el listado ya expandido. La diferencia es de dos, no de un tramo de 40: un evento de varios días, o un nombre que ya contiene ` · ` (el botón junta los nombres con ese separador).
- `npm run lint` del repo no está limpio por los 172 errores previos de fuera de esta ronda.

**Archivo histórico desde Beatport (piloto).** `scripts/_archive-artist-discography.mjs` lee `/artist/…/tracks` con `publish_date` hasta el 31 dic 2025, agrupa cada tema en el lunes ISO de su release y hace **INSERT** en `chart_featured_tracks` (no borra picks ya publicados; un tema que ya está, mismo id Beatport, se salta). Lo de 2026 no entra por aquí: eso es New Releases (`--nr-2026` es el flag aparte). El progreso de cada lote (`scripts/_archive-*-progress.txt`) está en `.gitignore`.

## New Releases (novedades editoriales en `/charts`)

> **Regla invariante:** los picks se **clasifican por semana según la fecha de release del tema en la tienda** (para Beatport: el día que esa tienda muestra como release / `publish_date` en scrape). **`week_date` en JSON = lunes ISO de esa semana de release.** Nada más (ni el día en que pegas URLs ni “la siguiente fila temporal del repo”) determina esa semana; ver `.cursor/rules/charts-new-releases-supabase.mdc`.

- **Qué muestra producción:** filas **`chart_featured_tracks`** en Supabase (por **`chart_editions.week_date`**). La ruta **`/[lang]/charts` no lee** `data/charts/picks/*.json`.
- **Qué fichero usar:** la **`week_date`** de la edición es el **lunes** de la **semana del release en Beatport** (campo día del lanzamiento que devuelve la tienda). **No** se elige por la fecha del chat ni por «incrementar una semana respecto al último JSON**.
- **Solo disco / repo:** editar **`data/charts/picks/<semana>.json`** o ejecutar **`scripts/_append-batch-nr-from-releases.mjs`** (URLs Beatport → singles; puede escribir **uno o más** `<lunes>.json`): **solo actualiza Git**, no las filas que ve la web.
- **Publicar en Supabase (obligatorio para que el sitio muestre los nuevos picks):** **`npm run db:chart:featured -- data/charts/picks/<semana>.json`** (equiv.: `node scripts/guia-base-datos.mjs run chart-featured-file …`). Opciones en `chart-featured-upsert.mjs`: **`--create-edition`**, **`--enrich-release-dates --write-json`**, **`--backfill-remixer-credits`** (filas ya publicadas, sin JSON). En red con SSL inspection usa **`node --use-system-ca scripts/chart-featured-upsert.mjs …`** (`NODE_OPTIONS` con `--use-system-ca` rompe npm).
- **Sin paso JSON:** importación Beatport en **`/[lang]/administrator/tracks`** (API **`/api/admin/featured-import`**): escribe directamente en **`chart_featured_tracks`**.
- **Remixer = crédito de artista (agosto 2026):** Beatport deja el original en `artists[]` y el remixer en `remixers[]` / `mix_name` (`PhoenixRising Remix`, `Jem Haynes Remix`). Aquí el remixer es el **productor de la versión breakbeat** y debe figurar como artista: el import fusiona `artists` + `remixers` + nombres parseados de `mix_name` (`src/lib/remixer-credits.ts`); `ArtistNames` los pinta en todas las filas; la ficha (`ArtistFeaturedTracks`) y el **tablero de artistas** (`/top100`) le acreditan (sin duplicar si ya está en `artists[]`). No se inventa artista en *Original Mix*, *VIP Remix*, *Breakbeat Remix*. Reaplicar a filas vivas + JSON: `node scripts/chart-featured-upsert.mjs --backfill-remixer-credits` (solo UPDATE, mismos UUID).
- **Viernes (día de lanzamientos):** Beatport lleva **mucho más tráfico**; Cloudflare y límites suelen **fallar más** (`403`, timeouts). Suele ir mejor **al día siguiente** o con **`BEATPORT_BATCH_PAUSE_MS`** más alto; no es necesariamente un fallo del código.
- **Otros comandos relacionados:** **`npm run db:chart:vinyl`** (vinilos del archivo desde JSON; identidad = **ID de YouTube**, no Discogs); **`npm run db:chart:backfill-new-releases`** (relleno histórico desde 40 Breaks). Los picks Beatport/Bandcamp **anteriores a 2026-01-01** no se listan en New Releases: van a **Selecciones de archivo** (por año), misma tabla `chart_featured_tracks`. Más contexto en inglés: [README.md — Beatport (incluye New Releases)](./README.md#beatport-weekly-chart-vs-top-10-on-profiles).
- **IDs inmutables (no romper Mis Tracks):** el `id` de `chart_tracks` / `chart_featured_tracks` / `chart_vinyl_tracks` es lo que guarda el “+” en `saved_chart_tracks`. El upsert semanal **actualiza** la fila viva (40 Breaks = URL Beatport, NR = `link_url`, vinilo = vídeo YouTube). **Prohibido** borrar e insertar la misma canción (eso regeneraba UUID y huérfana los saves). UUID nuevo solo si el tema no estaba en esa edición. Si quitas un pick de la semana, la fila del catálogo puede desaparecer; quien lo guardó **con snapshot** lo sigue viendo. Huérfanos con URL: `node scripts/saved-tracks-rebind.mjs`. Regla: **`.cursor/rules/charts-ids-inmutables-saves.mdc`**.

### YouTube vs Beatport (Selecciones de archivo)

El mapa completo está en [Cómo entran las canciones](#cómo-entran-las-canciones). Detalle operativo:

- **New Releases** y archivo digital (release antes o desde **2026-01-01**, según corte editorial) viven en **`chart_featured_tracks`** (Beatport/Bandcamp): **semana** o **año** según release, con botones **Spotify** y **TIDAL** tras el matcher.
- **YouTube** solo alimenta **`chart_vinyl_tracks`**: en la web se agrupa por **año de lanzamiento**, también si ese año es 2026. No entra en New Releases. La `week_date` del JSON es solo contenedor en BD.
- **No duplicar** el mismo tema por YouTube si ya está (o debe estar) en Beatport: saldrían **dos filas** en `/charts` (una con streaming, otra solo embed) y la prioridad editorial es la **vía tienda**.
- Antes de `npm run db:chart:vinyl`: comprobar Beatport y si el tema ya está en NR/archivo digital; si sí → import NR (`featured-import` / `db:chart:featured`) y `db:chart:spotify` / `db:chart:tidal`, **sin** vinilo.
- YouTube queda para histórico, vinilo, white labels, bootlegs o temas **sin** listing en tienda.

Regla Cursor (agente): **`.cursor/rules/charts-youtube-vs-beatport.mdc`**.

### Enlaces «Abrir en Spotify» / «Abrir en TIDAL» en `/charts`

Cada fila de **New Releases** y del archivo digital (Beatport/Bandcamp en `chart_featured_tracks`) muestra un botón **SPOTIFY** (`SpotifyLinkButton` en `ChartView.tsx`): quien tenga cuenta de Spotify puede escuchar el tema completo allí (no podemos alojar audio íntegro por derechos). Dos modos:

- **Enlace verificado** — columna **`spotify_url`** en `chart_tracks` + `chart_featured_tracks` (migración **`066_charts_spotify_url.sql`**), rellenada por **`npm run db:chart:spotify`** (`scripts/spotify-match-charts.mjs`): búsqueda en la Web API de Spotify con **client credentials** (`SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`; desde feb-2026 el dueño de la app necesita Premium, pero no hay OAuth por usuario). Matching conservador (título normalizado + al menos un artista; «Original Mix» cuenta como sin sufijo); ante ambigüedad queda `NULL`.
- **Fallback de búsqueda** — sin `spotify_url`, el botón enlaza a `open.spotify.com/search/<artistas título>`, así funciona aunque el matching no se haya ejecutado.

**TIDAL** funciona igual con `--service=tidal` (`npm run db:chart:tidal`, columna **`tidal_url`**, migración **`067_charts_tidal_url.sql`**, env `TIDAL_CLIENT_ID` + `TIDAL_CLIENT_SECRET` de developer.tidal.com — sin requisito Premium ni cuota diaria observada; endpoint `GET /v2/searchResults?filter[query]=…&include=tracks.artists`, JSON:API). Diferencia editorial (deliberada, aprobada por el usuario): el **botón TIDAL solo sale con enlace verificado** — sin fallback de búsqueda — porque su catálogo de breaks es más limitado y un tercer botón fijo cargaría las filas.

**Botones** en `TrackShareButton.tsx` (`SpotifyLinkButton`, `TidalLinkButton`, `BeatportLinkButton`): **circulares con logo de marca en móvil Y escritorio** (34px / 30px, paths oficiales de simple-icons, tooltip = nombre del servicio; Spotify = verde oficial `#1ED760` con logo negro según su branding, Beatport = negro con «b» `#01FF95`, TIDAL = papel con rombo negro). Se usan en `/charts` (New Releases y archivo digital), **Top 10 de Beatport** de artista/sello (`BeatportTopTracks.tsx`; allí Spotify usa fallback de búsqueda porque el snapshot JSONB no tiene columnas), **En Optimal Breaks** de la ficha (`ArtistFeaturedTracks.tsx`) y **Mis Tracks** propia y lista pública (`TracksSection.tsx` + `/api/public/user-tracks`). Las filas de YouTube (archivo) no llevan botón Spotify/TIDAL a propósito.

**App vs. web (no «arreglarlo» con deep links):** todos los botones usan URLs `https://` a propósito. El propio SO abre la app nativa si está instalada y el navegador si no — no existe API web para detectar apps instaladas, y forzar URIs `spotify:` saca diálogos feos del navegador a quien no la tiene. Limitación conocida de Spotify: la página del **fallback de búsqueda** (`open.spotify.com/search/…`) en web móvil **sin sesión iniciada** muestra «búsquedas recientes/explorar» en vez de resultados; los enlaces directos a track funcionan bien sin sesión. Se cura solo conforme el matching convierte fallbacks en enlaces directos.

Los syncs semanales **no** pisan los matches: la RPC del 40 (`apply_chart_tracks_row_updates`) no incluye las columnas y `chart-featured-upsert.mjs` solo envía `spotify_url` / `tidal_url` si vienen en el JSON. **Tras publicar cada edición nueva:** `npm run db:chart:spotify -- --week=<lunes>` **y** `npm run db:chart:tidal -- --week=<lunes>`. Spotify (Development Mode) tiene **cuota diaria por cuenta** (~1.300 búsquedas): ante 429 `QUOTA_EXCEEDED` el script corta limpio con resumen y al reejecutarlo continúa donde quedó (solo procesa filas NULL). El OAuth por usuario (añadir a playlist, reproducción completa embebida) queda **descartado**: desde feb/mar-2026 las apps en Development Mode admiten máx. 5 usuarios en allowlist y el Extended Quota Mode exige organizaciones con ≥250k usuarios activos mensuales.

---

## Descubrir artistas y sellos desde los charts

Crecimiento editorial del catálogo a partir de ediciones **publicadas** de las filas históricas de **`chart_tracks`** (40 Breaks; ya no se listan) + **New Releases** (`chart_featured_tracks`). El archivo YouTube **no cuenta** para estos umbrales.

### Artistas — umbral **≥ 3** apariciones

1. Contar créditos de artista en todas las ediciones publicadas (unión de esas filas históricas + New Releases). Un crédito = el nombre en `artists[]`. **Los remixers van en `artists[]`** (`remixers[]` de Beatport + `mix_name` parseado); tras el backfill de agosto 2026 un remix cuenta para el umbral ≥ 3.
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

El Top 10 de la ficha es la primera vía de entrada (véase [Cómo entran las canciones](#cómo-entran-las-canciones)). Aquí se guarda el **Top 10 de ventas** que Beatport muestra en la ficha de un **artista** o **sello** (`npm run db:beatport:top` / `beatport-top-tracks.mjs`). El script histórico `chart-40-breaks.mjs` sigue existiendo y deja filas en `chart_tracks`, pero **esa lista no se muestra** en la web desde el 27 sep 2026: los saves y los enlaces `?play=chart:` siguen resolviendo. Los temas que solo estaban ahí pasaron a New Releases (2026, semana del lanzamiento) o a Selecciones de archivo (años anteriores).

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

**ADN breakbeatero (`breakbeat_profiles`).** El bloque de análisis del dashboard genera (y relee) **una fila por usuario**. Es **privado**: no se comparte en Almas Gemelas, Top de la Comunidad ni en `/u/<id>/tracks`. Migración **`064_breakbeat_profiles_rls.sql`**: RLS activado; `authenticated` solo SELECT/INSERT/UPDATE/DELETE de su propia fila (`auth.uid() = user_id`); **`anon` sin grants**. Escritura vía JWT del usuario (`POST /api/breakbeat-profile` + hook `useBreakbeatProfile`), no `service_role`. Mis Tracks entra con las **cuatro** fuentes (`chart` | `featured` | `vinyl` | `beatport_top`), paginando y troceando `.in()`; los subgéneros del primer párrafo siguen saliendo de las fichas de artistas favoritos. Detalle: **[`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md)** (*Breakbeat DNA*).

**Mis Tracks (`/[lang]/mi-cuenta/tracks`)**. Guarda canciones desde `/charts` y desde el Top 10 de las fichas:

- **New Releases** (`chart_featured_tracks`, Beatport o Bandcamp, release desde 2026)
- **Selecciones de archivo** (YouTube en `chart_vinyl_tracks`, y Beatport/Bandcamp anterior a 2026 en `chart_featured_tracks`)
- **Top 10 de la ficha** (`beatport_top`: el save guarda URL + snapshot; no hay fila de chart)
- Los saves antiguos de **40 Breaks** (`track_source = chart`) siguen en Mis Tracks. Esa lista ya no se muestra.

La tabla **`saved_chart_tracks`** (migraciones **`053_saved_chart_tracks.sql`** + **`054_saved_chart_tracks_beatport_top.sql`**) es **polimórfica**: guarda `(user_id, track_source, track_id)` con `track_source ∈ {chart, featured, vinyl, beatport_top}` y `UNIQUE (user, source, id)`. Ese **`track_id` es el UUID de la fila viva** y **no puede cambiar** cuando se reedita el chart: los upserts hacen `UPDATE` por URL/YouTube (véase [IDs inmutables](#new-releases-novedades-editoriales-en-charts) y `.cursor/rules/charts-ids-inmutables-saves.mdc`). La migración 054 añade además `canonical_url` (URL normalizada de la canción) y `snapshot` (JSONB) para cubrir casos como el **Top 10 de Beatport** en fichas de artista/sello, que vive como **JSONB** dentro de `artists.beatport_top_tracks` y no tiene fila propia en ninguna tabla de charts — y para que Mis Tracks **siga pintando** un save si el pick original se quita de la semana. Un backfill del mismo script rellena `canonical_url` para los saves antiguos de `chart / featured / vinyl`.

El botón **`SaveTrackButton`** ("+") aparece en cada fila del chart y también en cada fila del **Top 10 de Beatport** en `/[lang]/artists/[slug]` y `/[lang]/labels/[slug]`. Por dentro usa `useSavedChartTracks()` (`src/hooks/useUserData.ts`), que es un **store compartido a nivel módulo** — todas las instancias del botón en la página se pintan sincronizadas sin round-trips.

**Agrupación canónica (canción = URL externa = vídeo de YouTube).** Una misma canción puede aparecer como fila en varias tablas y varias semanas, **o como entrada del Top 10 de un artista / sello**. Para que el botón trate todas esas filas como la misma canción (y al desmarcar borre todas), `ChartView.tsx`, `TracksSection.tsx` y el propio hook construyen una **clave canónica** por track:

| Fuente | Clave |
|--------|-------|
| `chart` | URL de Beatport normalizada (`host + pathname`) |
| `featured` | URL externa normalizada (Beatport / Bandcamp) |
| `vinyl` | **ID del vídeo de YouTube** (`yt:<id>` vía `extractYouTubeId`). **No** se usa `discogs_url`, porque un mismo release de Discogs contiene varias pistas (A1/A2/B1…) y cada una es su propia fila. Usar la URL de Discogs colapsaría canciones distintas en un único grupo y al guardar una, las demás se pisarían. |
| `beatport_top` | URL de Beatport normalizada del track (almacenada en `canonical_url` + metadatos en `snapshot`; sin fila en ninguna tabla origen). |

Fallback cuando falta URL: `nm:<título>|<mix>|<artistas>`.

**Cross-source real por URL.** El hook expone `isSavedByUrl(url)` y `toggleByUrl(url, {trackId, snapshot})`, usados por el "+" del Top 10 de Beatport: si ya guardaste esa canción desde New Releases, el archivo o un save antiguo de 40 Breaks, el botón aparece ya en verde en el Top 10 **y viceversa**; al desmarcar se borran todas las filas (`chart` + `featured` + `vinyl` + `beatport_top`) que comparten esa URL canónica.

**Página /mi-cuenta/tracks:** orden por artista / título / fecha de release / fecha de guardado; **Play all** + **Shuffle** sobre la cola de audio (Beatport + Bandcamp) usando la `MiniPreviewBar` global — si sales de la página, **la música sigue sonando** porque el `<audio>` vive en `DeckAudioProvider`; filtro **multiselección** por fuente real de reproducción (Beatport / Bandcamp / YouTube); dedupe cruzado para que una canción aparezca **una sola vez** aunque esté guardada desde dos fuentes. Los vídeos de YouTube se reproducen con el embed aparte (iframe de YouTube requiere pantalla visible), así que no entran en la cola de audio y sí se paran al navegar.

**Lista pública compartible**: botón **🔗 COMPARTIR** copia `/[lang]/u/<userId>/tracks`. Otra persona puede reproducir, ordenar y filtrar esa lista en modo lectura; puede guardar canciones pero **a su propia cuenta**, no edita la del dueño. Si no tiene sesión, sale modal para registrarse. Backend: `/api/public/user-tracks` (service-role, bypasa RLS).

**Compartir una canción concreta (abre en Optimal Breaks con modal «Toca para escuchar»).** Cada fila de canción — en `ChartView` (New Releases y archivo), en `TracksSection` (propia y la pública `/u/<userId>/tracks`) y en el Top 10 de Beatport de artistas/sellos (`BeatportTopTracks`) — tiene un botón 🔗 compacto (`src/components/TrackShareButton.tsx`) que prioriza `navigator.share` en móvil y copia al portapapeles como fallback con feedback ✓. Esquema de URLs:

- `/[lang]/charts?week=<YYYY-MM-DD>&play=chart:<uuid>` → save o enlace antiguo de **40 Breaks**. La sección no se lista; el enlace abre el modal «Toca para escuchar».
- `/[lang]/charts?week=<YYYY-MM-DD>&play=featured:<uuid>` → fila de **New Releases** en esa edición.
- `/[lang]/artists/<slug>?play=beatport:<beatportId>` / `/[lang]/labels/<slug>?play=beatport:<beatportId>` → fila dentro del **Top 10 de Beatport** de esa ficha (el `beatportId` se extrae de `beatport_url`).

Helpers y parser en **`src/lib/share-track.ts`** (`buildTrackSharePath`, `buildBeatportSharePath`, `buildBeatportTopInternalPath`, `parsePlayParam`). En `/charts`, el servidor pinta el emergente en el HTML inicial (`SharedTrackLanding`); ChartView abre la semana o el año, hace scroll y amplía la cola sin un segundo modal. En la ficha, `BeatportTopTracks` sigue armando **`TapToPlayOverlay`**. Es el **tap del receptor** quien reproduce (ver «Aterrizaje directo en `/charts`» más abajo). El botón 🔗 de una fila de vinilo **no** genera esa URL pública (sigue el enlace externo a Discogs/YouTube). Si aun así llega un `?play=vinyl:<uuid>`, el aterrizaje directo lo pinta y el vídeo suena dentro del diálogo. El **drawer de Usuarios** del admin usa el mismo esquema interno: un save `beatport_top` va a la ficha, nunca a Beatport.

**Enlaces cortos de artista (`/a/<slug>`).** El sticker de enlace de las stories de Instagram (y otros campos con límite de longitud) rechaza la URL canónica completa. La fila COMPARTIR de cada ficha de artista incluye un botón **✂ CORTO** que copia `https://www.optimalbreaks.com/a/<slug>`; el middleware (`src/middleware.ts`) lo redirige con **307** a `/{locale}/artists/<slug>` según la cookie `OB_LOCALE` / `Accept-Language` del visitante. El canonical SEO no cambia (la redirección es temporal y el tráfico del sticker aterriza en la ficha real).

**Alcance del shortlink — decisión cerrada (ago 2026).** `/a/<slug>` es suficientemente corto; **no** acortar más. Meta no publica límite oficial de longitud de URL: el sticker de historias admite ~2.048 caracteres en la práctica, el campo de enlace del perfil también (el tope de 150 caracteres es solo para el *texto* de la bio), y el error "Sorry, this link is too long" es un bug caprichoso de la app / heurística de spam (típicamente URLs cargadas de UTM), no un conteo real. Descartado a propósito: **códigos aleatorios en raíz** (`/x7k2…` exigiría tabla código↔slug más consulta a BD dentro del middleware en cada petición — prohibido tras el incidente de Disk IO — y chocaría con el enrutado por locale) y **comprar un dominio corto de vanidad** (estilo bit.ly; coste y mantenimiento extra por un puñado de caracteres que a Instagram le dan igual). Si el sticker vuelve a protestar: pegar la URL sin parámetros/texto extra y personalizar la etiqueta del sticker. El patrón `/a/` es solo de artistas hoy; ampliarlo con intención (p. ej. `/l/` sellos), no generalizar a ciegas. Nota de perspectiva: el ahorro real fue solo ~9 caracteres; el valor del shortlink es que **se puede decir en voz alta y recordar** («optimalbreaks.com/a/ctrl-z») y que **no fija idioma** — el artista comparte un único enlace válido para fans ES y EN.

**OG dinámico por track.** `generateMetadata` en `charts/page.tsx`, `artists/[slug]/page.tsx` y `labels/[slug]/page.tsx` lee el `?play=` en SSR: si resuelve a un track real, sobreescribe `og:title` (`"Título (Mix) — Artistas"`), `og:description` (`"Escucha este track en Optimal Breaks · Sello · Año"`) y `og:image` (el `artwork_url` del tema). Así los previews de WhatsApp/X muestran la canción concreta y no una tarjeta genérica de chart o ficha. Detalle en **`docs/USER_ENGAGEMENT.md`** (*Track-level deep-linking*).

**Enlaces compartidos: modal, NUNCA autoplay (regla de producto, sep 2026).** Un enlace compartido **no** intenta `audio.play()` al aterrizar. El **tap del receptor** arranca la canción — gesto real, igual en PC y móvil. El patrón antiguo («intenta autoplay y enseña el modal si el navegador rechaza con `NotAllowedError`») **no sacaba el modal en móvil**, porque WebKit rechaza la secuencia `pause()→src→play()` con `AbortError`, no con `NotAllowedError` (bug sep 2026). La única excepción con arranque automático es el buscador global ⌘K (`#chart-row-<id>` + `?play=1`, gesto dentro de la sesión); si ese intento se bloquea con `NotAllowedError`, `DeckAudioProvider` activa `previewBlocked` y pinta su **`PreviewAutoplayOverlay`**, cuyo toque llama a `togglePreview()`. **No cambiar los formatos de URL de compartir**: hay enlaces ya publicados en Instagram que deben seguir funcionando.

**Aterrizaje directo en `/charts` (28 sep 2026).** `?play=chart:|featured:|vinyl:<uuid>` lo resuelve el servidor con **`resolveSharedLanding`** (`src/lib/shared-track-landing.ts`) y **`createCachedSupabase`** (la misma Data Cache de 300 s que el resto de `/charts`). `charts/page.tsx` pinta **`SharedTrackLanding`** (`src/components/SharedTrackLanding.tsx`) **antes** del fallback de Suspense «Cargando los charts»: el emergente va en el HTML inicial. No espera al esquema, al JavaScript de ChartView, a `?kind=locate` ni a que baje un año entero del archivo.

| Estado | Qué ve el receptor |
|---|---|
| `audio` | ▶ **TOCA PARA ESCUCHAR** (o **ESCUCHARLO ENTERO** si hay `full_audio_url`). El tap suena en el motor global de previews. |
| `video` | El YouTube suena **dentro** del mismo diálogo (`LazyYouTubeEmbed`). El diálogo se queda abierto. Texto: «Toca el vídeo para escucharlo.» |
| `no_audio` | La fila existe pero no hay fuente en la web. Ofrece **ESCUCHAR EN LA TIENDA**. |
| `missing` | Id desconocido o edición no publicada. «Este tema ya no está disponible.» |
| `null` | Sin `?play=` válido, o falló la lectura a Supabase. No hay emergente de servidor; ChartView sigue su deep-link anterior. |

La URL reproducible es el mismo orden que `buildFeaturedBundle` / `previewAudioSrc` en ChartView: un Bandcamp con `link_url` usa `/api/bandcamp-preview` aunque `sample_url` sea null; si no, `full_audio_url`; si no, el sample de Beatport por el proxy. Una fila featured publicada sin sample ni audio completo **pero con enlace de Bandcamp** ofrece el play de la página, no el botón de la tienda. `no_audio` es el caso sin ninguna fuente. Los joins llevan `chart_editions!inner(...)`; los tipos generados de Supabase piden un cast (`as unknown as`). No quitar el join.

Hasta hidratar, el botón dice **CARGANDO…** y está desactivado (`useSyncExternalStore`: servidor `false`, cliente `true`). Así no hay un play que aún no puede sonar, y no hace falta un `setState` dentro de un efecto.

**Cola, sin un segundo emergente.** El tap reproduce ese tema solo (`1 / 1`) por el hook gated, que desbloquea el audio dentro del gesto (`primePreviewInGesture`). ChartView recibe `sharedLandingHandled` y **no** arma `TapToPlayOverlay` ni la intención de vinilo: eso apilaba un segundo «Toca para escuchar». Cuando llega la semana o el año, registra el bundle completo en **`shared-track-bus`** (`registerSharedBundle`) y llama a **`extendPreviewQueue`**. Esa llamada solo cambia cola, índice y grupo: no debe hacer `pause()`, cambiar `src`, llamar a `play()`, resetear el progreso ni reanudar un tema que el oyente ya pausó. El contador de la barra pasa de `1 / 1` a `N / total`, y ⏭ avanza dentro de esa semana o año. Vale igual si el tap es antes de que cargue la sección o después. `?play=chart:` (40 Breaks, que no se listan) se queda en cola de un tema (`sectionKey` `shared-chart-<id>`); no hay fila pública a la que hacer scroll. Featured y vinilo sí abren la semana o el año, quitan `?play=` con `history.replaceState` y hacen scroll a `chart-row-<id>` / `chart-vinyl-row-<id>`. Cuando el tema ha sonado de verdad, el diálogo se cierra para siempre (`played`): ni la pausa, ni un cambio de tema, ni el reintento de 12 s lo vuelven a sacar. Mientras sigue abierto queda por encima del overlay del motor (`previewBlocked`, `z-95`).

**Banner de cookies y el botón de play.** El `<main>` del layout es `relative z-[1]`. Un diálogo con `z-[205]` pintado dentro pierde contra el banner de cookies (`CookieBanner`, `z-[200]`, hermano de ese main). En una primera visita a 375×667 (sin cookie `ob_consent`) el banner tapaba el centro del play. Tras hidratar, `SharedTrackLanding` **se porta a `document.body`** para que el `z-[205]` cuente. El HTML inicial sigue llevando el diálogo inline (el portal solo corre cuando `useHydrated()` es true). No quitar el portal ni bajar el overlay por debajo de `z-[200]`.

Las fichas `?play=beatport:<id>` siguen con **`TapToPlayOverlay`** (`BeatportTopTracks`, `pendingTapPlay`). Ese flujo no pasa por `SharedTrackLanding`.

**Aterrizaje de un tema compartido en `/charts` — emergente al instante, audio en el gesto, cola que crece sin cortar (28 sep 2026).** Como `/charts` carga por secciones (primero el esquema, los temas de cada semana/año bajo demanda), un `?play=featured:|chart:|vinyl:<id>` compartido ya no puede esperar a que `ChartView` encuentre la fila. El flujo ahora:

- **El servidor resuelve el tema** en `src/lib/shared-track-landing.ts` (`loadSharedLanding`: una consulta ligera y cacheada por id vía `locateChartTrack`) y `charts/page.tsx` pinta **`SharedTrackLanding`** (`src/components/SharedTrackLanding.tsx`) en el HTML inicial, **fuera** del `<Suspense>` de los charts: el receptor ve título, carátula y el botón rojo **▶ TOCA PARA ESCUCHAR** antes de que exista la lista. Estados: `audio` (preview o tema completo en el reproductor global), `video` (vinilo → YouTube dentro del emergente), `no_audio` (se ofrece la tienda), `missing` (aviso claro, nunca silencio). El aterrizaje construye el **mismo `rowKey`, `sectionKey` y `src`** que `ChartView` para esa fila, así ambos hablan del mismo tema. Tras hidratar, el diálogo se porta a `document.body` (el `<main>` con `z-[1]` dejaba que el banner de cookies tapara el play en móvil).
- **El toque reproduce dentro del gesto.** `src/lib/audio-unlock.ts` guarda el `<audio>` del preview (y los de mix/deck + `AudioContext`) a nivel de módulo; `usePreviewAudioGated` llama a `primePreviewInGesture(src)` de forma síncrona en el click, así iOS/PWA nunca trata el `play()` posterior como autoplay. `DeckAudioProvider` **adopta** ese elemento (`wiredAudioEls`; `previewSrcEquals` evita reasignar `src`) cuando termina su `import()` y `PendingActionRunner` reproduce el `playPreviewQueue` pendiente.
- **Llega la semana → la cola crece, el audio no se toca.** API nueva del motor **`extendPreviewQueue(items, index, groupKey)`** (expuesta en `PreviewAudioApi`, `usePreviewAudio`, `usePreviewAudioMaybe`, `usePreviewAudioGated` → no-op sin motor): solo actualiza cola/índice/grupo (estado + refs) y precarga el siguiente; sin `pause()`, sin `src`, sin `play()`, sin reset de progreso, sin watchdog, sin `claimAudio`, sin `logTrackPlay`. Se niega si el `rowKey` actual no coincide y conserva el `src` que suena si el del bundle difiere. El efecto `sharedHandoff` de `ChartView` la llama cuando aterriza su bundle de esa semana/año (también si el usuario ya ha **pausado**: la cola crece, la reproducción **no** se reanuda); `SharedTrackLanding` tiene un efecto de respaldo idempotente para la carrera «sección registrada en `shared-track-bus` antes de que el motor tuviera nuestro tema». El contador pasa de `1 / 1` a `N / total` sin tocar el tiempo; ⏮/⏭ y el auto-avance funcionan sobre toda la semana.
- **El watchdog de arranque nunca reinicia una pista que suena**: `armPreviewStartWatchdog` considera «ya suena» `!paused && !ended && (currentTime > 0 || readyState ≥ 3)`, tanto al armarse como al vencer los 4 s.
- **Cuando ya ha sonado, el emergente se retira para siempre** (`played` derivado en el render). Pausar, saltar o parar después no lo devuelve ni saca el «no ha sonado · reintentar» de los 12 s (ese aviso es solo para un toque que nunca produjo sonido).
- **La causa real del «se corta al cargar la lista» estaba en el servidor:** `src/lib/audio-upstream.ts` (`streamAudioUpstream`, usado por `/api/audio-proxy` y `/api/bandcamp-preview`) pasaba `AbortSignal.timeout(10_000)` al `fetch`, y esa señal sigue abortando **mientras se reenvía el cuerpo**. Un sample de 2–5 MB que tardara > 10 s en 4G moría a mitad (`failed to pipe response` / `TimeoutError` en el log de Vercel) → `error` en el `<audio>` → el reproductor paraba (cola de 1) o recargaba la pista, coincidiendo en el tiempo con la llegada de la lista, que era el sospechoso equivocado. El timeout ahora cubre **solo la fase de cabeceras** (`AbortController` que se limpia al resolver el `fetch`); con cabeceras en mano, el stream fluye sin límite. No volver a poner un timeout de petición completa a los streams de audio.

**Un enlace compartido nunca se queda mudo (rescate, sep 2026).** Los Top 10 de Beatport rotan con cada re-scrape, así que un `?play=beatport:<id>` viejo puede apuntar a un corte que ya no está en el JSONB vigente de la ficha. **`findBeatportTopFallbackTrack`** (`src/lib/beatport-top-fallback.ts`, solo servidor) lo recupera de `chart_tracks` → `chart_featured_tracks` → el **snapshot** de cualquier save `beatport_top` (service role), y las fichas se lo pasan a `<BeatportTopTracks fallbackTrack>`: mismo modal «Toca para escuchar», cola de un solo tema, sin fila extra en la lista. El OG dinámico usa el mismo helper. Detalle en `docs/USER_ENGAGEMENT.md` (*Shared links never go mute*).

**Portada en el overlay.** Las URLs de carátulas de Beatport no deben cargarse con `<img>` plano: el CDN suele devolver **403** (bloqueo de hotlink por `Referer`). En el overlay se usa **`next/image`** (`fill`, `sizes`) para pasar por **`/_next/image`**, igual que en filas de chart y `BeatportTopTracks`. Los host deben seguir en `next.config.js` → `images.remotePatterns`. Si la imagen falla igual, `onError` muestra un placeholder **♪** en lugar del icono de imagen rota.

**Admin Tracks.** `/[lang]/administrator/tracks` agrega las estadísticas de guardado de **todos los usuarios** (top tracks, sellos, artistas) aplicando la misma dedupe canónica que la UI de usuario. Las mismas cifras (ranking, origen, últimos 7 días) están en la pestaña **Guardados** de `/[lang]/administrator/stats`. Cuenta todos los «+», también los de cuentas fichadas; el Top 100 público sí les quita el auto-voto. Backend: `src/app/api/admin/tracks/route.ts`.

**Admin Awards** (`/[lang]/administrator/awards`, solo admin). El back office de un BreaksPoll futuro. **Un «+» de Mis Tracks es un voto.** No hay otra urna. La cara pública sigue siendo el Top 100.

La tarjeta **Saved Tracks** de la home del admin (`/api/admin/stats`) es el `count(*)` de **todas** las filas de `saved_chart_tracks`: todos los años, listas públicas y privadas. El 4 oct 2026 esa tarjeta marcaba **4418**. Awards abre en el **año en curso**, eje **Lanzamiento**, modo **Como en público**. El KPI **Votos** es solo ese corte: «+» de temas cuyo año de salida es ese año, de listas públicas. Por eso puede leerse ~2700 con 4418 en la home: no faltan votos; es la edición. El pie de la cifra dice «+ de este corte».

- **Edición → Todos los años:** todos los «+» públicos que se pueden identificar, de cualquier año de lanzamiento.
- **Crudo:** el mismo corte más las listas privadas. Sirve para auditar, no para nominar.
- Un tema **sin año** no entra en la edición 2026 por lanzamiento. Sale en el histograma como **Sin año**, o entra si el eje es **Año del voto** y el «+» se hizo ese año.
- Un save sin tema reconocible (sin clave canónica) no vota. Queda en cobertura como **Sin ficha**.

Dos universos, los mismos que el Top 100. **Temas** (tema del año, remix, tema español, y el tema más votado de cada año): el auto-voto del fichado **sigue contando** en este corte admin (no es el Top público). Una marca de sello no quita la canción. **Artistas, sellos, países y Revelación:** en público no suma el auto-voto (fichaje, claim, familiar) ni el volcado de un sello fichado. DistroKid, TuneCore y el resto de agregadores no compiten como sello.

El tablero va en cinco bloques, para ver el origen de un vistazo: **Internacional** (tema del año, remix, mejor productor, mejor sello, revelación), **España** (artista, sello, tema), **Reino Unido** (artista, tema), **Estados Unidos** (artista, tema), **Resto del mundo** (artista, tema). Cinco nominados por premio. Revelación solo con un año concreto: ≥2 créditos este año y 0 el anterior. España sale de la ficha con país ES. Reino Unido sale de la ficha con UK o GB (un compuesto como AU/UK también cuenta). Estados Unidos es solo la ficha con US: Canadá, México y Brasil van al resto del mundo. El resto es quien tiene país y no es España, Reino Unido ni Estados Unidos. Sin ficha o sin país no hay premio: sale en cobertura, no en el resto del mundo. No hay sello inglés, ni estadounidense, ni del resto. No están, y no se inventan, las categorías de BreaksPoll que un «+» no puede llenar (mejor DJ, álbum, radio, club night, gran evento, mix, tema gratis).

El ▶ de un nominado suena en el sitio: audio completo si lo hay, si no el preview de tienda, si no YouTube debajo de esa fila. El tema lleva su **carátula** (la misma que artistas y sellos llevan su foto); Beatport, Discogs y YouTube pasan por el proxy de imágenes. Si no hay carátula, se queda el número del puesto. Spec: **[`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md)** (*Admin Awards*). API: `GET /api/admin/awards`.

**Admin Usuarios.** `/[lang]/administrator/users` lista cuentas (Auth + perfil). Los números de Favoritos / Mixes / Tracks abren un drawer. Un tema guardado desde el **Top 10 de Beatport** enlaza a la ficha (`?play=beatport:<id>`), **no** a Beatport. El buscador filtra por **email, nombre y usuario**; vaciar el campo recarga la lista completa al instante (debounce + se ignoran respuestas viejas). Detalle: **[`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md)** (*Admin users*).

**Top de la Comunidad (`/[lang]/top100`).** Página propia (en `/charts` solo queda una tarjeta que enlaza). **`CommunityMonthlyTop`** pide **`GET /api/public/charts/community-monthly?limit=100`**. Ranking **all-time** de cada **"+"** en Mis Tracks: **tablero de artistas** (el título sigue siendo «Top 10»; de primeras se ven 10, **Cargar más** abre hasta 50, **Ver menos** contrae) y **top 100 temas**, del mismo recuento. El movimiento de artistas usa **NUEVO** / **▲** / **▼** / **═**: **la lista es en vivo** (el puesto cambia con cada save); **la variación compara ahora frente a hace 7 días exactos** (ventana móvil, misma hora, reconstruido desde `created_at`, sin tabla de snapshots — la ventana mide siempre lo mismo y nada se reinicia el lunes; un sorpasso de fin de semana mantiene su ▲/▼ una semana entera). *Cambiado el 8 oct 2026: antes comparaba con el lunes ISO anterior, así que la ventana iba de 7 a 14 días según el día de la semana y la página no podía decir qué periodo cubría la flecha.* **«X sem.»** = semanas seguidas **en el tablero**, no en ese puesto; el nº 1 además lleva **semanas en el nº 1** y una frase editorial. Agrupación canónica como el panel admin de Tracks; temas ordenados por **usuarios únicos → total de saves → reproducciones → save más reciente → alfabético**. Las lecturas de filas origen (`chart_tracks` / `chart_featured_tracks` / `chart_vinyl_tracks`) van en **trozos de 200 IDs** (`.in()`): un solo filtro con cientos de UUIDs de New Releases recorta metadatos y tira saves antiguos **sin `snapshot`** (agosto 2026: la web mostraba ~803 saves con ~968 filas en BD). El slug `community-monthly` se conserva por compatibilidad (nació mensual; all-time desde abril 2026). Un save de un remix acredita también al **remixer** (además del original), parseando `mix_name` si hace falta (`src/lib/remixer-credits.ts`). **Auto-voto:** un usuario **fichado** (`editorial_artist_marks`, panel Usuarios) o con **claim aprobado** no suma crédito a *su* nombre en el tablero de artistas (el tablero sigue midiendo **canciones guardadas**). El save sigue en Mis Tracks. No sube el Top 100 de canciones si el tema le acredita (igual un familiar fichado contra ese nombre). Repaso periódico de trampas: **`docs/USER_ENGAGEMENT.md`** (*Periodic cheat-vote audit*). **Marca de sello** (`editorial_label_marks`): los «+» de esa cuenta en temas de ese sello no acreditan a **nadie** en el tablero (sí en canciones / Mis Tracks); colabs en **otros** sellos sí cobran. Bookings solo tras el claim (`accepts_bookings`). Tras un fichaje, `N saves · M fans` son **otros** usuarios (a menudo la cuenta editorial), no un skip roto — Afghan Headspin, 25 ago 2026 (24 «+» propios fuera); dump DKR 26 ago; **quién los sostiene tras las dos marcas:** J-Break 26 = Optimal Breaks 19 + Afghan 5 (no DKR) + jennie 1 + Mestas 1; Afghan Headspin 21 = Optimal Breaks 17 + Mestas 3 + jennie 1. Marcas y emails: **[`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md)** (*Editorial marks in production*). Migraciones **`070`** / **`071`**. Detalle: **[`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md)** (*Community Top* → *Artist board — weekly movement*) y [README.md — User engagement](./README.md#user-engagement-my-breaks).

**Almas Gemelas (`/[lang]/mi-cuenta/almas-gemelas`).** **`GET /api/breakbeat/soulmates`** (sesión autenticada) calcula similitud **Jaccard** sobre claves canónicas frente a otros usuarios que siguen en el cómputo; umbral mínimo de saves en perfil; recomendaciones cruzadas. Un cuenta **fichada, reclamada o familiar** no mete en *su* set Jaccard los temas de ese crédito (mismo criterio que el Top de artistas y el Top 100 de canciones). Mis Tracks sí los guarda. Migración **`056_community_top_and_soulmates.sql`**: columna **`profiles.is_tracks_public`** (por defecto activa; si es `FALSE`, el usuario no entra en los cruces ni en el top de la comunidad agregado). Toggle en **`/mi-cuenta/perfil`**. Documentación completa: **`docs/USER_ENGAGEMENT.md`** (*Community Top*, *Soulmates*).

### Vistas de listado (grande / compacto / lista)

En **Artistas**, **Sellos**, **Eventos**, **Escenas** y **Mixes** (cuando hay filas en Supabase) puedes cambiar la disposición de las tarjetas:

- **Grande** — rejilla amplia (o tarjetas estilo flyer en eventos y mixes).
- **Compacto** — rejilla densa; es la **vista por defecto** al cargar (no se guarda en URL ni `localStorage`).
- **Lista** — filas con miniatura cuadrada.

Componentes: `ViewToggle.tsx` más `ArtistsExplorer`, `LabelsExplorer`, `EventsExplorer`, `ScenesExplorer`, `MixesExplorer` en `src/components/`. Textos en `src/dictionaries/es.json` y `en.json` (`view_large`, `view_compact`, `view_list`).

**Eventos (`EventsExplorer`, `/[lang]/events`):** La vista **compacta** usa `repeat(auto-fill, minmax(9.25rem, 1fr))` y la fecha y el título van a **11 px** (28 sep 2026: antes eran 3 / 5 / 7 / 10 columnas y el texto a 9 px, con tarjetas de ~100 px a 768 y 1133). `sizes` del cartel: `(max-width: 700px) 46vw, 200px`. Grande y lista no cambian. Detalle: [Maquetación tablet](#maquetación-tablet-28-sep-2026). El pie de tarjeta funciona como **semáforo** por día calendario: **pasados** (último día `date_end` o `date_start` anterior a hoy, medianoche local) van en **`var(--red)`** con texto **blanco**; **próximos** usan el **amarillo de marca** **`var(--yellow)`** (mismo token que logo/navbar) con **`var(--ink)`**. El **hover** aclara el pie con `color-mix` hacia blanco; la **franja detrás del cartel** refuerza el estado (mezcla con rojo si pasó, amarillo sólido si es próximo). El `<Link>` es **`group/link`** y el pie usa **`group-hover/link:`** para reaccionar al pasar por la imagen (y al revés). **`CardThumbnail`** lleva **`groupHoverGroup="link"`** para el zoom. Rejilla con **`items-stretch`**, enlace **`h-full`** y pie con **`flex-1`** / **`min-h-*`** para **alinear alturas de pie** en cada fila. **Vista calendario por año:** cada día con eventos va en **rojo** si todos los eventos que tocan ese día están **pasados**, en **amarillo** si queda alguno **próximo** (misma regla `isEventPast`); leyendas **`calendar_legend_past`** / **`calendar_legend_upcoming`**. Al **pulsar un día** se abre un **modal** (cartel, fechas, ubicación, lineup resumido, texto breve y enlace a la ficha; no se navega directo desde la celda). Textos **`calendar_modal_*`** en diccionarios. **Tramos (28 sep 2026):** grande, compacto y lista pintan **`EVENTS_PAGE = 40`** tarjetas por año y el resto entra con «Ver más». La vista calendario recibe el año **entero** (`paged` solo si `view !== 'calendar'`). Cambiar fecha o país vuelve al primer tramo durante el render. El corazón de cada tarjeta lee el almacén compartido de `useFavoriteToggle` (una consulta a `favorite_events` por usuario, no una por tarjeta).

**Ficha de evento (`/[lang]/events/[slug]`):** CTA ancha de compra en el **hero** si hay URL de entradas o web, el evento **no está pasado** por fecha (último día del evento antes que hoy) y además **`event_type === 'upcoming'`** o el enlace es **MonsterTicket** (`monsterticket.com` / `.es` y subdominios). Se prioriza URL MonsterTicket. Textos acordados para MonsterTicket: **«Compra de entradas»** / **«Buy tickets»**; enlaces genéricos: **«Comprar entradas»** / **«Get tickets»**. Detalle en inglés: [README.md — Directory listing views](./README.md#directory-listing-views-artists-labels-events-scenes-mixes).

### Showcase de artistas (home y roster de sello) — `ArtistShowcase`

**`src/components/ArtistShowcase.tsx`** pinta las portadas gigantes estilo fanzine (bandera, fans, géneros, waveform y play cuadrado rojo) y se reutiliza en dos superficies con la prop **`layout`**:

- **`stage`** (home): pila vertical en móvil, carrusel horizontal desde `lg` con **índice sticky** de artistas (resalta el que está en pantalla y muestra un mini ecualizador mientras suena).
- **`rail`** (ficha de sello `/[lang]/labels/[slug]`): carrusel horizontal en **todos** los anchos. El roster sale de **`labels.key_artists`**, resuelto contra `artists` **por slug y por nombre**; los artistas sin ficha se pintan sin enlace.

**Orden de la ficha de sello** (rediseño agosto 2026): cabecera (logo, título, favorito, acordeón **Top 10 Beatport**, acordeón **«En Optimal Breaks»** — New Releases + archivo digital y YouTube del sello vía `ArtistFeaturedTracks` con `origin.kind: 'label'`, datos de `fetchLabelOnSitePicks` en `src/lib/artist-related-content.ts`; no lista los 40 Breaks — y CTA de Discogs) → **carrusel del roster** → bio + sidebar (solo lanzamientos clave + links).

**Reproducción:** el play encola el **Top 10 de Beatport** del artista por el modo `preview` global (`usePreviewAudioGated` → `MiniPreviewBar` persistente), con **guardar** (`mode: 'url'` + snapshot con origen del artista) y **compartir** por pista, y `originPath` de vuelta a la tarjeta. Un `IntersectionObserver` precalienta el motor de audio al acercarse la sección para que el primer toque reproduzca dentro del gesto del usuario.

**UX del raíl en móvil (no regresionar):**

- La tarjeta mide **`calc(100% − 32px)` con `max-w-full`** y toda la cadena de ancestros lleva **`min-w-0`**: una card **nunca** puede ser más ancha que el viewport (el bug original: el `min-w` porcentual resolvía contra un flex sin límite, el cartel se paneaba de lado y el play quedaba fuera de alcance).
- **`snap-start snap-always`**: cada swipe avanza exactamente **un artista**; el **peek** de ~20 px del siguiente cartel (atenuado) es la pista de que se puede deslizar. En desktop se mantiene el peek centrado del 92/90 % (`lg:snap-center`).
- **Las flechas son solo de desktop** (`hidden lg:grid`). En móvil la **barra sticky con contador** (`01/06 NOMBRE`) hace de navegación: en el raíl es un **botón** que salta al siguiente artista (con vuelta al primero). Su `top` coincide con la **altura real del header** (`top-[52px] sm:top-[60px]`).
- La sombra dura de `.obx-card` y el padding inferior del raíl solo existen **≥ 1024 px** (en móvil sumaban ancho/alto fantasma).
- La portada usa **`object-top`** en móvil (las caras se quedan dentro del recorte de 400 px); nombre y bio con `line-clamp-2`.
- Tracking del activo: en el raíl móvil compara **`offsetLeft` con `scrollLeft`** (acorde a `snap-start`); en desktop compara centros.

---

## Open Graph (previews en redes)

Todas las imágenes OG son **PNG 1200 × 630** (tamaño recomendado por Meta, `1.91:1`). Fuentes:

| Ruta | Componente / origen | Notas |
|------|---------------------|-------|
| `/:lang/opengraph-image` | `DefaultOgImage` (`src/lib/DefaultOgImage.tsx`) | Tarjeta fanzine de marca — home + fallback cuando una página no sobreescribe OG. Es JSX de Satori: **todo `<div>` con varios hijos necesita `display: flex`** (sin eso la ruta devuelve 500). |
| `/:lang/events/[slug]` (`generateMetadata`) | `events.og_image_url` o `image_url` | Igual que las fichas de artista: Facebook/WhatsApp bajan el JPEG de Storage. No hay `opengraph-image.tsx` por evento (esa ruta servía el placeholder «OB»). Olibass usa un 1200×630 con el flyer entero (logo y fecha, sin recorte). |
| `/:lang/charts` (estática) | `public/images/opengraph/sections/charts-catalog.png` (`-en` en `/en`) | Tarjeta de catálogo: «más de 18.000» canciones de breakbeat (suelo público el 9 oct 2026: más de 18.000). El suelo se sube al cruzar 19.000. Textos en `seo.charts`. Un `?play=` de tema compartido sigue usando la carátula del tema. |
| `/:lang/mixes` (estática) | `public/images/opengraph/sections/mixes-screenshot.png` | Captura de sección. Textos en `seo.mixes`. |
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

**Mixes (`MixesExplorer`, `/[lang]/mixes`):** el vídeo de una sesión **no se aloja en esta web**. YouTube o SoundCloud lo sirven; la ficha solo guarda el enlace y embebe el reproductor. Si nos pasan el archivo, se sube a un YouTube no listado. No va a `private/music` ni a `/api/audio` (eso es el MP3 de una exclusiva de un tema; ver *Audio completo alojado*). Filtros por **año**, **plataforma** (YouTube, SoundCloud, …) y **búsqueda** en título + artista. Cada año pinta las primeras **`MIXES_PAGE = 24`** tarjetas; el resto entra con «Ver más» (+24). Los tramos solo crecen: filtrar no los reinicia, para no chocar con `#mix-<id>`. Ese deep-link limpia filtros, sube el tramo del año a `max(24, posición+1)` y, un frame más **160 ms** después, hace scroll si la tarjeta ya está en el DOM. **YouTube y SoundCloud no montan el iframe al hacer scroll:** portada + play, y el iframe solo al clic (`LazyYouTubeEmbed`, `LazySoundCloudEmbed` con `auto_play=true`). Volver a un `IntersectionObserver` acumulaba decenas de iframes y en móvil cerraba la pestaña. Un mix con `audio_url` (o un `.mp3` en `embed_url`) suena por el motor global; si la URL falla, la mini-barra enseña «No se pudo cargar este mix. Pulsa ▶ para reintentar.» y ▶ vuelve a llamar a `playMix`. El corazón de cada tarjeta usa el almacén de `useFavoriteToggle`: logueado, **una** lectura de `saved_mixes` por visita, no una por tarjeta. En el DOM los años van **de más reciente a más antiguo**.

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
| `track` | `chart_featured_tracks` (New Releases y archivo digital) | `title`, `mix_name`, `label`, `artist_names_text` ([migración **051**](./supabase/migrations/051_chart_tracks_artist_names_text.sql)) |
| `track` | `chart_vinyl_tracks` (Selecciones de archivo, YouTube) | mismos campos |
| `track` | Top 10 de ficha (`artists.beatport_top_tracks` / `labels.beatport_top_tracks`) | título dentro del JSONB; el resultado enlaza a la ficha |
| `mix` | `mixes` | `title`, `artist` |
| `event` | `events` | `title`, `slug`, `city`, `venue`, `lineup_text` ([migración **052**](./supabase/migrations/052_events_lineup_text.sql): aplana `lineup text[]` + `stages[].lineup` en una columna `STORED GENERATED`) |
| `label` | `labels` | `name`, `slug` |
| `scene` | `scenes` | `title`, `slug`, `city` |
| `post` | `posts` | `title`, `slug` |
| `organization` | `organizations` | `name`, `slug` |

Varias palabras se cruzan con **AND**: cada una puede caer en un **campo distinto** de la misma fila. Un trozo cuenta si una palabra **empieza** por él (`ondamik` encuentra a Ondamike). No cuenta en medio de otra (`skin` no entra en Ruskin). `dj tortu skin` encuentra el tema **Skin** de DJ Tortu (`skin` en `title`, `dj` y `tortu` en `artist_names_text`). La frase entera no tiene que estar junta en un solo campo. Si el nombre del artista cabe entero en lo escrito y contiene la palabra más larga, la ficha sale también.

### Reglas de presentación

- **Orden de grupos en la UI** (favorece la música): `artist → track → mix → event → label → scene → post → organization`.
- **Eventos futuros vs. pasados:** los **pasados se descartan por defecto**. Sólo se muestran si la búsqueda es **claramente de eventos** (p. ej. buscas "Winter Festival" y **todos** los otros resultados están vacíos): en ese caso sí aparecen también los pasados. Si hay cualquier otro tipo de resultado (un track, un artista…), sólo se muestran eventos **futuros** (`date_start >= hoy`, orden ascendente).
- **Chip de fecha en eventos:** junto al chip de tipo se pinta `formatEventDate` en **amarillo** para próximos (`is_upcoming: true`) y **rojo** para pasados.
- **Deduplicado de tracks:** una misma canción puede estar en New Releases y en el archivo. Se deduplica con la clave `normalize(title) | normalize(mix_name) | normalize(primer_artista)` y se **prioriza `chart_featured_tracks` y después `chart_vinyl_tracks`**. La búsqueda pública **no** consulta `chart_tracks`. Si el tema ya salió por `/charts`, no se repite desde el Top 10 de la ficha. El `href` apunta a una fila que existe en el DOM.
- **Carátulas:**
  - **Tracks** → `next/image` con la `artwork_url` de Beatport (proxy de Next.js para sortear hotlink/CSP).
  - **Mixes** → se **ignora** la portada propia del mix (YouTube/SoundCloud) y siempre se usa primero la foto del artista; si no hay, fallback a **`/images/disco_optimal_breaks.webp`**.
  - **Artistas** → `displayArtistImageUrl` (mismo helper que el resto del sitio).
- **Rate limit:** 120 peticiones / minuto por IP (instancia), respuesta `429` si se excede.

### Deep-linking al hacer clic

Los `href` que devuelve la API llevan **hash + `?play=1`** para que la vista destino abra el acordeón correcto, haga scroll a la fila exacta y arranque reproducción:

- `/{lang}/charts#chart-row-<id>?play=1` — New Releases y archivo digital (`ChartView`).
- `/{lang}/charts#chart-vinyl-row-<id>?play=1` — Selecciones de archivo por YouTube (el iframe arranca al pulsar play).
- `/{lang}/mixes#mix-<id>?play=1` — `MixesExplorer` (MP3/SoundCloud directos, YouTube vía autoplay).

El `useEffect` de `ChartView.tsx` escucha el hash y el parámetro `play`, expande el acordeón de año/semana correspondiente, hace scroll, destaca la fila y lanza play. Al terminar, limpia `?play=1` con `history.replaceState` para que un refresh no vuelva a dispararlo. Si el resultado cae en la página que ya está abierta (el segundo tema, también dentro de la misma semana), el palette no depende del router de Next —que no remonta la vista ni dispara `hashchange`—: reescribe la URL y emite `SEARCH_NAV_EVENT` (`publishSearchNavigation` en `share-track.ts`). Lo mismo en `/mixes` y en el Top 10 de una ficha.

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
| `preview` | Previews de canciones: New Releases y archivo en `/charts`, Top 10 Beatport en ficha de artista/sello, **Mis Tracks** (propia o compartida). Un **tema** de SoundCloud en `/charts` usa esta misma barra (widget oculto), no el modo `mix`. | `MiniPreviewBar` del provider (persistente entre rutas) |

### Persistencia entre rutas

El modo **`preview` es global**: la cola (`PreviewTrack[]`), el índice, el `<audio>` real y toda la UI viven dentro de `DeckAudioProvider`. Los componentes consumidores (`ChartView`, `BeatportTopTracks`, `TracksSection`, `CommunityMonthlyTop`) ya **no tienen `<audio>` propio** ni barra flotante local — llaman a `playPreviewQueue` / `togglePreview` / `stopPreview` vía **`usePreviewAudioGated`** (que delega en **`usePreviewAudio`** cuando el motor está montado). Resultado: si empiezas a escuchar un track en `/es/artists/adam-freeland` y navegas a `/es/charts` o a `/es/mi-cuenta/tracks`, el audio **sigue sonando** y la `MiniPreviewBar` sigue visible (Beatport y Bandcamp). Los vídeos de YouTube (vinilos) siguen parándose al navegar porque son iframes ajenos.

### Exclusión mutua

Al reclamar audio el provider llama internamente a **`claimAudio(source)`** (y acepta aliases retrocompatibles `chart-preview` / `chart-playall` / `beatport-top` / `my-tracks`, todos mapean a `preview`). Esto dispara el evento **`ob-audio-claim`** en `window`, que pausa los otros modos. Solo suena **uno** a la vez sin importar desde dónde se pulsó play.

### El Play/Pausa de cada fila es un toggle real (no reinicia)

**Invariante (agosto 2026):** el botón ▶ de una fila que pasa a **`❚❚`** debe **pausar** de verdad — al pulsarlo otra vez, reanuda desde la misma posición. **Nunca** debe re-lanzar la cola (eso reinicia el tema desde 0:00 y parece que "el botón de pausa no detiene la reproducción"). El fallo se reportó en Firefox pero era de todos los navegadores: el handler de la fila siempre llamaba a `playPreviewQueue` en vez de hacer toggle.

- **Patrón correcto:** si la fila pulsada es la que suena en este grupo (`previewGroupKey === sectionKey && previewQueue[previewIndex]?.rowKey === rowKey`), llamar a **`togglePreview()`**; si no, `playPreviewQueue(bundle, idx, groupKey)`. El icono `❚❚` solo se muestra con `isActive && previewPlaying` (en pausa → `▶`).
- **Superficies que deben mantenerlo:** `ChartView` (New Releases y archivo), `CommunityMonthlyTop` (`/top100`), `BeatportTopTracks` (Top 10 de artista/sello), `ArtistFeaturedTracks` (picks de la ficha). `TracksSection` (Mis Tracks) y `ArtistShowcase` ya hacían toggle y son la implementación de referencia.
- **Tarjetas de mix** (`MixesExplorer.MixPlayButton`, dashboard `DashboardMixPlayButton`): la etiqueta **`■ STOP`** debe llamar a **`stopMix()`** (no a `playMix` otra vez). `useMixAudioGated` expone `stopMix` / `toggleMixPlayback` para ello.

### Coordinador de embeds y consistencia en móvil (`src/lib/youtube-play-coordinator.ts`)

Los iframes de terceros (vinilos YouTube, tarjetas de `/mixes`, mixes guardados del dashboard, **widgets visuales de SoundCloud**) viven fuera del provider; un singleton a nivel de módulo coordina los dos mundos — **una sola fuente audible en todo el sitio**. Invariantes añadidos en agosto 2026 con los arreglos de consistencia en móvil/PWA (sonaba otro tema, dos fuentes a la vez al volver del background, la lockscreen abría otra app):

- **Todo embed pasa por el coordinador.** YouTube vía `requestYouTubePlay` / `registerYouTubeEmbed` (todos los montajes con `autoplay` llaman antes a `requestYouTubePlay`); los widgets visuales de SoundCloud vía **`useSoundCloudExclusivePlayback`** (`SoundCloudVisualEmbed.tsx`): el evento `PLAY` de la Widget API reclama el slot y registra un stopper que hace `pause()`. El `YouTubeIframe` del dashboard (`user/shared.tsx`) delega en `LazyYouTubeEmbed` — **no** reintroducir `<iframe>` en crudo sin coordinar.
- **Carrera request→mount cerrada.** `stopAllYouTube()` recuerda qué slot desalojó el reproductor global; si ese iframe se registra *tarde*, se para a sí mismo en vez de volver a silenciar el preview que el usuario acababa de arrancar (siempre gana la última acción del usuario).
- **Los keepers del preview respetan los embeds.** El resume de `visibilitychange`, el intervalo de 10 s y el watchdog de arranque en `DeckAudioProvider` consultan **`getActiveYouTubePlayId()`** y nunca auto-reanudan el `<audio>` del preview por encima de un embed activo.
- **Las interrupciones de foco de audio se comportan como un reproductor de música de verdad (`previewInterruptedRef`).** Si el SO nos pausa **cuando ya llevábamos >1 s ocultos** (la canción sonaba en background y otra app reclama el altavoz: nota de voz de WhatsApp, una llamada), marcamos interrumpido **al momento** y **no** llamamos a `play()`. En móvil ese `play()` sí arranca y le quita el audio a WhatsApp (el corte a ~2 s). El reintento único ~1,5 s queda **solo** para la pausa al ir a background / lock (throttling del SO); si ese `play()` se rechaza, también hacemos back-off. Una vez interrumpido, ni el keeper ni el resume de `visibilitychange` lo reviven: el usuario pulsa play (o cualquier play explícito / cambio de pista / `ended`→avance limpia el flag). Las pausas benignas de segundo plano se reanudan al volver al primer plano.
- **El watchdog de arranque ya no quema la cola.** Si un `play()` no arrancaba en segundo plano, antes saltaba a la siguiente pista tras 3 intentos y, como todas fallaban igual, se comía la cola entera y paraba ("suenan 4-5 temas y de repente para"). Ahora sólo salta si hay un error real de medios (`audio.error`: URL del proxy caída / formato no soportado); un `play()` bloqueado pero sano mantiene la pista actual y se reanuda al volver al primer plano o al pulsar play.
- **Exclusión entre ventanas (`BroadcastChannel('ob-playback-claim')`).** Cuando cualquier pestaña / ventana PWA del origen arranca reproducción (`claimAudio`, claims de YouTube/SC, resume de preview/mix), emite un claim y el resto de clientes se silencia — estilo Spotify; arregla el bug de "dos listas a la vez" cuando convivían el icono PWA y una pestaña de Safari.
- **Media Session:** el effect del deck **no** debe limpiar metadata/handlers de `mediaSession` con `mode === 'preview'` (antes lo hacía y dejaba la lockscreen de iOS huérfana). Preview gestiona su sesión con **`src/lib/now-playing-session.ts`** (`applyNowPlaying` en `loadAndPlayPreviewAt` + handlers en su effect). El módulo rellena `title` (con mix si aplica), `artist`, `album` (sello) y carátula **same-origin** vía `/api/og/image-proxy` (iOS tira la sesión si la JPEG de Beatport llega sin CORS). Como respaldo, espeja el now-playing en `document.title`: si el SO ignora Media Session, la lockscreen ya no enseña «Mis tracks | Optimal Breaks» sino el tema. Se re-aplica al bloquear (`visibilitychange`) y al navegar. YouTube/SoundCloud empujan los mismos metadatos al montar el iframe.
- **Manifest PWA** (`public/manifest.json`) declara `id: "/"`, `scope: "/"` y `launch_handler.client_mode: "focus-existing"` para que los controles del sistema / lanzamientos reutilicen la ventana existente en vez de abrir otra instancia. El manifest está precacheado por `public/sw.js` — **bumpear `CACHE_NAME`** cada vez que cambie (actualmente `ob-v6`).
- **Captura de enlaces (abrir links compartidos dentro de la PWA instalada) — limitación de plataforma, no nuestra (sep 2026).** Lo decide el SO: en **Android**, el WebAPK que genera Chrome al instalar registra el dominio y los enlaces tocados en otras apps suelen abrir directamente en la PWA (ajustable en Ajustes → Aplicaciones → Optimal Breaks → «Abrir de forma predeterminada»; los navegadores internos de Instagram/WhatsApp pueden interceptar el primer tap). En **iOS no existe** mecanismo alguno (ni campo de manifest, ni meta tag, ni esquema de URL) para que un enlace abra la web app de pantalla de inicio: siempre abre en el navegador; los universal links son solo para apps nativas del App Store. **No perder tiempo intentándolo.**

### Desbloqueo en el gesto (iOS, `src/lib/audio-unlock.ts`, 28 sep 2026)

El motor (`DeckAudioProvider`) se carga con `import()` dinámico al primer Play. Cuando por fin llamaba a `audio.play()` / `AudioContext.resume()` ya habían pasado cientos de ms (segundos en 4G) desde el toque, e iOS Safari / la PWA lo trataban como autoplay: `NotAllowedError` en previews (salía «Toca para escuchar»), deck mudo (`AudioContext` suspendido) y mixes que no arrancaban.

Los `<audio>` compartidos y el `AudioContext` único viven a **nivel de módulo**, fuera de React. Los hooks gated llaman a **`primePreviewInGesture` / `primeMixInGesture` / `primeDeckInGesture` de forma síncrona dentro del click**; cuando el motor termina de cargar **adopta esos mismos elementos**, ya desbloqueados. Un elemento que ya ha sonado dentro de un gesto puede cambiar de `src` y volver a `play()` después sin gesto nuevo (así funciona el auto-avance de pista). Los mixes de SoundCloud son iframes y no pasan por `primeMixInGesture`.

**No** crear un segundo `<audio>` o `AudioContext` para preview, mix o deck, ni volver a mover el `play()` / `resume()` a después del import dinámico.

### Proxy de audio con Range (`src/lib/audio-upstream.ts`)

`/api/audio-proxy` (samples de Beatport) y `/api/bandcamp-preview` reenvían el upstream con **`streamAudioUpstream`**. iOS Safari pide el audio a trozos (`Range: bytes=0-1` y luego más) y espera **206 + `Content-Range`**. Devolver un **200** completo anunciando `Accept-Ranges` hacía fallar la reproducción o el seek, y el listener `error` del reproductor saltaba de pista en cadena. El temporizador de aborto cubre **solo las cabeceras** (10 s): abortar el cuerpo a mitad cortaba samples de 2–5 MB en 4G (`failed to pipe response`). Respuestas completas de más de 20 MB se rechazan (413).

### `MiniPreviewBar`

Renderizada por el provider cuando `previewQueue.length > 0` (antes se montaba en cada página). Diseño idéntico al antiguo:

- Barra de progreso seekable (clic + arrastre con listeners en `document`, sin `setPointerCapture` — ver [Navegación segura con la música sonando](#navegación-segura-con-la-música-sonando) más abajo para el porqué).
- Transporte Anterior `⏮` / Play-Pause `▶ ❚❚` / Stop `■` / Siguiente `⏭`.
- Título + artista = **volver al origen**: el clic lleva a la **lista donde se arrancó la cola**. Si la página actual contiene la fila (`domId`), hace scroll con destello amarillo; si no, navega al **`originPath`** del track (`/charts?week=…`, `/top100`, `/mi-cuenta/tracks`, la ficha de artista/sello del Top 10 Beatport o de sus New Releases, la tarjeta del showcase en la home) con `#<domId>` y hace el scroll cuando la fila existe (bucle de reintentos ~10 s que cubre fetches en cliente y acordeones). La navegación **no toca el `<audio>`**: la barra persiste y el tema sigue sonando. Las páginas con contenido plegado/paginado escuchan el hash: `ChartView` reutiliza su deep-link (expande la semana correcta, sin autoplay si no hay `?play=`), `BeatportTopTracks`/`ArtistFeaturedTracks` expanden su acordeón con `#bp-row-*` / `#nr-row-*`, y `TracksSection` amplía `visibleCount` hasta montar `#mytracks-row-<key>`. El atajo de scroll directo solo aplica **en la propia página de origen**, porque algunos `domId` se repiten entre páginas (`bp-row-3` existe en todas las fichas con Top 10 de Beatport).
- Tiempo actual / duración e `índice / total`.
- **Botón guardar (`+` / ✓)** — mismo `SaveTrackButton` (tamaño `sm`) que aparece en cada fila de chart / Top 10 / Mis Tracks, ahora también a la derecha del contador de tiempo del reproductor. Cada `PreviewTrack` lleva su propio `save` (`mode: 'ref'` para tracks con fila propia en `chart_*_tracks`, `mode: 'url'` para entradas del Top 10 de Beatport que viven solo como JSONB), así el botón opera sobre la misma agrupación canónica que la fila origen y se mantiene sincronizado vía el store compartido `useSavedChartTracks`. Permite añadir/quitar la canción que está sonando sin tener que volver a su fila.
- `navigator.mediaSession` configurado con metadatos y handlers `play` / `pause` / `previoustrack` / `nexttrack` para auriculares, lockscreen y Bluetooth.
- **Pantalla de bloqueo / “Reproduciendo ahora”** — Helper **`src/lib/now-playing-session.ts`**. Campos de `MediaMetadata`: `title` (título + mix si no iba ya en el título), `artist`, `album` (sello) y `artwork` (carátula proxied en nuestro dominio + icono de respaldo). **No hay campo de año** en la API del SO; no lo concatenamos (truncado en iOS). Año y fecha siguen en la web. iOS, si la sesión falla (carátula cross-origin, set antes de `playing`), enseña `document.title`: por eso mientras suena el título del documento es `Tema (mix) · Artista` y no el de la página (`Mis tracks | Optimal Breaks`). Se re-aplica al bloquear y al cambiar de ruta. YouTube y SoundCloud usan el mismo helper.
- **Safe area móvil** — `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 10px)` para que en iPhones los botones de transporte no rocen la home-bar (la `safe-area` por sí sola los dejaba demasiado pegados al borde inferior). El wrapper de la página **no** usa un rem fijo: con la barra visible es `pb-[var(--ob-bottom-bar-h,12.5rem)]`. El shell publica esa variable con su `offsetHeight` (la safe-area ya va dentro). Dos filas hasta `lg`, una fila desde 1024. Ver [Maquetación tablet](#maquetación-tablet-28-sep-2026).
- **PWA iOS (standalone)** — La barra está **portalada a `document.body`** (`#ob-audio-overlays`) para que ningún wrapper del lazy load rompa `position: fixed`, y su `bottom` se ajusta dinámicamente con el hook compartido **`useViewportBottomOffset`** (`src/hooks/useViewportBottomOffset.ts`): escucha `visualViewport.resize` / `scroll`, `pageshow`, `focus`, `orientationchange` y `visibilitychange`, y re-mide a 80/250/600/1200 ms tras cada "despertar" (iOS necesita unos frames para reportar el viewport real al volver al primer plano). Además **descarta mediciones transitorias** tomadas con la página oculta o con un desfase >40% de la altura (solo ocurren con un overlay nativo — hoja de compartir, teclado — encima) y, mientras el offset aplicado sea >0, **se auto-cura re-midiendo en un intervalo corto** hasta volver a 0, porque iOS a veces no emite ningún evento al cerrar la hoja de compartir y el offset se quedaba congelado. Sin esto, tras **compartir un enlace por Web Share a Facebook/WhatsApp/etc. y volver** a la PWA, o tras bloquear/desbloquear el móvil, el reproductor quedaba "flotando" en mitad de la pantalla con canciones por debajo. La misma compensación se aplica en **`BackToTop`**.

### Navegación segura con la música sonando

El mini reproductor es un overlay `position: fixed` que **persiste entre rutas** (renderizado con `createPortal` en `<div id="ob-audio-overlays">` bajo `document.body`, con su propio `DeckAudioContext.Provider`). Esa persistencia provocaba tres clases de bug que ya están corregidas:

- **Pointer capture pegado (menú/footer dejaban de responder).** Antes la barra de seek llamaba a `setPointerCapture(pointerId)` en cada `pointerdown`. Si una navegación de Next.js (o un cambio de pestaña / iOS WebView) reemplazaba el árbol React **antes** de que llegara `pointerup`, la captura quedaba viva sobre el `<div>` del seek y **todos** los clicks siguientes iban a parar ahí en vez de a la página: el síntoma era "los enlaces del menú no van, tengo que pulsar STOP para que vuelvan". **Solución:** la barra ya no usa `setPointerCapture`; en `pointerdown` registra `pointermove`/`pointerup`/`pointercancel` sobre `document` con el `pointerId` del gesto, y los desmonta al terminar. Una segunda red de seguridad (`visibilitychange` / `pagehide` / `blur`) aborta el drag si la pestaña se oculta.
- **Lluvia de re-renders del rAF que bloqueaba las transiciones de `next/link`.** El tick de progreso usaba `requestAnimationFrame` con `setPreviewProgress(audio.currentTime)` ~60 veces por segundo. Como `previewProgress` forma parte del valor del contexto, **cada consumidor de `useDeckAudio` se re-renderizaba en cada frame** (`TracksSection`, `ChartView`, `BeatportTopTracks`, `BackToTop`…). En React 18 + App Router las navegaciones de `next/link` viven dentro de una transición interrumpible: si llegan `setState`s de alta prioridad más rápido de lo que el árbol nuevo puede comprometer, la transición se reinicia indefinidamente y la página de destino **nunca llega a montar**. El síntoma exacto era *"sigue sonando la música, el menú no responde, en cuanto le doy a STOP la página a la que quería navegar carga de golpe"*. **Solución:** el rAF de preview tira `setState` como mucho cada ~120 ms (≈8 fps, más que suficiente para una barra fina); el del deck hace lo mismo con `setProgressA/B` (la rotación del plato sí sigue a 60 fps porque solo se ve en `/`). Con ~7× menos updates de contexto, el scheduler de transiciones tiene tiempo de respirar y las rutas se montan limpiamente mientras la música sigue sonando.
- **Reproductor flotando a mitad de pantalla en PWA iOS.** En modo standalone (PWA), el *layout viewport* y el *visual viewport* pueden desincronizarse (cambio de altura de la barra del sistema, bloqueo/desbloqueo, status bar y sobre todo **compartir por Web Share a Facebook/WhatsApp y volver**). Un `position: fixed; bottom: 0` puro acababa pintando la barra en mitad de la página con canciones visibles por debajo. **Solución:** `MiniPlayerShell` y `BackToTop` usan el hook compartido **`useViewportBottomOffset`**, que escucha `visualViewport.resize` / `scroll`, `pageshow`, `focus`, `orientationchange` y `visibilitychange`, y re-mide a 80/250/600/1200 ms tras cada despertar porque iOS tarda algunos frames en reportar el viewport real al recuperar el foco. El hook suma `innerHeight − (vv.height + vv.offsetTop)` al `bottom`, **descarta mediciones transitorias** (página oculta o desfase >40% de la altura, que solo ocurre con la hoja de compartir / teclado encima) y **se auto-cura**: mientras el offset aplicado sea >0 sigue re-midiendo en un intervalo corto hasta volver a 0, cubriendo el caso en que iOS no emite ningún evento al cerrar la hoja de compartir. Combinado con el portal a `<body>`, la barra se mantiene pegada al borde visible en cualquier estado del viewport (PWA, navegador, tras sleep/wake, tras share-and-return).

Todo está en `src/components/DeckAudioProvider.tsx` (función `MiniPlayerShell` para el pointer, los dos `useEffect` con `requestAnimationFrame` para el throttle).

### `PreviewAutoplayOverlay` (respaldo de autoplay del ⌘K)

Si `loadAndPlayPreviewAt` recibe **`NotAllowedError`** (política de autoplay al abrir Whatsapp/enlace en pestaña nueva), el provider pone **`previewBlocked`** y muestra un modal a pantalla: una sola tarjeta **▶ TOCA PARA ESCUCHAR** que llama a **`togglePreview()`** con el primer gesto del usuario. La carátula usa **`next/image`** vía **`/_next/image`** para evitar el **403** de hotlink de Beatport que provocaría un `<img>` directo. Si la imagen falla, placeholder **♪**. Se limpia al reproducir correctamente o al **`stopPreview`**. Código en `DeckAudioProvider.tsx`. **Ojo:** los enlaces compartidos ya **no** dependen de este mecanismo. En `/charts` el servidor pinta `SharedTrackLanding` en el HTML inicial; en las fichas, `BeatportTopTracks` sigue armando `TapToPlayOverlay`. Ninguno intenta `play()` al aterrizar (regla de producto, sep 2026). Este overlay del provider queda como respaldo del flujo ⌘K.

La barra sigue emitiendo `OB_CHART_PLAYALL_BAR_EVENT` para que `BackToTop` suba su botón de scroll mientras está visible. `BackToTop` se coloca en `max(calc(var(--ob-bottom-bar-h, 0px) + 14px), …)` (el segundo término es `6.75rem` más safe-area, o `7rem` si ese evento de play-all está activo), así la flecha sigue la altura real de la barra. Además aplica la **misma compensación de `visualViewport`** que el reproductor para no quedar flotando a mitad de pantalla en PWA iOS.

Detalle técnico y tabla de archivos en [README.md — Global audio system](./README.md#global-audio-system-lazydeckaudioprovider--deckaudioprovider).

---

## Audio completo alojado (exclusivas de artistas)

A veces un artista cede el **tema entero** para streaming gratuito en la web. Son picks normales de New Releases con `chart_featured_tracks.full_audio_url` relleno (migración `078`).

Casos (Kritycal System, sep 2026):

| Tema | Semana | MP3 | Qué pasó |
|---|---|---|---|
| *Take My Home* | 14 sep | `kritycal-system-take-my-home.mp3` | Primera exclusiva. |
| *Bandido & Maleante* | 28 sep | `kritycal-system-bandido-maleante.mp3` | El primer archivo era una demo de 1:25. El máster dura 3:58 (igual que Spotify y Beatport `/track/bandido-maleante/29540534`). Se sustituyó el mismo MP3; el enlace de la web no cambió. |

- **Almacenamiento:** el MP3 (192 kbps desde el WAV del artista, ffmpeg) vive en **`private/music/`** y es lo único de esa carpeta que entra en Git — *no* en `public/`, para que no sea descargable por URL directa. El WAV y la carátula se quedan en el mismo `private/music/` y están gitignorados (`private/music/*` salvo `*.mp3`): no van a GitHub ni a Vercel. El artwork público va al bucket `media` de Supabase en WebP. Si llega después el máster de verdad, se vuelve a codificar **encima del mismo archivo** y se hace push: hasta el deploy, la web sigue sirviendo la versión anterior.
- **Entrega:** **`/api/audio/[file]`** — las peticiones de la propia web (check `Sec-Fetch-Site` / `Referer`) reciben un 302 a una **URL firmada** (HMAC, caducidad 6 h) que sirve el archivo con soporte **Range** (seek). Barra de direcciones, hotlinks y enlaces firmados compartidos → 403 / mueren solos. `next.config.js` incluye solo `private/music/*.mp3` en el trace de la lambda (`outputFileTracingIncludes`). Es una barrera tipo SoundCloud/Bandcamp, **no DRM**: quien sabe, puede capturar el stream.
- **UI (`ChartView.tsx`):** fila con fondo amarillo suave, banner rojo a sangre arriba («EXCLUSIVE FULL TRACK — ESCÚCHALO ENTERO GRATIS») y botón rojo **▶ PLAY FULL**. El player prefiere `full_audio_url` sobre `sample_url`; Mis Tracks también lo propaga y lo reproduce entero.
- **Sesiones y mixes en vídeo no van por aquí.** Una hora de vídeo no cabe en Git ni en la lambda, y esta ruta solo acepta `.mp3`. Si nos pasan una sesión, se sube a un YouTube no listado y `/mixes` la embebe. Un mix solo en audio (una hora a 192 kbps ≈ 80 MB) tampoco entra en `private/music`: unos pocos agotarían el tamaño de la función.
- **Receta para la próxima exclusiva:** `.cursor/rules/audio-completo-exclusivas.mdc` (paso a paso: ffmpeg → `private/music/` → pick JSON con `full_audio_url: "/api/audio/<slug>.mp3"` → `chart-featured-upsert`).

---

## Secciones del sitio

Inicio, historia, artistas, sellos, **organizaciones** (`/organizations/[slug]`), eventos, escenas, blog, mixes, about, **login** (auth y recuperación por correo), **reset-password** (tras enlace de Supabase), **dashboard** (usuario), **`/administrator`** (solo `profiles.role = admin`: CRUD + imágenes; sin enlace en el menú público), páginas legales. En **inicio**: hasta **4 eventos próximos** (`date_start` ≥ hoy) y fallback si no hay datos (ver sección *Home — línea temporal* arriba). Listados desde Supabase en artistas, sellos, eventos, escenas y mixes: **tres vistas** (grande / compacto / lista; por defecto compacto). En **eventos**: pie semáforo, hover y CTA MonsterTicket en ficha (ver *Vistas de listado*). En **mixes**: filtros y **carga perezosa de embeds**; los lotes nuevos viven en `data/mixes/*.json` (p. ej. `karmic-waves-soundcloud-2026.json`) y se publican con la guía de mixes (URL canónica de SoundCloud, artwork, `published_at` y duración leídos del HTML) (ver sección *Vistas de listado* arriba y [README.md](./README.md)).

### País de un evento (canónico, 28 sep 2026)

`events.country` es el **nombre en inglés** (`Spain`, `United Kingdom`, `United States`…). `normalizeEventCountry` (`src/lib/event-country.ts`) se aplica al escribir (chat admin, que metía `ES` por defecto, y los formularios `/administrator/events`) y al leer el filtro «País» de `/events`. Un valor desconocido pasa tal cual, solo recortado. En producción se unificaron 11 grafías a 5 países (Spain 75, United States 34, United Kingdom 15, Australia 5, Hungary 1) y los sufijos de `location` (`, ES` / `, España` / `, UK` / `, US`…) al mismo nombre.

### Festival › Edición › Evento (29 sep 2026)

Tres niveles, todos en `src/lib/event-series.ts`:

| Nivel | Qué es | Config | URL |
|---|---|---|---|
| **Festival** | La marca | `FESTIVAL_BRANDS` (`raveart`, `olibass-music-festival`, `heat`) | `/festivals/<slug>` |
| **Edición** | El formato que se repite | `FESTIVAL_SERIES` (Raveart Summer / Winter / Retro Halloween, `olibass-open-air`, `olibass-snow-edition`…) | `/festivals/<slug>` |
| **Evento** | El día con su cartel y sus sesiones | tabla `events` | `/events/<slug>` (sin cambios) |

- Festival y edición se publican con ≥ `MIN_SERIES_EDITIONS` (2) eventos. Una edición por debajo aún no tiene página, pero sale dentro de la de su festival (ancla `#edition-<slug>`).
- Marcas de un solo formato (Híbrida Fest, Dreambeach, Oshun…) **no** van en `FESTIVAL_BRANDS`: esa `/festivals/<slug>` **es** el festival. Cada fecha es un **evento**, aunque el promotor la llame «edición». En esa página se dice eventos/fechas, no ediciones. Un evento suelto (una noche de club sin marca que se repita) no pertenece a ningún festival.
- **HEAT** (Paris 15, Málaga; 30 sep 2026) es festival con tres ediciones: `heat-opening`, `heat-temporada` (cualquier otra noche con «HEAT» en el nombre) y `heat-closing-boiler-xl` (URL ya publicada, se mantiene). Marca: `/festivals/heat`.
- El slug de una marca nunca puede coincidir con el de una edición (comparten `/festivals/`). Olibass: la marca se quedó `/festivals/olibass-music-festival` (ya indexada); el Open Air pasó a `/festivals/olibass-open-air`.
- `/festivals` **no es alfabético**: primero las marcas con fecha próxima (la más cercana), luego el resto por la última fecha. Con menos de tres citas próximas van en una fila ancha (fecha, cartel, ciudad de esa noche). A partir de tres, **por mes**. Cada card enseña la ciudad de esa próxima o última fecha. Las noches de club se quedan en `/agenda`. La ficha del evento, la de la sesión y el sitemap enlazan los dos niveles; migas: Festival › Edición › Evento.
- Añadir un festival con varias ediciones = una entrada en `FESTIVAL_BRANDS` que apunte a slugs de `FESTIVAL_SERIES` ya existentes. `seasons` solo para temporadas sin nombre propio.

**Sesiones por evento (29 sep 2026):** `mixes.event_id` (migración **`083_mixes_event_id.sql`**) ata cada sesión al evento donde se grabó. El evento, el festival y la edición las pintan con `MixSessionGrid`: las mismas vistas grande / compacto / lista que `/mixes`, **compacto por defecto** (portada + play, iframe solo al pulsar). Cada sesión tiene URL propia `/mixes/<slug>`. Se etiqueta con `event_slug` en el lote JSON (`run mixes-file`), el campo «Evento» del admin o `stage_upsert_mix` en el chat.

**MP3 descargable (30 sep 2026):** con permiso de la promotora o del artista, el MP3 de la sesión se sube como asset de la release de GitHub **`sesiones-descarga`** (`optimalbreaks/optimalbreakswebsite`; hasta 2 GB por archivo, tráfico gratis, se sirve como descarga) y su URL va en **`mixes.download_url`** (migración `084`). El botón y la franja apuntan a nuestra URL **`/descargar/<slug>.mp3`** (`src/app/descargar/[file]/route.ts`, 302 al asset de GitHub; el archivo no pasa por Vercel; esa es la URL que se comparte, no la de GitHub). El campo está en el formulario de mixes del admin. No va en Git, `public/`, `private/music` ni Supabase Storage (el tope de subida del proyecto es menor que una sesión de una hora). No es `audio_url`, que pasa las tarjetas al reproductor nativo. Los originales se quedan en `music/dowload_mixes/` (gitignorado). Si llega un WAV, se codifica a MP3 320 kbps (`ffmpeg -b:a 320k`) y se sube ese; el WAV no se publica. Publicadas: Afghan Headspin y Neva vs Tilla Pink (Olibass Open Air 2026).

**El botón va en el vídeo, en estos tres sitios. Los tres, siempre** (componente `MixDownloadStrip`, pegado debajo del reproductor; sale solo si hay `download_url`):

1. **El vídeo en el festival** — bloque «Sesiones» de `/festivals/<slug>`. La edición y la ficha del evento usan ese mismo vídeo, así que el botón sale ahí también.
2. **El vídeo en `/mixes`** — en cada tarjeta del listado.
3. **La URL de la sesión** — `/mixes/<slug>`, debajo del vídeo («Descargar sesión en MP3»).

En `/mixes`, además, un sello «⬇ MP3» en la portada, un aviso amarillo arriba y el chip «Descargables». Eso ayuda a encontrarlas; no sustituye a los tres botones.

**Story IG de una sesión (admin):** en `/mixes/<slug>`, junto a LINK, el admin ve un botón **IG** (`ShareButtons` con `storyPlay="mix:<slug>"`). Copia el enlace y comparte (móvil) o descarga (escritorio) un PNG 1080×1920 de `/api/og/story?play=mix:<slug>`: en SoundCloud la portada del tema (`mixes.image_url`); en YouTube el retrato del artista (`artists.image_url`, y si no hay, la miniatura del mix). Debajo, artista, festival, edición (solo si es un formato con nombre), fecha del evento y sala · ciudad. Con `download_url` añade un sello rojo «DISPONIBLE PARA DESCARGA · MP3 · GRATIS» sobre la imagen y el pie dice «Descárgala gratis en el enlace». La caché de esa story es de 5 min (la de los temas sigue en 1 día): al añadir el MP3, el sello sale en la siguiente story. Las exclusivas de canción (`full_audio_url`) se escuchan y no se descargan: su story no lleva sello.

**Datos estructurados de Evento (aviso de Search Console, 30 sep 2026).** Google marcó `image`, `performer`, `description`, `offers` y `endDate` como leves. Venían de nodos `Event` a medias: las ediciones dentro de `/festivals/<slug>`, los próximos eventos de `/organizations/<slug>` y el `recordedAt` de cada sesión. Ahora festival y promotora usan `agendaEventJsonLd` (`src/lib/seo.ts`), el mismo bloque que la ficha: cartel (o la imagen OG del sitio), descripción (la de la ficha o una hecha con fecha, sala, ciudad y cartel), `endDate` (fecha de fin o el mismo día), `offers` (entradas, web o la propia ficha) y `performer` (cartel, o la promotora si no hay cartel). El `recordedAt` de la sesión ya no es un `Event`: apunta al `@id` del evento de la ficha. Un evento sin cartel y sin promotora puede seguir sin `performer`.

**Chat de captura y ediciones (incidente 29 sep 2026).** Dos carteles rompieron Olibass: el del Open Air 2025 **pisó** la ficha del 19 sep 2026 (mismo slug, sin mirar el año) y el de la Snow de feb 2026 (sin año) acabó como duplicado el **27 feb 2027**. Arreglado en `findDuplicateEvent` / `upsertEventAction` (`src/lib/admin-chat.ts`): mismo slug con otro año = otra edición (se crea `<slug>-<año>`); si el año lo puso `normalizeUpcomingEventDate`, un evento de la misma edición (y temporada) el mismo día/mes se trata como el existente y conserva su fecha. Datos restaurados en el mismo id (favoritos intactos); 2025 en `olibass-music-festival-open-air-2025`; `/events/olibass-snow-edition` 301 → la de 2026.

### Migraciones SQL (resumen)

Aplica `supabase/migrations/` en **orden alfabético**. El README en inglés incluye una tabla **parcial** (001–011); hay **muchas más** (charts, mixes, OG, escenas, engagement, lotes de contenido…): lista completa en la carpeta del repo.

---

## Cabecera y ancho en móvil

- En **`globals.css`**, `html` y `body` llevan `max-width: 100%` y `overflow-x: hidden` (o `clip`) para evitar scroll horizontal fantasma. Ese recorte **también esconde el desborde real**: que no haya barra de scroll no significa que el contenido quepa. Hay que medir el borde derecho de cada elemento contra `documentElement.clientWidth`.
- El **`<header>`** no usa `overflow-x: hidden`, para que los paneles en posición absoluta (menú hamburguesa, **desplegable de cuenta** tras el avatar) no queden recortados. Z-index alto en esos paneles respecto a la barra sticky.

### Maquetación tablet (28 sep 2026)

Auditoría en la web pública (`https://www.optimalbreaks.com`) a anchos CSS reales, con emulación táctil y `(hover: none)` / `(pointer: coarse)`. Cortes de Tailwind 3: **sm 640**, **md 768**, **lg 1024**, **xl 1280**. Los arreglos son clases y maquetación: la lógica de audio, los hooks y los datos no se tocaron. Las capturas están en `tmp-responsive/` (gitignored).

| Pieza | Antes | Ahora | No volver a |
| --- | --- | --- | --- |
| **Cabecera** (`Header.tsx`) | Menú de escritorio desde `lg`. A 1024 la fila necesita ~1180 px: LOGIN acababa en x=1031 y «TOP 100» se encogía. Solo cabía justo a 1180. | Menú de escritorio desde **`xl` (1280)**, enlaces con `whitespace-nowrap` y `shrink-0`. Hamburguesa (`xl:hidden`) hasta 1279. Esas filas del menú ya medían 44 px de alto a 768. | Bajar el menú de escritorio a `lg`. |
| **Deck de la home** (`DjDeck.tsx`) | Tres columnas desde `md`. A 768 la rejilla medía 674 px y cada plato ~205 px. | Dos platos y mezclador horizontal hasta **`lg`**. La rejilla de tres columnas empieza en 1024. | Cambiar los platos en `md`. |
| **Eventos compactos** (`CompactGrid` en `EventsExplorer`) | `grid-cols-3/5/7/10`, fecha y título a 9 px. A 768: 7 columnas, tarjeta 102×212. A 1133: 10 columnas, tarjeta ~108 px. | `repeat(auto-fill, minmax(9.25rem, 1fr))`, fecha y título a **11 px**. Unas 2 columnas a 360, 4–5 a 768, ~7 a 1133. `COMPACT_POSTER_SIZES`: `(max-width: 700px) 46vw, 200px`. Se quedan los bordes, el pie amarillo o rojo y el recorte a dos líneas. | Una cuenta fija de columnas, o bajar el texto de 11 px. |
| **Mini reproductor** (`MiniPlayerShell`) | Una fila desde `sm`. Hacia 700 px un título largo se truncaba (441 px de texto en 313 px). El relleno de la página era un `4.75rem` / `5rem` fijo (~86 px). A 390 la barra medía **196 px** y tapaba el crédito del pie unos 110 px. | **Dos filas hasta `lg`** (título a todo el ancho, luego controles y tiempo). Una fila desde 1024: controles, título, tiempo. El transporte sigue a 40 px hasta `lg`. El relleno de la página es **`pb-[var(--ob-bottom-bar-h,12.5rem)]`** mientras la barra está. El ResizeObserver del shell escribe `--ob-bottom-bar-h` con el `offsetHeight` (ya incluye safe-area + 10 px). El respaldo de 12,5 rem cubre las dos filas hasta que el efecto mide. | Un padding en rem fijo. La altura cambia con el corte y con la home-bar. |
| **`.track-action-bar`** (`globals.css`) | `zoom: 0.86` por debajo de 640. El clic no coincidía con lo pintado: a 390 px el + visible estaba hacia x=173–205 y el clicable en x=150–176, así que pulsar + abría compartir en las filas con BPM y tonalidad. La caja también se salía (borde derecho x=383 / 417 / 464 a 360 / 390 / 430) y el `overflow-x: hidden` de `html` recortaba los últimos botones. | Sin zoom. `min-width: 0`, `max-width: 100%`. Por debajo de 640 la fila se queda dentro del padre y **se desplaza en horizontal** si no caben play + BPM + tonalidad + guardar + compartir + Spotify + TIDAL + Beatport (scrollbar oculta, hijos con `flex-shrink: 0`). El orden de los botones no cambia. Desde 640: `width: auto`, alineada a la derecha; esa media query puede partir línea (ya lo hacía). | Volver a poner `zoom`. Poner el `+` el primero. Partir la fila en móvil. |

**Visto y dejado como estaba** (la misma pasada): celdas del calendario ~43×22 a 768; el modal de un día cargado cabía y hacía scroll a 744 px de alto (el cierre mide 36×36); chips de 7–8 px en grande y lista; etiquetas del mixer a 7 px; anterior/siguiente del deck a 16×16; la compacta de mixes a 768 eran 4 columnas y no se salía (el enlace de YouTube a 9 px); el modal de cookies cabía y hacía scroll a 1133×744; el buscador vacío cabía. **`/mi-cuenta` no se abrió** (sesión cerrada). El modal promo de charts no salió (temporizador / `localStorage`).

---

## Deck e idioma

Al navegar entre **`/en` y `/es`**, se **remonta** el segmento `[lang]` (incluido **`LazyDeckAudioProvider`**). El estado de reproducción en memoria no se conserva entre locales; si `sessionStorage` marca sesión activa, el bundle de audio puede volver a cargarse en el nuevo idioma sin restaurar la cola anterior automáticamente. En la home, los **dos platos** se mantienen hasta `lg` (1024 px); por debajo va el mezclador horizontal. No bajar ese corte a `md`: a 768 la rejilla de tres columnas dejaba cada plato en ~205 px. Ver [Maquetación tablet](#maquetación-tablet-28-sep-2026).

---

## Roadmap (resumen)

Hecho: Supabase en listados, miniaturas y Storage, auth (login, **`/auth/confirm`**, callback OAuth, recuperación → **`/reset-password`**, plantillas en `mailing/supabase/`), dashboard, **JSON + `db:artist`**, **`/administrator`**, **vistas de listado** en las cinco secciones de referencia, **sitemap + robots** (`sitemap.ts`, `robots.ts`), segmento `/artists` sin caché agresiva de HTML, **GA4** (`@next/third-parties/google` + Consent Mode y cookies), **optimización CWV** (audio lazy, fuentes diferidas, preload Unbounded 900, banner cookies/modal charts fuera del LCP, SEO home breakbeat).  
Pendiente: RSS, modo oscuro, etc. Ya hechos: **Búsqueda global** (*Buscador global*), **OG por sección** — home/mixes/charts (screenshots), **eventos = cartel a pantalla completa**, y overrides por canción (ver *Open Graph*).

---

## Licencia

Todos los derechos reservados © 2026 Optimal Breaks.
