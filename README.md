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
- **Audio**: Web Audio API with scratch simulation
- **Fonts**: Unbounded, Courier Prime, Special Elite, Darker Grotesque

---

## Images & cards

Listings and detail pages use a shared **`CardThumbnail`** component (`src/components/CardThumbnail.tsx`):

- **`image_url`** on artists, events, labels, scenes, mixes and blog posts can point to any HTTPS image (e.g. Supabase Storage public URL or external CDN).
- If `image_url` is empty, a **placeholder** (diagonal stripes + initials from the title) keeps the layout consistent.
- **Home** `ArtistCard` / `EventFlyer` include the same thumbnail strip.
- **Blog post** pages show a wide hero image under the title when `image_url` is set (or placeholder if not).
- **Responsive**: grids stack to one column on small screens; flyer-style hover tilt is limited to `sm:` and up to avoid awkward touch behaviour.

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

---

## Project Structure

```
OptimalBreaks/
├── docs/
│   └── ARTIST_AI_AGENT.md      # Full guide: AI artist agent (ES/EN)
├── data/
│   └── artists/                # One JSON file per artist → npm run db:artist
├── scripts/
│   ├── seed-supabase.mjs       # Run SQL migrations / seed (needs Postgres URI)
│   └── actualizar-artista.mjs  # Upsert artists from JSON (Postgres or Supabase API)
│   ├── generar-artista-agente.mjs
│   └── prompts/
│       └── artista-agente-system.txt  # System prompt for db:artist:agent
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
│   │       │   └── [slug]/     # Individual artist pages
│   │       ├── labels/         # Record label directory
│   │       │   └── [slug]/     # Individual label pages
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
│   │   ├── CardThumbnail.tsx   # Shared image / placeholder for cards & heroes
│   │   ├── DjDeck.tsx          # Interactive DJ controller with audio + scratch
│   │   ├── Marquee.tsx         # Tape strip with infinite scroll
│   │   ├── Timeline.tsx        # Dark section timeline
│   │   ├── ArtistCard.tsx      # Home / grid artist card (with thumbnail)
│   │   ├── EventFlyer.tsx      # Event flyer with tape decoration + thumbnail
│   │   ├── AuthProvider.tsx    # Supabase auth context
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

**Server-only elevated key** — Storage uploads, `createServiceSupabase()`, and the `db:artist` script (when not using Postgres) need the legacy **service_role** JWT or the new **secret** key (`sb_secret_…`):

```
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key
# or: SUPABASE_SECRET_KEY=sb_secret_...
```

Never put elevated keys in `NEXT_PUBLIC_*` or client-side code.

**Postgres URI** (optional) — required only for `npm run db:migrate` / `db:seed` against SQL files, not for day-to-day artist JSON updates via API. See `.env.local.example`.

### 4. Apply database migrations

Run every file in `supabase/migrations/` on your Supabase project (SQL Editor or `npm run db:migrate` with Postgres configured). Use **lexical (alphabetical) order** so `004_*` files run before `005` and `006`. Notable files: `005_storage_media.sql` (Storage bucket), `006_artist_extended_fields.sql` (extra `artists` columns for rich profiles).

Project scripts (if Postgres URI is configured):

```bash
npm run db:migrate
npm run db:seed
```

### 5. Updating artists (JSON upsert)

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
| **Postgres** | If `DATABASE_URL` (or aliases in `.env.local.example`) or `SUPABASE_DB_PASSWORD` + `NEXT_PUBLIC_SUPABASE_URL` is set — same as `db:seed`. |
| **Supabase API** | If Postgres is not configured: uses `NEXT_PUBLIC_SUPABASE_URL` + **`SUPABASE_SERVICE_ROLE_KEY`** or **`SUPABASE_SECRET_KEY`**. |

The browser **anon / publishable** key cannot be used for this write path. JWT keys and `sb_*` keys are **not** Postgres passwords; SQL migrations still need a real DB connection string or password when you use `db:migrate`.

### 5b. Agent: generate artist JSON (OpenAI + optional SerpAPI)

The agent writes **`data/artists/<slug>.json` only** — not Supabase. After generation, run **`npm run db:artist`** to upsert into the database (same schema as [`006_artist_extended_fields.sql`](supabase/migrations/006_artist_extended_fields.sql)).

**Full documentation (batch mode, env vars, admin API, bulk sync):** [`docs/ARTIST_AI_AGENT.md`](docs/ARTIST_AI_AGENT.md).

Editable system prompt: [`scripts/prompts/artista-agente-system.txt`](scripts/prompts/artista-agente-system.txt).

Requires **`OPENAI_API_KEY`** in `.env.local`. Defaults to **`gpt-5.4`**; override with **`OPENAI_MODEL`**. Optional **`SERPAPI_API_KEY`** ([SerpApi](https://serpapi.com)) for web snippets; if missing, the agent uses model knowledge only.

```bash
npm run db:artist:agent -- plump-djs "Plump DJs"
npm run db:artist:agent -- some-slug "Artist Name" --notes research/artist-notes.txt
npm run db:artist:agent -- some-slug "Artist" --no-search --stdout
npm run db:artist:agent:all                    # regenerate JSON for every artist row in Supabase (slow / API cost)
npm run db:artist:ensure -- data/artists/deekline.json   # verify DB matches JSON; sync if not
```

Then review the JSON, fact-check, and run `npm run db:artist -- data/artists/<slug>.json`. **Always fact-check** before publishing.

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
| Artists | `/[lang]/artists` | Directory from Supabase (or featured fallback) |
| Labels | `/[lang]/labels` | Record labels that shaped the sound |
| Events | `/[lang]/events` | Festivals, club nights, iconic past events, upcoming |
| Scenes | `/[lang]/scenes` | Breakbeat by territory |
| Blog | `/[lang]/blog` | Editorial layer: essays, comparisons, retrospectives |
| Mixes | `/[lang]/mixes` | Essential mixes, classic sets, radio shows |
| Dashboard | `/[lang]/dashboard` | User area (favorites, sightings, events, mixes, profile) — requires login |
| Login | `/[lang]/login` | Supabase auth |
| Privacy / Terms / Cookies | `/[lang]/privacy`, etc. | Legal pages |
| About | `/[lang]/about` | Project manifesto, contact, collaborate, submit |

---

## Database Schema

Supabase tables are reflected in `src/types/database.ts`. Highlights:

- **artists** — `slug`, name / `name_display`, `real_name`, bio (EN/ES), category, styles, era, `image_url`, essential tracks, recommended mixes, related artists, `labels_founded`, `key_releases` (JSON), website, socials, featured flag, sort order — see `006_artist_extended_fields.sql` and `data/artists/deekline.json`
- **labels** — name, country, founded year, description (EN/ES), `image_url`, key artists/releases
- **events** — name, type, dates, location, lineup, description (EN/ES), `image_url`
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

---

## NPM scripts (database & content)

| Script | Purpose |
|--------|---------|
| `npm run db:artist -- data/artists/<file>.json` | Upsert **one artist** from JSON (`slug` is the natural key). |
| `npm run db:artist:ensure -- data/artists/<file>.json` | Compare JSON vs Supabase row; run upsert if bios / `real_name` differ. |
| `npm run db:migrate` | Execute all `supabase/migrations/*.sql` in order via **Postgres** (requires connection string or password in env). |
| `npm run db:seed` | Run `002_seed_data.sql` only (Postgres). |
| `npm run db:verify` | Row-count sanity check via **Supabase HTTP API** (`NEXT_PUBLIC_SUPABASE_ANON_KEY` or `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`). |
| `npm run db:artist:agent -- <slug> "Name"` | Generate `data/artists/<slug>.json` with OpenAI (+ optional SerpAPI). See [`docs/ARTIST_AI_AGENT.md`](docs/ARTIST_AI_AGENT.md). |
| `npm run db:artist:agent:all` | Regenerate JSON for **all** artists listed in Supabase (uses API credits; then run `db:artist` per file or bulk script). |
| `npm run db:timeline` | Insert **missing** artists from `src/lib/artists-timeline.ts` (`ARTIST_ERAS`, same names as `/artists`) via **Supabase API** (service/secret key). Skips slugs already in `artists`. |
| `npm run db:timeline:sql` | Regenerate `009_artists_from_artist_eras_timeline.sql` (optional; for migrations without running the script against prod). |

---

## Roadmap

- [x] Supabase-backed listings for artists, events, blog, labels, scenes, mixes (with static fallbacks when empty)
- [x] Per-entity `image_url` + shared card thumbnails and Storage bucket for hosted images
- [x] User auth + dashboard (favorites, sightings, saved content)
- [x] Artist updates via JSON + `npm run db:artist` (upsert by `slug`; Postgres or Supabase API)
- [ ] Admin panel — CRUD for artists, labels, events, blog posts + image upload UI
- [ ] Search functionality
- [ ] Richer SoundCloud/YouTube/Mixcloud embeds in mixes section
- [ ] Sitemap.xml + robots.txt for SEO
- [ ] OG images per section
- [ ] RSS feed for blog
- [ ] Newsletter subscription
- [ ] Community submissions (suggest artist, submit event)
- [ ] Dark mode toggle

---

## License

All rights reserved © 2026 Optimal Breaks. Made with breaks and noise from Murcia, Spain.
