# Optimal Breaks — Artist biography agent (AI)

[English below](#english) · [Español arriba](#español)

---

## Español

### Qué hace

El **agente de fichas de artista** genera o reescribe un archivo JSON con el esquema de la tabla `artists` de Supabase: biografías bilingües (EN/ES), estilos, tracks esenciales, sellos fundados, lanzamientos clave, relacionados, redes, etc.

**Importante:** el agente **solo escribe** `data/artists/<slug>.json` en disco. **No actualiza Supabase.** La web lee siempre la base de datos; para publicar hay que ejecutar `npm run db:artist` (o el flujo de verificación/sync indicado abajo).

### Archivos implicados

| Ruta | Rol |
|------|-----|
| `scripts/generar-artista-agente.mjs` | CLI: OpenAI + SerpAPI opcional → JSON |
| `scripts/prompts/artista-agente-system.txt` | Prompt de sistema (reglas editoriales y esquema JSON) |
| `src/app/api/admin/agent/route.ts` | Misma lógica vía POST (panel admin, requiere admin) |
| `scripts/actualizar-artista.mjs` | UPSERT del JSON → Supabase |
| `scripts/ensure-artist-json-in-db.mjs` | Comprueba JSON vs fila en BD y sincroniza si difiere |

### Variables de entorno

Definidas en `.env.local` (ver `.env.local.example`):

- **`OPENAI_API_KEY`** — obligatoria para el agente.
- **`OPENAI_MODEL`** — opcional; por defecto el código usa **`gpt-5.4`**.
- **`SERPAPI_API_KEY`** — opcional; snippets de Google para contexto (si falta, el agente usa solo el modelo).
- Para **leer la lista de artistas en batch** y para **`db:artist`**: `NEXT_PUBLIC_SUPABASE_URL` + **`SUPABASE_SERVICE_ROLE_KEY`** o **`SUPABASE_SECRET_KEY`**.

### Comandos (npm)

**Un artista (genera/actualiza el JSON):**

```bash
npm run db:artist:agent -- <slug-kebab> "Nombre para búsqueda"
```

Opciones útiles:

- `--notes ruta.txt` — notas del editor (máxima prioridad frente a web/modelo).
- `--no-search` — sin SerpAPI.
- `--stdout` — imprime JSON por consola sin escribir archivo.

**Batch: todos los artistas ya existentes en Supabase** (mismo `slug` y `name` de la tabla):

```bash
npm run db:artist:agent:all
```

Opciones del batch:

- `--limit N` — solo los primeros N (pruebas).
- `--delay-ms ms` — pausa entre llamadas (por defecto 3000).
- `--no-search` — sin búsqueda web.
- `--skip=slug1,slug2` — no regenerar esos slugs.

Cada artista implica llamadas a **OpenAI** (y opcionalmente **SerpAPI**). Un lote grande puede llevar **horas** y un **coste notable** en API.

**Subir JSON → Supabase (uno):**

```bash
npm run db:artist -- data/artists/<slug>.json
```

**Comprobar que la BD coincide con un JSON y sincronizar si no:**

```bash
npm run db:artist:ensure -- data/artists/<slug>.json
```

**Sincronizar muchos JSON** (PowerShell, desde la raíz del repo):

```powershell
Get-ChildItem "data\artists\*.json" | ForEach-Object { node scripts/actualizar-artista.mjs $_.FullName }
```

### Flujo recomendado

1. Ejecutar el agente (uno o batch).
2. Revisar hechos en los JSON (especialmente años, sellos fundados, URLs).
3. `npm run db:artist` (o bulk) contra el **mismo** proyecto Supabase que usa el despliegue (`NEXT_PUBLIC_SUPABASE_URL` en Vercel u host).

### Calidad de los campos estructurados

El prompt pide prudencia: sin inventar URLs, distinguir sellos **fundados** de sellos donde solo publicó, `related_artists` coherentes, etc. Aun así conviene **revisión humana**; el script solo normaliza tipos básicos, no valida veracidad.

### Panel admin

Ruta de API: `POST /api/admin/agent` (cuerpo JSON con `slug`, `artistName`, notas opcionales, `search` boolean). Requiere sesión de administrador. Misma idea que el CLI: respuesta JSON del modelo; no sustituye al `db:artist` para persistir en masa.

---

## English

### What it does

The **artist profile agent** generates or rewrites a JSON file matching the Supabase `artists` table schema: bilingual bios (EN/ES), styles, essential tracks, labels founded, key releases, related artists, socials, etc.

**Important:** the agent **only writes** `data/artists/<slug>.json` on disk. It **does not** update Supabase. The site always reads the database; to publish, run `npm run db:artist` (or the verify/sync flow below).

### Files involved

| Path | Role |
|------|------|
| `scripts/generar-artista-agente.mjs` | CLI: OpenAI + optional SerpAPI → JSON |
| `scripts/prompts/artista-agente-system.txt` | System prompt (editorial rules + JSON shape) |
| `src/app/api/admin/agent/route.ts` | Same logic via POST (admin UI, admin auth required) |
| `scripts/actualizar-artista.mjs` | UPSERT JSON → Supabase |
| `scripts/ensure-artist-json-in-db.mjs` | Compare JSON vs DB row and sync if different |

### Environment variables

Set in `.env.local` (see `.env.local.example`):

- **`OPENAI_API_KEY`** — required for the agent.
- **`OPENAI_MODEL`** — optional; default in code is **`gpt-5.4`**.
- **`SERPAPI_API_KEY`** — optional; Google snippets for context (if missing, model-only).
- For **batch artist list** and **`db:artist`**: `NEXT_PUBLIC_SUPABASE_URL` + **`SUPABASE_SERVICE_ROLE_KEY`** or **`SUPABASE_SECRET_KEY`**.

### Commands (npm)

**Single artist (writes/updates the JSON file):**

```bash
npm run db:artist:agent -- <kebab-slug> "Name for search context"
```

Useful flags:

- `--notes path.txt` — editor notes (highest priority vs web/model).
- `--no-search` — skip SerpAPI.
- `--stdout` — print JSON to stdout; do not write a file.

**Batch: every artist row already in Supabase** (uses `slug` and `name` from the table):

```bash
npm run db:artist:agent:all
```

Batch flags:

- `--limit N` — first N only (smoke tests).
- `--delay-ms ms` — pause between calls (default 3000).
- `--no-search` — no web search.
- `--skip=slug1,slug2` — skip those slugs.

Each row triggers **OpenAI** (and optionally **SerpAPI**). Large batches can take **hours** and cost real money.

**Push JSON → Supabase (one file):**

```bash
npm run db:artist -- data/artists/<slug>.json
```

**Verify DB matches a JSON file and sync if not:**

```bash
npm run db:artist:ensure -- data/artists/<slug>.json
```

**Bulk sync many JSON files** (PowerShell, repo root):

```powershell
Get-ChildItem "data\artists\*.json" | ForEach-Object { node scripts/actualizar-artista.mjs $_.FullName }
```

### Recommended workflow

1. Run the agent (single or batch).
2. Fact-check JSON (especially years, labels founded, URLs).
3. Run `npm run db:artist` (or bulk) against the **same** Supabase project as production (`NEXT_PUBLIC_SUPABASE_URL` on Vercel/host).

### Structured field quality

The prompt is conservative: no invented URLs, **labels founded** vs labels where the artist only released, sensible **related_artists**, etc. **Human review** is still advised; scripts normalize shapes, not truth.

### Admin API

`POST /api/admin/agent` with JSON body (`slug`, `artistName`, optional notes, `search` boolean). Requires admin session. Same idea as CLI: model JSON in the response; use `db:artist` to persist at scale.
