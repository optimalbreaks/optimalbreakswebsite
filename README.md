# OPTIMAL BREAKS — The Breakbeat Bible

> Archive, magazine, guide, agenda and scene memory. A project dedicated to preserving and celebrating breakbeat culture worldwide.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4) ![Supabase](https://img.shields.io/badge/Supabase-2.45-3ECF8E)

**Spanish summary:** [README.es.md](./README.es.md)

---

## What is Optimal Breaks?

Optimal Breaks is a bilingual (ES/EN) web platform dedicated to the history, artists, labels, events, scenes and culture of breakbeat music — from the Bronx in the 1970s to the present day.

The site features an interactive DJ deck with real audio playback and scratch capability, a fanzine/club aesthetic inspired by xerox culture and rave flyers, and a full editorial structure covering every aspect of breakbeat worldwide.

---

## Content Distribution

The project separates **reference content** from **editorial content**.

### Structural / reference pages

These sections should hold the most stable, navigable and encyclopedia-like information:

- **History** — the core historical narrative: origins, UK, US, Andalusia, Australia, decline and digital era
- **Artists** — key names, timelines, artist directories and canonical references
- **Scenes** — territory-based overviews (Bronx/NY, UK, US/Florida, Andalusia, Australia, global digital scene)
- **Labels** — labels as infrastructure: who shaped the sound and why they matter
- **Organizations** — promoters, booking brands and umbrella entities (e.g. Raveart as promoter + label arm); linked from labels and events
- **Events** — festivals, club nights, iconic past events and current agenda
- **Mixes** — essential sets, radio shows, YouTube/Mixcloud-era continuity

### Blog / editorial layer

The **Blog** is reserved for pieces that are more interpretive, essayistic, comparative or memory-driven. Examples:

- UK breakbeat vs US breakbeat
- the Andalusian boom and the `Break Nation` documentary
- the global decline of breakbeat and its latent survival
- Camden, white labels, pirate radio and record-shop culture
- Beatport, YouTube, Mixcloud and the people who kept the scene alive
- first-person or scene-memory articles tied to travel, shops, radios or local experiences

### Editorial rule of thumb

If a topic answers **"what is this, who belongs here, where did it happen, when did it happen?"**, it should usually live in the structural sections.

If a topic answers **"how should this be interpreted, why did it evolve this way, what did it feel like, how do two scenes compare?"**, it should usually live in the `Blog`.

This split helps the site feel both like an archive and like a living magazine without mixing both layers on the same page.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3.4 + custom CSS variables
- **Database**: Supabase (PostgreSQL) + Row Level Security
- **Storage**: Supabase Storage (public bucket `media` for content images — see below)
- **i18n**: Custom middleware with `/es` and `/en` prefixed routes + hreflang tags
- **Analytics**: Google Analytics 4 via **`@next/third-parties/google`** (`GoogleAnalytics` component) + **Consent Mode v2** aligned with `CookieBanner` (see [Analytics (GA4)](#analytics-google-analytics-4))
- **Audio**: Web Audio API with scratch simulation
- **Fonts**: Unbounded, Courier Prime, Special Elite, Darker Grotesque

---

## Analytics (Google Analytics 4)

Optional measurement ID (public env var, safe in the browser):

- Set **`NEXT_PUBLIC_GA_MEASUREMENT_ID`** to your GA4 measurement ID (format `G-XXXXXXXXXX`) in `.env.local` and in **Vercel → Project → Environment Variables** for Production/Preview. If unset, no GA scripts load.

Implementation:

- **`src/components/GoogleAnalytics.tsx`** — loads **`GoogleAnalytics`** from **`@next/third-parties/google`** (official Next.js integration: gtag.js + automatic **page_view** tracking on App Router navigations). A small inline **`Script`** runs first to set **Consent Mode v2** defaults (`analytics_storage` and ad-related flags **denied** until the user accepts analytics cookies).
- **`src/components/CookieBanner.tsx`** — persists choices and dispatches **`ob-cookie-consent`**; `GoogleAnalytics` listens and calls **`gtag('consent', 'update', …)`** when analytics is granted or revoked.

CSP in **`next.config.js`** already allows `googletagmanager.com` and `google-analytics.com` in `connect-src` / `script-src` as needed.

---

## AI prompts and agents (OpenAI)

System prompts for **artist**, **label**, and **event enrichment** agents live under **`scripts/prompts/*.txt`** (versioned in Git; not stored in Supabase). **`OPENAI_MODEL`** and **`OPENAI_API_KEY`** (and optional **`SERPAPI_API_KEY`**) are set in **`.env.local`**; temperature, `max_tokens`, and JSON user instructions are defined in code per route or script.

**Central index (all prompt files, defaults per flow, related APIs):** [`docs/AI_PROMPTS_AND_AGENTS.md`](docs/AI_PROMPTS_AND_AGENTS.md).  
**Artist agent (batch, admin API, commands):** [`docs/ARTIST_AI_AGENT.md`](docs/ARTIST_AI_AGENT.md).

---

## Images & cards

Listings and detail pages use a shared **`CardThumbnail`** component (`src/components/CardThumbnail.tsx`):

- **`image_url`** on artists, events, labels, scenes, mixes and blog posts can point to any HTTPS image (e.g. Supabase Storage public URL or external CDN).
- If `image_url` is empty, a **placeholder** (diagonal stripes + initials from the title) keeps the layout consistent.
- **Home** `ArtistCard` / `EventFlyer` include the same thumbnail strip.
- **Blog post** pages show a wide hero image under the title when `image_url` is set (or placeholder if not).
- **Responsive**: grids stack to one column on small screens; flyer-style hover tilt is limited to `sm:` and up to avoid awkward touch behaviour.

### Directory listing views (Artists, Labels, Events, Scenes, Mixes)

When Supabase returns rows, these five sections use **client components** that offer three layouts (toolbar top-right on Artists next to search; top-right on the others):

| Mode | Behaviour |
|------|-----------|
| **Large** | Spacious grid (or flyer-style cards for events and mixes). |
| **Compact** | Dense multi-column grid — **default** on first load (choice is not persisted in URL or `localStorage`). |
| **List** | Horizontal rows with a small square thumbnail. |

Shared UI: `src/components/ViewToggle.tsx`. Per-section explorers: `ArtistsExplorer`, `LabelsExplorer`, `EventsExplorer`, `ScenesExplorer`, `MixesExplorer` in `src/components/`. Labels for the buttons live under each section in `src/dictionaries/en.json` and `es.json` (`view_large`, `view_compact`, `view_list`).

---

## Supabase Storage (`media` bucket)

SQL migration: `supabase/migrations/005_storage_media.sql`

- Creates a **public** bucket named **`media`** (image MIME types, ~5 MB per file by default).
- **Public read** policy so URLs work in `<img>` and with the site CSP (`img-src` includes `https:`).
- Writes from the browser are **not** opened to anonymous users by default; uploads are intended via **Dashboard**, **service role**, or a future admin API.

Server-side helpers:

- `src/lib/supabase-admin.ts` — `createServiceSupabase()` (requires `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`, **server only**).
- `src/lib/supabase-storage.ts` — `publicMediaObjectUrl()`, `uploadPublicMedia()` for scripts or Route Handlers.

After uploading a file, store the **public object URL** in the corresponding `image_url` column (or build it with `publicMediaObjectUrl('path/inside/bucket.jpg')`).

**CLI upload (local file → bucket `media`):** with service/secret key in `.env.local`:

```bash
npm run media:upload -- ./my-cover.webp events/raveart-summer-festival-2025/cover.webp
```

Script: [`scripts/upload-storage-media.mjs`](scripts/upload-storage-media.mjs). It prints the public URL and a sample `UPDATE` for `events.image_url` (or any table with `image_url`). Only upload images you have the **rights** to use (own photos, licensed assets, or explicit permission from rights holders).

---

## Project Structure

```
OptimalBreaks/
├── docs/
│   ├── AI_PROMPTS_AND_AGENTS.md # Index: all .txt prompts, env defaults, APIs (ES/EN)
│   └── ARTIST_AI_AGENT.md      # Full guide: AI artist agent (ES/EN)
├── data/
│   └── artists/                # One JSON file per artist → npm run db:artist
├── scripts/
│   ├── seed-supabase.mjs            # Run SQL migrations / seed (needs Postgres URI)
│   ├── actualizar-artista.mjs       # Upsert artists from JSON (Supabase REST API only)
│   ├── ensure-artist-json-in-db.mjs # Compare JSON vs DB; upsert if bios differ
│   ├── generar-artista-agente.mjs   # OpenAI → data/artists/<slug>.json
│   ├── upload-storage-media.mjs     # npm run media:upload — local file → bucket `media`
│   ├── sync-timeline-artists.mjs    # db:timeline / db:timeline:sql
│   ├── sync-user-list-artists.mjs   # db:user-list — starter rows for extended name list
│   └── prompts/                # System prompts: artist, label, event enrich, revision modes
│       ├── artista-agente-system.txt
│       ├── artista-agente-revision-system.txt
│       ├── sello-agente-system.txt
│       ├── sello-agente-revision-system.txt
│       └── evento-enriquecer-system.txt
├── public/
│   └── music/                  # MP3 tracks for the DJ deck
├── supabase/
│   └── migrations/             # SQL migrations (schema, users, storage, …)
├── src/
│   ├── app/
│   │   ├── globals.css         # Global styles, animations, grain overlay
│   │   ├── layout.tsx          # Root layout with metadata
│   │   └── [lang]/
│   │       ├── layout.tsx      # Lang layout: Header + Footer + hreflang
│   │       ├── page.tsx        # HOME — hero, deck, marquee, timeline, artists, events, CTA
│   │       ├── history/        # Full breakbeat history by era
│   │       ├── artists/        # Artist directory (+ Supabase / fallback)
│   │       │   ├── layout.tsx  # No fetch/Data Cache; no-store headers for this segment
│   │       │   └── [slug]/     # Individual artist pages (related-artist name → slug links)
│   │       ├── labels/         # Record label directory
│   │       │   └── [slug]/     # Individual label pages (+ link to org when organization_id set)
│   │       ├── organizations/  # Promoter / umbrella org detail (e.g. Raveart)
│   │       │   └── [slug]/     # Related labels + promoted events
│   │       ├── events/         # Event calendar + iconic past events
│   │       │   └── [slug]/     # Individual event pages
│   │       ├── scenes/         # Breakbeat by region/country
│   │       │   └── [slug]/     # Individual scene pages
│   │       ├── blog/           # Articles, rankings, retrospectives
│   │       │   └── [slug]/     # Individual blog posts
│   │       ├── mixes/          # Essential mixes, classic sets, radio shows
│   │       ├── dashboard/      # Logged-in user area (favorites, sightings, …)
│   │       ├── login/          # Auth entry
│   │       ├── privacy/        # Legal
│   │       ├── terms/
│   │       ├── cookies/
│   │       └── about/          # About, contact, collaborate
│   ├── components/
│   │   ├── Header.tsx          # Sticky nav, language switch, mobile menu, auth
│   │   ├── Footer.tsx          # Site map, legal, social, funding note
│   │   ├── ViewToggle.tsx      # Large / compact / list control (shared)
│   │   ├── ArtistsExplorer.tsx # Artists: search, filters, three views
│   │   ├── LabelsExplorer.tsx  # Labels: three views
│   │   ├── EventsExplorer.tsx  # Events: three views
│   │   ├── ScenesExplorer.tsx  # Scenes: three views
│   │   ├── MixesExplorer.tsx   # Mixes: three views
│   │   ├── CardThumbnail.tsx   # Shared image / placeholder for cards & heroes
│   │   ├── DjDeck.tsx          # Interactive DJ controller with audio + scratch
│   │   ├── Marquee.tsx         # Tape strip with infinite scroll
│   │   ├── Timeline.tsx        # Dark section timeline
│   │   ├── ArtistCard.tsx      # Home / grid artist card (with thumbnail)
│   │   ├── EventFlyer.tsx      # Event flyer with tape decoration + thumbnail
│   │   ├── AuthProvider.tsx    # Supabase auth context
│   │   ├── GoogleAnalytics.tsx # GA4 via @next/third-parties + Consent Mode v2
│   │   ├── CookieBanner.tsx    # Cookie UI + consent events for GA
│   │   └── ShareButtons.tsx    # Social share on detail pages
│   ├── hooks/
│   │   └── useUserData.ts      # Favorites, sightings, saved mixes, etc.
│   ├── dictionaries/
│   │   ├── en.json             # English translations
│   │   └── es.json             # Spanish translations
│   ├── lib/
│   │   ├── dictionaries.ts     # Dictionary loader
│   │   ├── i18n-config.ts      # i18n configuration (es, en)
│   │   ├── supabase.ts         # Browser Supabase client
│   │   ├── supabase-server.ts  # Server client (cookies)
│   │   ├── supabase-admin.ts   # Service role (server only)
│   │   ├── supabase-storage.ts # Storage URL + upload helpers
│   │   ├── artist-entity-match.ts  # Resolve related-artist names → slugs for internal links
│   │   ├── seo.ts              # Metadata helpers
│   │   └── security.ts         # Slug / locale sanitization
│   ├── types/
│   │   └── database.ts         # Full DB types: artists, labels, events, blog, scenes, mixes, history, profiles, …
│   └── middleware.ts           # i18n redirect middleware
├── music/                      # Source MP3 files (copy to public/music)
├── propuesta12-fanzine-club.html  # Design reference
├── Historia del break.txt      # Research content
├── package.json
├── tailwind.config.js
├── tsconfig.json
├── next.config.js
└── postcss.config.js
```

---

## Design Aesthetic

**Fanzine Club Edition** — inspired by xerox zines, rave flyers and record shop culture:

- Paper texture background with grain overlay
- Yellow highlighter marks on headings
- Warning stripe danger bars
- Adhesive tape decorations
- Ransom-note style cards
- Cut-out label system (genre tags)
- DJ deck with spinning vinyl, tonearms, VU meters and knobs
- Red/yellow/acid/UV accent palette on cream paper

---

## DJ Deck Features

The hero section includes a fully interactive DJ controller:

- **Audio playback** — plays real MP3 tracks from `/public/music/`
- **Scratch** — drag either platter up/down to scrub through the audio; vinyl rotates with your finger/mouse
- **6 tracks** — switch between them with ◄ ► buttons
- **Crossfader** — adjusts volume balance
- **Play/Pause** — main button + individual deck toggles
- **Progress bar** — clickable to seek
- **VU meters** — animate based on playback state
- **Tonearms** — move when playing/stopped
- **Touch support** — works on mobile
- **Auto-advance** — next track plays when current one ends

---

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Copy music to public folder

```bash
mkdir public/music
cp music/* public/music/
```

On Windows:

```cmd
mkdir public\music
copy music\* public\music\
```

### 3. Configure environment

```bash
cp .env.local.example .env.local
```

Edit `.env.local` with your Supabase credentials.

**Public (browser) key** — use either the legacy JWT **anon** key or the new **publishable** key (`sb_publishable_…`):

```
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
# or: NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_...
```

**Server-only elevated key** — Storage uploads, `createServiceSupabase()`, and **all** CLI upserts for artists/labels (`db:artist`, agents, `elegir-foto`, etc.) require the legacy **service_role** JWT or the new **secret** key (`sb_secret_…`). Data scripts do **not** use direct Postgres for those writes.

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# or: SUPABASE_SECRET_KEY=sb_secret_...
```

Never put elevated keys in `NEXT_PUBLIC_*` or client-side code.

**Google Analytics 4 (optional)** — set **`NEXT_PUBLIC_GA_MEASUREMENT_ID=G-…`** in `.env.local` and Vercel so GA4 loads in production. Omit the variable to disable analytics entirely.

**Postgres URI** (optional) — **only** for `npm run db:migrate` / `db:seed` (`seed-supabase.mjs` runs SQL against the database). Artist/label agents, `db:artist`, `db:label`, photos, and similar tools use **Supabase HTTP API + service role**, not `DATABASE_URL`.

### 4. Apply database migrations

Run every file in `supabase/migrations/` on your Supabase project (SQL Editor or `npm run db:migrate` with Postgres configured). Use **lexical (alphabetical) order** so `004_*` runs before `005`–`011`. Notable: `005` (Storage), `006` (rich artist fields), `007` (admin role), `008`–`009` (featured + timeline artists), `010` (organizations + Raveart / Raveart Records + first event batch), `011` (extra Raveart rows aligned with [official gallery](https://www.raveart.es/galeria/)). See the **SQL migrations** table below.

Project scripts (if Postgres URI is configured):

```bash
npm run db:migrate
npm run db:seed
```

### 5. Updating artists (JSON upsert)

Files matching **`data/artists/*.json`** are **gitignored** (the live site reads **Supabase** only). Use JSON locally for upserts, agent output (`--json-only` / `--save-json`), or exports; fresh clones get an empty `data/artists/` folder except `.gitkeep`.

Recommended way to create or refresh **artist** rows without SQL or a dashboard:

1. Ensure migration **`006_artist_extended_fields.sql`** has been applied (adds `real_name`, `labels_founded`, `key_releases` on `artists`).
2. Add or edit a file under **`data/artists/`**, e.g. `data/artists/deekline.json`. Use `deekline.json` as the schema reference: bilingual bios, styles, essential tracks, related artists, labels founded, key releases (`title`, `year`, optional `note`), `socials`, `website`, `category`, `is_featured`, `sort_order`, etc. In **`bio_en`** / **`bio_es`**, separate paragraphs with a **blank line** (`\n\n` in the JSON string) so the artist page renders multiple paragraphs instead of one block.
3. Run:

```bash
npm run db:artist -- data/artists/your-slug.json
```

The script **upserts on `slug`**: updates an existing artist or inserts a new row.

**How the script connects**

| Mode | When it runs |
|------|----------------|
| **Supabase REST API** | Always for `db:artist` / `lib/artist-upsert.mjs`: `NEXT_PUBLIC_SUPABASE_URL` + **`SUPABASE_SERVICE_ROLE_KEY`** or **`SUPABASE_SECRET_KEY`**. |

The browser **anon / publishable** key cannot be used for this write path. **`DATABASE_URL` / `SUPABASE_DB_PASSWORD` are not used** for artist or label upserts from scripts (avoids blocked `db.*.supabase.co` on many networks). SQL migrations (`db:migrate`) still need Postgres credentials when you run them locally.

### 5b. Agent: generate artist profiles (OpenAI + optional SerpAPI)

By default the agent **UPSERTs into Supabase** via the **REST API + service role** (same path as **`npm run db:artist`**). Optional **`--json-only`** writes only `data/artists/<slug>.json`; **`--save-json`** upserts **and** saves a JSON copy (schema: [`006_artist_extended_fields.sql`](supabase/migrations/006_artist_extended_fields.sql)).

**Full documentation (batch mode, env vars, admin API, bulk sync):** [`docs/ARTIST_AI_AGENT.md`](docs/ARTIST_AI_AGENT.md).  
**All AI prompts and per-flow model defaults:** [`docs/AI_PROMPTS_AND_AGENTS.md`](docs/AI_PROMPTS_AND_AGENTS.md).

Editable system prompt: [`scripts/prompts/artista-agente-system.txt`](scripts/prompts/artista-agente-system.txt).

Requires **`OPENAI_API_KEY`** in `.env.local`. Defaults to **`gpt-5.4`**; override with **`OPENAI_MODEL`**. Optional **`SERPAPI_API_KEY`** ([SerpApi](https://serpapi.com)) for web snippets; if missing, the agent uses model knowledge only.

```bash
npm run db:artist:agent -- plump-djs "Plump DJs"
npm run db:artist:agent -- some-slug "Artist Name" --notes research/artist-notes.txt
npm run db:artist:agent -- some-slug "Artist" --no-search --stdout
npm run db:artist:agent:all                    # regenerate and upsert every artist row in Supabase (slow / API cost)
npm run db:artist:ensure -- data/artists/deekline.json   # verify DB matches JSON; sync if not
```

Fact-check bios and URLs after generation. If you used **`--json-only`**, run **`npm run db:artist -- data/artists/<slug>.json`** to publish.

**Bulk upsert (all JSON files in `data/artists/`)** — from repo root, PowerShell:

```powershell
Get-ChildItem "data\artists\*.json" | ForEach-Object { npm run db:artist -- ("data/artists/" + $_.Name) }
```

Git Bash:

```bash
for f in data/artists/*.json; do npm run db:artist -- "$f"; done
```

### 5c. Artist pages: Supabase vs Git, caching, placeholders

- **Source of truth for the live site** is the **`artists` table** in the Supabase project configured as `NEXT_PUBLIC_SUPABASE_URL` in Vercel (or locally). Committing JSON to Git does **not** update bios until an upsert runs against that project (**`npm run db:artist`**, the agent CLI by default, or admin save).
- **`npm run db:user-list`** inserts **starter** rows for many names (short placeholder copy in ES/EN). Replace those profiles with the agent (default UPSERT) or **`db:artist`** when you have a full JSON.
- **Caching:** Under `[lang]/artists`, the app sets **`revalidate = 0`**, **`fetchCache = 'force-no-store'`**, and **`next.config.js`** adds **`Cache-Control` / `CDN-Cache-Control: no-store`** for `/[lang]/artists` routes so HTML and Supabase-backed data are not served stale from the Data Cache or the CDN after you publish DB changes. The PWA **`public/sw.js`** does **not** cache HTML for paths containing **`/artists`** (offline fallback for those URLs is not a stale artist page).

### 6. Run development server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) — you'll be redirected to `/en` or `/es` based on your browser language.

---

## Sections

| Section | Route | Description |
|---------|-------|-------------|
| Home | `/[lang]` | Hero with DJ deck, timeline, featured artists, events, CTA |
| History | `/[lang]/history` | Origins, UK, US, Andalusia, Australia, decline, digital era |
| Artists | `/[lang]/artists` | Directory from Supabase (or featured fallback); **large / compact / list** views + filters |
| Labels | `/[lang]/labels` | Record labels that shaped the sound; **three listing views** when data exists |
| Organizations | `/[lang]/organizations/[slug]` | Promoter / umbrella org: related labels, event archive and upcoming (e.g. `raveart`) |
| Events | `/[lang]/events` | Festivals, club nights, iconic past events, upcoming; **three listing views** |
| Scenes | `/[lang]/scenes` | Breakbeat by territory; **three listing views** |
| Blog | `/[lang]/blog` | Editorial layer: essays, comparisons, retrospectives |
| Mixes | `/[lang]/mixes` | Essential mixes, classic sets, radio shows; **three listing views** |
| Dashboard | `/[lang]/dashboard` | User area (favorites, sightings, events, mixes, profile) — requires login |
| Login | `/[lang]/login` | Supabase auth |
| Privacy / Terms / Cookies | `/[lang]/privacy`, etc. | Legal pages |
| About | `/[lang]/about` | Project manifesto, contact, collaborate, submit |
| Administrator | `/[lang]/administrator` | Admin-only CRUD + image upload (`profiles.role = admin`); not linked from public nav |

---

## Database Schema

Supabase tables are reflected in `src/types/database.ts`. Highlights:

- **artists** — `slug`, name / `name_display`, `real_name`, bio (EN/ES), category, styles, era, `image_url`, essential tracks, recommended mixes, related artists, `labels_founded`, `key_releases` (JSON), website, socials, featured flag, sort order — see `006_artist_extended_fields.sql` and `data/artists/deekline.json`
- **labels** — name, country, founded year, description (EN/ES), `image_url`, key artists/releases; optional **`organization_id`** → `organizations.id` (migration `010`)
- **events** — name, type, dates, location, lineup, description (EN/ES), `image_url`, stages/schedule (JSON), tags, tickets, socials, coords; optional **`promoter_organization_id`** → `organizations.id` (migration `010`). Events are **created manually** (admin UI or Cursor agent) and then **enriched** with `npm run db:events:enrich -- <slug>` (SerpAPI + OpenAI fill missing fields). Enricher system prompt: [`scripts/prompts/evento-enriquecer-system.txt`](scripts/prompts/evento-enriquecer-system.txt) (see [`docs/AI_PROMPTS_AND_AGENTS.md`](docs/AI_PROMPTS_AND_AGENTS.md))
- **organizations** — `slug`, name, roles (`label`, `promoter`, …), descriptions (EN/ES), `website`, `socials` (JSON), optional `base_city` / `founded_year`; Raveart seed + FK wiring in `010_raveart_organizations.sql`; extra gallery-titled events in `011_raveart_gallery_events.sql`
- **blog_posts** — title, content, excerpt (EN/ES), category, tags, author, `image_url`, published flag
- **scenes** — name (EN/ES), country, region, key artists/labels/venues, era, `image_url`
- **mixes** — title, artist, type, year, duration, embed URL, platform, `image_url`
- **history_entries** — title, content (EN/ES), section, year range, sort order
- **profiles**, **favorite_artists**, **favorite_labels**, and related user tables — see `003_user_system.sql` and follow-up migrations

---

## SQL migrations (reference)

Files under `supabase/migrations/` (apply in lexical order):

| File | Purpose |
|------|---------|
| `001_initial_schema.sql` | Core content tables |
| `002_seed_data.sql` | Seed data |
| `003_user_system.sql` | Profiles, favorites, attendance, ratings, etc. |
| `004_public_fan_counts.sql` | Fan counters |
| `004_slug_and_function_hardening.sql` | Slug / function hardening |
| `005_storage_media.sql` | Storage bucket `media` + public read policy |
| `006_artist_extended_fields.sql` | `artists`: `real_name`, `labels_founded`, `key_releases` |
| `007_admin_role.sql` | Admin role flag on profiles |
| `008_home_featured_artists.sql` | Home / featured artist wiring |
| `009_artists_from_artist_eras_timeline.sql` | Large INSERT set from era map (regenerable via `db:timeline:sql`) |
| `010_raveart_organizations.sql` | Table **`organizations`**, FKs on **`labels.organization_id`** and **`events.promoter_organization_id`**, RLS read policy; seed **Raveart**, **Raveart Records**, first **Summer/Winter** (+ **Summer 2026** placeholder) |
| `011_raveart_gallery_events.sql` | More **Raveart** events to match [galería oficial](https://www.raveart.es/galeria/) (**Winter 2019**, **Winter 2022**, **Retro Halloween** 2022–2025); SQL comment for filling **`image_url`** after Storage upload |

---

## NPM scripts (database & content)

| Script | Purpose |
|--------|---------|
| `npm run db:artist -- data/artists/<file>.json` | Upsert **one artist** from JSON (`slug` is the natural key). |
| `npm run db:artist:ensure -- data/artists/<file>.json` | Compare JSON vs Supabase row; run upsert if bios / `real_name` differ. |
| `npm run db:migrate` | Execute all `supabase/migrations/*.sql` in order via **Postgres** (requires connection string or password in env). |
| `npm run db:migrate:raveart` | Run only **`010_raveart_organizations.sql`** and **`011_raveart_gallery_events.sql`** (safe on DBs that already have `001`–`009`). Same Postgres env as `db:migrate`. |
| `node scripts/seed-supabase.mjs --files <name>.sql …` | Run an explicit list of migration files by basename (no path traversal). |
| `npm run db:seed` | Run `002_seed_data.sql` only (Postgres). |
| `npm run db:verify` | Row-count sanity check via **Supabase HTTP API** (`NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). |
| `npm run db:artist:agent -- <slug> "Name"` | OpenAI (+ optional SerpAPI) → **UPSERT** `artists` by default; `--json-only` / `--save-json` for file-only or copy. See [`docs/ARTIST_AI_AGENT.md`](docs/ARTIST_AI_AGENT.md). |
| `npm run db:artist:agent:all` | Regenerate **all** artist rows in Supabase via the agent (API credits); optional `--save-json` for `data/artists/` copies. |
| `npm run db:timeline` | Insert **missing** artists from `src/lib/artists-timeline.ts` (`ARTIST_ERAS`, same names as `/artists`) via **Supabase API** (service/secret key). Skips slugs already in `artists`. |
| `npm run db:timeline:sql` | Regenerate `009_artists_from_artist_eras_timeline.sql` (optional; for migrations without running the script against prod). |
| `npm run db:user-list` | Insert **missing** artists from the extended name list in `sync-user-list-artists.mjs` (short **placeholder** bios until you enrich with agent + `db:artist`). |
| `npm run db:events:enrich -- <slug>` | **Enrich** an existing event: SerpAPI web + OpenAI fill date, lineup, descriptions, venue, tags, etc. Add `--with-poster` to also search for the poster image. `--dry-run` previews changes without writing. |
| `npm run db:events:poster -- <slug>` | Search for event **poster/flyer** via SerpAPI Google Images + OpenAI; upload to Storage `media/events/<slug>/poster.*` and update `events.image_url`. |
| `npm run media:upload -- <local-file> <path-in-bucket>` | Upload a file to Storage bucket **`media`** (service/secret key); prints public URL + sample SQL for `image_url`. |

---

## Roadmap

- [x] Supabase-backed listings for artists, events, blog, labels, scenes, mixes (with static fallbacks when empty)
- [x] Per-entity `image_url` + shared card thumbnails and Storage bucket for hosted images
- [x] User auth + dashboard (favorites, sightings, saved content)
- [x] Artist updates via JSON + `npm run db:artist` (upsert by `slug`; Supabase REST API + service role)
- [x] Admin UI — `/[lang]/administrator`: CRUD for artists, labels, events, blog, scenes, mixes, history + image upload (requires `admin` on `profiles`)
- [x] Public reference listings — **large / compact / list** views for artists, labels, events, scenes, mixes (default **compact**; choice not persisted)
- [ ] Search functionality
- [ ] Richer SoundCloud/YouTube/Mixcloud embeds in mixes section
- [x] Dynamic sitemap (`src/app/sitemap.ts`, includes `/organizations/*`) + robots rules (`src/app/robots.ts`) for SEO basics
- [x] Google Analytics 4 (`@next/third-parties/google` + Consent Mode v2 + `CookieBanner`)
- [ ] OG images per section
- [ ] RSS feed for blog
- [ ] Newsletter subscription
- [ ] Community submissions (suggest artist, submit event)
- [ ] Dark mode toggle

---

## License

All rights reserved © 2026 Optimal Breaks. Made with breaks and noise from Murcia, Spain.
