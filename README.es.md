# OPTIMAL BREAKS — La biblia del breakbeat

> Archivo, revista, guía, agenda y memoria de escena. Proyecto dedicado a preservar y celebrar la cultura breakbeat en todo el mundo.

La documentación técnica completa está en inglés en [**README.md**](./README.md). Aquí va un resumen en español **y el flujo recomendado para actualizar artistas**.

---

## Qué es

Plataforma web **bilingüe (ES/EN)** sobre historia, artistas, sellos, eventos, escenas y cultura del **breakbeat**. Incluye un **DJ deck** interactivo (audio real y scratch), estética fanzine/club, y secciones editoriales y de referencia.

---

## Stack principal

- **Next.js 14** (App Router), **TypeScript**, **Tailwind** 3.4
- **Supabase**: PostgreSQL + autenticación + **Storage** (bucket público `media` para fotos de contenido)
- Rutas `/es` y `/en` con middleware propio
- Tipografías: Unbounded, Courier Prime, Special Elite, Darker Grotesque

---

## Actualizar artistas (forma recomendada)

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

### Cómo se conecta el script

| Modo | Cuándo |
|------|--------|
| **Postgres directo** | Si tienes `DATABASE_URL` (u otros alias del `.env.local.example`) o `SUPABASE_DB_PASSWORD` + `NEXT_PUBLIC_SUPABASE_URL` — igual que `npm run db:seed`. |
| **API de Supabase** | Si **no** hay URI/contraseña de Postgres: `NEXT_PUBLIC_SUPABASE_URL` + **`SUPABASE_SERVICE_ROLE_KEY`** o **`SUPABASE_SECRET_KEY`** (formato nuevo `sb_secret_*`). |

La clave **anon** o **publishable** (`sb_publishable_*`) **no sirve** para este script: no puede escribir en `artists` con los permisos habituales. Las claves JWT / `sb_*` **no son** la contraseña de PostgreSQL; para ejecutar SQL masivo con `npm run db:migrate` sigues necesitando conexión a la base de datos.

### Estructura del proyecto (artistas)

- `data/artists/*.json` — datos por artista
- `scripts/actualizar-artista.mjs` — lógica del upsert
- [`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md) — guía completa del **agente IA** (español e inglés): batch, variables, sync con Supabase, API admin

Más detalle y tabla de migraciones SQL en [README.md](./README.md).

### Agente de biografías (OpenAI)

Genera o reescribe **`data/artists/<slug>.json`** (mismo esquema que `db:artist`). **No escribe en Supabase:** la web lee la base; después del agente hay que ejecutar **`npm run db:artist`**.

Documentación detallada: **[`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md)**. Prompt del sistema: **`scripts/prompts/artista-agente-system.txt`**.

```bash
npm run db:artist:agent -- plump-djs "Plump DJs"
npm run db:artist:agent:all                                    # todos los artistas en BD → JSON (coste API)
npm run db:artist:ensure -- data/artists/deekline.json         # comprobar JSON vs BD y sincronizar si difiere
```

Necesitas **`OPENAI_API_KEY`**. Por defecto **`gpt-5.4`**; **`OPENAI_MODEL`** lo sobrescribe. Opcional **`SERPAPI_API_KEY`**. Revisa siempre hechos antes de publicar.

---

## Variables de entorno (resumen)

Copia `.env.local.example` → `.env.local`.

- **Cliente (navegador):** `NEXT_PUBLIC_SUPABASE_URL` + **`NEXT_PUBLIC_SUPABASE_ANON_KEY`** *o* **`NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`** (`sb_publishable_*`).
- **Solo servidor** (Storage admin, `db:artist` vía API): **`SUPABASE_SERVICE_ROLE_KEY`** *o* **`SUPABASE_SECRET_KEY`** (`sb_secret_*`). Nunca en `NEXT_PUBLIC_*`.
- **Postgres** (opcional, para `db:migrate` / `db:seed`): ver comentarios en `.env.local.example`.
- **Agente de bios** (opcional): `OPENAI_API_KEY`, opcionalmente `OPENAI_MODEL`, y si quieres búsqueda web `SERPAPI_API_KEY` (ver `.env.local.example` y [`docs/ARTIST_AI_AGENT.md`](./docs/ARTIST_AI_AGENT.md)).

---

## Imágenes

- Cada entidad relevante tiene **`image_url`** en la base de datos.
- El componente **`CardThumbnail`** muestra la foto o un **placeholder** (iniciales + rayas) si no hay URL.
- Se usa en listados, fichas de detalle, home, blog (lista y artículo) y favoritos del dashboard.
- Las URLs pueden ser de **Supabase Storage** (`/storage/v1/object/public/media/...`) u otros HTTPS.

---

## Storage en Supabase

1. Aplica la migración **`supabase/migrations/005_storage_media.sql`** en tu proyecto.
2. Sube archivos al bucket **`media`** (panel de Supabase o código servidor con **service role** o **secret key**).
3. Guarda la URL pública en la columna **`image_url`** correspondiente.

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

Aplica las migraciones SQL de `supabase/migrations/` **en orden alfabético** en el panel de Supabase, o `npm run db:migrate` si tienes URI de Postgres configurada.

---

## Secciones del sitio

Inicio, historia, artistas, sellos, eventos, escenas, blog, mixes, about, **login**, **dashboard** (usuario), páginas legales (privacidad, términos, cookies). Detalle en la tabla del README principal.

---

## Roadmap (resumen)

Hecho: datos desde Supabase en listados, miniaturas y bucket de imágenes, auth y dashboard básico, **actualización de artistas por JSON + `db:artist`**.  
Pendiente: panel admin visual, búsqueda, SEO avanzado (OG), RSS, etc.

---

## Licencia

Todos los derechos reservados © 2026 Optimal Breaks.
