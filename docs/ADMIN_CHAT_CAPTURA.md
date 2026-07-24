# Chat editorial / Captura PWA — Optimal Breaks

[English below](#english) · [Español arriba](#español)

---

## Español

### Qué es

Canal **solo admin** (`profiles.role = admin`, p. ej. `contacto@eskaladigital.com`) para mandar **capturas de cartel**, texto o links y hacer **UPSERT directo** en Supabase: eventos, artistas, mixes, New Releases y vinyl picks.

Pensado sobre todo para **PWA móvil**: captura de Facebook/Instagram → enviar → ficha en BD.

### Dónde abrir

| Entrada | Ruta |
|---------|------|
| Captura fullscreen (PWA) | `/[lang]/administrator/chat` |
| Pestaña en centro de agentes | `/[lang]/administrator/agent` → «Chat editorial» |
| FAB «Captura» (abajo-izquierda, solo admin) | `AdminCaptureFab` |
| Atajo PWA / Web Share Target | `public/manifest.json` → `/share-target` → chat |

### Flujo de un evento (captura)

1. **Cliente** (`AgentChat.tsx`): comprime imagen, preview en `data:` URL, barra de progreso orientativa, `POST /api/admin/agent/chat`.
2. **API chat** (`src/app/api/admin/agent/chat/route.ts`, `maxDuration = 300`): sube a Storage `media/chat/…`, plan OpenAI.
3. **OCR de la captura** (`src/lib/admin-chat.ts`): hechos (`ScreenshotFacts`). Si el plan no trae `actions`, **fallback** crea acción `event` desde OCR.
4. **UPSERT evento**: detecta **duplicados** (slug + nombre normalizado + año). La captura en `media/chat/` es **provisional**.
5. **En paralelo** (no en serie):
   - Enrich: `POST /api/admin/agent/event` (web: OpenAI `web_search` preferente, SerpAPI fallback). Timeout chat **45 s**.
   - Cartel oficial: `POST /api/admin/agent/event-poster` con **`light: true`**. Timeout chat **55 s**.
6. Si enrich/cartel fallan o hacen timeout, **el evento ya está guardado** (con captura si no hay flyer mejor).

### Barra de progreso (UI)

Etapas **orientativas** (un solo request, sin stream): Subiendo → Leyendo cartel (OCR) → Guardando BD → Completando ficha/cartel → Casi listo. Al responder la API, 100 %.

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

### Otras acciones del chat

| Tipo | Destino |
|------|---------|
| `event` | `events` (+ enrich + cartel) |
| `artist` | agente artista → UPSERT |
| `mix` | `mixes` |
| `new_release` | `featured-import` / `chart_featured_tracks` (semana = lunes ISO del **release Beatport**) |
| `vinyl` | picks de vinilo de la edición |

Prompt de plan: **`scripts/prompts/admin-chat-system.txt`**.

### Archivos clave

| Archivo | Rol |
|---------|-----|
| `src/components/admin/AgentChat.tsx` | UI chat + progreso |
| `src/app/api/admin/agent/chat/route.ts` | Endpoint chat |
| `src/lib/admin-chat.ts` | Plan, OCR, upserts, timeouts, paralelo enrich/poster |
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

**Admin-only** channel to send **poster screenshots**, text or links and **UPSERT** into Supabase (events, artists, mixes, New Releases, vinyl). Built for **mobile PWA** capture from social apps.

### Entry points

- Fullscreen: `/[lang]/administrator/chat`
- Agents hub tab: `/[lang]/administrator/agent`
- FAB + Web Share Target (`manifest` / `sw.js` → `/share-target`)

### Event pipeline (screenshot)

Upload → OCR facts → OpenAI plan (+ OCR fallback action) → event UPSERT (dedupe) → **in parallel** enrich (`/api/admin/agent/event`, 45s) + official poster (`/api/admin/agent/event-poster? light: true`, 55s). Event is saved even if enrich/poster time out.

### Poster selection

**Vision/OCR by default** (read text on the flyer). Do not trust Google Images titles alone. Chat uses **`light: true`**. CLI: `elegir-poster-evento.mjs` (opt-out: `--metadata-only`).

### Progress UI

Client-side staged progress bar in `AgentChat.tsx` (not a real server stream).

### Key files / env / invariants

Same tables as the Spanish section above. Prompt: `scripts/prompts/admin-chat-system.txt`. Env: OpenAI + SerpAPI + Supabase service role.

### See also

- [`AI_PROMPTS_AND_AGENTS.md`](./AI_PROMPTS_AND_AGENTS.md)
- [`guia-base-datos.mjs`](../scripts/guia-base-datos.mjs) — `events-enrich`, `events-poster`
- Cursor rules: `base-de-datos-sin-dejar-trabajo-al-usuario`, `charts-new-releases-supabase`, `admin-chat-captura`
