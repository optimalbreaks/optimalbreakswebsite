# Chat editorial / Captura PWA — Optimal Breaks

[English below](#english) · [Español arriba](#español)

---

## Español

### Qué es

Canal de **admin** y **colaborador** (`profiles.role`) con un **agente conversacional** de OpenAI (**tool-calling**): texto, capturas, links. El colaborador usa el mismo chat de altas y **no** entra en `/administrator`.

El agente puede **leer** la BD y la web, **preparar** altas/cambios (eventos, sellos, artistas, mixes, New Releases, vinyl, CRUD admin, SQL) y **solo escribe en Supabase tras Confirmar** (botón o «sí» / «adelante»).

Pensado también para **PWA móvil** (Share Target → chat → confirmar).

### Dónde abrir

El chat es un **widget flotante** (estilo chatbot), no una página a pantalla completa.

| Entrada | Qué hace |
|---------|----------|
| Botón 💬 abajo-izquierda (admin y colaborador) | Abre / minimiza el panel (`AdminCaptureFab`) |
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

### Aportación de los colaboradores

`/[lang]/administrator/colaboradores` (solo admin, sidebar «Colaboradores»). Lee los hilos de las cuentas con `profiles.role = collaborator` y cruza cada «Hecho» con el catálogo.

Si esa cuenta **además** tiene una ficha reclamada (`artists.claimed_by`), la ficha pública y las cards de `/artists` enseñan la etiqueta **Artista colaborador de Optimal Breaks** (`CatalogCollaboratorBadge`). El rol admin no lleva esa etiqueta. `claimed_by` no se manda al cliente: solo un booleano calculado en el servidor.

Cuenta como aportación lo que **sigue publicado**: tema nuevo, mix nuevo, evento creado, ficha de artista o sello nueva. Un evento que ya existía y se reescribió va aparte («ya estaba»). Un confirmado que falló, o un tema que luego se borró, no suma. La misma ficha tocada varias veces cuenta una.

Cada confirmación guarda en el mensaje un trazo `executed` (`ops` + resultado) para que el recuento no dependa solo del texto. Los hilos anteriores se reconstruyen con el último `pending_ops` y las líneas `✓/✗`.

Un enlace Beatport de **release** mete todos los temas de ese disco; un enlace de **track**, solo ese. Si Beatport no devuelve la ficha, o no se inserta ninguna fila, el chat responde «No se completó el guardado» y no «Hecho».

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
| `stage_upsert_event` | `events` (+ enrich/cartel tras confirmar). Varias capturas: 1ª = portada, resto = `gallery_urls` (horario/info) |
| `stage_upsert_label` | `POST /api/admin/agent/label` → `labels` |
| `stage_upsert_artist` | `POST /api/admin/agent` → `artists` |
| `stage_upsert_mix` | `mixes` |
| `stage_new_releases` | `featured-import` / `chart_featured_tracks` |
| `stage_vinyl_picks` | `chart_vinyl_tracks` (UPDATE por ID de YouTube; no regenerar UUID — ver `.cursor/rules/charts-ids-inmutables-saves.mdc`). La clave es `vinylIdentityKey` en `src/lib/share-track.ts` (import estático). Prohibido un `import()` de `scripts/lib/chart-vinyl-track-key.mjs`: en Vercel el bundler responde «Cannot find module as expression is too dynamic» y Confirmar no guarda (11 oct 2026, colaborador zarzote). |

Un enlace de YouTube se lee en el servidor con oEmbed **antes** del modelo (`resolveYouTubeLinks` en `admin-chat.ts`): título, artista (el canal «Nombre - Topic» es el artista de un **tema**), mix entre paréntesis, duración y miniatura. **Si dura 15 minutos o menos, es un tema aunque el título diga set o sesión.** Si es un **tema**, el servidor mira el catálogo (`chart_featured_tracks` y `chart_vinyl_tracks`) y la cola de lanzamientos del día (`chart_import_queue`). Ya está → no se vuelve a añadir. Está pendiente de validación en Imports → «No te preocupes, que este tema ya está». No se prepara alta y no suma en la aportación del colaborador: lo cura el editor. Si no está, busca la misma canción en Beatport. Hay ficha de Beatport → New Releases o archivo de tienda, según la fecha de release (no se archiva el YouTube). No hay tienda → `stage_vinyl_picks`. Una sesión larga (essential mix, set, b2b, podcast, más de 15 minutos) sigue como mix. El artista de la sesión es el DJ que coincide con una ficha del catálogo dentro del título (`resolveSessionArtistName`). No se usa el nombre del canal ni un «AKA»: «Jan-B AKA Janbalik» queda en «Jan-B». Si hay varios (vs, b2b, ft), se quedan en el orden del título. El modelo no puede decir que no ve el enlace. Si no llama a `stage_*`, el servidor deja la operación que corresponda.

**Beatport desde Vercel (14 oct 2026).** Cloudflare devuelve challenge a la búsqueda y a las fichas de Beatport cuando la petición sale de Vercel. Del 12 al 14 oct ningún YouTube de colaborador entró («no he podido abrir Beatport»). Ahora en Vercel no se abre Chromium: un fetch rápido y, si no trae temas, la búsqueda web de OpenAI (`findBeatportViaWeb` en `admin-chat.ts`), que exige el mismo título, versión y artista. Si Beatport lo tiene, la fila entra en `chart_import_queue` como pendiente (sin BPM, tonalidad ni preview: desde Vercel no se pueden leer) y al colaborador se le dice «No te preocupes, que este tema ya está». Si no lo tiene, se prepara el YouTube o el SoundCloud. Si ni el fetch ni la búsqueda web responden, se prepara igual: nunca se bloquea al colaborador porque Beatport no conteste.

**Enlaces de Beatport en el chat (17 oct 2026).** Del 15 al 16 oct fallaron los ocho intentos con «Beatport no devolvió la ficha (challenge o página vacía)». Cuatro de los cinco temas ya estaban en la web (Boogie, Not Human, Diagnostics y The Cyberfunk Vault). Ahora `/api/admin/featured-import` mira primero si ese id de Beatport está en `chart_featured_tracks`, en cualquier semana, o en `chart_import_queue`. Si está, contesta «No te preocupes, que este tema ya está» sin abrir Beatport. En Vercel ya no se abre Chrome, que también recibía el challenge y alargaba la petición hasta el «Load failed» del móvil. Un tema nuevo que Cloudflare tapa falla en segundos y pide el enlace de YouTube o SoundCloud. La búsqueda web no sirve para rellenar la ficha: para el mismo enlace dio artistas distintos en cada intento. Un error de ficha de artista o sello sin JSON (504 de Vercel) ya dice el código HTTP en vez de «falló el upsert».

**Revisor del chat (17 oct 2026).** `npx tsx scripts/review-chatbot-messages.ts` (por defecto, los últimos 7 días; `--since=YYYY-MM-DD`, `--days=N`, `--no-llm`). Detecta los ✗ al confirmar, las propuestas sin confirmar («Load failed» o abandono), los enlaces que se vuelven a pegar y los «hecho» que escribieron en otra ficha (slug preparado distinto del slug guardado). Agrupa por causa y localiza en `src/` la línea que da el error. Le pasa al modelo el mapa del flujo y el `git log` del periodo para que proponga el arreglo de código. Si después del último fallo hay guardados correctos del mismo tipo, lo marca como probablemente arreglado. El informe va a `docs/chatbot/INFORME-REVISION-CHAT.md`, gitignorado porque lleva textos de los colaboradores. No escribe en la BD.

Un enlace de SoundCloud se lee igual (`resolveSoundCloudLinks`): duración en la ficha (milisegundos) y fecha `created_at`. **15 minutos o menos es un tema, nunca un mix.** Primero se mira si ya está en la web: si está, no se añade. Si está pendiente de validación en la cola del día, se contesta «No te preocupes, que este tema ya está» y no se da de alta. Si no está, se busca en Beatport y entra por la tienda. SoundCloud (`platform: soundcloud`) solo si Beatport no la tiene. Más de 15 minutos → mix. Si el modelo deja la URL en `video_url`, al confirmar se trata igual que `embed_url`. Si la duración no se puede leer, solo es mix cuando el texto dice sesión, set, b2b o podcast.
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

### Ediciones de un festival: no pisar ni duplicar (29 sep 2026)

Incidente Olibass: el cartel del Open Air **2025** llegó con el slug de la ficha del **19 sep 2026** y la sobrescribió; el de la Snow de **feb 2026** (sin año) se empujó al **27 feb 2027** y creó un duplicado. Reglas actuales de `findDuplicateEvent` (se llama con la fecha **ya normalizada**):

1. **Mismo slug, otro año** → no es la misma ficha. Se inserta como `<slug>-<año>` (o `-<año>-2`…). Nunca se actualiza una edición de otro año.
2. **Año adivinado** (el cartel no lo traía y `normalizeUpcomingEventDate` lo cambió) → si existe un evento de la **misma edición** (`festivalSeriesForEventName`, y misma temporada si la hay) con el **mismo día/mes**, es ese: se completa y **conserva su fecha** (no se mueve a +1 año).
3. Misma edición + misma fecha exacta → el existente, aunque el nombre del cartel sea distinto («Olibass Snow Edition» vs «OLIBASS Music Festival | Snow Edition»).
4. Si el cartel sí trae año, se respeta (edición pasada = ficha pasada nueva).
5. **Mismo año, otro día** (21 oct 2026, Electrolunch): no es la misma ficha. «Electrolunch XXL» cabía dentro de «Electrolunch XXL · Picnic 76 (Stanton Warriors)» y el confirm del 24 oct pisó la fila del 9 may. Con las dos fechas completas y distintas se inserta otra fila. El enriquecimiento posterior no puede meter en `stages` / `schedule` artistas que no estén ya en `lineup`.
6. **Misma noche, mismo local, misma marca** (23 oct 2026, RitMika): un segundo cartel del mismo día y del mismo venue, cuyo nombre empieza por la misma palabra de 6 letras o más, actualiza la ficha. El título más largo sustituye al corto. No baja el umbral de 8 letras del nombre contenido: eso fue lo que pisó Electrolunch. Una captura de Instagram no se lee con los adhesivos: «AKA» no es «ARÁ», y «a-z» de «primeras confirmaciones» no es un artista.

Si algo sale mal: restaurar sobre el **mismo id** (conserva favoritos/asistencias) y mover los datos de la otra edición a una fila propia.

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
| `OPENAI_CHAT_MODEL` / `OPENAI_AGENT_MODEL` / `OPENAI_MODEL` | Modelo del loop (fallback típico `gpt-5.6-terra`) |
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
7. New Releases: semana = lunes ISO del **release Beatport**; el **remixer** entra en `artists[]` (regla `charts-new-releases-supabase`).
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

**Admin and collaborator conversational agent** (OpenAI **tool-calling**): text, screenshots, links. It **reads** the DB/web, **stages** writes (events, labels, artists, mixes, New Releases, vinyl; admin also gets CRUD and SQL), and **persists only after Confirm**. A collaborator uses that capture chat and does not enter `/administrator`. Also used as a mobile PWA capture channel (Share Target → confirm).

### Entry points

Floating **chatbot widget** (not a full-page chat):

| Entry | What it does |
|-------|----------------|
| 💬 FAB (bottom-left, admin and collaborator) | Opens / minimizes the panel (`AdminCaptureFab`) |
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

A YouTube link is read server-side via oEmbed before the model runs (`resolveYouTubeLinks`): title, artist (a «Name - Topic» channel is the artist), mix name in parentheses, duration, and thumbnail. **15 minutes or less is a song even if the title says set or session.** A **song** is checked against the catalogue and the day’s release queue (`chart_import_queue`): already listed → no second row; still pending the editor’s validation → «No te preocupes, que este tema ya está», with no staged add and no collaborator credit. Otherwise Beatport is searched. A Beatport listing → New Releases or the store archive by release date (the YouTube is not filed); no store listing → vinyl archive. A long DJ set (essential mix, set, b2b, podcast, over 15 minutes) is staged as a mix. The model must not claim it cannot read the link. If it skips `stage_*`, the server still queues the op that matches that decision. Vinyl row identity on confirm is the static `vinylIdentityKey` in `src/lib/share-track.ts`. Do not `import()` `scripts/lib/chart-vinyl-track-key.mjs` with a computed path: Vercel throws «Cannot find module as expression is too dynamic» and Confirm does not save (11 Oct 2026).

**Beatport from Vercel (14 Oct 2026).** Cloudflare answers Beatport search and track pages with a challenge when the request comes from Vercel. From 12 to 14 Oct no collaborator YouTube got in («no he podido abrir Beatport»). On Vercel the chat no longer launches Chromium: one quick fetch and, if it returns no tracks, OpenAI web search (`findBeatportViaWeb`), which requires the same title, version and artist. A Beatport hit goes to `chart_import_queue` as pending (no BPM, key or preview: Vercel cannot read them) and the collaborator gets «No te preocupes, que este tema ya está». No hit → the YouTube or SoundCloud is staged. If neither the fetch nor web search answers, it is staged anyway: a silent Beatport never blocks a collaborator.

**Beatport links in the chat (17 Oct 2026).** All eight attempts on 15–16 Oct failed with «Beatport no devolvió la ficha». Four of the five tracks were already on the site (Boogie, Not Human, Diagnostics, The Cyberfunk Vault). `/api/admin/featured-import` now checks first whether that Beatport id is in `chart_featured_tracks` (any week) or `chart_import_queue`, and answers «No te preocupes, que este tema ya está» without opening Beatport. On Vercel it no longer launches Chrome: it got the challenge too and dragged the request into the mobile «Load failed». A new track hidden by Cloudflare fails within seconds and asks for the YouTube or SoundCloud link. Web search cannot fill the listing: it returned different artists for the same link on each attempt. Artist or label failures without JSON (a Vercel 504) now show the HTTP status.

**Chat reviewer (17 Oct 2026).** `npx tsx scripts/review-chatbot-messages.ts` (last 7 days by default; `--since=YYYY-MM-DD`, `--days=N`, `--no-llm`). Finds ✗ on confirm, unconfirmed proposals, re-pasted links and successful saves that landed on a different event row (prepared slug ≠ saved slug). Groups them by cause, locates the source line in `src/` and asks the model for a code fix with the real flow map and the period's `git log`. A cause followed by successful saves of the same type is flagged as probably fixed. Report: `docs/chatbot/INFORME-REVISION-CHAT.md` (gitignored: it holds collaborator text). No DB writes.

A SoundCloud link is read the same way (`resolveSoundCloudLinks`): duration from the track page (milliseconds) and `created_at`. **15 minutes or less is a song, never a mix.** The server checks the site first and does not add a song that is already listed. A row still pending the editor’s validation gets «No te preocupes, que este tema ya está» and is not filed. If it is not there, it searches Beatport and files the store listing. SoundCloud (`platform: soundcloud`) is only used when Beatport does not have the song. Longer than 15 minutes → mix. A SoundCloud URL left in `video_url` is treated as `embed_url` on confirm. If the duration cannot be read, it is a mix only when the text says session, set, b2b, or podcast.

### Event dates without a year on the flyer

`normalizeUpcomingEventDate` (`admin-chat.ts`) forces the next future `YYYY-MM-DD` so the model cannot park events in a past year (they would vanish from the public upcoming list).

**Festival editions (29 Sep 2026):** `findDuplicateEvent` never updates a row of another year with the same slug (inserts `<slug>-<year>`), and when the year was guessed it matches an event of the same edition series on the same day/month and keeps that event's date. A different calendar day in the same year is also a new row (21 Oct 2026: an Electrolunch XXL poster for 24 Oct overwrote the 9 May Picnic 76 row because the shorter name was contained in the longer one). The same night at the same venue, with the same leading brand of 6+ letters, updates the existing row (23 Oct 2026: a second RitMika poster became a duplicate because «RITMIKA» is only 7 letters). An Instagram screenshot is not read with its stickers: «AKA» is not a brand, and «a-z» next to “first confirmations” is not an act. Enrichment cannot add stage or schedule artists that are not already in `lineup`. Olibass incident details in the Spanish section above.

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
- Cursor: `admin-chat-captura`, `base-de-datos-sin-dejar-trabajo-al-usuario`, `charts-new-releases-supabase` (remixer → `artists[]`)
