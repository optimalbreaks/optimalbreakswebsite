# Optimal Breaks — Artist biography agent (AI)

[English below](#english) · [Español arriba](#español)

---

## Español

### Qué hace

El **agente de fichas de artista** genera con OpenAI (y búsqueda opcional) un objeto con el esquema de la tabla `artists` de Supabase: biografías bilingües (EN/ES), estilos, tracks esenciales, sellos fundados, lanzamientos clave, relacionados, redes, etc.

**Por defecto** el CLI hace **UPSERT vía API REST de Supabase** (misma lógica que `npm run db:artist`: `NEXT_PUBLIC_SUPABASE_URL` + **service role** / **secret**; `lib/artist-upsert.mjs` **no** usa Postgres/`pg`). La web sigue leyendo solo la base de datos.

- **`--json-only`** — no toca la BD; escribe solo `data/artists/<slug>.json`.
- **`--save-json`** — además del UPSERT, guarda copia en `data/artists/<slug>.json`.
- **`--stdout`** — imprime JSON por consola; sin escritura a disco ni a BD.

Los archivos **`data/artists/*.json`** están en **`.gitignore`** (canónico en Supabase); se generan o editan solo en local.

### Archivos implicados

| Ruta | Rol |
|------|-----|
| `scripts/generar-artista-agente.mjs` | CLI: OpenAI + SerpAPI opcional → UPSERT en BD (opcional JSON) |
| `scripts/prompts/artista-agente-system.txt` | Prompt de sistema (reglas editoriales y esquema JSON) |
| `src/app/api/admin/agent/route.ts` | POST: genera con el modelo y **persiste** vía `scripts/lib/artist-upsert.mjs` |
| `scripts/lib/artist-upsert.mjs` | UPSERT compartido solo por REST (CLI agente, `actualizar-artista`, API admin) |
| `scripts/actualizar-artista.mjs` | UPSERT desde un archivo JSON → Supabase |
| `scripts/ensure-artist-json-in-db.mjs` | Comprueba JSON vs fila en BD y sincroniza si difiere |
| `src/lib/artist-entity-match.ts` | En fichas públicas: enlazar nombres de `related_artists` a slugs del directorio |

### Variables de entorno

Definidas en `.env.local` (ver `.env.local.example`):

- **`OPENAI_API_KEY`** — obligatoria para el agente.
- **`OPENAI_MODEL`** — opcional; por defecto el código usa **`gpt-5.4`**.
- **`SERPAPI_API_KEY`** — opcional; snippets de Google para contexto (si falta, el agente usa solo el modelo).
- Para **escribir en `artists`** (agente por defecto, `db:artist`, batch): `NEXT_PUBLIC_SUPABASE_URL` + **`SUPABASE_SERVICE_ROLE_KEY`** / **`SUPABASE_SECRET_KEY`**. La clave **anon/publishable** no vale para upsert. `DATABASE_URL` solo aplica a migraciones (`db:migrate`), no a estos scripts.

### Comandos (npm)

**Un artista (genera y hace UPSERT en Supabase por defecto):**

```bash
npm run db:artist:agent -- <slug-kebab> "Nombre para búsqueda"
```

Opciones útiles:

- `--notes ruta.txt` — notas del editor (máxima prioridad frente a web/modelo).
- `--no-search` — sin SerpAPI.
- `--stdout` — imprime JSON por consola; sin archivo ni BD.
- `--json-only` — solo `data/artists/<slug>.json`, sin BD.
- `--save-json` — UPSERT + copia JSON en disco.

**Batch: todos los artistas ya existentes en Supabase** (regenera con IA y **vuelve a guardar en la misma tabla**):

```bash
npm run db:artist:agent:all
```

Opciones del batch:

- `--limit N` — solo los primeros N (pruebas).
- `--delay-ms ms` — pausa entre llamadas (por defecto 3000).
- `--no-search` — sin búsqueda web.
- `--skip=slug1,slug2` — no regenerar esos slugs.
- `--save-json` — además del UPSERT, escribe/actualiza el JSON en `data/artists/`.
- `--json-only` — solo archivos JSON (no recomendado si quieres publicar en web sin paso extra).

Cada artista implica llamadas a **OpenAI** (y opcionalmente **SerpAPI**). Un lote grande puede llevar **horas** y un **coste notable** en API.

**Registrar el progreso del batch:** en terminal puedes redirigir la salida estándar a un archivo (por ejemplo `agent-batch-log.txt` en la raíz del repo) para conservar el índice y los slugs procesados si se interrumpe la sesión.

**Subir un JSON existente → Supabase (sin pasar por el agente):**

```bash
npm run db:artist -- data/artists/<slug>.json
```

**Comprobar que la BD coincide con un JSON y sincronizar si no:**

```bash
npm run db:artist:ensure -- data/artists/<slug>.json
```

**Sincronizar muchos JSON** (PowerShell, desde la raíz del repo):

```powershell
Get-ChildItem "data\artists\*.json" | ForEach-Object { npm run db:artist -- ("data/artists/" + $_.Name) }
```

Git Bash:

```bash
for f in data/artists/*.json; do npm run db:artist -- "$f"; done
```

### Publicación en la web y caché

La app **no** lee los archivos de `data/artists/` en runtime: solo **Supabase**. Tras `db:artist`, la ficha debería reflejar la BD en cuanto el proyecto desplegado use la **misma** `NEXT_PUBLIC_SUPABASE_URL`.

Si el panel de Supabase está bien pero la URL pública enseña texto viejo: comprobar que Vercel apunta al mismo proyecto; las rutas **`/artists`** están configuradas para **no cachear** HTML de forma agresiva (segment layout `revalidate` / `fetchCache`, cabeceras `no-store` en `next.config.js`, y el PWA **`public/sw.js`** no almacena HTML de URLs que contienen `/artists`). Tras un deploy que actualice el SW, conviene recarga forzada o ventana privada en dispositivos que ya tenían caché antigua.

Las filas creadas por **`npm run db:user-list`** llevan una **bio placeholder** corta hasta que sustituyes con el agente (UPSERT por defecto), `db:artist` desde JSON o el panel admin.

### Flujo recomendado

1. Ejecutar el agente (uno o batch); con credenciales de escritura, la ficha queda ya en Supabase.
2. Revisar en la web o en admin (años, sellos fundados, URLs). Si trabajas solo con archivos JSON, `npm run db:artist` sigue siendo la vía explícita al disco → BD.

### Calidad de los campos estructurados

El prompt pide prudencia: sin inventar URLs, distinguir sellos **fundados** de sellos donde solo publicó, `related_artists` coherentes, etc. Aun así conviene **revisión humana**; el script solo normaliza tipos básicos, no valida veracidad.

### Panel admin

Ruta de API: `POST /api/admin/agent` (cuerpo JSON con `slug`, `artistName`, notas opcionales, `search` boolean). Requiere sesión de administrador. Tras generar, el servidor hace **UPSERT** en `artists`. La respuesta incluye `artist`, `saved`, `row` o `dbError` si falló la escritura.

### Ver también (resto del repo)

- Esquema de base de datos, migraciones SQL (incl. **`010`–`011`** organizaciones / Raveart) y tabla de scripts: [**README.md**](../README.md) · resumen ES: [**README.es.md**](../README.es.md).
- Subir un archivo local al bucket **`media`**: `npm run media:upload` → [`scripts/upload-storage-media.mjs`](../scripts/upload-storage-media.mjs).
- Analítica web (GA4, variables `NEXT_PUBLIC_GA_MEASUREMENT_ID`, Consent Mode): [**README.md** — Analytics](../README.md#analytics-google-analytics-4) · [**README.es.md**](../README.es.md) (sección *Analítica (GA4)*).

---

## English

### What it does

The **artist profile agent** uses OpenAI (and optional web search) to produce an object matching the Supabase `artists` schema: bilingual bios (EN/ES), styles, essential tracks, labels founded, key releases, related artists, socials, etc.

**By default** the CLI **UPSERTs via Supabase REST API** (same as `npm run db:artist`: `NEXT_PUBLIC_SUPABASE_URL` + **service role** / **secret**; `lib/artist-upsert.mjs` does **not** use Postgres/`pg`). The site still reads only the database.

- **`--json-only`** — skip the DB; write only `data/artists/<slug>.json`.
- **`--save-json`** — UPSERT **and** save a copy under `data/artists/<slug>.json`.
- **`--stdout`** — print JSON to stdout; no disk or DB writes.

**`data/artists/*.json`** files are **gitignored** (Supabase is canonical); create or edit them only locally.

### Files involved

| Path | Role |
|------|------|
| `scripts/generar-artista-agente.mjs` | CLI: OpenAI + optional SerpAPI → UPSERT (optional JSON file) |
| `scripts/prompts/artista-agente-system.txt` | System prompt (editorial rules + JSON shape) |
| `src/app/api/admin/agent/route.ts` | POST: model output, then **persist** via `scripts/lib/artist-upsert.mjs` |
| `scripts/lib/artist-upsert.mjs` | Shared UPSERT over HTTP only (agent CLI, `actualizar-artista`, admin API) |
| `scripts/actualizar-artista.mjs` | UPSERT from a JSON file → Supabase |
| `scripts/ensure-artist-json-in-db.mjs` | Compare JSON vs DB row and sync if different |
| `src/lib/artist-entity-match.ts` | Public artist pages: map `related_artists` names to internal slugs |

### Environment variables

Set in `.env.local` (see `.env.local.example`):

- **`OPENAI_API_KEY`** — required for the agent.
- **`OPENAI_MODEL`** — optional; default in code is **`gpt-5.4`**.
- **`SERPAPI_API_KEY`** — optional; Google snippets for context (if missing, model-only).
- To **write `artists`** (default agent, `db:artist`, batch): `NEXT_PUBLIC_SUPABASE_URL` + **`SUPABASE_SERVICE_ROLE_KEY`** / **`SUPABASE_SECRET_KEY`**. The **anon/publishable** key cannot upsert. `DATABASE_URL` is for migrations (`db:migrate`), not these scripts.

### Commands (npm)

**Single artist (default: UPSERT to Supabase):**

```bash
npm run db:artist:agent -- <kebab-slug> "Name for search context"
```

Useful flags:

- `--notes path.txt` — editor notes (highest priority vs web/model).
- `--no-search` — skip SerpAPI.
- `--stdout` — print JSON to stdout; no file or DB.
- `--json-only` — JSON file only, no DB.
- `--save-json` — UPSERT + JSON copy on disk.

**Batch: every artist row already in Supabase** (regenerates with AI and **writes back** to the same table):

```bash
npm run db:artist:agent:all
```

Batch flags:

- `--limit N` — first N only (smoke tests).
- `--delay-ms ms` — pause between calls (default 3000).
- `--no-search` — no web search.
- `--skip=slug1,slug2` — skip those slugs.
- `--save-json` — also write/update files under `data/artists/`.
- `--json-only` — JSON files only (not recommended if you want the live site updated without an extra step).

Each row triggers **OpenAI** (and optionally **SerpAPI**). Large batches can take **hours** and cost real money.

**Log batch progress:** redirect stdout to a file (e.g. `agent-batch-log.txt` at the repo root) so you keep a record of index and slugs if the run stops mid-way.

**Push an existing JSON file → Supabase (without running the agent):**

```bash
npm run db:artist -- data/artists/<slug>.json
```

**Verify DB matches a JSON file and sync if not:**

```bash
npm run db:artist:ensure -- data/artists/<slug>.json
```

**Bulk sync many JSON files** (PowerShell, repo root):

```powershell
Get-ChildItem "data\artists\*.json" | ForEach-Object { npm run db:artist -- ("data/artists/" + $_.Name) }
```

Git Bash:

```bash
for f in data/artists/*.json; do npm run db:artist -- "$f"; done
```

### Publishing & cache

The app **does not** read `data/artists/*.json` at runtime — only **Supabase**. After `db:artist`, the live profile should match the DB as long as the deployment’s **`NEXT_PUBLIC_SUPABASE_URL`** is the same project you updated.

If Supabase looks correct but the public URL shows old copy: confirm Vercel env matches that project. **`/artists`** routes are set up to avoid aggressive HTML caching (segment `revalidate` / `fetchCache`, `no-store` headers in `next.config.js`, and PWA **`public/sw.js`** skips caching HTML for URLs containing `/artists`). After a deploy that ships a new SW, use a hard refresh or private window on clients that kept an old cache.

Rows created by **`npm run db:user-list`** ship a **short placeholder** bio until you replace them via the agent (default UPSERT), `db:artist` from JSON, or admin.

### Recommended workflow

1. Run the agent (single or batch); with write credentials, the row is already in Supabase.
2. Fact-check on the site or in admin (years, labels founded, URLs). If you only maintain JSON files on disk, `npm run db:artist` remains the explicit file → DB path.

### Structured field quality

The prompt is conservative: no invented URLs, **labels founded** vs labels where the artist only released, sensible **related_artists**, etc. **Human review** is still advised; scripts normalize shapes, not truth.

### Admin API

`POST /api/admin/agent` with JSON body (`slug`, `artistName`, optional notes, `search` boolean). Requires admin session. After validation, the server attempts an **UPSERT** into `artists`. Response includes `artist`, `saved`, `row`, or `dbError` if the write failed (retry from the UI).

### See also (rest of repo)

- Full database schema, SQL migrations (including **`010`–`011`** organizations / Raveart), and npm scripts table: [**README.md**](../README.md) · Spanish summary: [**README.es.md**](../README.es.md).
- Upload a local file to the **`media`** bucket: `npm run media:upload` → [`scripts/upload-storage-media.mjs`](../scripts/upload-storage-media.mjs).
- Web analytics (GA4, `NEXT_PUBLIC_GA_MEASUREMENT_ID`, Consent Mode): [**README.md** — Analytics](../README.md#analytics-google-analytics-4) · [**README.es.md**](../README.es.md) (section *Analítica (GA4)*).
