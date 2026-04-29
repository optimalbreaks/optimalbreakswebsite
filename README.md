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

## User engagement (My Breaks)

Logged-in users get **My Breaks** (`/[lang]/dashboard` as overview + dedicated pages under `/[lang]/mi-cuenta/<slug>`): favorites, attendance, saved mixes, **saved chart tracks** (`/mi-cuenta/tracks`), **Soulmates** (`/mi-cuenta/almas-gemelas`), and **star ratings only for real-world experiences** — **artists** (seen live) and **events** (went there). Labels, mixes, etc. use **favorites/saves only** (no 1–5 stars).

**Reference:** [`docs/USER_ENGAGEMENT.md`](docs/USER_ENGAGEMENT.md). **DB:** migration **`032_event_ratings_attendance_fields.sql`** for extra `event_ratings` fields; migrations **`053_saved_chart_tracks.sql`** + **`054_saved_chart_tracks_beatport_top.sql`** for the polymorphic saved-tracks table (`chart | featured | vinyl | beatport_top`, plus `canonical_url` + `snapshot` columns so the artist/label **Beatport Top 10** can be saved cross-source with a single URL-based canonical key). Migration **`056_community_top_and_soulmates.sql`** adds **`profiles.is_tracks_public`** (default `TRUE`; users who set it to `FALSE` are excluded from **Soulmates** affinity matching and from **Community Monthly Top** aggregates) plus **`idx_sct_created`** on `saved_chart_tracks.created_at` for cheap monthly windows.

**Community Monthly Top** (`/[lang]/charts`, section below *Retro Vinyl Picks*): `CommunityMonthlyTop.tsx` calls **`GET /api/public/charts/community-monthly`** (`month=YYYY-MM`, optional `limit`). Same canonical dedupe as the admin Tracks dashboard; month chips list **only months that have at least one qualifying save** (flex-wrap + no horizontal scroll so taps work reliably on iOS PWA).

**Soulmates** (`/[lang]/mi-cuenta/almas-gemelas`): **`GET /api/breakbeat/soulmates`** (authenticated cookie session) computes **Jaccard similarity** over canonical keys vs other users who opted in; returns top matches plus cross-user recommendations. Toggle **public list for Soulmates / Monthly Top** on `/mi-cuenta/perfil`.

**Public shared tracks page.** Every user can copy a public URL from `/mi-cuenta/tracks` (🔗 COMPARTIR button) that points to `/[lang]/u/<userId>/tracks`. Third parties can browse, sort, filter and play that list but cannot edit it; their own SAVE button adds tracks to **their** list (and shows a sign-up modal when logged out). Backed by `/api/public/user-tracks` using the service-role Supabase client to bypass RLS for read-only.

