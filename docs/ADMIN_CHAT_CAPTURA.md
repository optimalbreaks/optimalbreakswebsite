# Chat editorial / Captura PWA — Optimal Breaks

[English below](#english) · [Español arriba](#español)

---

## Español

### Qué es

Canal **solo admin** (`profiles.role = admin`) con un **agente conversacional** (OpenAI tool-calling): texto, capturas y links. El agente lee la BD/web, **prepara** altas (eventos, sellos, artistas, mixes, NR, vinyl, CRUD admin, SQL) y **solo escribe tras Confirmar**.

Chips de modo (Evento / Sello / Artista / NR / Vinyl / Mix) = **hint**. Persistencia de hilos: `admin_chat_threads` / `admin_chat_messages` (migración `062`).

Pensado también para **PWA móvil** (Share Target → chat → confirmar).

### Dónde abrir

| Entrada | Ruta |
|---------|------|
| Captura fullscreen (PWA) | `/[lang]/administrator/chat` |
| Pestaña en centro de agentes | `/[lang]/administrator/agent` → «Chat editorial» |
| FAB «Captura» (abajo-izquierda, solo admin) | `AdminCaptureFab` |
| Atajo PWA / Web Share Target | `public/manifest.json` → `/share-target` → chat |

### Flujo del agente

1. **Cliente** (`AgentChat.tsx`): mensaje/captura → `POST /api/admin/agent/chat` (+ `thread_id`, `intent`).
2. **Agente** (`src/lib/admin-chat-agent.ts`): loop OpenAI con **tools** (buscar BD, web, OCR, `stage_*`).
3. Respuesta con `reply` + **`pending_ops`**. UI muestra tarjeta **Confirmar / Cancelar**.
4. Confirmar → `confirm_ops` → `executePendingOps` (reutiliza upserts de `admin-chat.ts` + APIs agente + CRUD/SQL).
5. Evento confirmado: UPSERT + dedupe; enrich/cartel en **segundo plano** (`waitUntil`, poster `light: true`).

### Barra de progreso (UI)

Etapas orientativas (sin stream): Enviando → Agente/tools → Preparando ops. Tras Confirmar, el guardado real está en la respuesta de `confirm_ops`.

### Cartel oficial — visión / OCR (obligatorio)

**No** elegir flyer solo por títulos de Google Imágenes (Google atribuye mal; caso real: Stanton Sessions vs C.A.Y.A. by fabric).

| Pieza | Comportamiento |
|-------|----------------|
| Script CLI | `scripts/elegir-poster-evento.mjs` — **visión/OCR por defecto**; `--metadata-only` = escape frágil |
| API admin | `POST /api/admin/agent/event-poster` — visión/OCR; body `{ slug, light?: boolean }` |
| Chat | siempre `light: true` (hasta 6 thumbs, `detail: low`) para no colgar |
| CLI / API “completa” | hasta 8 candidatos, preferir original, `detail: high` |
| Prompt | leer texto del cartel; rechazar si es **otro** evento aunque el metadato diga lo contrario |

Comandos:

```bash
npm run db:events:poster -- <slug>
# o
node scripts/guia-base-datos.mjs run events-poster <slug>
# Solo metadatos (no recomendado):
node scripts/elegir-poster-evento.mjs <slug> --metadata-only
```

Enriquecer ficha + cartel:

```bash
node scripts/guia-base-datos.mjs run events-enrich <slug> --with-poster [--force]
```

### Tools / destinos

| Tool / op | Destino |
|-----------|---------|
| `stage_upsert_event` | `events` (+ enrich/cartel al confirmar) |
| `stage_upsert_label` | `/api/admin/agent/label` → `labels` |
| `stage_upsert_artist` | `/api/admin/agent` → `artists` |
| `stage_upsert_mix` | `mixes` |
| `stage_new_releases` | `featured-import` / `chart_featured_tracks` |
| `stage_vinyl_picks` | `chart_vinyl_tracks` |
| `stage_db_*` / `db_*` | CRUD tablas admin |
| `db_sql_read` / `stage_db_sql_write` | Postgres (`DATABASE_URL`) |

Prompt: **`scripts/prompts/admin-chat-system.txt`**.

### Archivos clave

| Archivo | Rol |
|---------|-----|
| `src/components/admin/AgentChat.tsx` | UI conversacional + Confirmar |
| `src/app/api/admin/agent/chat/route.ts` | Endpoint agente + hilos |
| `src/lib/admin-chat-agent.ts` | Tool loop, pending_ops, SQL, persistencia |
| `src/lib/admin-chat.ts` | Upserts, OCR, enrich/poster en background |
| `supabase/migrations/062_admin_chat_threads.sql` | Hilos/mensajes |
| `src/app/api/admin/agent/event/route.ts` | Enrich evento |
| `src/app/api/admin/agent/event-poster/route.ts` | Cartel (visión/OCR, `maxDuration = 120`) |
| `scripts/elegir-poster-evento.mjs` | CLI carteles |
| `scripts/enriquecer-evento.mjs` | CLI enrich |
| `scripts/prompts/admin-chat-system.txt` | System prompt del plan |
| `scripts/prompts/evento-enriquecer-system.txt` | Enrich |
| `public/manifest.json` / `public/sw.js` | Share Target PWA |
| `src/app/share-target/route.ts` | Recibe shares |
| `src/lib/share-inbox.ts` | Inbox SW |

### Credenciales

- `OPENAI_API_KEY` (obligatoria)
- `OPENAI_MODEL` / `OPENAI_VISION_MODEL` (opcionales)
- `SERPAPI_API_KEY` (imágenes cartel + fallback web)
- `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` (o `SUPABASE_SECRET_KEY`)

### PWA / Share Target

1. Usuario comparte imagen/link a Optimal Breaks.
2. SW o ruta `/share-target` guarda/sube y redirige al chat.
3. Admin envía → mismo pipeline.

### Invariantes

1. **Upsert directo** — no pedir confirmación si hay nombre de evento.
2. **No fingir “Guardado”** sin `results` OK / fila en BD.
3. **Duplicados** — actualizar, no crear otra ficha.
4. **Captura `media/chat/`** = provisional; buscar cartel oficial.
5. **Cartel = OCR visual**, no solo metadatos SerpAPI.
6. **Chat no debe colgarse** en OCR pesado: `light` + paralelo + timeouts; el evento ya está persistido.
7. New Releases: semana = release Beatport (regla `charts-new-releases-supabase`).

### Relación con Cursor / CLI

El chat **no sustituye** del todo a Cursor para fichas largas, pero cubre el alta rápida desde móvil. Para retoques:

- `run events-enrich <slug> --force --with-poster`
- `run events-poster <slug>`
- Regla: **`base-de-datos-sin-dejar-trabajo-al-usuario`**.

### Troubleshooting

| Síntoma | Qué mirar |
|---------|-----------|
| “Guardando…” eterno (antes del fix) | Enrich+cartel en serie + OCR hi-res; ver `admin-chat.ts` paralelo + `light` |
| Guardado OK, cartel mal | OCR; reejecutar `events-poster` / subir flyer a `public/images/events/` + WebP |
| Evento duplicado | `findDuplicateEvent`; borrar slug malo (`events-delete-slug`) |
| Preview negra en chat | Previews `data:` URL, no `blob:` revocado |
| TLS / `fetch failed` en scripts locales | Red Acttax: `NODE_EXTRA_CA_CERTS` o Node con `--use-system-ca` (ver README) |

---

## English

### What it is

**Admin-only conversational agent** (OpenAI tool-calling): screenshots, text, links. Reads the DB/web, **stages** writes (events, labels, artists, mixes, NR, vinyl, admin CRUD, SQL), and **only persists after Confirm**. Mobile PWA Share Target supported.

### Entry points

- Fullscreen: `/[lang]/administrator/chat`
- Agents hub tab: `/[lang]/administrator/agent`
- FAB + Web Share Target (`manifest` / `sw.js` → `/share-target`)

### Agent flow

Message → tool loop (`admin-chat-agent.ts`) → `pending_ops` → Confirm → `executePendingOps`. Event upsert still dedupes; enrich/poster run in background (`light: true`).

### Poster selection

**Vision/OCR by default**. Chat poster uses **`light: true`**.

### Progress UI

Client-side staged progress (not a server stream). Confirm card for pending ops.

### Key files / env

`admin-chat-agent.ts`, `admin-chat.ts`, migration `062_admin_chat_threads.sql`. Prompt: `scripts/prompts/admin-chat-system.txt`. Env: OpenAI + SerpAPI + Supabase service role (+ `DATABASE_URL` for SQL tools).

### See also

- [`AI_PROMPTS_AND_AGENTS.md`](./AI_PROMPTS_AND_AGENTS.md)
- [`guia-base-datos.mjs`](../scripts/guia-base-datos.mjs) — `events-enrich`, `events-poster`
- Cursor rules: `base-de-datos-sin-dejar-trabajo-al-usuario`, `charts-new-releases-supabase`, `admin-chat-captura`
