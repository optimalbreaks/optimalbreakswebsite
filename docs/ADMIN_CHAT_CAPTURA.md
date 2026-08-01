# Chat editorial / Captura PWA — Optimal Breaks

[English below](#english) · [Español arriba](#español)

---

## Español

### Qué es

Canal **solo admin** (`profiles.role = admin`) con un **agente conversacional** de OpenAI (**tool-calling**): texto, capturas, links.

El agente puede **leer** la BD y la web, **preparar** altas/cambios (eventos, sellos, artistas, mixes, New Releases, vinyl, CRUD admin, SQL) y **solo escribe en Supabase tras Confirmar** (botón o «sí» / «adelante»).

Pensado también para **PWA móvil** (Share Target → chat → confirmar).

### Dónde abrir

El chat es un **widget flotante** (estilo chatbot), no una página a pantalla completa.

| Entrada | Qué hace |
|---------|----------|
| Botón 💬 abajo-izquierda (solo admin) | Abre / minimiza el panel (`AdminCaptureFab`) |
| Sidebar admin → «Chat» | Abre el mismo widget |
| `/[lang]/administrator/chat` | Abre el widget (ruta Share Target / atajo) |
| Centro de agentes → «Chat editorial» | Botón que abre el widget |
| Web Share Target | `manifest` → `/share-target` → `/administrator/chat` → widget abierto |

**Móvil / PWA:** el panel abierto es un **sheet** a pantalla completa anclado al `visualViewport` (teclado iOS, notch, home bar). Portal a `document.body`, `z-index` por encima del deck, scroll del body bloqueado al abrir. El FAB cerrado sigue compensando la barra del reproductor + desfase PWA (`useViewportBottomOffset`).

### Flujo del agente

```text
Mensaje / captura
  → POST /api/admin/agent/chat
  → loop OpenAI + tools (lectura + stage_*)
  → reply + pending_ops
  → UI: Confirmar / Cancelar  (o «sí» / «cancelar»)
  → executePendingOps → BD
```

1. **Cliente** [`AgentChat.tsx`](../src/components/admin/AgentChat.tsx) (mode `widget`): mensaje/captura, chips (`intent` = hint), `thread_id`, tarjeta Confirmar; mientras espera: indicador «escribiendo» (sin barra de % falsa).
2. **API** [`chat/route.ts`](../src/app/api/admin/agent/chat/route.ts) (`maxDuration = 300`): sube imágenes a `media/chat/…`, historial del hilo, llama al agente.
3. **Agente** [`admin-chat-agent.ts`](../src/lib/admin-chat-agent.ts): hasta ~10 rondas de tools; las `stage_*` **no** escriben.
4. **Confirmar** → `executePendingOps` ([`admin-chat.ts`](../src/lib/admin-chat.ts) + APIs `/api/admin/agent/*` + CRUD/SQL).
5. Evento confirmado: UPSERT + dedupe; enrich + cartel oficial en **segundo plano** (`waitUntil`, poster `light: true`).
6. Artista/sello confirmados sin `image_url` https: foto/logo en **segundo plano** (artist-photo con visión; label-logo).

`GET /api/admin/agent/chat?threads=1` lista hilos; `?thread_id=` carga mensajes.

### Confirmación y memoria conversacional

| Acción | ¿Escribe en BD? |
|--------|-----------------|
| Tools de lectura (`search_catalog`, `get_record`, `db_list`, `db_get`, `db_sql_read`, `web_search`, `read_image_facts`) | No (solo leen) |
| Tools `stage_*` / `stage_db_*` / `stage_db_sql_write` | No: acumulan `pending_ops` |
| Botón **Confirmar y guardar**, o «sí»/«ok» con ops en cliente / último mensaje del hilo | **Sí** |
| «sí» sin ops previas pero el agente hace `stage_*` en ese turno | **Sí** (auto-aplica tras el stage) |
| **Cancelar** / «cancelar» (con ops) | No (descarta). Un «no» conversacional largo va al agente |

Reglas importantes:

- El modelo debe **stage primero** y pedir Confirmar; no preguntar solo «¿lo añado?» sin `stage_*`.
- Prohibido decir «he creado» / «guardado» mientras solo hay `pending_ops` (el servidor reescribe esas frases a «he preparado»).
- Al recuperar ops del hilo se usa **solo el último mensaje assistant** (no ops antiguas ya confirmadas).
- El cliente también guarda `pending_ops` en `sessionStorage` por si se pierde el ref al decir «sí».
- Historial para el modelo: preferencia el hilo en BD (`admin_chat_messages`).

### Chips de modo

Evento · Sello · Artista · New Release · Vinyl pick · Mix = **hint** (`intent` en el prompt). Sin chip, el modelo clasifica; palabras como «sello» / Beatport `/label/` ayudan. Distinguir siempre: **sello ≠ evento ≠ artista**.

### Tools

**Catálogo (preferidas para altas ricas)**

| Tool | Destino |
|------|---------|
| `search_catalog` / `get_record` | Lectura `artists\|labels\|events\|mixes` |
| `stage_upsert_event` | `events` (+ enrich/cartel tras confirmar) |
| `stage_upsert_label` | `POST /api/admin/agent/label` → `labels` |
| `stage_upsert_artist` | `POST /api/admin/agent` → `artists` |
| `stage_upsert_mix` | `mixes` |
| `stage_new_releases` | `featured-import` / `chart_featured_tracks` |
| `stage_vinyl_picks` | `chart_vinyl_tracks` |
| `stage_enrich_event` / `stage_event_poster` | APIs event / event-poster |
| `stage_artist_photo` / `stage_label_logo` | APIs foto / logo (`artistName`/`labelName` o resolución por slug en BD) |

**CRUD genérico** (tablas de [`api/admin/[table]`](../src/app/api/admin/[table]/route.ts)):  
`db_list`, `db_get`, `stage_db_insert`, `stage_db_update`, `stage_db_delete`  
→ `artists`, `labels`, `events`, `blog_posts`, `scenes`, `mixes`, `history_entries`.

**SQL** (Postgres; necesita `DATABASE_URL` o `SUPABASE_DB_PASSWORD` + URL pública):  
`db_sql_read` (SELECT/WITH, máx. 50 filas) · `stage_db_sql_write` (siempre confirmación; un solo statement).

Prompt de sistema: [`scripts/prompts/admin-chat-system.txt`](../scripts/prompts/admin-chat-system.txt).

### Persistencia de conversación

Migración [`062_admin_chat_threads.sql`](../supabase/migrations/062_admin_chat_threads.sql):

- `admin_chat_threads` — hilo por admin (`user_id`, `title`, `intent`, timestamps)
- `admin_chat_messages` — `role`, `content`, `pending_ops`, `tool_trace`, `attached_urls`

Si las tablas no existen, el chat sigue (pending en `sessionStorage`). Tipado en [`src/types/database.ts`](../src/types/database.ts): **no usar `unknown` en JSONB** (rompe la inferencia de Supabase y el build).

### Fechas de eventos (cartel sin año)

Si el flyer dice solo día/mes («21 de agosto») **sin año**, el modelo a menudo inventaba un año pasado (p. ej. 2023) y el evento **no aparecía** en `/events` (listado de próximos).

Mitigación: `normalizeUpcomingEventDate` en [`admin-chat.ts`](../src/lib/admin-chat.ts) — OCR, `normalizeChatActions` y UPSERT fuerzan la **próxima ocurrencia futura** (`YYYY-MM-DD`). Prompt + tool `stage_upsert_event` lo dejan explícito.

### Cartel oficial — visión / OCR

**No** elegir flyer solo por títulos de Google Imágenes.

| Pieza | Comportamiento |
|-------|----------------|
| CLI | `scripts/elegir-poster-evento.mjs` — visión/OCR por defecto; `--metadata-only` = escape |
| API | `POST /api/admin/agent/event-poster` — `{ slug, light?: boolean }` |
| Chat (tras confirmar evento) | `light: true` |

```bash
npm run db:events:poster -- <slug>
node scripts/guia-base-datos.mjs run events-enrich <slug> --with-poster [--force]
```

### Archivos clave

| Archivo | Rol |
|---------|-----|
| `src/components/AdminCaptureFab.tsx` | Widget flotante (FAB → panel chatbot) |
| `src/components/admin/AgentChat.tsx` | UI del chat (`widget` / capture / embedded) + Confirmar + chips + hilo |
| `src/app/api/admin/agent/chat/route.ts` | API agente |
| `src/lib/admin-chat-agent.ts` | Tool loop, pending_ops, SQL, hilos |
| `src/lib/admin-chat.ts` | Upserts, OCR, enrich/poster background |
| `scripts/prompts/admin-chat-system.txt` | System prompt del agente |
| `supabase/migrations/062_admin_chat_threads.sql` | Tablas de hilos |
| `.cursor/rules/admin-chat-captura.mdc` | Regla Cursor (alwaysApply) |

### Credenciales

| Variable | Uso |
|----------|-----|
| `OPENAI_API_KEY` | Obligatoria |
| `OPENAI_CHAT_MODEL` / `OPENAI_AGENT_MODEL` / `OPENAI_MODEL` | Modelo del loop (fallback típico `gpt-4o`) |
| `OPENAI_VISION_MODEL` | OCR / carteles |
| `SERPAPI_API_KEY` | Imágenes cartel + fallback web |
| `NEXT_PUBLIC_SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` | REST / upserts |
| `DATABASE_URL` (o password Postgres) | Tools SQL |

### PWA / Share Target

1. Comparte imagen/link a Optimal Breaks.  
2. SW o `/share-target` → chat.  
3. El agente **prepara** ops; el admin **confirma** antes de BD.

### Invariantes

1. **Nada a BD sin Confirmar / «sí» que aplica** (salvo lecturas). Las `stage_*` solo preparan.
2. **No fingir “creado/guardado”** con solo `pending_ops`; tras escribir, mirar `results` OK.
3. **Sello ≠ evento ≠ artista** (tools y chips).
4. **Duplicados de evento** — actualizar, no clonar.
5. Captura en `media/chat/` = **provisional**; cartel oficial por OCR.
6. **Fecha sin año en cartel** → próxima ocurrencia futura (`normalizeUpcomingEventDate`).
7. New Releases: semana = lunes ISO del **release Beatport** (regla `charts-new-releases-supabase`).
8. Tipado `admin_chat_*`: JSONB como tipo JSON recursivo, no `unknown`.

### Relación con Cursor / CLI

El chat **no sustituye** a Cursor para lotes o fichas muy largas. Para retoques: `run events-enrich`, `run label-agent`, `run artist-json`, etc. Regla: **`base-de-datos-sin-dejar-trabajo-al-usuario`**.

### Troubleshooting

| Síntoma | Qué mirar |
|---------|-----------|
| Build Vercel: `never` en `.name` / labels | Tipado `admin_chat` con `unknown` — ver `database.ts` |
| Dice “he creado” / “guardado” pero no hay fila | Era solo stage; debe salir tarjeta Confirmar o «Hecho. Guardado…» con `results` |
| «No hay operaciones pendientes» al decir «sí» | Deploy antiguo; o no hubo `stage_*`. Debe ir al agente / recuperar ops del **último** assistant |
| Confirmó OK pero no sale en `/events` | Fecha en el pasado (año mal inferido). Revisar `date_start`; ver sección fechas |
| SQL tools fallan | Falta `DATABASE_URL`; usa CRUD REST |
| Hilos no se guardan | Migración `062` no aplicada |
| Cartel incorrecto | OCR; `events-poster` / WebP en `public/images/events/` |
| Preview negra | Previews `data:` URL, no `blob:` |
| Teclado tapa el chat en iOS PWA | Sheet anclado a `visualViewport` (`AdminCaptureFab`) |
| TLS local | `NODE_TLS_REJECT_UNAUTHORIZED=0` o CA corporativa (README) |

---

## English

### What it is

**Admin-only conversational agent** (OpenAI **tool-calling**): text, screenshots, links. It **reads** the DB/web, **stages** writes (events, labels, artists, mixes, New Releases, vinyl, admin CRUD, SQL), and **persists only after Confirm**. Also used as a mobile PWA capture channel (Share Target → confirm).

### Entry points

Floating **chatbot widget** (not a full-page chat):

| Entry | What it does |
|-------|----------------|
| 💬 FAB (bottom-left, admin only) | Opens / minimizes the panel (`AdminCaptureFab`) |
| Admin sidebar → Chat | Same widget |
| `/[lang]/administrator/chat` | Opens the widget (Share Target / shortcut) |
| Agents hub → Chat editorial | Button opens the widget |
| Web Share Target | → `/share-target` → `/administrator/chat` → widget open |

**Mobile / PWA:** open panel is a full-viewport **sheet** pinned to `visualViewport` (iOS keyboard, notch, home bar). Portaled to `document.body`, above the audio deck; body scroll locked while open. Closed FAB still clears the player bar + PWA viewport skew (`useViewportBottomOffset`).

### Agent flow

Message/image → `POST /api/admin/agent/chat` → OpenAI tool loop (`admin-chat-agent.ts`) → `pending_ops` → **Confirm** / «yes» → `executePendingOps`. Confirmed events: UPSERT + dedupe; enrich + official poster in background (`waitUntil`, poster `light: true`).

UI waiting state is a typing indicator (not a fake %-progress bar). Threads: migration `062` (`admin_chat_threads` / `admin_chat_messages`); pending also in `sessionStorage`.

### Confirmation & memory

- `stage_*` never writes. Confirm button, short «yes» with pending ops (client or **latest** assistant message), or «yes» that triggers stage in the same turn → write.
- Do not ask “shall I add it?” without staging. Do not claim “created/saved” while only staged (server rewrites wording).
- Prefer DB thread history for the model context.

Mode chips are **hints**. Do not confuse **label** with **event** or **artist**.

### Event dates without a year on the flyer

`normalizeUpcomingEventDate` (`admin-chat.ts`) forces the next future `YYYY-MM-DD` so the model cannot park events in a past year (they would vanish from the public upcoming list).

### Tools (summary)

- Catalog stages: event, label, artist, mix, new_releases, vinyl + enrich/poster/photo/logo  
- Admin CRUD: list/get + staged insert/update/delete  
- SQL: `db_sql_read` / `stage_db_sql_write` (needs `DATABASE_URL`)

System prompt: `scripts/prompts/admin-chat-system.txt`.

### Posters

Vision/OCR by default (not Google Images titles alone). Chat uses `light: true` after a confirmed event upsert.

### Env

`OPENAI_API_KEY`, optional `OPENAI_CHAT_MODEL` / `OPENAI_MODEL` / `OPENAI_VISION_MODEL`, `SERPAPI_API_KEY`, Supabase service role, optional `DATABASE_URL` for SQL.

### Typing note

Do **not** type `admin_chat_*` JSONB columns as TypeScript `unknown` — it breaks Supabase client inference (`never` on other tables) and fails the Vercel build. Use a recursive JSON type in `src/types/database.ts`.

### See also

- [`AI_PROMPTS_AND_AGENTS.md`](./AI_PROMPTS_AND_AGENTS.md)  
- [`guia-base-datos.mjs`](../scripts/guia-base-datos.mjs)  
- Cursor: `admin-chat-captura`, `base-de-datos-sin-dejar-trabajo-al-usuario`, `charts-new-releases-supabase`
