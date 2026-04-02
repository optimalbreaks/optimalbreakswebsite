# Optimal Breaks — Prompts de IA y agentes editoriales

[English below](#english) · [Español arriba](#español)

---

## Español

### Política del proyecto

Los **textos de sistema** de los agentes editoriales (fichas de artista, sello, enriquecimiento de eventos) viven en el repositorio bajo **`scripts/prompts/*.txt`**. Así quedan **versionados en Git**, revisables y alineados con el despliegue. **No** hay tabla en Supabase para prompts; si en el futuro se añadiera una capa editable en BD, lo habitual sería un enfoque híbrido con **fallback** a estos archivos.

### Archivos de prompt (`.txt`)

| Archivo | Uso |
|---------|-----|
| `artista-agente-system.txt` | Agente de ficha de **artista** (CLI `generar-artista-agente.mjs`, API `POST /api/admin/agent`). |
| `artista-agente-revision-system.txt` | Modo **`--revise`** del CLI de artista: reglas adicionales al prompt de sistema. |
| `sello-agente-system.txt` | Agente de ficha de **sello** (`generar-sello-agente.mjs`, API `POST /api/admin/agent/label`). |
| `sello-agente-revision-system.txt` | Modo revisión del CLI de sello. |
| `evento-enriquecer-system.txt` | **Enriquecedor de eventos** (`scripts/enriquecer-evento.mjs`, API `POST /api/admin/agent/event`). |

Las **instrucciones de usuario** (checklist, slug, contexto web, notas) se arman en **código** en cada script o `route.ts`; no están centralizadas en un solo `.txt`.

### Variables de entorno (OpenAI / búsqueda)

Definidas en `.env.local` (plantilla: `.env.local.example`).

| Variable | Rol |
|----------|-----|
| **`OPENAI_API_KEY`** | Obligatoria donde haya llamadas a OpenAI. |
| **`OPENAI_MODEL`** | Opcional; el **valor por defecto depende del flujo** (ver tabla siguiente). |
| **`SERPAPI_API_KEY`** | Opcional; contexto web (Google) en agentes que lo soportan. |
| **`OPENAI_VISION_MODEL`** | Opcional en `elegir-foto-artista.mjs` (modo `--vision`). |

### Modelo por defecto (si no defines `OPENAI_MODEL`)

| Flujo | Default típico en código |
|--------|---------------------------|
| Artista (CLI + API admin) | `gpt-5.4` |
| Sello (API admin + CLI sello) | `gpt-5.4` |
| Enriquecer evento (CLI + API admin evento) | `gpt-4o-mini` |
| Elegir foto artista / sello, poster, logo (scripts y APIs relacionadas) | suele ser `gpt-5.4` salvo ramas vision (`gpt-4o-mini` u `OPENAI_VISION_MODEL`) |
| Perfil breakbeat (`/api/breakbeat-profile`) | `OPENAI_MODEL` si existe; si no, por defecto `gpt-5.4` |

Comprueba siempre el archivo concreto si cambias de modelo: los defaults pueden divergir entre flujos.

### Otros parámetros (temperatura, `max_tokens`, formato)

Van **en código** (fetch a `v1/chat/completions`), no en `.txt`. Ejemplos:

- Agente admin artista: `temperature`, `response_format: json_object` en `src/app/api/admin/agent/route.ts`.
- Enriquecedor de eventos: ver `scripts/enriquecer-evento.mjs` y `src/app/api/admin/agent/event/route.ts`.
- Perfil breakbeat: `max_tokens` y la longitud objetivo del análisis se controlan en `src/app/api/breakbeat-profile/route.ts`.

Los **límites de longitud de biografías** (p. ej. párrafos sugeridos) forman parte del **texto del prompt** o del bloque de usuario, no de una constante global única.

### Guías detalladas por agente

- **Artista — biografías y también fotos (SerpAPI → Storage, `--repair`, retratos en `public`):** [`docs/ARTIST_AI_AGENT.md`](./ARTIST_AI_AGENT.md).
- **Base de datos, enrich, posters, fotos:** [`scripts/guia-base-datos.mjs`](../scripts/guia-base-datos.mjs) (`node scripts/guia-base-datos.mjs` sin args).
- **Imágenes / WebP / Storage:** [`docs/IMAGES_AND_WEBP.md`](./IMAGES_AND_WEBP.md).
- **Favoritos, valoraciones, asistencia:** [`docs/USER_ENGAGEMENT.md`](./USER_ENGAGEMENT.md).

### Prompts fuera de `scripts/prompts/`

Algunas herramientas llevan **cadenas de sistema breves en el propio script** o en la ruta API, no en un `.txt` separado:

- **Elegir foto de artista:** `scripts/elegir-foto-artista.mjs` (texto + JSON de candidatos; modo `--vision` con miniaturas). API admin: `src/app/api/admin/agent/artist-photo/route.ts`.
- **Logos / carteles** (sellos, eventos): scripts y rutas API homólogas bajo `scripts/` y `src/app/api/admin/agent/`.

Si unifica criterios editoriales, busca en el fichero del script o en `src/app/api/...` correspondiente. Comandos y flags: sección *Fotos de artista* en [`ARTIST_AI_AGENT.md`](./ARTIST_AI_AGENT.md).

### Ver también

- [`README.md`](../README.md) — stack, env, comandos `npm run db:*`.
- [`README.es.md`](../README.es.md) — resumen en español y flujo de artistas.
- [`docs/README.md`](./README.md) — índice de toda la documentación Markdown y auditoría.
- [`IMAGES_AND_WEBP.md`](./IMAGES_AND_WEBP.md), [`USER_ENGAGEMENT.md`](./USER_ENGAGEMENT.md).

---

## English

### Project policy

**System prompts** for editorial agents (artist profiles, labels, event enrichment) live in the repo under **`scripts/prompts/*.txt`**. They are **Git-versioned** and ship with the app. There is **no** Supabase table for prompts today; a future DB-backed editor would typically use a **hybrid** approach with **fallback** to these files.

### Prompt files (`.txt`)

| File | Used by |
|------|---------|
| `artista-agente-system.txt` | **Artist** agent (`generar-artista-agente.mjs`, `POST /api/admin/agent`). |
| `artista-agente-revision-system.txt` | Artist CLI **`--revise`** mode: extra system rules. |
| `sello-agente-system.txt` | **Label** agent (`generar-sello-agente.mjs`, `POST /api/admin/agent/label`). |
| `sello-agente-revision-system.txt` | Label CLI revision mode. |
| `evento-enriquecer-system.txt` | **Event enricher** (`enriquecer-evento.mjs`, `POST /api/admin/agent/event`). |

**User-side instructions** (checklists, slug, web context, notes) are built in **code** in each script or `route.ts`.

### Environment variables

See `.env.local` / `.env.local.example`.

| Variable | Role |
|----------|------|
| **`OPENAI_API_KEY`** | Required for OpenAI calls. |
| **`OPENAI_MODEL`** | Optional; **defaults differ by flow** (table below). |
| **`SERPAPI_API_KEY`** | Optional web context (Google) where supported. |
| **`OPENAI_VISION_MODEL`** | Optional for `elegir-foto-artista.mjs` (`--vision`). |

### Default model when `OPENAI_MODEL` is unset

| Flow | Typical code default |
|------|----------------------|
| Artist (CLI + admin API) | `gpt-5.4` |
| Label (admin API + label CLI) | `gpt-5.4` |
| Event enrich (CLI + admin event API) | `gpt-4o-mini` |
| Artist/label photo pick, poster, logo scripts/APIs | often `gpt-5.4` except vision branches |
| Breakbeat profile API | `OPENAI_MODEL` if set; otherwise defaults to `gpt-5.4` |

Always check the specific file if you rely on a single global default.

### Other parameters (`temperature`, `max_tokens`, `response_format`)

Set **in code** (OpenAI HTTP API), not in `.txt`. Examples: admin artist route, `enriquecer-evento.mjs`, `breakbeat-profile/route.ts`. **Bio length hints** live inside prompt text, not one shared numeric cap.

### Deeper docs

- **Artist agent (bios + photos / repair / public portraits):** [`docs/ARTIST_AI_AGENT.md`](./ARTIST_AI_AGENT.md).
- **DB CLI catalogue:** [`scripts/guia-base-datos.mjs`](../scripts/guia-base-datos.mjs).
- **Images / WebP / Storage:** [`docs/IMAGES_AND_WEBP.md`](./IMAGES_AND_WEBP.md).
- **User favorites, ratings, attendance:** [`docs/USER_ENGAGEMENT.md`](./USER_ENGAGEMENT.md).

### Prompts not under `scripts/prompts/`

Some tools use **short inline system strings** in the script or API route:

- **Artist photo pick:** `scripts/elegir-foto-artista.mjs` (text + candidate JSON; `--vision` with thumbnails). Admin: `src/app/api/admin/agent/artist-photo/route.ts`.
- **Label logos / event posters:** sibling scripts and admin routes under `scripts/` and `src/app/api/admin/agent/`.

Commands and flags: *Artist photos* section in [`ARTIST_AI_AGENT.md`](./ARTIST_AI_AGENT.md).

### See also

- [`README.md`](../README.md), [`README.es.md`](../README.es.md).
- [`docs/README.md`](./README.md) — Markdown map and maintenance audit.
- [`IMAGES_AND_WEBP.md`](./IMAGES_AND_WEBP.md), [`USER_ENGAGEMENT.md`](./USER_ENGAGEMENT.md).
