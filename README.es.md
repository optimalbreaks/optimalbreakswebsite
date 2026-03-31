# OPTIMAL BREAKS — La biblia del breakbeat

> Archivo, revista, guía, agenda y memoria de escena. Proyecto dedicado a preservar y celebrar la cultura breakbeat en todo el mundo.

La documentación técnica completa está en inglés en [**README.md**](./README.md). Aquí va un resumen en español **y el flujo recomendado para actualizar artistas**.

---

## Qué es

Plataforma web **bilingüe (ES/EN)** sobre historia, artistas, sellos, eventos, escenas y cultura del **breakbeat**. Incluye un **DJ deck** interactivo (audio real y scratch), estética fanzine/club, y secciones editoriales y de referencia.

**Organizaciones y Raveart:** existe la tabla **`organizations`** (promotora, roles, enlaces). Los **sellos** pueden enlazar a una organización (`labels.organization_id`) y los **eventos** a la promotora (`events.promoter_organization_id`). Ficha pública: `/[lang]/organizations/[slug]` (p. ej. `raveart`). Datos sembrados y ampliados con las migraciones **`010_raveart_organizations.sql`** y **`011_raveart_gallery_events.sql`** (alineación con la [galería oficial](https://www.raveart.es/galeria/)). Detalle técnico y tabla de migraciones en [README.md](./README.md).

**Eventos:** se crean **manualmente** desde el panel admin (`/administrator/events/new`) o pidiendo al agente Cursor. Para completar la ficha (fecha, lineup, descripción, venue, tags, etc.) se usa el **agente enriquecedor**: `npm run db:events:enrich -- <slug> [--with-poster]`. SerpAPI busca en la web y OpenAI completa los campos vacíos. El prompt de sistema del enriquecedor está en **`scripts/prompts/evento-enriquecer-system.txt`**.

**Índice general de prompts y agentes IA** (archivos `.txt`, variables `OPENAI_*`, modelos por defecto, APIs): **[`docs/AI_PROMPTS_AND_AGENTS.md`](./docs/AI_PROMPTS_AND_AGENTS.md)**. La guía detallada del agente de **artistas** sigue en [`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md).

**Imágenes (WebP, `public/images` vs Supabase Storage):** [`docs/IMAGES_AND_WEBP.md`](./docs/IMAGES_AND_WEBP.md). **Qué puede hacer el usuario** (favoritos, visto en vivo, asistencia a eventos, reseñas): [`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md).

---

## Stack principal

- **Next.js 14** (App Router), **TypeScript**, **Tailwind** 3.4
- **Supabase**: PostgreSQL + autenticación + **Storage** (bucket público `media` para fotos de contenido)
- **Analítica (opcional)**: **Google Analytics 4** con el paquete oficial **`@next/third-parties/google`** y **Consent Mode v2** enlazado al banner de cookies (`CookieBanner` + `GoogleAnalytics`). Detalle en [README.md — Analytics](./README.md#analytics-google-analytics-4) y en la sección [Analítica (GA4)](#analítica-ga4) de este archivo.
- Rutas `/es` y `/en` con middleware propio
- Tipografías: Unbounded, Courier Prime, Special Elite, Darker Grotesque

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

Guía detallada: **[`docs/IMAGES_AND_WEBP.md`](./docs/IMAGES_AND_WEBP.md)**.

- Cada entidad relevante tiene **`image_url`** en la base de datos (casi siempre **Supabase Storage**, no `public/images/`).
- **`displayImageUrl()`** (`src/lib/image-url.ts`) solo reescribe **rutas locales** `/images/*.jpg|png` → `.webp`. Las URLs de **Storage** se usan **tal cual** en la BD: el objeto debe existir con esa extensión.
- El componente **`CardThumbnail`** aplica esa normalización y muestra **placeholder** si no hay URL.
- Se usa en listados, fichas, home, blog y dashboard.

### My Breaks / interacción del usuario

Resumen de favoritos, **visto en vivo** en artistas (estrellas 1–5), **valorar evento** en la ficha del evento (mismo tipo de modal: fecha, sitio, estrellas, notas), asistencia y reseñas en el dashboard: **[`docs/USER_ENGAGEMENT.md`](./docs/USER_ENGAGEMENT.md)**. Migración Supabase **`032_event_ratings_attendance_fields.sql`** para los campos extra de la valoración de eventos.

### Vistas de listado (grande / compacto / lista)

En **Artistas**, **Sellos**, **Eventos**, **Escenas** y **Mixes** (cuando hay filas en Supabase) puedes cambiar la disposición de las tarjetas:

- **Grande** — rejilla amplia (o tarjetas estilo flyer en eventos y mixes).
- **Compacto** — rejilla densa; es la **vista por defecto** al cargar (no se guarda en URL ni `localStorage`).
- **Lista** — filas con miniatura cuadrada.

Componentes: `ViewToggle.tsx` más `ArtistsExplorer`, `LabelsExplorer`, `EventsExplorer`, `ScenesExplorer`, `MixesExplorer` en `src/components/`. Textos en `src/dictionaries/es.json` y `en.json` (`view_large`, `view_compact`, `view_list`).

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

## Secciones del sitio

Inicio, historia, artistas, sellos, **organizaciones** (`/organizations/[slug]`), eventos, escenas, blog, mixes, about, **login**, **dashboard** (usuario), **`/administrator`** (solo `profiles.role = admin`: CRUD + imágenes; sin enlace en el menú público), páginas legales. Listados desde Supabase en artistas, sellos, eventos, escenas y mixes: **tres vistas** (grande / compacto / lista; por defecto compacto). Detalle en [README.md](./README.md).

### Migraciones SQL (resumen)

Aplica `supabase/migrations/` en **orden alfabético**. Descripción detallada de cada archivo en el README en inglés.

---

## Roadmap (resumen)

Hecho: Supabase en listados, miniaturas y Storage, auth, dashboard, **JSON + `db:artist`**, **`/administrator`**, **vistas de listado** en las cinco secciones de referencia, **sitemap + robots** (`sitemap.ts`, `robots.ts`), segmento `/artists` sin caché agresiva de HTML, **GA4** (`@next/third-parties/google` + Consent Mode y cookies).  
Pendiente: búsqueda global, OG por sección, RSS, modo oscuro, etc.

---

## Licencia

Todos los derechos reservados © 2026 Optimal Breaks.