**Per-track sharing.** Every row on chart, saved-tracks and Beatport Top 10 lists carries a per-song `TrackShareButton` (🔗) that copies a URL of the form `/charts?week=…&play=<chart|featured>:<uuid>` or `/<artists|labels>/<slug>?play=beatport:<beatportId>`. Opening that URL lands on Optimal Breaks with the song already playing and the preview card (artwork + title) rendered on social media via server-side OG overrides. Details in *[Per-track sharing](#per-track-sharing-open--autoplay-on-optimal-breaks)* and `docs/USER_ENGAGEMENT.md`.

**Admin Tracks dashboard.** `/[lang]/administrator/tracks` aggregates saved-track stats (top tracks, labels and artists) across **all users**, applying the same cross-source canonical dedupe as the user UI so a track saved from both "40 Breaks Vitales" and "New Releases" counts once. Source: `/api/admin/tracks/route.ts`.

---

## Tech Stack

- **Framework**: Next.js 14 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS 3.4 + custom CSS variables
- **Database**: Supabase (PostgreSQL) + Row Level Security
- **Storage**: Supabase Storage (public bucket `media` for content images — see below)
- **i18n**: Custom middleware with `/es` and `/en` prefixed routes + hreflang tags; global **deck / mix audio** remounts on locale change (`DeckAudioProvider` `key={lang}` in `[lang]/layout.tsx`) so one playback session per language
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
**All Markdown docs (map + audit):** [`docs/README.md`](docs/README.md).

---

## Images & cards

**Full guide (WebP, `public/images` vs Supabase, pitfalls):** [`docs/IMAGES_AND_WEBP.md`](docs/IMAGES_AND_WEBP.md).

Listings and detail pages use a shared **`CardThumbnail`** component (`src/components/CardThumbnail.tsx`):

- **`image_url`** on artists, events, labels, scenes, mixes and blog posts can point to any HTTPS image (e.g. Supabase Storage public URL or external CDN).
- **Artists only:** **`displayArtistImageUrl(slug, image_url)`** (`src/lib/artist-public-portrait.ts`) prefers remote HTTPS, then **editorial** portraits from **`data/artist-public-portrait-map.json`** + `public/images/artists/*.webp`, then a DB value already under **`/images/artists/`**. If still nothing usable, the thumbnail uses a **branded punk fallback** (`onError` also falls back if a remote URL breaks).
- Other entities use **`displayImageUrl()`** (`src/lib/image-url.ts`): **only** paths under **`/images/`** (static `public/` assets) get `.jpg`/`.png` → `.webp` substitution. **Supabase Storage URLs are used exactly as stored** — the object must exist at that path (do not rely on the client renaming `.jpg` to `.webp`).
- If `image_url` is empty (non-artist paths), a **placeholder** (diagonal stripes + initials from the title) keeps the layout consistent.
- **Home** `ArtistCard` / `EventFlyer` include the same thumbnail strip.
- **Blog post** pages show a wide hero image under the title when `image_url` is set (or placeholder if not).
- **Responsive**: grids stack to one column on small screens; flyer-style hover tilt is limited to `sm:` and up to avoid awkward touch behaviour.
- **Hover groups:** when a parent uses Tailwind **`group/link`** (e.g. event cards in `EventsExplorer`), pass **`groupHoverGroup="link"`** on **`CardThumbnail`** so poster zoom uses **`group-hover/link:`** and stays in sync with the footer strip.

### Directory listing views (Artists, Labels, Events, Scenes, Mixes)

When Supabase returns rows, these five sections use **client components** that offer three layouts (toolbar top-right on Artists next to search; top-right on the others):

| Mode | Behaviour |
|------|-----------|
| **Large** | Spacious grid (or flyer-style cards for events and mixes). |
| **Compact** | Dense multi-column grid — **default** on first load (choice is not persisted in URL or `localStorage`). |
| **List** | Horizontal rows with a small square thumbnail. |

Shared UI: `src/components/ViewToggle.tsx`. Per-section explorers: `ArtistsExplorer`, `LabelsExplorer`, `EventsExplorer`, `ScenesExplorer`, `MixesExplorer` in `src/components/`. Labels for the buttons live under each section in `src/dictionaries/en.json` and `es.json` (`view_large`, `view_compact`, `view_list`).

**Mixes (`MixesExplorer`, `/[lang]/mixes`):** Filters by **year**, **platform** (YouTube, SoundCloud, …), and **text search** on title + artist. Filter logic is unchanged from a user perspective; the implementation keeps the **full catalog mounted** and toggles visibility with Tailwind’s **`hidden` class** on non-matching cards so **embeds are not destroyed** when you clear filters (avoid using only the HTML `hidden` attribute on the same node as `display: flex` — author styles win and wrong rows could stay visible). **YouTube and SoundCloud iframes load on demand:** an `IntersectionObserver` mounts each embed when the card nears the viewport (DOM order follows **newest publication years first**), and the iframe uses `loading="lazy"`. SoundCloud continues to use the visual player (`SoundCloudVisualEmbed` URL builder; lazy wrapper in `MixesExplorer`).

**Events (`EventsExplorer`, `/[lang]/events`):** Footer acts as a **traffic light** by calendar day: **past** events (last day `date_end` or `date_start` before today, local midnight) use **`var(--red)`** with **white** text; **still upcoming** use the **brand yellow** **`var(--yellow)`** (same token as the logo / navbar) with **`var(--ink)`** text. **Hover** lightens the footer with `color-mix(…, white, 50%)` on both colours; the **strip behind the poster** uses a matching tint (**red mix** when past, solid yellow when upcoming) so image and footer read as one unit. The card `<Link>` is **`group/link`**, so **`group-hover/link:`** on the footer fires when hovering the image (and vice versa). **`CardThumbnail`** uses **`groupHoverGroup="link"`** for poster zoom. Rows use **`items-stretch`**, **`h-full`** on the link, and **`flex-1`** / **`min-h-*`** on the footer so **footer heights align** within each grid row (large and compact). **Calendar year view** (`view_calendar`): each day with events is **red** if every event touching that day is **past**, **yellow** if at least one is still **upcoming** (same `isEventPast` rule); legend copy in **`calendar_legend_past`** / **`calendar_legend_upcoming`**. **Clicking a day** opens a **portal modal** (poster, dates, location, lineup excerpt, description snippet, **CTA link** to the full event page — no direct navigation from the cell). Copy under **`calendar_modal_*`** keys in `en.json` / `es.json`.

**Event detail (`/[lang]/events/[slug]`):** Full-width **hero ticket CTA** when there is a ticket/website URL, the event is **not past** by date (`isEventPastByDate`: last calendar day of the event before today), and either **`event_type === 'upcoming'`** or **`tickets_url` / `website`** is a **MonsterTicket** host (`monsterticket.com`, `monsterticket.es`, including subdomains). **`preferredHeroTicketUrl`** prefers MonsterTicket over other URLs. Copy for MonsterTicket: **“Compra de entradas”** / **“Buy tickets”**; generic links keep **“Comprar entradas”** / **“Get tickets”**.

---

## Supabase Storage (`media` bucket)

SQL migration: `supabase/migrations/005_storage_media.sql`

- Creates a **public** bucket named **`media`** (image MIME types, ~5 MB per file by default).
- **Public read** policy so URLs work in `<img>` and with the site CSP (`img-src` includes `https:`).
- Writes from the browser are **not** opened to anonymous users by default; uploads are intended via **Dashboard**, **service role**, or a future admin API.

Server-side helpers:

- `src/lib/supabase-admin.ts` — `createServiceSupabase()` (requires `SUPABASE_SERVICE_ROLE_KEY` or `SUPABASE_SECRET_KEY`, **server only**).
- `src/lib/supabase-storage.ts` — `publicMediaObjectUrl()`, `uploadPublicMedia()` for scripts or Route Handlers.

After uploading a file, store the **public object URL** in the corresponding `image_url` column (or build it with `publicMediaObjectUrl('path/inside/bucket.jpg')`). Prefer **`.webp`** for new objects when you control the file; the URL in the database must match the uploaded extension (see [IMAGES_AND_WEBP.md](docs/IMAGES_AND_WEBP.md)).

**CLI upload (local file → bucket `media`):** with service/secret key in `.env.local`:

```bash
npm run media:upload -- ./my-cover.webp events/raveart-summer-festival-2025/cover.webp
```

Script: [`scripts/upload-storage-media.mjs`](scripts/upload-storage-media.mjs). It prints the public URL and a sample `UPDATE` for `events.image_url` (or any table with `image_url`). Only upload images you have the **rights** to use (own photos, licensed assets, or explicit permission from rights holders).

---

## Authentication (Supabase Auth and email templates)

**App routes:**

- `src/app/[lang]/login/` — sign up, sign in, forgot password (sends recovery email).
- `src/app/[lang]/reset-password/` — **new password form** after a valid recovery session (this is the screen users expect after clicking the email link).
- `src/app/[lang]/auth/confirm/route.ts` — **server** [`verifyOtp`](https://supabase.com/docs/reference/javascript/auth-verifyotp) with `token_hash` + `type` from the link query string; sets the session cookie and redirects. **`type=recovery`** → `/{lang}/reset-password`; other types (e.g. signup) → `/{lang}/login` (or a safe `?next=` path only).
- `src/app/[lang]/auth/callback/` — **client page** for **OAuth (Google) PKCE**: exchanges `?code=` via `exchangeCodeForSession`, or listens for auth events. If Supabase lands here **without** `code` but with email params (e.g. `token_hash` nested inside `?next=`), the client **redirects to** `/{lang}/auth/confirm` so the server can finish verification (avoids hanging on “Confirming session…”).
- Legacy: `src/app/api/auth/callback/route.ts` — redirects to `/{locale}/auth/callback` preserving `code` / `next` for old `redirect_to` values.

Helpers: `src/lib/auth-callback.ts` (`normalizeRelativeNext`, `isSafeAppPath`, `parseOtpFromAuthCallbackParams`, etc.). Middleware skips session refresh on paths containing `/auth/callback` and `/auth/confirm` so auth cookies are not disturbed mid-flow.

**Redirects from the app (must match [URL Configuration](https://supabase.com/dashboard/project/_/auth/url-configuration) allow list):**

- **Sign up** — `emailRedirectTo` → `https://…/{lang}/auth/confirm` (email link should hit this route with `token_hash` + `type`; see templates below).
- **Password reset** — `redirectTo` → `https://…/{lang}/auth/confirm` (same; after `verifyOtp`, user is sent to `/{lang}/reset-password`).

**HTML email templates (branded, Outlook-friendly tables):** copy from [`mailing/supabase/`](mailing/supabase/) into **Supabase Dashboard → Authentication → Email**. The repo templates use **`{{ .RedirectTo }}?token_hash={{ .TokenHash }}&type=…`** for the main button/link so the first hop is **your** `/auth/confirm` endpoint (recommended for SSR; avoids broken PKCE-only redirects). Full file list, `type` per template, paste steps, variables, and SMTP notes: [`mailing/supabase/README.md`](mailing/supabase/README.md).

Use **custom SMTP** (e.g. OVH) under Auth settings if you want `From:` on your domain; disable link-tracking that rewrites URLs.

---

## Project Structure

```
OptimalBreaks/
├── docs/
│   ├── README.md               # Doc index + maintenance audit (what each .md covers)
│   ├── AI_PROMPTS_AND_AGENTS.md # Index: all .txt prompts, env defaults, APIs (ES/EN)
│   ├── ARTIST_AI_AGENT.md      # Full guide: AI artist agent (ES/EN)
│   ├── IMAGES_AND_WEBP.md      # public/images vs Storage, displayImageUrl, WebP rules
│   └── USER_ENGAGEMENT.md      # Favorites, seen live, event attendance, ratings
├── mailing/
│   ├── supabase/               # Auth email HTML → paste into Supabase Email templates (see README there)
│   └── firma-*.html            # Email signature variants (not used by Supabase Auth)
├── data/
│   └── artists/                # One JSON file per artist → npm run db:artist
├── scripts/
│   ├── seed-supabase.mjs            # Run SQL migrations / seed (needs Postgres URI)
│   ├── actualizar-artista.mjs       # Upsert artists from JSON (Supabase REST API only)
│   ├── ensure-artist-json-in-db.mjs # Compare JSON vs DB; upsert if bios differ
│   ├── generar-artista-agente.mjs   # OpenAI → data/artists/<slug>.json
│   ├── elegir-foto-artista.mjs      # npm run db:artist:photo — SerpAPI + OpenAI → Storage + UPSERT
│   ├── sync-artist-public-portrait-urls.mjs  # db:artist:sync-public-portraits — map + public/images/artists → image_url
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
│   │       ├── login/          # Email/password auth, forgot password
│   │       ├── auth/confirm/   # GET route: verifyOtp(token_hash, type) → session + redirect
│   │       ├── auth/callback/  # Client: OAuth PKCE (?code=); repair → /auth/confirm if needed
│   │       ├── reset-password/ # New password after recovery (session from /auth/confirm)
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
│   │   ├── MixesExplorer.tsx   # Mixes: three views, filters, lazy YT/SC embeds
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
│   │   ├── auth-callback.ts    # Safe redirect paths; parse token_hash from broken callback URLs
│   │   ├── seo.ts              # Metadata helpers
│   │   └── security.ts         # Slug / locale sanitization
│   ├── types/
│   │   └── database.ts         # Full DB types: artists, labels, events, blog, scenes, mixes, history, profiles, …
│   └── middleware.ts           # i18n + Supabase cookie refresh (skips /auth/callback, /auth/confirm)
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

## Home — history timeline (`section_history`)

The dark **Timeline** on the home page (`src/components/Timeline.tsx`) is driven by **`home.section_history.items`** in `src/dictionaries/en.json` and `es.json`. Each row has a display **`year`** string (often a range), **`title`**, and **`desc`**.

**Order is not computed in code** — there is no sort by start year, end year, or midpoint. The JSON array order is **manual and editorial**: a narrative thread (origins → UK → …), **side paths** (e.g. US as a parallel map), and a **closing** block (e.g. global digital era last, as a layer that spans decades alongside other chapters). Overlapping periods are expected; placement follows **story flow**, not a single numeric rule. To reorder, edit `items` in **both** locale files.

**Events strip:** the home grid shows up to **four** rows where **`date_start` ≥ today** (local calendar `YYYY-MM-DD`), **`ORDER BY date_start ASC`**. If that query returns nothing, the page uses the **four latest** events by **`date_start` DESC**; if the table is empty, **`FALLBACK_HOME_EVENTS`** placeholders apply (`src/app/[lang]/page.tsx`).

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
- **Locale switch (ES/EN)** — `DeckAudioProvider` is mounted with **`key={lang}`** in `src/app/[lang]/layout.tsx`. Navigating between `/en` and `/es` **remounts** the audio context (home vinyl deck, mini bar, SoundCloud/mix mode). Playback from the previous locale does **not** continue in the background.

---

## Layout, header, and mobile width

- **`html` / `body`** in `src/app/globals.css` use **`max-width: 100%`** and **`overflow-x: hidden`** (or `clip` where supported) to avoid horizontal “ghost” scroll on narrow viewports (`100vw` vs usable width).
- The **`<header>`** intentionally does **not** set `overflow-x: hidden`, so **absolutely positioned** panels (mobile hamburger menu, **account dropdown** behind the avatar) are not clipped. Dropdowns use a high **z-index** (e.g. `z-[200]`) above the sticky bar (`z-[100]`).

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

### 5c. Artist portraits (web search → Storage, repair, `public/images/artists`)

**Not** the bio agent: **`npm run db:artist:photo`** / **`db:artist:photo:repair`** use SerpAPI + OpenAI, validate downloaded bytes, upload to Storage, and UPSERT **`image_url`**. Slugs covered by **`data/artist-public-portrait-map.json`** + a file in **`public/images/artists/`** are skipped automatically (no wasted API calls) unless **`--force-rephoto`**. After adding local WebP + map entry, run **`npm run db:artist:sync-public-portraits`**. Full flags and admin API: [**`docs/ARTIST_AI_AGENT.md`**](docs/ARTIST_AI_AGENT.md) (section *Artist photos* / *Fotos de artista*).

**Bulk upsert (all JSON files in `data/artists/`)** — from repo root, PowerShell:

```powershell
Get-ChildItem "data\artists\*.json" | ForEach-Object { npm run db:artist -- ("data/artists/" + $_.Name) }
```

Git Bash:

```bash
for f in data/artists/*.json; do npm run db:artist -- "$f"; done
```

### 5d. Artist pages: Supabase vs Git, caching, placeholders

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
| Home | `/[lang]` | Hero with DJ deck, timeline, featured artists, **up to 4 upcoming events** (see *Home — history timeline*), CTA |
| History | `/[lang]/history` | Origins, UK, US, Andalusia, Australia, decline, digital era |
| Artists | `/[lang]/artists` | Directory from Supabase (or featured fallback); **large / compact / list** views + filters |
| Labels | `/[lang]/labels` | Record labels that shaped the sound; **three listing views** when data exists |
| Organizations | `/[lang]/organizations/[slug]` | Promoter / umbrella org: related labels, event archive and upcoming (e.g. `raveart`) |
| Events | `/[lang]/events` | Festivals, club nights, iconic past events, upcoming; **three listing views** |
| Scenes | `/[lang]/scenes` | Breakbeat by territory; **three listing views** |
| Blog | `/[lang]/blog` | Editorial layer: essays, comparisons, retrospectives |
| Mixes | `/[lang]/mixes` | Essential mixes, classic sets, radio shows; **three listing views**; year / platform / search filters; **lazy embeds** (see *Directory listing views* → Mixes) |
| Charts | `/[lang]/charts` | *40 Breaks Vitales*, *New Releases*, *Retro Vinyl Picks*; **Community Monthly Top** (ranking of saves across users for a calendar month) appears **after** Retro Vinyl Picks |
| Dashboard (overview) | `/[lang]/dashboard` | User area landing: summary cards + Breakbeat DNA — requires login |
| My account — sections | `/[lang]/mi-cuenta/favoritos`, `.../vistos-en-vivo`, `.../eventos`, `.../resenas`, `.../mixes`, `.../tracks`, `.../almas-gemelas`, `.../perfil` | Each user area lives in its own page (no in-page tabs). Legacy `/dashboard?tab=xxx` URLs redirect automatically. Soulmates + privacy toggle: [`docs/USER_ENGAGEMENT.md`](docs/USER_ENGAGEMENT.md). |
| My Tracks (public) | `/[lang]/u/<userId>/tracks` | Shareable read-only version of a user's saved-tracks list; third-party visitors can play/sort/filter and save tracks to **their** list. |
| Login | `/[lang]/login` | Supabase auth (sign up, sign in, forgot password → email link) |
| Reset password | `/[lang]/reset-password` | New password after recovery email; session created by `/{lang}/auth/confirm` (or repaired via `/{lang}/auth/callback` → confirm) |
| Privacy / Terms / Cookies | `/[lang]/privacy`, etc. | Legal pages |
| About | `/[lang]/about` | Project manifesto, contact, collaborate, submit |
| Administrator | `/[lang]/administrator` | Admin-only CRUD + image upload (`profiles.role = admin`); not linked from public nav |

---

## Global search (⌘K / Ctrl+K)

The `CommandPalette` (magnifier icon in the header, keyboard shortcut **⌘K** / **Ctrl+K**) hits **`/api/search`** (`src/app/api/search/route.ts`) and merges results from **nine origins** into a single list. The goal is to **favour music playback**: if you search an artist name, every track of theirs that sits in any chart must appear so you can click → jump → hear.

### What it searches and where

| Type | Table / source | Columns (`ilike`) |
|------|----------------|-------------------|
| `artist` | `artists` | `name`, `name_display`, `slug` |
| `track` | `chart_tracks` | `title`, `mix_name`, `label`, `artist_names_text` (migration **051**) |
| `track` | `chart_featured_tracks` (New Releases) | same columns |
| `track` | `chart_vinyl_tracks` (Retro Vinyl Picks) | same columns |
| `mix` | `mixes` | `title`, `artist` |
| `event` | `events` | `title`, `slug`, `city`, `venue`, `lineup_text` (migration **052**: flattens `lineup text[]` + `stages[].lineup` into a `STORED GENERATED` column) |
| `label` | `labels` | `name`, `slug` |
| `scene` | `scenes` | `title`, `slug`, `city` |
| `post` | `posts` | `title`, `slug` |
| `organization` | `organizations` | `name`, `slug` |

### Presentation rules

- **Group order in the UI** (music first): `artist → track → mix → event → label → scene → post → organization`.
- **Future vs. past events:** past events are **discarded by default**. They only show up when the query is clearly event-centric (i.e. every other result type is empty): in that case past editions are included too. Otherwise only **upcoming** events appear (`date_start >= today`, asc).
- **Date chip on events:** next to the type chip the UI renders `formatEventDate` in **yellow** for upcoming (`is_upcoming: true`) and **red** for past.
- **Track deduplication:** the same song can live in several chart editions. Dedupe key is `normalize(title) | normalize(mix_name) | normalize(first_artist_name)` and priority is **`chart_tracks` > `chart_featured_tracks` > `chart_vinyl_tracks`**. Within each table rows come back ordered by **`chart_editions.week_date` DESC** first, then `position` ASC, so the surviving row is always the one from the **most recent edition** (the one `/charts` renders near the top). This keeps the result `href` pointing at a row that actually **exists** in the DOM so deep-link + autoplay don’t fail intermittently.
- **Artwork:**
  - **Tracks** → `next/image` with Beatport `artwork_url` (the Next.js image proxy sidesteps hotlink/CSP).
  - **Mixes** → the mix’s own cover (YouTube/SoundCloud) is **ignored**; we always prefer the artist photo first, and fall back to **`/images/disco_optimal_breaks.webp`** if no artist image exists.
  - **Artists** → `displayArtistImageUrl` (same helper used elsewhere on the site).
- **Rate limit:** 120 requests/min per IP (per instance), `429` on excess.

### Deep-linking on click

The `href` values returned by the API carry both a **hash** and **`?play=1`** so the destination view opens the right accordion, scrolls to the exact row and starts playback:

- `/{lang}/charts#chart-row-<id>?play=1` — 40 Breaks Vitales and New Releases (`ChartView`).
- `/{lang}/charts#chart-vinyl-row-<id>?play=1` — Retro Vinyl Picks (YouTube iframe autoplay).
- `/{lang}/mixes#mix-<id>?play=1` — `MixesExplorer` (direct MP3/SoundCloud, YouTube via autoplay).

The `useEffect` in `ChartView.tsx` listens for hash + `play`, expands the matching year/week accordion, scrolls, highlights the row and triggers play. When done it strips `?play=1` via `history.replaceState` so a refresh doesn’t fire playback again.

### Per-track sharing (open + autoplay on Optimal Breaks)

Every song surface (`ChartView`, `TracksSection` and `BeatportTopTracks`) renders a tiny 🔗 button per row — `TrackShareButton` (`src/components/TrackShareButton.tsx`) — that uses `navigator.share` on mobile and `clipboard.writeText` (with ✓ feedback) as fallback. URL shapes:

- `/{lang}/charts?week=<YYYY-MM-DD>&play=chart:<uuid>` — **40 Breaks Vitales** row in a specific edition.
- `/{lang}/charts?week=<YYYY-MM-DD>&play=featured:<uuid>` — **New Releases** row in a specific edition.
- `/{lang}/artists/<slug>?play=beatport:<beatportId>` / `/{lang}/labels/<slug>?play=beatport:<beatportId>` — row inside the **Beatport Top 10** of a profile (stable `beatportId` extracted from `beatport_url`).

`parsePlayParam` in `src/lib/share-track.ts` normalises the three shapes plus the legacy `?play=1`. Retro Vinyl Picks are **not** shared this way — they stay on their Discogs / YouTube links because iframe-only playback makes autoplay via arbitrary share links unreliable.

**Server OG overrides.** `generateMetadata` on `charts/page.tsx`, `artists/[slug]/page.tsx` and `labels/[slug]/page.tsx` reads `?play=` during SSR: if it resolves to an actual track it rewrites `og:title` (`"Title (Mix) — Artists"`), `og:description` (`"Listen to this track on Optimal Breaks · Label · Year"`) and `og:image` (the track `artwork_url`), falling back to the normal profile/chart OG when it doesn't. So sharing a link on WhatsApp/X shows the **song** as the preview, not the generic chart or profile card.

**Autoplay fallback.** When a shared link is opened in a fresh tab, Chrome/Safari routinely block `audio.play()` with `NotAllowedError` (no user gesture in the new tab). `DeckAudioProvider` intercepts the specific error and flips `previewBlocked` on the context (also exposed on `usePreviewAudio().previewBlocked`). A full-screen **`PreviewAutoplayOverlay`** renders a single "▶ TAP TO PLAY" card with **cover art + title + artist**. One tap calls `togglePreview()` (now inside a user gesture) and the overlay self-dismisses. Other playback errors (bad URL, CORS…) do not trigger the overlay.

**Cover art in the overlay.** Beatport artwork URLs must not be loaded with a raw `<img>`: their CDN often returns **403** when the browser sends a non-Beatport `Referer`. The overlay therefore uses **`next/image`** (`fill`, `sizes`) so the request goes through **`/_next/image`** — same pattern as chart rows and `BeatportTopTracks`. Hostnames must remain allowed in `next.config.js` → `images.remotePatterns`. If the image still fails, `onError` swaps the thumbnail for a neutral **♪** placeholder instead of the broken-image icon.

### Key files

- `src/app/api/search/route.ts` — REST API (parallel queries, dedupe, ordering).
- `src/components/CommandPalette.tsx` — palette UI (keyboard shortcuts, groups, rendering).
- `supabase/migrations/051_chart_tracks_artist_names_text.sql` — `artist_names_text` generated from JSONB `artists` on the three chart tables.
- `supabase/migrations/052_events_lineup_text.sql` — `lineup_text` generated from `events.lineup` + `events.stages[].lineup`.

---

## Global audio system (`DeckAudioProvider` + `claimAudio`)

All audio in the app is owned by a single provider — **`DeckAudioProvider`**, mounted in `src/app/[lang]/layout.tsx`. It exposes **three mutually-exclusive modes**:

| Mode | Origin | Visible component |
|------|--------|-------------------|
| `deck` | Home DJ deck (4 pads) | `DJDeck` + provider's `MiniDeckBar` |
| `mix` | SoundCloud / YouTube mix | provider's `MiniDeckBar` |
| `preview` | Chart song previews (weekly chart: "40 Breaks" + "New Releases"), Beatport Top 10 on artist/label pages, **My Tracks** page (own or shared) | provider's **`MiniPreviewBar`** (persists across route changes) |

### Persistence across navigation

The **`preview` mode is global**: the queue (`PreviewTrack[]`), the current index, the real `<audio>` element and the now-playing UI all live inside `DeckAudioProvider`. Consumer components (`ChartView`, `BeatportTopTracks`, `TracksSection`) **no longer have their own `<audio>` or floating bar** — they just call `playPreviewQueue(queue, index, groupKey)` / `togglePreview()` / `stopPreview()` via the **`usePreviewAudio`** hook. This means if you start a preview on `/es/artists/adam-freeland` and navigate to `/es/charts` or `/es/mi-cuenta/tracks`, **audio keeps playing** and the `MiniPreviewBar` stays visible (for Beatport/Bandcamp samples). YouTube embeds (vinyl tracks) still stop on navigation since they're third-party iframes.

### How mutual exclusion works

1. **`claimAudio(source)`** dispatches a `CustomEvent` named **`ob-audio-claim`** on `window` with `{ detail: { source } }`. The provider itself calls `claimAudio` when switching modes.
2. The provider pauses the non-matching modes when a claim is received. Only one of `deck` / `mix` / `preview` plays at a time.
3. The type **`AudioClaimSource`** still accepts legacy aliases (`chart-preview`, `chart-playall`, `beatport-top`, `my-tracks`) for backward compatibility — they all map to the new `preview` mode.

### `MiniPreviewBar`

Rendered by the provider whenever `previewQueue.length > 0`. Same visual layout as the old per-page floating bar:

- **Progress bar** — seekable click/drag (`pointer events`), red fill on a neutral track.
- **Transport** — Previous `⏮` / Play-Pause `▶ ❚❚` / Stop `■` / Next `⏭`.
- **Track info** — title (Unbounded) + artist (Courier Prime). If the current `PreviewTrack` has a `domId` and the visible page contains that row, tapping the info scrolls to it.
- **Time & counter** — `currentTime / duration` + `index / total`.
- **Save toggle (`+` / ✓)** — same `SaveTrackButton` (size `sm`) that lives on every chart / Top 10 / My Tracks row, rendered to the right of the time. Each `PreviewTrack` carries its own `save` payload (`mode: 'ref'` for tracks that have a row in `chart_*_tracks`, `mode: 'url'` for Beatport Top 10 entries that only live as JSONB) so the button operates on the same canonical group as the source row and stays in sync via the shared `useSavedChartTracks` store. Lets the user add or remove the song that is currently playing without having to scroll back to its row.
- **`mediaSession`** — `metadata` (title, artist, artwork) + `play` / `pause` / `previoustrack` / `nexttrack` handlers for hardware media keys, lock screen and Bluetooth.
- **OS “Now Playing” / lock screen** — The Web **Media Session** API only exposes standard `MediaMetadata` text fields (`title`, `artist`, `album`, `artwork`) plus position state for the scrubber. **There is no dedicated release-year field** for the system UI. The only way to show a year on the phone lock screen would be to concatenate it into `title` / `artist` / `album`, which competes for space and is **heavily truncated** on iOS. We intentionally keep those strings **clean**; release year and full date stay in the **in-app** UI (`MiniPreviewBar`, chart rows), not duplicated into `mediaSession`.
- **Mobile safe-area** — `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 10px)` so the transport buttons keep ~10 px of breathing room above the iPhone home-bar even when the system reports 0 px of inset (and the page wrapper reserves the same height with `pb-[calc(4.75rem+env(safe-area-inset-bottom,0px)+10px)]` so the last row never sits under the bar).

### `PreviewAutoplayOverlay` (shared-link autoplay)

When `loadAndPlayPreviewAt` hits **`NotAllowedError`**, the provider sets **`previewBlocked`** and renders a full-viewport modal above the page: one tappable card ("▶ TAP TO PLAY" / ES equivalent) that calls **`togglePreview()`** on first user gesture. Cover art uses **`next/image`** so Beatport URLs load via **`/_next/image`** (avoids CDN hotlink 403 from plain `<img>`). Failed loads show a **♪** placeholder. Clears when playback starts successfully or **`stopPreview`** runs. Implemented inside `DeckAudioProvider.tsx`.

The bar still dispatches **`OB_CHART_PLAYALL_BAR_EVENT`** (`ob-chart-playall-bar`) so that `BackToTop.tsx` can offset its scroll-to-top button while the bar is visible. `BackToTop`'s offset matches the new height (`bottom-[calc(6.75rem+env(safe-area-inset-bottom,0px)+10px)]` / `7rem+…` on `sm`), so the up-arrow keeps sitting just above the player.

### `MiniDeckBar` (home deck / mix)

The home deck has its own sticky mini-bar inside `DeckAudioProvider` (different UI: waveform, crossfader, mix info). The same mutual-exclusion logic is shared.

### Key files

| File | Role |
|------|------|
| `src/components/DeckAudioProvider.tsx` | Context + `<audio>` for `preview`, `playPreviewQueue`/`togglePreview`/`stopPreview`, `usePreviewAudio` hook, `MiniPreviewBar` (with the in-bar save toggle and the iOS safe-area + 10 px padding), `MiniDeckBar`, `claimAudio`, `AudioClaimSource`, `OB_CHART_PLAYALL_BAR_EVENT`. Also exports the **`PreviewSaveData`** discriminated union (`mode: 'ref'` / `mode: 'url'`) consumed by every queue producer below. |
| `src/components/ChartView.tsx` | Weekly chart (`WeekAccordion`, `ChartTrackRow`, `FeaturedPickRow`). Builds `PreviewTrack[]` bundles (with `relatedRefs` from `canonicalGroups` baked into each `save`) and calls `playPreviewQueue`. No local audio. |
| `src/components/BeatportTopTracks.tsx` | Top 10 accordion. Builds `PreviewTrack[]` (URL-mode `save` with `externalUrl` + snapshot) and calls `playPreviewQueue`. No local audio. |
| `src/components/CommunityMonthlyTop.tsx` | Monthly community top. Builds `PreviewTrack[]` with mixed-mode `save` (URL for `beatport_top` primaries, ref for the rest) and calls `playPreviewQueue`. |
| `src/components/user/TracksSection.tsx` | My Tracks page (own/shared). Play-all + shuffle for the audio subset; YouTube embeds for vinyls rendered inline. `toPreviewTrack` mirrors the per-row save logic (URL mode for shared `beatport_top`, ref mode with `relatedRefs` on the owner's list). |
| `src/components/BackToTop.tsx` | Listens for `OB_CHART_PLAYALL_BAR_EVENT` to offset the scroll button (matches the new player height: `safe-area + 10 px`). |
| `src/app/api/audio-proxy/route.ts` | Server-side proxy for `geo-samples.beatport.com` / `geo-media.beatport.com` (prevents hotlink blocks) |

---

## Editorial vetoes (entities **not** to create)

A short, hard-coded list of names that look like a label or artist on Beatport / Bandcamp but **must not** become a profile on Optimal Breaks:

| Name | Why | What to do |
|------|-----|------------|
| **DistroKid** (Beatport label id `66449`) | Mass-market **distributor / aggregator**, not a curated breakbeat label. Showing it as a label dilutes the catalog and its "top tracks" are random genres. | Leave the string `"DistroKid"` on individual chart picks (it appears in many JSON picks because Beatport reports it as the label of self-published tracks) but **do not** run `db:label`, `db:label:agent` or any UPSERT that would create a row in `labels` for it. The chart UI shows the text; the Beatport button still links to the track; no `/labels/distrokid` profile is generated. |

Add to this table only after explicit user confirmation. The aim is to keep a small, discoverable list rather than a separate document.

---

## Database Schema

Supabase tables are reflected in `src/types/database.ts`. Highlights:

- **artists** — `slug`, name / `name_display`, `real_name`, bio (EN/ES), category, styles, era, `image_url`, essential tracks, recommended mixes, related artists, `labels_founded`, `key_releases` (JSON), website, socials, featured flag, sort order — see `006_artist_extended_fields.sql` and `data/artists/deekline.json`. Optional **Beatport** fields (migration **`046_beatport_top_tracks.sql`**): `beatport_id`, `beatport_url`, `beatport_top_tracks` (JSONB, top-selling tracks + preview URLs, **each with `release_date YYYY-MM-DD`** when scrapeable), `beatport_top_tracks_updated_at`. The public artist page shows an accordion **only when** `beatport_top_tracks` is non-empty.
- **labels** — name, country, founded year, description (EN/ES), `image_url`, key artists/releases; optional **`organization_id`** → `organizations.id` (migration `010`). Same optional Beatport columns as artists (`046`).
- **events** — name, type, dates, location, lineup, description (EN/ES), `image_url`, stages/schedule (JSON), tags, tickets, socials, coords; optional **`promoter_organization_id`** → `organizations.id` (migration `010`). Events are **created manually** (admin UI or Cursor agent) and then **enriched** with `npm run db:events:enrich -- <slug>` (SerpAPI + OpenAI fill missing fields). Enricher system prompt: [`scripts/prompts/evento-enriquecer-system.txt`](scripts/prompts/evento-enriquecer-system.txt) (see [`docs/AI_PROMPTS_AND_AGENTS.md`](docs/AI_PROMPTS_AND_AGENTS.md))
- **organizations** — `slug`, name, roles (`label`, `promoter`, …), descriptions (EN/ES), `website`, `socials` (JSON), optional `base_city` / `founded_year`; Raveart seed + FK wiring in `010_raveart_organizations.sql`; extra gallery-titled events in `011_raveart_gallery_events.sql`
- **blog_posts** — title, content, excerpt (EN/ES), category, tags, author, `image_url`, published flag
- **scenes** — name (EN/ES), country, region, key artists/labels/venues, era, `image_url`
- **mixes** — title, artist, type, year, duration, embed URL, platform, `image_url`
- **history_entries** — title, content (EN/ES), section, year range, sort order
- **profiles**, **favorite_artists**, **favorite_labels**, and related user tables — see `003_user_system.sql` and follow-up migrations; **`056_community_top_and_soulmates.sql`** adds **`is_tracks_public`** on **`profiles`** for Soulmates / Monthly Top opt-out

---

## SQL migrations (reference)

Files under `supabase/migrations/` (apply in lexical order). **Many migrations exist beyond the table below** (012+ charts, mixes, OG URLs, scenes, engagement, content batches, etc.): open the folder or run `ls supabase/migrations` for the full list.

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
| `046_beatport_top_tracks.sql` | **`artists`** and **`labels`**: `beatport_id`, `beatport_url`, `beatport_top_tracks` (JSONB, default `[]`), `beatport_top_tracks_updated_at` — powers the **Beatport Top 10** accordion on profile pages |
| `056_community_top_and_soulmates.sql` | **`profiles.is_tracks_public`** (default `TRUE`; when `FALSE`, user excluded from **Soulmates** + **Community Monthly Top** aggregates); **`idx_sct_created`** on **`saved_chart_tracks.created_at`** |
| `057_chart_featured_tracks_release_date.sql` | **`chart_featured_tracks.release_date DATE`** + index. Stores **full publish day** (YYYY-MM-DD) from Beatport / Bandcamp alongside `release_year`; rendered everywhere via `formatTrackReleaseDisplay` (see below) |

---

## Track release dates (full day vs year)

All track-listing surfaces (40 Breaks Vitales, New Releases, Retro Vinyl Picks, Beatport Top 10 on artist/label profiles, **My Tracks** own + public, Community Monthly Top, Soulmates recommendations, admin Tracks dashboard, ⌘K search) display the **full publish date** in `YYYY-MM-DD` when available, falling back to the year only when the day is unknown.

- **Storage:** `chart_tracks.release_date`, `chart_featured_tracks.release_date` (migration **`057`**), and per-track `release_date` inside the JSONB columns `artists.beatport_top_tracks` / `labels.beatport_top_tracks`. `chart_vinyl_tracks` keeps year only (vinyls rarely have a sourceable day). `saved_chart_tracks.snapshot` carries the field for `beatport_top` rows so My Tracks renders the day even after the source row is gone.
- **Helpers (`src/lib/share-track.ts`):**
  - `formatTrackReleaseDisplay(release_date, release_year)` — returns `YYYY-MM-DD` if valid, else the year as string, else `null`. Use this **everywhere** a song row prints its date.
  - `effectiveReleaseYear(release_date, release_year)` — extracts the year for filters / sorting fallbacks.
  - `releaseSortTimestampMs(release_date, release_year)` — UTC ms for "newest first" ordering on `My Tracks → release` (day precision when present, Jan 1 of the year otherwise).
  - `isBeatportArtworkUrl(url)` — kept around even though the live site uses Vercel's image optimizer (Pro plan); occasionally useful when wanting to bypass the proxy for small thumbnails.
- **Scraping:**
  - Beatport: `__NEXT_DATA__` → `publish_date` / `new_release_date`.
  - Bandcamp: `data-tralbum` → `album_release_date` / `release_date`.
  - Used by `chart-featured-upsert.mjs` (flag **`--enrich-release-dates`** + optional `--write-json` to persist), `chart-40-breaks.mjs`, `beatport-top-tracks.mjs` and `backfill-new-releases-from-40breaks.mjs`.
- **Backfill of saved snapshots:** `scripts/saved-tracks-backfill.mjs` includes `release_date` in its **additive merge** — for every existing `saved_chart_tracks.snapshot` it fills `release_date` (and other missing fields) without overwriting user-visible data. Flag **`--scrape-beatport`** falls back to scraping Beatport directly for `beatport_top` saves whose snapshot has no date and whose source artist/label JSONB no longer carries the track.
- **CSS rule:** in every component the date span uses `whitespace-nowrap` (so `2026-04-27` does not break across `2026-` / `04-27`) inside an info paragraph that uses `break-words`. Removing `sm:truncate` was deliberate — title + label + date now wrap to a second line on narrow profile / sidebar columns instead of clipping.

---

## Beatport: weekly chart vs Top 10 on profiles

- **Weekly chart (“40 Breaks Vitales”)** — `npm run db:chart` runs `scripts/chart-40-breaks.mjs` (Beatport genre top 100 + editorial pipeline). Separate from per-artist sales widgets.
- **Top 10 sales on Beatport** — `npm run db:beatport:top -- artist <slug> <beatport_id>` or `label <slug> <beatport_id>` runs `scripts/beatport-top-tracks.mjs`: fetches the public Beatport page, reads embedded **`__NEXT_DATA__`**, extracts the **top-10-tracks** query, and **`UPDATE`s** the matching row in **`artists`** or **`labels`** by `slug` (`beatport_url`, `beatport_id`, `beatport_top_tracks`, `beatport_top_tracks_updated_at`). Requires migration **`046_beatport_top_tracks.sql`** and **`NEXT_PUBLIC_SUPABASE_URL` + service role / secret key**.
- **Finding `beatport_id`** — Open the artist or label on [Beatport](https://www.beatport.com); the canonical URL is `/artist/<slug>/<id>` or `/label/<slug>/<id>`. Pass the same `slug` as in Optimal Breaks (e.g. `deekline` → `https://www.beatport.com/artist/deekline/3171` → `3171`).
- **Batch refresh** — `npm run db:beatport:top -- --all-artists` or `--all-labels` walks every row that already has **`beatport_id`** set (staggered requests). Use `--dry-run` to print counts without writing.
- **UI** — `src/components/BeatportTopTracks.tsx` (client): accordion in the **hero** of `/[lang]/artists/[slug]` and `/[lang]/labels/[slug]` when tracks exist. Previews use **`/api/audio-proxy`** (allowed Beatport sample hosts); artwork uses **`next/image`** (optimized/proxied) like the main chart. Track rows are **visually identical** to `ChartTrackRow` (same `PositionBadge`, artwork size, title/artist/label/year layout, BPM/key badges, BEATPORT button). Playback uses the **global `preview` mode** via `usePreviewAudio` → the persistent `MiniPreviewBar` (see [Global audio system](#global-audio-system-deckaudioprovider--claimaudio)). The **`+`** save button is also wired (same canonical dedupe as charts): saving a Top 10 track adds it to the user's **My Tracks**, and a track saved elsewhere already appears in green here.
- **JSON upsert** — Optional `beatport_id` and `beatport_url` on `data/artists/*.json` / label JSON are passed through **`npm run db:artist` / `db:label`** (`scripts/lib/artist-upsert.mjs`, `label-upsert.mjs`). They do **not** include `beatport_top_tracks`; refresh rankings with **`db:beatport:top`** after setting the ID.

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
| `npm run db:artist:photo -- <slug>` | SerpAPI Google Images + OpenAI → download valid image bytes → Storage `media/artists/<slug>/portrait.*` → UPSERT `artists.image_url`. Skips slugs with editorial portrait in `public/images/artists` (see map) unless `--force-rephoto`. |
| `npm run db:artist:photo:repair` | Same script with **`--repair`**: queue from Supabase — missing `https://` image, broken URL (HEAD), or bad prior upload; re-search; on failure set `image_url` **null** (UI punk fallback). Editorial `public/images/artists` slugs excluded. |
| `npm run db:artist:sync-public-portraits` | For each slug in **`data/artist-public-portrait-map.json`** with a matching file under **`public/images/artists/`**, set `image_url` to `/images/artists/<file>.webp` and UPSERT. |
| `npm run db:timeline` | Insert **missing** artists from `src/lib/artists-timeline.ts` (`ARTIST_ERAS`, same names as `/artists`) via **Supabase API** (service/secret key). Skips slugs already in `artists`. |
| `npm run db:timeline:sql` | Regenerate `009_artists_from_artist_eras_timeline.sql` (optional; for migrations without running the script against prod). |
| `npm run db:user-list` | Insert **missing** artists from the extended name list in `sync-user-list-artists.mjs` (short **placeholder** bios until you enrich with agent + `db:artist`). |
| `npm run db:events:enrich -- <slug>` | **Enrich** an existing event: SerpAPI web + OpenAI fill date, lineup, descriptions, venue, tags, etc. Add `--with-poster` to also search for the poster image. `--dry-run` previews changes without writing. |
| `npm run db:events:poster -- <slug>` | Search for event **poster/flyer** via SerpAPI Google Images + OpenAI; upload to Storage `media/events/<slug>/poster.*` and update `events.image_url`. |
| `npm run media:upload -- <local-file> <path-in-bucket>` | Upload a file to Storage bucket **`media`** (service/secret key); prints public URL + sample SQL for `image_url`. |
| `npm run db:beatport:top -- artist <slug> <beatport_id>` | Scrape Beatport **Top 10** for that **artist** → update `beatport_top_tracks` (+ URL/ID/timestamp) in Supabase. Same pattern: `label <slug> <id>`. Flags: `--all-artists`, `--all-labels`, `--dry-run`. See **Beatport: weekly chart vs Top 10 on profiles**. |
| `npm run db:chart` | Weekly **genre chart** pipeline (`chart-40-breaks.mjs`); not the same as per-profile Top 10. |

---

## Roadmap

- [x] Supabase-backed listings for artists, events, blog, labels, scenes, mixes (with static fallbacks when empty)
- [x] Per-entity `image_url` + shared card thumbnails and Storage bucket for hosted images
- [x] User auth + dashboard (favorites, sightings, saved content)
- [x] Artist updates via JSON + `npm run db:artist` (upsert by `slug`; Supabase REST API + service role)
- [x] Admin UI — `/[lang]/administrator`: CRUD for artists, labels, events, blog, scenes, mixes, history + image upload (requires `admin` on `profiles`)
- [x] Public reference listings — **large / compact / list** views for artists, labels, events, scenes, mixes (default **compact**; choice not persisted)
- [x] Global search (⌘K `CommandPalette` + `/api/search`: artists, tracks across all charts, mixes, events by lineup, labels, scenes, posts, organizations — see **Global search**)
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
