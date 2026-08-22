# OPTIMAL BREAKS — The Breakbeat Bible

> Archive, magazine, guide, agenda and scene memory. A project dedicated to preserving and celebrating breakbeat culture worldwide.

![Next.js](https://img.shields.io/badge/Next.js-14-black) ![TypeScript](https://img.shields.io/badge/TypeScript-5-blue) ![Tailwind](https://img.shields.io/badge/Tailwind-3.4-06B6D4) ![Supabase](https://img.shields.io/badge/Supabase-2.45-3ECF8E)

**Spanish summary:** [README.es.md](./README.es.md)

**Repository root:** Clone or open the directory that contains **`package.json`** at the top level (for example the folder named **`web optimalbreaks`** on your machine). That folder is the Git and **npm** root: run all install/dev/DB commands from there, and keep **`.env.local`** beside `package.json`. Parent folders that only wrap this project are not the repo root.

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

**Reference:** [`docs/USER_ENGAGEMENT.md`](docs/USER_ENGAGEMENT.md). **DB:** migration **`032_event_ratings_attendance_fields.sql`** for extra `event_ratings` fields; migrations **`053_saved_chart_tracks.sql`** + **`054_saved_chart_tracks_beatport_top.sql`** for the polymorphic saved-tracks table (`chart | featured | vinyl | beatport_top`, plus `canonical_url` + `snapshot` columns so the artist/label **Beatport Top 10** can be saved cross-source with a single URL-based canonical key). Migration **`056_community_top_and_soulmates.sql`** adds **`profiles.is_tracks_public`** (default `TRUE`; users who set it to `FALSE` are excluded from **Soulmates** affinity matching and from **Community Top** aggregates) plus **`idx_sct_created`** on `saved_chart_tracks.created_at`. Migration **`064_breakbeat_profiles_rls.sql`** enables **owner-only RLS** on **`breakbeat_profiles`** (Breakbeat DNA on the dashboard overview): `authenticated` may SELECT/INSERT/UPDATE/DELETE only `auth.uid() = user_id`; **`anon` has no grants**; DNA is **not** public (unlike the shareable My Tracks list).

**Community Top** (`/[lang]/top100`; `/charts` only links there): `CommunityMonthlyTop.tsx` calls **`GET /api/public/charts/community-monthly`** (`limit` up to 100; the page requests 100). All-time ranking of **"+" saves** in My Tracks — same pass for **top 100 tracks** and the **artist board** (API top **50**; heading stays «Top 10»; first 10 rows, **Load more** / **Show less**). Artist rows use the same movement language as 40 Breaks Vitales (**NUEVO** / **▲** / **▼** / **═**): the **list is live** (ranks move with each save); the **variation is Monday-to-Monday** (ISO Monday 00:00 UTC vs now, reconstructed from `created_at`, no snapshot table). `X sem.` = consecutive weeks **on the board**, not at that rank; the #1 only also gets **weeks at #1** plus a one-line editorial headline. Canonical dedupe as the admin Tracks dashboard; tracks sorted by **unique users → total saves → play count → most-recent save → alphabetical**. Source-row lookups **must** use chunked `.in()` (`IN_CHUNK = 200` in `community-monthly/route.ts`, same idea as `/api/public/user-tracks`): one giant `.in('id', …)` on New Releases drops metadata and silently drops saves that have no `snapshot`. The slug `community-monthly` is preserved for compatibility (was monthly until April 2026). Detail: [`docs/USER_ENGAGEMENT.md`](docs/USER_ENGAGEMENT.md) (*Community Top* → *Artist board — weekly movement*).

**Soulmates** (`/[lang]/mi-cuenta/almas-gemelas`): **`GET /api/breakbeat/soulmates`** (authenticated cookie session) computes **Jaccard similarity** over canonical keys vs other users who opted in; returns top matches plus cross-user recommendations. Toggle **public list for Soulmates / Community Top** on `/mi-cuenta/perfil`.

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
- **i18n**: Custom middleware with `/es` and `/en` prefixed routes + hreflang tags; navigating between locales **remounts** the `[lang]` layout (including **`LazyDeckAudioProvider`**) so playback does not bleed across languages once the audio engine is loaded
- **Analytics**: Google Analytics 4 via **`@next/third-parties/google`** (`GoogleAnalytics` component, **`next/dynamic` `ssr: false`**) + **Consent Mode v2** aligned with `CookieBanner` (see [Analytics (GA4)](#analytics-google-analytics-4))
- **Audio**: Web Audio API with scratch simulation; **`DeckAudioProvider`** is **lazy-loaded** on first Play (or when resuming an active session) — see [Global audio system](#global-audio-system-lazydeckaudioprovider--deckaudioprovider)
- **Fonts**: Self-hosted via **`@fontsource`** (no Google Fonts CDN). **Critical path:** Unbounded **latin** 700/900 + preload of the **900** `.woff2` (home H1 / LCP). **Deferred:** Special Elite, Courier Prime, Darker Grotesque, Unbounded 400 via **`DeferredFonts`** (`requestIdleCallback` / timeout). See [Performance & Core Web Vitals](#performance--core-web-vitals)

---

## Analytics (Google Analytics 4)

Optional measurement ID (public env var, safe in the browser):

- Set **`NEXT_PUBLIC_GA_MEASUREMENT_ID`** to your GA4 measurement ID (format `G-XXXXXXXXXX`) in `.env.local` and in **Vercel → Project → Environment Variables** for Production/Preview. If unset, no GA scripts load.

Implementation:

- **`src/components/GoogleAnalytics.tsx`** — loads **`GoogleAnalytics`** from **`@next/third-parties/google`** (official Next.js integration: gtag.js + automatic **page_view** tracking on App Router navigations). A small inline **`Script`** runs first to set **Consent Mode v2** defaults (`analytics_storage` and ad-related flags **denied** until the user accepts analytics cookies).
- **`src/components/CookieBanner.tsx`** — persists choices and dispatches **`ob-cookie-consent`**; `GoogleAnalytics` listens and calls **`gtag('consent', 'update', …)`** when analytics is granted or revoked. Loaded with **`next/dynamic` (`ssr: false`)**; mounts as a **bottom bar** after LCP (waits for `largest-contentful-paint` via `PerformanceObserver`, max ~4.5 s) so it does not compete for LCP on first paint.

CSP in **`next.config.js`** already allows `googletagmanager.com` and `google-analytics.com` in `connect-src` / `script-src` as needed.

---

## AI prompts and agents (OpenAI)

System prompts for **artist**, **label**, **event enrichment**, and the **admin conversational agent** live under **`scripts/prompts/*.txt`** (versioned in Git; not stored in Supabase). **`OPENAI_MODEL`** and **`OPENAI_API_KEY`** (and optional **`SERPAPI_API_KEY`**, **`OPENAI_VISION_MODEL`**, **`OPENAI_CHAT_MODEL`**) are set in **`.env.local`**; temperature, `max_tokens`, tools, and JSON user instructions are defined in code per route or script. Admin chat (tool-calling + confirm before write) + poster OCR: [`docs/ADMIN_CHAT_CAPTURA.md`](docs/ADMIN_CHAT_CAPTURA.md).

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

**Mixes (`MixesExplorer`, `/[lang]/mixes`):** Filters by **year**, **platform** (YouTube, SoundCloud, …), and **text search** on title + artist. Filter logic is unchanged from a user perspective; the implementation keeps the **full catalog mounted** and toggles visibility with Tailwind’s **`hidden` class** on non-matching cards so **embeds are not destroyed** when you clear filters (avoid using only the HTML `hidden` attribute on the same node as `display: flex` — author styles win and wrong rows could stay visible). SoundCloud continues to use the visual player (`SoundCloudVisualEmbed` URL builder; lazy wrapper in `MixesExplorer`), mounted on demand by an `IntersectionObserver`.

**YouTube cards — poster facade + proxied thumbnail (`LazyYouTubeEmbed` in `src/components/YouTubeEmbed.tsx`):** YouTube cards do **not** auto-mount the player. Each card shows a **poster** (the video thumbnail) with a red play button, and the heavy `youtube.com/embed/…` iframe mounts **only when the user clicks play** (then `autoplay=1`, exclusive via the play coordinator). This is deliberate and **must not regress to auto-mounting many iframes at once**:

- **Why no auto-mount:** mounting ~10 YouTube iframes simultaneously (e.g. a year section full of YouTube sessions at the top of the list) froze the page, especially on networks/adblockers that block `i.ytimg.com` — each iframe hung waiting on Google's image CDN. Click-to-play means at most one iframe is mounted at a time.
- **Why the thumbnail goes through a proxy:** the poster image is requested from **our own domain** via **`/api/og/image-proxy?src=…`** (server fetches `https://i.ytimg.com/vi/<id>/hqdefault.jpg` and re-serves it). Loading `i.ytimg.com` directly from the browser leaves the poster **black** on corporate proxies / privacy extensions (uBlock EasyPrivacy, Brave Shields, Acttax SSL inspection…) that treat `ytimg.com` as a tracker. The proxy host allow-list lives in `src/app/api/og/image-proxy/route.ts` (`i.ytimg.com`, `img.youtube.com`). If the proxy still fails, the poster falls back to a **striped placeholder with the mix title** legible.
- **`autoplay` prop bypasses the facade:** rows that already have their own ▶ button (`/charts` vinyl, **My Tracks**, **Community Top**) and the global search (⌘K `?play=1` deep-link) pass `autoplay`, which mounts the iframe immediately — those flows are unchanged.
- **Local dev caveat:** on `localhost` the proxy runs inside your own network, so if that network blocks `i.ytimg.com` the poster shows the striped placeholder locally; it renders correctly in production (Vercel egress is not blocked). Test posters on the deployed site, not local.

DOM order follows **newest publication years first**.

**Events (`EventsExplorer`, `/[lang]/events`):** Footer acts as a **traffic light** by calendar day: **past** events (last day `date_end` or `date_start` before today, local midnight) use **`var(--red)`** with **white** text; **still upcoming** use the **brand yellow** **`var(--yellow)`** (same token as the logo / navbar) with **`var(--ink)`** text. **Hover** lightens the footer with `color-mix(…, white, 50%)` on both colours; the **strip behind the poster** uses a matching tint (**red mix** when past, solid yellow when upcoming) so image and footer read as one unit. The card `<Link>` is **`group/link`**, so **`group-hover/link:`** on the footer fires when hovering the image (and vice versa). **`CardThumbnail`** uses **`groupHoverGroup="link"`** for poster zoom. Rows use **`items-stretch`**, **`h-full`** on the link, and **`flex-1`** / **`min-h-*`** on the footer so **footer heights align** within each grid row (large and compact). **Calendar year view** (`view_calendar`): each day with events is **red** if every event touching that day is **past**, **yellow** if at least one is still **upcoming** (same `isEventPast` rule); legend copy in **`calendar_legend_past`** / **`calendar_legend_upcoming`**. **Clicking a day** opens a **portal modal** (poster, dates, location, lineup excerpt, description snippet, **CTA link** to the full event page — no direct navigation from the cell). Copy under **`calendar_modal_*`** keys in `en.json` / `es.json`.

**Event detail (`/[lang]/events/[slug]`):** Full-width **hero ticket CTA** when there is a ticket/website URL, the event is **not past** by date (`isEventPastByDate`: last calendar day of the event before today), and either **`event_type === 'upcoming'`** or **`tickets_url` / `website`** is a **MonsterTicket** host (`monsterticket.com`, `monsterticket.es`, including subdomains). **`preferredHeroTicketUrl`** prefers MonsterTicket over other URLs. Copy for MonsterTicket: **“Compra de entradas”** / **“Buy tickets”**; generic links keep **“Comprar entradas”** / **“Get tickets”**.

---

## Performance & Core Web Vitals

Optimisations target **mobile Lighthouse** (LCP, CLS, unused JS) without changing product behaviour once the user presses Play.

### Lazy global audio (`LazyDeckAudioProvider`)

**`DeckAudioProvider`** (~1900 lines, preview queue, mini-bars, Web Audio deck) is **not** in the initial JS bundle on most routes. **`LazyDeckAudioProvider`** wraps the app in `src/app/[lang]/layout.tsx` and dynamically `import()`s the real provider when:

1. The user triggers playback (**deck**, **mix**, or **preview**) — via **`useAudioEngineGate().requestLoad(action)`** and **`PendingActionRunner`** (runs the pending action once the provider mounts), or
2. **`sessionStorage`** key **`ob_audio_active`** is set (audio was active; reloads the engine after navigation or refresh).

Until then, consumers use **gated hooks** that enqueue the first action without throwing:

| Hook | Used by |
|------|---------|
| **`usePreviewAudioGated`** (`src/hooks/useGatedDeckAudio.ts`) | `ChartView`, `BeatportTopTracks`, `TracksSection`, `CommunityMonthlyTop` |
| **`useMixAudioGated`** | `MixesExplorer`, `DashboardMixPlayButton` in `user/shared.tsx` |
| **`useDjDeckControl`** (inline in `DjDeck.tsx`) | Home DJ deck UI (static placeholder until first Play) |

**`useOptionalDeckAudio`** / **`useDeckAudioMaybe`** return safe defaults when the engine is not mounted (`BackToTop`, etc.).

**Stable shell on first Play.** `LazyDeckAudioProvider` always renders the same wrapper around `{children}` (`<DeckAudioContext.Provider>` + the padding `<div>`) so the React tree of pages like `ChartView` is **not** remounted when the engine finally loads. The engine is mounted as a sibling in `engineOnly` mode and binds its context value, padding class and overlays via **`onBind(shell)`**; the lazy provider stores them in state and re-publishes. Without this, the accordion state in **`/charts`** (`openPicks` / `openForty`) collapsed on the very first play because the subtree was being replaced.

**Player overlay portaled to `<body>`.** The mini-player and `PreviewAutoplayOverlay` are mounted via **`createPortal`** into a stable `<div id="ob-audio-overlays">` appended to `document.body`. This guarantees `position: fixed` on the bar always resolves against the viewport and is unaffected by any wrapping element introduced by the lazy gate, route transitions, or PWA standalone quirks.

**Visual viewport sync (iOS PWA).** Both **`MiniPlayerShell`** (the bottom bar) and **`BackToTop`** read **`useViewportBottomOffset`** (`src/hooks/useViewportBottomOffset.ts`), which subscribes to `visualViewport.resize` / `scroll`, plus `pageshow`, `focus`, `orientationchange` and `visibilitychange`, and adds `window.innerHeight − (visualViewport.height + visualViewport.offsetTop)` to the element's `bottom`. After every "wake" event it re-measures at ≈80/250/600/1200 ms because iOS standalone needs a few frames to report the real viewport values once the app comes back to the foreground (e.g. **after Web Share to Facebook / WhatsApp**, switching apps, or lock/unlock). Two extra safeguards handle the share-sheet case: measurements taken while `document.hidden` or with a drift **> 40% of the viewport height** are discarded (that only happens while a native overlay — share sheet, keyboard — is transiently shrinking the visual viewport; the real post-lock drift is tens of px), and while the applied offset is **> 0** the hook keeps re-measuring on a short interval (**self-healing**) until it returns to 0 — iOS sometimes fires *no* event at all when the share sheet closes, which used to leave the bar frozen mid-screen. Without all this, the layout viewport drifts from the visual viewport and `bottom: 0` ends up "floating" mid-screen; the compensation keeps the player and the back-to-top button anchored to the visible bottom edge.

### Fonts & render-blocking CSS

- **Layout imports:** `@fontsource/unbounded/latin-700.css`, `@fontsource/unbounded/latin-900.css` only (latin subsets, not full multi-script CSS).
- **Preload:** `<link rel="preload">` for **`unbounded-latin-900-normal.woff2`** (home hero H1 — typical LCP element).
- **`DeferredFonts`:** loads Special Elite (body/prose), Courier Prime, Darker Grotesque, Unbounded 400 after hydration (Special Elite immediately; others on idle). **`body`** uses monospace fallbacks until Special Elite arrives.
- **`next.config.js`:** webpack rule `type: 'asset/resource'` for `.woff2` imports used in the preload path.

### Other layout / route optimisations

- **`DjDeck`:** `next/dynamic` on the home page with a fixed-height placeholder (deck JS not in home first chunk until visible chunk loads).
- **`ChartsPromoModal`:** `ssr: false`; opens only after **2nd page view** in the session or **40 s** on site — not on first paint.
- **`BackToTop`**, **`GoogleAnalytics`**, **`ServiceWorkerRegistration`:** dynamic client imports in `[lang]/layout.tsx`.
- **`/[lang]/history`:** `export const revalidate = 300` (ISR) where applicable.
- **Removed** `export const dynamic = 'force-dynamic'` from `[lang]/layout.tsx` so static/ISR pages can cache HTML when data allows.

### Supabase Data Cache for public reads (Disk IO protection)

**Incident (Aug 2026):** the Supabase instance exhausted its **Disk IO Budget** — every public page view (bots included) ran the full catalog queries with no cache, and the middleware called Supabase Auth on every request with no timeout. When the DB throttled to its 5 MB/s baseline, the middleware exceeded Vercel's 25 s limit and the whole site returned **504 `MIDDLEWARE_INVOCATION_TIMEOUT`**. Compute was upgraded **Nano → Micro**, and the app now caches all public reads:

- **`createCachedSupabase()`** (`src/lib/supabase-server.ts`): cookie-less read client whose PostgREST GETs are stored in the **Next/Vercel Data Cache** with **`revalidate: 300`** (5 min). Used by every public catalog page — home, `/charts`, `/artists` (+ detail), `/labels` (+ detail), `/events` (+ detail + OG image), `/mixes`, `/scenes` (+ detail), `/blog` (+ detail), `/history`, `/organizations/[slug]` — plus `sitemap.ts`, `/api/search` and `/api/og/story`. DB publishes show on the public site within **≤ ~5 min**; the admin panel reads live data and is unaffected.
- **Do not** switch these pages back to `createServerSupabase()` (calling `cookies()` disables all caching → every visit hits the DB again) and do not use the cached client for per-user data or writes.
- **Middleware** (`src/middleware.ts`): `supabase.auth.getUser()` runs **only** when the request carries Supabase auth cookies (anonymous traffic skips Auth entirely), the Auth fetch is aborted after **2.5 s** (`AbortSignal.timeout`) and wrapped in try/catch — a Supabase outage can no longer take the whole site down with 504s.
- `/charts` and `/blog` declare `export const dynamic = 'force-dynamic'` because they depend on `searchParams` (`?week=`, `?play=`, `?page=`); their fetches still go through the Data Cache.

Guard rule for agents: `.cursor/rules/supabase-cache-lecturas-publicas.mdc`.

### Home SEO (breakbeat)

- Home metadata and JSON-LD lead with **breakbeat**; visible H1 includes **`sr-only`** “Breakbeat —” plus **OPTIMAL BREAKS** styling; section H2s in dictionaries include **breakbeat** in the highlighted span. See commits on `main` (May 2026).

---

All OG images are declared **1200 × 630 PNG** (Meta's recommended size, `1.91:1`). Sources:

| Route | Component | Notes |
|-------|-----------|-------|
| `/:lang/opengraph-image` | `DefaultOgImage` (`src/lib/DefaultOgImage.tsx`) | Branded fanzine card for the home + fallback for every page that doesn't override. Satori JSX — every container with multiple children sets `display: flex` (required by Satori; missing it causes a 500 on the route). |
| `/:lang/events/[slug]/opengraph-image` | `EventOgImage` (`src/lib/EventOgImage.tsx`) | **The event poster itself**. Full 1200×630 frame with the poster shown via `object-fit: contain` on an INK (`#1a1a1a`) background, so square / vertical / horizontal flyers are never cropped. No Satori text composition: date, venue, lineup all live in the HTML/OG description instead. `sharp` pipeline: WebP/AVIF → PNG, `resize({ width: 1200, height: 630, fit: 'inside' })` to keep the original aspect ratio and trim the base64 data URL size. |
| `/:lang/<charts\|mixes>` (static) | `public/images/opengraph/sections/<charts\|mixes>-screenshot.png` | Section screenshots generated via `npm run og:sections`. Copy keys under `seo.charts` / `seo.mixes` in dictionaries. |
| `/:lang/<charts\|artists\|labels>?play=…` | `generateMetadata` overrides (see **Per-track sharing**) | Rewrites `og:title` / `og:description` / `og:image` to the shared track (Beatport `artwork_url`) when the query carries `?play=<source>:<id>`. |

**Event poster freshness (versioned OG URL).** The poster lives at a **fixed** Storage path (`media/events/<slug>/poster.*`, overwritten with `upsert`), so its URL never changes when the flyer is replaced — and Facebook/WhatsApp cache the scraped card **per URL**. Since migration `065_events_updated_at.sql`, `events.updated_at` (trigger `events_updated_at`) acts as the cache version: `generateImageMetadata` in `opengraph-image.tsx` puts its epoch **in the emitted image path** (`…/opengraph-image/<epoch>?<hash>`), so every row update produces a brand-new og:image URL. (An explicit `openGraph.images` in `generateMetadata` does **not** work here: the same-segment file convention always overrides it — verified on Next 14.2.) Inside the OG route the poster is fetched with `?v=<epoch>` too, busting the Vercel Data Cache and the Supabase CDN — the old `cache: 'force-cache'` without version pinned the poster bytes forever. `/events` and the detail page version the visible `image_url` the same way (`imageCacheVersion` / `versionedImageUrl` in `src/lib/image-url.ts`). Everything refreshes within ≤ ~5 min (Data Cache) of a row update; for links **already scraped by Facebook**, force one refresh via the [Sharing Debugger](https://developers.facebook.com/tools/debug/).

**Event `description` meta tag.** `generateMetadata` in `src/app/[lang]/events/[slug]/page.tsx` composes the description as `"FECHA · VENUE, CIUDAD, PAÍS — descripción"`:

- `metaDateLabel(date_start, date_end, lang)` → short range: `"5 sept 2026"` or `"5–7 sept 2026"` (same locale as the UI).
- `metaPlaceLabel(venue, city, country)` → deduped by lowercase (avoids `"Granada, Granada, Spain"` when `venue` already contains the city).
- Long description is the localised `description_es` / `description_en`.
- `detailPageMetadata` applies **`smartTruncate(160)`** so the head (date + place) is preserved and only the long description is clipped, never mid-word.

### Vercel Firewall: bypass for OG scrapers

Even with `robots.txt` allowing `facebookexternalhit`, Meta's Sharing Debugger will still show **403** if Vercel's **DDoS Mitigation** (always active) or **Bot Protection** (optional) treats the scraper IPs as automated traffic. **Fix is not in code** — it's a one-time allowlist in the Vercel dashboard:

1. Project → **Settings → Firewall** → **Add New… → System Bypass** (`0 / 25`).
2. Condition group `Matches any`, all rows = `Request Header` · `User-Agent` · `Contains`, one row per UA: `facebookexternalhit`, `Facebot`, `meta-externalagent`, `WhatsApp`, `Twitterbot`, `LinkedInBot`, `Slackbot-LinkExpanding`, `TelegramBot`, `Discordbot`. (Or a single `Matches Regex` row if your plan exposes it.)
3. Save. *System Bypass* is the correct action: it skips **managed rulesets** (DDoS + Bot Protection) without disabling them for anyone else. Custom `Rule` → `Bypass` also works but isn't as explicit about skipping the system layer. `Rule` → `Log` / `Allow` / `Challenge` do **not** fix a 403 from DDoS Mitigation.
4. After saving, re-run [Meta Sharing Debugger](https://developers.facebook.com/tools/debug/) and use [Batch Invalidator](https://developers.facebook.com/tools/debug/sharing/batch/) on the URLs you want re-scraped.

The same allowlist is mirrored at `robots.txt` level in `src/app/robots.ts` (`OG_CRAWLER_USER_AGENTS`), so both layers stay in sync.

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

Layout below is relative to the **repo root** (the directory that contains `package.json`; local folder name may differ, e.g. `web optimalbreaks`).

```
<repo-root>/
├── docs/
│   ├── README.md               # Doc index + maintenance audit (what each .md covers)
│   ├── AI_PROMPTS_AND_AGENTS.md # Index: all .txt prompts, env defaults, APIs (ES/EN)
│   ├── ADMIN_CHAT_CAPTURA.md   # Admin chat widget (tools + Confirm, dates w/o year, PWA, OCR)
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
│   ├── chart-40-breaks.mjs           # npm run db:chart — weekly 40 Breaks
│   ├── chart-featured-upsert.mjs     # npm run db:chart:featured — New Releases (JSON → Supabase)
│   ├── chart-vinyl-upsert.mjs        # npm run db:chart:vinyl — Retro Vinyl Picks
│   ├── beatport-top-tracks.mjs      # npm run db:beatport:top — Top 10 on artist/label pages
│   ├── guia-base-datos.mjs          # npm run db:guia — scripted DB task index (`run chart-featured-file`, …)
│   ├── sync-timeline-artists.mjs    # db:timeline / db:timeline:sql
│   ├── sync-user-list-artists.mjs   # db:user-list — starter rows for extended name list
│   └── prompts/                # System prompts: artist, label, event enrich, admin chat, revision modes
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
│   │       ├── layout.tsx      # Lang layout: Header, LazyDeckAudioProvider, deferred fonts, dynamic GA/cookies
│   │       ├── page.tsx        # HOME — hero, deck (dynamic), marquee, timeline, artists, events, CTA
│   │       ├── history/        # Full breakbeat history by era
│   │       ├── artists/        # Artist directory (+ Supabase / fallback)
│   │       │   ├── layout.tsx  # Data reads cached 300 s (createCachedSupabase); no-store headers only for HTML/CDN
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
│   │   ├── DjDeck.tsx          # Interactive DJ controller (uses gated deck API until engine loads)
│   │   ├── LazyDeckAudioProvider.tsx  # Dynamic import gate for DeckAudioProvider
│   │   ├── PendingActionRunner.tsx    # Runs first play action after engine mounts
│   │   ├── DeferredFonts.tsx   # Non-critical @fontsource CSS after hydration
│   │   ├── ChartsPromoModal.tsx # Charts promo; deferred until engagement
│   │   ├── Marquee.tsx         # Tape strip with infinite scroll
│   │   ├── Timeline.tsx        # Dark section timeline
│   │   ├── ArtistCard.tsx      # Home / grid artist card (with thumbnail)
│   │   ├── EventFlyer.tsx      # Event flyer with tape decoration + thumbnail
│   │   ├── AuthProvider.tsx    # Supabase auth context
│   │   ├── GoogleAnalytics.tsx # GA4 via @next/third-parties + Consent Mode v2
│   │   ├── CookieBanner.tsx    # Cookie UI + consent events for GA (LCP-deferred bottom bar)
│   │   └── ShareButtons.tsx    # Social share on detail pages
│   ├── hooks/
│   │   ├── useGatedDeckAudio.ts # usePreviewAudioGated / useMixAudioGated
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
│   │   ├── audio-engine-pending.ts  # Pending play actions + sessionStorage key for lazy audio
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
- **Locale switch (ES/EN)** — navigating between `/en` and `/es` **remounts** the `[lang]` layout (including **`LazyDeckAudioProvider`**). Any in-memory playback state is dropped; if `sessionStorage` still marks an active session, the engine may **reload** on the new locale without restoring the previous queue automatically.

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

Requires **`OPENAI_API_KEY`** in `.env.local`. Defaults to **`gpt-5.6-terra`** with native **web_search**; override with **`OPENAI_MODEL`**. Optional **`SERPAPI_API_KEY`** ([SerpApi](https://serpapi.com)) as web fallback and for Google Images; if missing, the bio agent still searches via OpenAI.

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
- **Caching:** artist pages read Supabase through **`createCachedSupabase()`** (Next/Vercel **Data Cache**, `revalidate: 300`), so DB publishes show on the public site within **≤ ~5 min**. `next.config.js` still adds **`Cache-Control` / `CDN-Cache-Control: no-store`** for `/[lang]/artists` HTML and the PWA **`public/sw.js`** does **not** cache HTML for paths containing **`/artists`**. The old `revalidate = 0` / `fetchCache = 'force-no-store'` segment config was **removed in Aug 2026**: it made every visit hit Supabase and helped exhaust the instance's Disk IO Budget (site-wide 504) — see *Performance → Supabase Data Cache for public reads*.

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
| Charts | `/[lang]/charts` | *40 Breaks Vitales*, *New Releases*, *Retro Vinyl Picks*; teaser card linking to **Community Top** |
| Community Top 100 | `/[lang]/top100` | All-time ranking of **"+" saves** (My Tracks): artist board (10 visible, load more to 50, weekly ▲/▼/NUEVO) + top 100 tracks. API `GET /api/public/charts/community-monthly` (chunked `.in()` so every hydratable save counts) |
| Dashboard (overview) | `/[lang]/dashboard` | User area landing: summary cards + **Breakbeat DNA** (`breakbeat_profiles`, private RLS — **064**) — requires login |
| My account — sections | `/[lang]/mi-cuenta/favoritos`, `.../vistos-en-vivo`, `.../eventos`, `.../resenas`, `.../mixes`, `.../tracks`, `.../almas-gemelas`, `.../artista`, `.../perfil` | Each user area lives in its own page (no in-page tabs). Legacy `/dashboard?tab=xxx` URLs redirect automatically. Soulmates + privacy toggle: [`docs/USER_ENGAGEMENT.md`](docs/USER_ENGAGEMENT.md). |
| Artist area (verified) | `/[lang]/mi-cuenta/artista` | Claim your artist identity (search catalog or request a new profile), verification status, toggle **accepts_bookings**, booking inbox and sent requests. Public **REQUEST BOOKING** button shows on the artist page only when `accepts_bookings = TRUE`. Admin: `/[lang]/administrator/claims` + `/[lang]/administrator/bookings`. Spec: [`docs/GUIA_IMPLEMENTACION_BOOKINGS.md`](docs/GUIA_IMPLEMENTACION_BOOKINGS.md) |
| My Tracks (public) | `/[lang]/u/<userId>/tracks` | Shareable read-only version of a user's saved-tracks list; third-party visitors can play/sort/filter and save tracks to **their** list. |
| Login | `/[lang]/login` | Supabase auth (sign up, sign in, forgot password → email link) |
| Reset password | `/[lang]/reset-password` | New password after recovery email; session created by `/{lang}/auth/confirm` (or repaired via `/{lang}/auth/callback` → confirm) |
| Privacy / Terms / Cookies | `/[lang]/privacy`, etc. | Legal pages |
| About | `/[lang]/about` | Project manifesto, contact, collaborate, submit |
| Administrator | `/[lang]/administrator` | Admin-only CRUD + image upload (`profiles.role = admin`); not linked from public nav |
| Admin conversational agent (PWA) | Floating 💬 widget (`AdminCaptureFab`) / `/[lang]/administrator/chat` | Tools → stage → **Confirm**/«yes»; flyer dates without year → next future. See [`docs/ADMIN_CHAT_CAPTURA.md`](./docs/ADMIN_CHAT_CAPTURA.md) |

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

**Artist shortlinks (`/a/<slug>`).** Instagram story stickers (and other length-limited fields) reject the full canonical URL. Every artist page's SHARE row includes a **✂ SHORT** button that copies `https://www.optimalbreaks.com/a/<slug>`; the middleware (`src/middleware.ts`) 307-redirects it to `/{locale}/artists/<slug>` using the visitor's `OB_LOCALE` cookie / `Accept-Language`. SEO canonical URLs are untouched (the redirect is temporary and the sticker traffic lands on the real page).

**Shortlink scope — closed decision (Aug 2026).** `/a/<slug>` is short enough; do **not** shorten further. Meta publishes no official URL length limit: the story sticker accepts ~2,048 chars in practice, the profile link field likewise (the 150-char cap is bio *text* only), and the "Sorry, this link is too long" error is a flaky app bug / spam heuristic (typically UTM-laden URLs), not a real character count. Discarded on purpose: **root-level random codes** (`/x7k2…` would need a code↔slug table plus a DB lookup inside the middleware on every request — forbidden after the Disk IO incident — and would collide with locale-prefix routing) and **buying a short vanity domain** (bit.ly-style; extra cost/maintenance for a handful of characters Instagram doesn't care about). If the sticker complains again: paste the URL with no extra params/text and use the sticker's custom label. The `/a/` pattern is artist-only today; extend it deliberately (e.g. `/l/` labels) rather than generalising blindly.

**Server OG overrides.** `generateMetadata` on `charts/page.tsx`, `artists/[slug]/page.tsx` and `labels/[slug]/page.tsx` reads `?play=` during SSR: if it resolves to an actual track it rewrites `og:title` (`"Title (Mix) — Artists"`), `og:description` (`"Listen to this track on Optimal Breaks · Label · Year"`) and `og:image` (the track `artwork_url`), falling back to the normal profile/chart OG when it doesn't. So sharing a link on WhatsApp/X shows the **song** as the preview, not the generic chart or profile card.

**Autoplay fallback.** When a shared link is opened in a fresh tab, Chrome/Safari routinely block `audio.play()` with `NotAllowedError` (no user gesture in the new tab). `DeckAudioProvider` intercepts the specific error and flips `previewBlocked` on the context (also exposed on `usePreviewAudio().previewBlocked`). A full-screen **`PreviewAutoplayOverlay`** renders a single "▶ TAP TO PLAY" card with **cover art + title + artist**. One tap calls `togglePreview()` (now inside a user gesture) and the overlay self-dismisses. Other playback errors (bad URL, CORS…) do not trigger the overlay.

**Cover art in the overlay.** Beatport artwork URLs must not be loaded with a raw `<img>`: their CDN often returns **403** when the browser sends a non-Beatport `Referer`. The overlay therefore uses **`next/image`** (`fill`, `sizes`) so the request goes through **`/_next/image`** — same pattern as chart rows and `BeatportTopTracks`. Hostnames must remain allowed in `next.config.js` → `images.remotePatterns`. If the image still fails, `onError` swaps the thumbnail for a neutral **♪** placeholder instead of the broken-image icon.

### Key files

- `src/app/api/search/route.ts` — REST API (parallel queries, dedupe, ordering).
- `src/components/CommandPalette.tsx` — palette UI (keyboard shortcuts, groups, rendering).
- `supabase/migrations/051_chart_tracks_artist_names_text.sql` — `artist_names_text` generated from JSONB `artists` on the three chart tables.
- `supabase/migrations/052_events_lineup_text.sql` — `lineup_text` generated from `events.lineup` + `events.stages[].lineup`.

---

## Global audio system (`LazyDeckAudioProvider` + `DeckAudioProvider` + `claimAudio`)

All audio in the app is owned by a single provider — **`DeckAudioProvider`**, loaded **lazily** through **`LazyDeckAudioProvider`** in `src/app/[lang]/layout.tsx`. Until the engine loads, UI surfaces use **gated hooks** (`usePreviewAudioGated`, `useMixAudioGated`, offline deck controls in `DjDeck`) that call **`requestLoad(action)`** on first Play. Once mounted, the provider exposes **three mutually-exclusive modes**:

| Mode | Origin | Visible component |
|------|--------|-------------------|
| `deck` | Home DJ deck (4 pads) | `DJDeck` + provider's `MiniDeckBar` |
| `mix` | SoundCloud / YouTube mix | provider's `MiniDeckBar` |
| `preview` | Chart song previews (weekly chart: "40 Breaks" + "New Releases"), Beatport Top 10 on artist/label pages, **My Tracks** page (own or shared) | provider's **`MiniPreviewBar`** (persists across route changes) |

### Persistence across navigation

The **`preview` mode is global**: the queue (`PreviewTrack[]`), the current index, the real `<audio>` element and the now-playing UI all live inside `DeckAudioProvider`. Consumer components (`ChartView`, `BeatportTopTracks`, `TracksSection`, `CommunityMonthlyTop`) **no longer have their own `<audio>` or floating bar** — they call `playPreviewQueue` / `togglePreview` / `stopPreview` via **`usePreviewAudioGated`** (which delegates to **`usePreviewAudio`** once the engine is mounted). This means if you start a preview on `/es/artists/adam-freeland` and navigate to `/es/charts` or `/es/mi-cuenta/tracks`, **audio keeps playing** and the `MiniPreviewBar` stays visible (for Beatport/Bandcamp samples). YouTube embeds (vinyl tracks) still stop on navigation since they're third-party iframes.

### How mutual exclusion works

1. **`claimAudio(source)`** dispatches a `CustomEvent` named **`ob-audio-claim`** on `window` with `{ detail: { source } }`. The provider itself calls `claimAudio` when switching modes.
2. The provider pauses the non-matching modes when a claim is received. Only one of `deck` / `mix` / `preview` plays at a time.
3. The type **`AudioClaimSource`** still accepts legacy aliases (`chart-preview`, `chart-playall`, `beatport-top`, `my-tracks`) for backward compatibility — they all map to the new `preview` mode.

### Per-row Play/Pause is a real toggle (not a restart)

**Invariant (Aug 2026):** a row's ▶ button that turns into a **`❚❚`** must actually **pause** the track — clicking it again resumes from the same position. It must **never** re-launch the queue (which restarts the song from 0:00 and looks like "the pause button doesn't stop playback"). The reported symptom was on Firefox but the bug was cross-browser: the row handler always called `playPreviewQueue` instead of toggling.

- **Correct pattern:** if the clicked row is the one currently playing in this group (`previewGroupKey === sectionKey && previewQueue[previewIndex]?.rowKey === rowKey`), call **`togglePreview()`**; otherwise `playPreviewQueue(bundle, idx, groupKey)`. The `❚❚` icon is shown only when `isActive && previewPlaying` (paused → `▶`).
- **Surfaces that must keep this:** `ChartView` (40 Breaks + New Releases), `CommunityMonthlyTop` (`/top100`), `BeatportTopTracks` (artist/label Top 10), `ArtistFeaturedTracks` (profile New Releases). `TracksSection` (My Tracks) and `ArtistShowcase` already toggled correctly and are the reference implementation.
- **Mix cards** (`MixesExplorer.MixPlayButton`, dashboard `DashboardMixPlayButton`): the **`■ STOP`** label must call **`stopMix()`** (not `playMix` again). `useMixAudioGated` exposes `stopMix` / `toggleMixPlayback` for this.

### Embed coordinator & mobile consistency (`src/lib/youtube-play-coordinator.ts`)

Third-party iframes (YouTube vinyl rows, `/mixes` cards, dashboard saved-mix cards, **SoundCloud visual widgets**) live outside the provider, so a module-level singleton coordinates both worlds — **only one audible source site-wide**. Invariants added in Aug 2026 after the mobile/PWA consistency fixes (wrong track playing, two sources at once after backgrounding, lock screen opening the wrong app):

- **Every embed goes through the coordinator.** YouTube via `requestYouTubePlay` / `registerYouTubeEmbed` (all `autoplay` mounts call `requestYouTubePlay` first); SoundCloud visual widgets via **`useSoundCloudExclusivePlayback`** (in `SoundCloudVisualEmbed.tsx`): the Widget API `PLAY` event claims the slot and registers a `pause()` stopper. The dashboard `YouTubeIframe` (`user/shared.tsx`) delegates to `LazyYouTubeEmbed` — do **not** reintroduce raw uncoordinated `<iframe>`s.
- **Request→mount race is closed.** `stopAllYouTube()` remembers which slot the global player evicted; if that slot's iframe registers *late*, it stops itself instead of re-silencing the preview the user just started (the last user action always wins).
- **Preview keepers respect embeds.** The `visibilitychange` resume, the 10 s keeper interval and the start watchdog in `DeckAudioProvider` all check **`getActiveYouTubePlayId()`** and never auto-`play()` the preview `<audio>` over an active embed.
- **Audio-focus interruptions behave like a real music app (`previewInterruptedRef`).** When another app grabs the OS audio focus (WhatsApp voice note, a call, another player) our `<audio>` is paused while the page is hidden. We try **exactly one** resume ~1.5 s later: if the focus is ours again (a transient notification "blip") the music keeps going; if that `play()` is rejected another app is actively playing, so we **back off and stay paused** instead of fighting for the focus every tick (the old bug: "songs kept trying to come back when I opened WhatsApp"). Once interrupted, neither the keeper nor the `visibilitychange` resume revive it — the user presses play (or any explicit play / track change / `ended`→advance clears the flag). Only **benign** background pauses (OS throttling with no other source playing) auto-resume on foreground return.
- **The start watchdog no longer burns through the queue.** If a track's `play()` doesn't start in the background it used to skip to the next track after 3 attempts, and since every track was blocked the same way it would eat the whole queue and stop ("4-5 songs play then it suddenly stops"). Now it only skips on a genuine media error (`audio.error`: dead proxy URL / unsupported format); a blocked-but-healthy `play()` holds the current track and resumes on foreground return or user tap.
- **Cross-window exclusion (`BroadcastChannel('ob-playback-claim')`).** When any tab / PWA window of the origin starts playback (`claimAudio`, YouTube/SC claims, preview/mix resume), it broadcasts a claim and every other client silences itself — Spotify-style, fixes the "two playlists at once" bug when both the PWA icon and a Safari tab were alive.
- **Media Session:** the deck effect must **not** clear `mediaSession` metadata/handlers while `mode === 'preview'` (it used to, leaving the iOS lock screen orphaned). Preview owns its session via `loadAndPlayPreviewAt` + its own handler effect.
- **PWA manifest** (`public/manifest.json`) declares `id: "/"`, `scope: "/"` and `launch_handler.client_mode: "focus-existing"` so OS media controls / launches reuse the existing window instead of spawning another instance. The manifest is precached by `public/sw.js` — **bump `CACHE_NAME`** whenever it changes (currently `ob-v5`).

### `MiniPreviewBar`

Rendered by the provider whenever `previewQueue.length > 0`. Same visual layout as the old per-page floating bar:

- **Progress bar** — seekable click/drag with `document`-level pointer listeners (no `setPointerCapture` — see [Safe navigation while audio is playing](#safe-navigation-while-audio-is-playing) below for why), red fill on a neutral track.
- **Transport** — Previous `⏮` / Play-Pause `▶ ❚❚` / Stop `■` / Next `⏭`.
- **Track info / back-to-origin** — title (Unbounded) + artist (Courier Prime). Tapping the info takes you **back to the song's source list**: if the current page contains the row (`domId`) it just scrolls to it with a yellow flash; otherwise it navigates to the track's **`originPath`** (`/charts?week=…`, `/top100`, `/mi-cuenta/tracks`, the artist/label page for a Beatport Top 10 or profile New Releases, the home showcase card) with `#<domId>` and then scrolls once the row exists (retry loop, ~10 s, covers client fetches and accordions). Navigation never touches the `<audio>` — the bar persists and playback continues. Pages with collapsed/paginated content listen for the hash: `ChartView` reuses its deep-link effect (expands the right week, no autoplay without `?play=`), `BeatportTopTracks`/`ArtistFeaturedTracks` expand their accordion on `#bp-row-*` / `#nr-row-*`, and `TracksSection` grows `visibleCount` until `#mytracks-row-<key>` is mounted. The direct-scroll shortcut only applies **on the origin page itself** because some `domId`s repeat across pages (`bp-row-3` exists on every profile with a Beatport Top 10).
- **Time & counter** — `currentTime / duration` + `index / total`.
- **Save toggle (`+` / ✓)** — same `SaveTrackButton` (size `sm`) that lives on every chart / Top 10 / My Tracks row, rendered to the right of the time. Each `PreviewTrack` carries its own `save` payload (`mode: 'ref'` for tracks that have a row in `chart_*_tracks`, `mode: 'url'` for Beatport Top 10 entries that only live as JSONB) so the button operates on the same canonical group as the source row and stays in sync via the shared `useSavedChartTracks` store. Lets the user add or remove the song that is currently playing without having to scroll back to its row.
- **`mediaSession`** — `metadata` (title, artist, artwork) + `play` / `pause` / `previoustrack` / `nexttrack` handlers for hardware media keys, lock screen and Bluetooth.
- **OS “Now Playing” / lock screen** — The Web **Media Session** API only exposes standard `MediaMetadata` text fields (`title`, `artist`, `album`, `artwork`) plus position state for the scrubber. **There is no dedicated release-year field** for the system UI. The only way to show a year on the phone lock screen would be to concatenate it into `title` / `artist` / `album`, which competes for space and is **heavily truncated** on iOS. We intentionally keep those strings **clean**; release year and full date stay in the **in-app** UI (`MiniPreviewBar`, chart rows), not duplicated into `mediaSession`.
- **Mobile safe-area** — `paddingBottom: calc(env(safe-area-inset-bottom, 0px) + 10px)` so the transport buttons keep ~10 px of breathing room above the iPhone home-bar even when the system reports 0 px of inset (and the page wrapper reserves the same height with `pb-[calc(4.75rem+env(safe-area-inset-bottom,0px)+10px)]` so the last row never sits under the bar).
- **PWA standalone (iOS) anchoring** — The bar is portaled to **`document.body`** (`#ob-audio-overlays`) so no wrapping element can break `position: fixed`, and its `bottom` is a dynamic value from **`useViewportBottomOffset`** that **compensates for `visualViewport` drift** after lock/unlock, orientation change or returning from Web Share (Facebook / WhatsApp / etc.). Same hook powers **`BackToTop`** so both overlays stay glued to the visible bottom edge in standalone mode.

### Safe navigation while audio is playing

The mini-player is a `position: fixed` overlay that **persists across routes** (rendered through `createPortal` into `<div id="ob-audio-overlays">` under `document.body`, with its own `DeckAudioContext.Provider`), so three whole classes of bugs used to be possible:

- **Pointer capture leaks (menu/footer becomes unclickable).** Originally the seek bar called `setPointerCapture(pointerId)` on every `pointerdown`. If a Next.js navigation (or a tab change / iOS WebView quirk) replaced the React tree before `pointerup` fired, the capture stayed live on the seek `<div>` and **all** subsequent clicks were routed to it instead of to the page — the user had to press STOP to unmount the player and recover navigation. **Fix:** the seek bar no longer calls `setPointerCapture`. On `pointerdown` it registers `pointermove`/`pointerup`/`pointercancel` listeners on `document`, scoped to the originating `pointerId`, and tears them down at the end of the gesture. A second-line cleanup runs on `visibilitychange` / `pagehide` / `blur` so any orphaned drag is aborted automatically.
- **rAF re-render storm blocking `next/link` transitions.** The progress tick used `requestAnimationFrame` with `setPreviewProgress(audio.currentTime)` ~60 fps. Because `previewProgress` is part of the memoised context value, **every consumer of `useDeckAudio` re-rendered every frame** (`TracksSection`, `ChartView`, `BeatportTopTracks`, `BackToTop`…). Under React 18 + App Router, `next/link` navigations live inside an interruptible transition: if high-priority `setState`s arrive faster than the new tree can commit, the transition restarts indefinitely and the destination page **never renders** — the symptom was *"music keeps playing, the menu doesn't respond, hitting STOP makes the page I had clicked finally appear"*. **Fix:** the preview rAF throttles its `setState` to ~120 ms (≈8 fps, plenty for a thin progress bar); the deck rAF throttles its `setProgressA/B` the same way (deck platter rotation stays at 60 fps because it only ever matters on `/`). With ~7× fewer context updates the transition scheduler isn't starved and routes commit cleanly while music keeps playing.
- **Player floating mid-screen in iOS PWA after lock/unlock or after returning from another app.** In standalone display mode the layout viewport and the visual viewport can desync (system bar height changes, screen lock, status-bar interactions, and especially **after using Web Share to Facebook/WhatsApp/etc. and coming back** to the PWA). Plain `position: fixed; bottom: 0` then renders the bar somewhere in the middle of the page with songs still visible behind it. **Fix:** `MiniPlayerShell` (and `BackToTop`) use **`useViewportBottomOffset`**, which listens to `visualViewport.resize` / `scroll`, `pageshow`, `focus`, `orientationchange` and `visibilitychange`, and re-measures at 80 / 250 / 600 ms after each wake event because iOS needs a few frames before reporting the real viewport metrics. The hook adds `innerHeight − (vv.height + vv.offsetTop)` to the `bottom`. Combined with the portal to `<body>`, the bar stays glued to the visible bottom edge in every viewport state (PWA, in-browser, after sleep/wake, after share-and-return).

Both behaviours live in `src/components/DeckAudioProvider.tsx` (function `MiniPlayerShell` for the pointer logic, the two `useEffect`s with `requestAnimationFrame` for the throttling).

### `PreviewAutoplayOverlay` (shared-link autoplay)

When `loadAndPlayPreviewAt` hits **`NotAllowedError`**, the provider sets **`previewBlocked`** and renders a full-viewport modal above the page: one tappable card ("▶ TAP TO PLAY" / ES equivalent) that calls **`togglePreview()`** on first user gesture. Cover art uses **`next/image`** so Beatport URLs load via **`/_next/image`** (avoids CDN hotlink 403 from plain `<img>`). Failed loads show a **♪** placeholder. Clears when playback starts successfully or **`stopPreview`** runs. Implemented inside `DeckAudioProvider.tsx`.

The bar still dispatches **`OB_CHART_PLAYALL_BAR_EVENT`** (`ob-chart-playall-bar`) so that `BackToTop.tsx` can offset its scroll-to-top button while the bar is visible. `BackToTop`'s offset matches the new height (`bottom-[calc(6.75rem+env(safe-area-inset-bottom,0px)+10px)]` / `7rem+…` on `sm`), so the up-arrow keeps sitting just above the player.

### `MiniDeckBar` (home deck / mix)

The home deck has its own sticky mini-bar inside `DeckAudioProvider` (different UI: waveform, crossfader, mix info). The same mutual-exclusion logic is shared.

### Key files

| File | Role |
|------|------|
| `src/components/LazyDeckAudioProvider.tsx` | **`AudioEngineGate`**, dynamic `import()` of `DeckAudioProvider`, `useAudioEngineGate()`, session resume via `ob_audio_active`. Keeps a **stable shell** around `{children}` (no remount when the engine loads) and **portals** the player overlays to `<div id="ob-audio-overlays">` under `document.body` so `position: fixed` always anchors to the viewport. |
| `src/components/deck-audio-context.ts` | Shared `DeckAudioContext` instance so the lazy provider and the engine module can publish/consume the same value without import cycles. |
| `src/components/PendingActionRunner.tsx` | Executes the first queued play action after the provider mounts. |
| `src/hooks/useGatedDeckAudio.ts` | **`usePreviewAudioGated`**, **`useMixAudioGated`** for pages that must work before the engine loads. |
| `src/lib/audio-engine-pending.ts` | Types for pending actions + **`AUDIO_SESSION_KEY`**. |
| `src/components/DeckAudioProvider.tsx` | Context + `<audio>` for `preview`, `playPreviewQueue`/`togglePreview`/`stopPreview`, **`usePreviewAudio`** / **`usePreviewAudioMaybe`**, `MiniPreviewBar` (with the in-bar save toggle, the iOS safe-area + 10 px padding, the **`visualViewport` bottom compensation** for PWA standalone, and the `document`-level seek-drag handlers from [Safe navigation while audio is playing](#safe-navigation-while-audio-is-playing)), `MiniDeckBar`, `claimAudio`, `AudioClaimSource`, `OB_CHART_PLAYALL_BAR_EVENT`. Supports an **`engineOnly`** mode that renders nothing and reports its context value + overlays via `onBind` so `LazyDeckAudioProvider` can keep a stable shell around the page. The two `requestAnimationFrame` ticks (preview progress + deck progress) flush React state at most every ~120 ms so high-frequency context updates don't starve `next/link` transitions. Also exports the **`PreviewSaveData`** discriminated union (`mode: 'ref'` / `mode: 'url'`) consumed by every queue producer below. |
| `src/components/DjDeck.tsx` | Home deck UI; **`useDjDeckControl`** gates play until `requestLoad`. |
| `src/components/ChartView.tsx` | Weekly chart (`WeekAccordion`, `ChartTrackRow`, `FeaturedPickRow`). Builds `PreviewTrack[]` bundles (with `relatedRefs` from `canonicalGroups` baked into each `save`) and calls `playPreviewQueue`. No local audio. |
| `src/components/BeatportTopTracks.tsx` | Top 10 accordion. Builds `PreviewTrack[]` (URL-mode `save` with `externalUrl` + snapshot) and calls `playPreviewQueue`. No local audio. |
| `src/components/CommunityMonthlyTop.tsx` | All-time community top on `/[lang]/top100` (slug kept for compatibility). Artist board: 10 visible, load more to 50, weekly movement like 40 Breaks. Builds `PreviewTrack[]` with mixed-mode `save` (URL for `beatport_top` primaries, ref for the rest) and calls `playPreviewQueue`. |
| `src/components/user/TracksSection.tsx` | My Tracks page (own/shared). Play-all + shuffle for the audio subset; YouTube embeds for vinyls rendered inline. `toPreviewTrack` mirrors the per-row save logic (URL mode for shared `beatport_top`, ref mode with `relatedRefs` on the owner's list). |
| `src/components/BackToTop.tsx` | Listens for `OB_CHART_PLAYALL_BAR_EVENT` to offset the scroll button (matches the new player height: `safe-area + 10 px`). Uses **`useViewportBottomOffset`** so on iOS PWA standalone the button stays anchored to the visible bottom edge after lock/unlock, orientation change, or returning from Web Share. |
| `src/hooks/useViewportBottomOffset.ts` | Shared hook for the iOS PWA viewport drift fix. Listens to `visualViewport.resize/scroll`, `pageshow`, `focus`, `orientationchange`, `visibilitychange` and re-measures at 80/250/600/1200 ms after each wake event. Ignores transient overlay measurements (hidden page or drift > 40% of viewport height) and self-heals by polling while offset > 0, so the bar recovers even when iOS fires no event after closing the share sheet. |
| `src/lib/youtube-play-coordinator.ts` | Singleton "one audible source" coordinator between the global player and third-party embeds (YouTube + SoundCloud visual). Handles the request→mount race, exposes `getActiveYouTubePlayId()` for the preview keepers, and broadcasts playback claims across tabs / PWA windows via `BroadcastChannel('ob-playback-claim')`. |
| `src/components/SoundCloudVisualEmbed.tsx` | SoundCloud visual iframe + **`useSoundCloudExclusivePlayback`** (Widget API `PLAY` → claim slot / register `pause()` stopper). Used by `/mixes` cards (`LazySoundCloudEmbed`) and dashboard saved-mix cards. |
| `src/app/api/audio-proxy/route.ts` | Server-side proxy for `geo-samples.beatport.com` / `geo-media.beatport.com` (prevents hotlink blocks) |

---

## Editorial vetoes (entities **not** to create)

A short, hard-coded list of names that look like a label or artist on Beatport / Bandcamp but **must not** become a profile on Optimal Breaks:

| Name | Why | What to do |
|------|-----|------------|
| **DistroKid** (Beatport label id `66449`) | Mass-market **distributor / aggregator**, not a curated breakbeat label. Showing it as a label dilutes the catalog and its "top tracks" are random genres. | Leave the string `"DistroKid"` on individual chart picks (it appears in many JSON picks because Beatport reports it as the label of self-published tracks) but **do not** run `db:label`, `db:label:agent` or any UPSERT that would create a row in `labels` for it. The chart UI shows the text; the Beatport button still links to the track; no `/labels/distrokid` profile is generated. |
| **TuneCore** (and similar aggregators: CD Baby, Amuse, RouteNote, UnitedMasters, Artistfy, Create Music Group when used as the Beatport “label”) | Same role as DistroKid: digital distribution / self-publishing pipes, not scene imprints. | Keep the string on chart rows if Beatport reports it; **never** create `labels` rows or `/labels/…` profiles. |
| **Major / generic majors** when they only appear as Beatport metadata (e.g. Polydor, Columbia (Sony), OWSLA/Atlantic, Atlantic Records UK, Major Recordings/Warner) | Not breakbeat-scene imprint targets for Optimal Breaks catalog growth. | Do **not** bootstrap them from chart frequency. Add a major only after explicit editorial confirmation. |
| **Vazteria X** (slug `vazteria-x`, Beatport artist id `227121`) | Asked (Aug 2026) **not to be part of the site**. Profile deleted. | Keep the **name on tracks**, event line-ups and label credits. **Never** recreate `/artists/vazteria-x`, a bio, a portrait or a bootstrap ficha. Rule: `.cursor/rules/artistas-opt-out-perfil.mdc`. |

Add to this table only after explicit user confirmation. The aim is to keep a small, discoverable list rather than a separate document.

---

## Discovering artists & labels from charts

Editorial growth of the catalogue from **published** editions of **40 Breaks Vitales** (`chart_tracks`) + **New Releases** (`chart_featured_tracks`). Retro Vinyl is **out of scope** for these thresholds.

### Artists — threshold **≥ 3** appearances

1. Count artist **credits** across all published editions (union of 40 Breaks + New Releases). One credit = one row where the name appears in `artists[]`.
2. Match against `data/artists/` (name / stripped name / slug; aliases in `CHART_NAME_TO_SLUG` inside `sync-chart-artists.mjs` / `enrich-chart-artists-agent.mjs`).
3. Candidates with **≥ 3** appearances and **no** local JSON → create with the agent:
   ```bash
   # SSL inspection (Acttax): see TLS notes below; Node < 22.15 needs OB_NO_SYSTEM_CA=1
   npm run db:chart:artists:agent -- --bootstrap-min-freq=3 --bootstrap-only --dry-run
   npm run db:chart:artists:agent -- --bootstrap-min-freq=3 --bootstrap-only
   ```
4. Optional after bios: portraits via `npm run db:artist:photo -- <slug>` (or a slug loop). Serp/Instagram failures are OK — leave `image_url` null.
5. Starter sync of *all* missing names (no frequency filter): `npm run db:chart:artists -- --all-published` then enrich starters with `db:chart:artists:agent` (without `--bootstrap-only`). Prefer the **≥ 3 bootstrap** for discovery batches.

### Labels — threshold **≥ 10** appearances (real imprints only)

1. Count the `label` string on the same chart tables (published editions only).
2. Match against `data/labels/` (name / slug; soft-match stripping trailing `Records` / `Recordings` / `Music`).
3. **Exclude** DistroKid, TuneCore and the veto list above before ranking.
4. Current editorial bar: only create profiles for missing labels with **≥ 10** appearances. Below that (5–9, 3–4, 1–2) stay parked until the threshold is lowered explicitly.
5. There is **no** automated `chart-labels` bootstrap yet — create with the label agent per slug:
   ```bash
   node scripts/guia-base-datos.mjs run label-agent -- <slug> "Label Name" --save-json
   # optional logo:
   node scripts/guia-base-datos.mjs run label-photo -- <slug>
   ```
6. Cursor rule (agent invariant): `.cursor/rules/charts-catalog-discovery.mdc`.

---

## Database Schema

Supabase tables are reflected in `src/types/database.ts`. Highlights:

- **artists** — `slug`, name / `name_display`, `real_name`, bio (EN/ES), category, styles, era, `image_url`, essential tracks, recommended mixes, related artists, `labels_founded`, `key_releases` (JSON), website, socials, featured flag, sort order — see `006_artist_extended_fields.sql` and `data/artists/deekline.json`. Optional **Beatport** fields (migration **`046_beatport_top_tracks.sql`**): `beatport_id`, `beatport_url`, `beatport_top_tracks` (JSONB, top-selling tracks + preview URLs, **each with `release_date YYYY-MM-DD`** when scrapeable), `beatport_top_tracks_updated_at`. The public artist page shows an accordion **only when** `beatport_top_tracks` is non-empty.
- **labels** — name, country, founded year, description (EN/ES), `image_url`, key artists/releases; optional **`organization_id`** → `organizations.id` (migration `010`). Same optional Beatport columns as artists (`046`).
- **events** — name, type, dates, location, lineup, description (EN/ES), `image_url`, stages/schedule (JSON), tags, tickets, socials, coords; optional **`promoter_organization_id`** → `organizations.id` (migration `010`). Events are created via admin UI, Cursor, or the **admin conversational agent** (💬 widget / `/[lang]/administrator/chat` — screenshot/text → tools → **Confirm** → UPSERT; flyer day/month without year → next future date; enrich + official poster by **vision/OCR**). Enrich: `npm run db:events:enrich -- <slug> [--with-poster]`. Poster: `npm run db:events:poster -- <slug>` (OCR by default). Docs: [`docs/ADMIN_CHAT_CAPTURA.md`](docs/ADMIN_CHAT_CAPTURA.md); enricher prompt: [`scripts/prompts/evento-enriquecer-system.txt`](scripts/prompts/evento-enriquecer-system.txt)
- **organizations** — `slug`, name, roles (`label`, `promoter`, …), descriptions (EN/ES), `website`, `socials` (JSON), optional `base_city` / `founded_year`; Raveart seed + FK wiring in `010_raveart_organizations.sql`; extra gallery-titled events in `011_raveart_gallery_events.sql`
- **blog_posts** — title, content, excerpt (EN/ES), category, tags, author, `image_url`, published flag
- **scenes** — name (EN/ES), country, region, key artists/labels/venues, era, `image_url`
- **mixes** — title, artist, type, year, duration, embed URL, platform, `image_url`
- **history_entries** — title, content (EN/ES), section, year range, sort order
- **profiles**, **favorite_artists**, **favorite_labels**, and related user tables — see `003_user_system.sql` and follow-up migrations; **`056_community_top_and_soulmates.sql`** adds **`is_tracks_public`** on **`profiles`** for Soulmates / Community Top opt-out
- **breakbeat_profiles** — one DNA-analysis row per user (`user_id` UNIQUE → `profiles`). Stats JSONB + bilingual analysis/archetype. **Private:** RLS owner-only (`064_breakbeat_profiles_rls.sql`). Written by `POST /api/breakbeat-profile` and `useBreakbeatProfile()` with the **user JWT** (not `service_role`). Detail: [`docs/USER_ENGAGEMENT.md`](docs/USER_ENGAGEMENT.md#breakbeat-dna-breakbeat_profiles)
- **artist_claims**, **booking_requests**, **booking_sender_bans** — *Verified artists + booking requests* (`068_artist_claims_bookings.sql`, contact fields in `069_artist_claims_contact.sql`). A user claims an artist identity (not editorial control), providing a **contact phone** (required) and optional email for verification; once approved (`artists.claimed_by`) they can toggle `accepts_bookings` and receive structured **booking requests** from other logged-in users. Per-role RLS; admin uses `service_role`. `booking_sender_bans` is service-role-only (a `profiles` column would let a user self-unban via the existing update-own-profile policy). No transactional emails in the MVP. Spec: [`docs/GUIA_IMPLEMENTACION_BOOKINGS.md`](docs/GUIA_IMPLEMENTACION_BOOKINGS.md)

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
| `056_community_top_and_soulmates.sql` | **`profiles.is_tracks_public`** (default `TRUE`; when `FALSE`, user excluded from **Soulmates** + **Community Top** aggregates); **`idx_sct_created`** on **`saved_chart_tracks.created_at`** |
| `057_chart_featured_tracks_release_date.sql` | **`chart_featured_tracks.release_date DATE`** + index. Stores **full publish day** (YYYY-MM-DD) from Beatport / Bandcamp alongside `release_year`; rendered everywhere via `formatTrackReleaseDisplay` (see below) |
| `062_admin_chat_threads.sql` | **Admin conversational agent:** `admin_chat_threads` + `admin_chat_messages` (history, `pending_ops`, tool traces). Docs: [`docs/ADMIN_CHAT_CAPTURA.md`](docs/ADMIN_CHAT_CAPTURA.md) |
| `064_breakbeat_profiles_rls.sql` | **`breakbeat_profiles`:** `CREATE TABLE IF NOT EXISTS` (one row per user) + **ENABLE RLS** + owner-only SELECT/INSERT/UPDATE/DELETE (`TO authenticated`, `(SELECT auth.uid()) = user_id`) + `REVOKE ALL` from **`anon`**. Fixes the PostgREST lint “RLS disabled on exposed table”. DNA is **private** (dashboard only). See [`docs/USER_ENGAGEMENT.md`](docs/USER_ENGAGEMENT.md#breakbeat-dna-breakbeat_profiles). |
| `068_artist_claims_bookings.sql` | **Verified artists + booking requests:** tables **`artist_claims`** (verification queue), **`booking_requests`** (structured requests with lifecycle) and **`booking_sender_bans`** (service-role-only moderation) + columns **`artists.claimed_by`** / **`artists.accepts_bookings`**. Anti-abuse unique indexes (one pending claim per user, one approved claim per artist, one live request per sender+artist) and per-role RLS. `claimed_by` never reaches public surfaces; the booking button is gated by `accepts_bookings`. Spec: [`docs/GUIA_IMPLEMENTACION_BOOKINGS.md`](docs/GUIA_IMPLEMENTACION_BOOKINGS.md). |
| `069_artist_claims_contact.sql` | **Claim contact details:** adds **`artist_claims.contact_phone`** (required by the API) and **`artist_claims.contact_email`** (optional) so admins can verify identity by phone. Shown in `/administrator/claims` (tap-to-call). |

---

## Track release dates (full day vs year)

All track-listing surfaces (40 Breaks Vitales, New Releases, Retro Vinyl Picks, Beatport Top 10 on artist/label profiles, **My Tracks** own + public, Community Top, Soulmates recommendations, admin Tracks dashboard, ⌘K search) display the **full publish date** in `YYYY-MM-DD` when available, falling back to the year only when the day is unknown.

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

### New Releases (editorial picks on `/charts`)

> **Invariant rule:** each featured pick belongs in the **`week_date`** edition, defined as **the ISO Monday of the calendar week that contains that track's release date** from the store (Beatport: `publish_date` in scraped `__NEXT_DATA__`). The day you paste URLs, chat cadence, or “the next timeline row” does **not** choose the bucket; see `.cursor/rules/charts-new-releases-supabase.mdc`.

- **What the live site reads:** **`chart_featured_tracks`** in Supabase (`chart_editions.week_date`). The route **`/[lang]/charts`** never reads **`data/charts/picks/*.json`** directly.
- **`chart_editions.week_date` is the ISO Monday starting the Beatport release week** (store `publish_date` from embedded `__NEXT_DATA__`). Do **not** derive it from chat cadence (“latest JSON + 7 days”) or the day pasted URLs arrive.
- **Git / JSON-only updates:** Editing `data/charts/picks/<week>.json` or running **`scripts/_append-batch-nr-from-releases.mjs`** (Beatport crawl → singles into one **or multiple** `<monday>.json` files when release weeks differ) updates **repository files only**. Production row counts stay stale until Supabase is synced.
- **Publish picks to Supabase:** `npm run db:chart:featured -- data/charts/picks/<week>.json` (same as **`run chart-featured-file`** via `npm run db:guia`). Optional flags on `chart-featured-upsert.mjs`: `--create-edition`, `--enrich-release-dates`, `--write-json`, `--verbose`. On corporate TLS inspection use `node --use-system-ca scripts/chart-featured-upsert.mjs …` (npm cannot pass `--use-system-ca` via `NODE_OPTIONS`).
- **Admin path (writes DB directly):** `/[lang]/administrator/tracks` → Beatport URL import (**`/api/admin/featured-import`**). No mandatory JSON upsert afterward.
- **Friday release-day congestion:** Labels worldwide often ship on **Fridays**, so Beatport sees **heavy traffic + scraping load**. Expect **more `403`/timeouts/flaky headless** than mid-week; retry **Saturday morning** or raise **`BEATPORT_BATCH_PAUSE_MS`** — same batches often succeed the next day without code changes.
- **Vinyl editorial block:** **`npm run db:chart:vinyl -- …`** (`chart-vinyl-upsert.mjs`). Identity for an existing cut is the **YouTube video id** (`vinylIdentityKey` in `scripts/lib/chart-vinyl-track-key.mjs`) so a re-upsert **keeps the same UUID**. **Backfill New Releases from 40 Breaks history:** **`npm run db:chart:backfill-new-releases`**.
- **Immutable row IDs (do not orphan My Tracks):** `chart_tracks.id` / `chart_featured_tracks.id` / `chart_vinyl_tracks.id` are what `saved_chart_tracks.track_id` stores. Weekly sync **UPDATEs** the live row (40 Breaks = Beatport URL, New Releases = `link_url`, vinyl = YouTube id). **Never** delete+insert the same song (that minted new UUIDs in 2026 and dropped user saves). New UUID only for a track that is not already in that edition. Removing a pick from the week may delete the catalogue row; saves **with `snapshot`** still render. Rebind orphans that still have a URL: `node scripts/saved-tracks-rebind.mjs`. Cursor rule: **`.cursor/rules/charts-ids-inmutables-saves.mdc`**.

### «Open on Spotify» / «Open on TIDAL» links on `/charts`

Every row in **40 Breaks Vitales** and **New Releases** shows a **SPOTIFY** button (`SpotifyLinkButton` in `ChartView.tsx`) so users with a Spotify account can hear the full track there (we cannot host full audio — no licensing). Two modes:

- **Verified link** — column **`spotify_url`** on `chart_tracks` + `chart_featured_tracks` (migration **`066_charts_spotify_url.sql`**), filled by **`npm run db:chart:spotify`** (`scripts/spotify-match-charts.mjs`): Spotify Web API search via **client-credentials** (env `SPOTIFY_CLIENT_ID` + `SPOTIFY_CLIENT_SECRET`; app owner needs Premium since Feb 2026, but no per-user OAuth is involved). Matching is conservative (normalized title + at least one artist must match; «Original Mix» is treated as no suffix); ambiguity leaves `NULL`.
- **Search fallback** — rows without `spotify_url` link to `open.spotify.com/search/<artists title>`, so the button works even before matching runs.

**TIDAL** works the same way via `--service=tidal` (`npm run db:chart:tidal`, column **`tidal_url`**, migration **`067_charts_tidal_url.sql`**, env `TIDAL_CLIENT_ID` + `TIDAL_CLIENT_SECRET` from developer.tidal.com — no Premium requirement, no daily quota observed; endpoint `GET /v2/searchResults?filter[query]=…&include=tracks.artists`, JSON:API). One editorial difference (deliberate, user-approved): the **TIDAL button only renders with a verified link** — no search fallback — because its breaks catalog is thinner and a third always-on button would clutter rows.

**Buttons** live in `TrackShareButton.tsx` (`SpotifyLinkButton`, `TidalLinkButton`, `BeatportLinkButton`): **circular brand-logo buttons on mobile AND desktop** (34px / 30px, official simple-icons paths, tooltip = service name; Spotify = official green `#1ED760` with black logo per Spotify branding, Beatport = black with `#01FF95` "b", TIDAL = paper with black diamond). Used across `/charts` (40 Breaks + New Releases), artist/label **Beatport Top 10** (`BeatportTopTracks.tsx`; Spotify there uses search fallback since the JSONB snapshot has no columns), artist **New Releases** (`ArtistFeaturedTracks.tsx`) and **My Tracks** own + public list (`TracksSection.tsx` + `/api/public/user-tracks`). Vinyl rows deliberately have no Spotify/TIDAL button.

**App vs. web (do not "fix" with deep links):** all buttons use plain `https://` URLs on purpose. The OS itself opens the native app when installed and the browser otherwise — there is no web API to detect an installed app, and forcing `spotify:` URIs shows scary browser dialogs for users without it. Known Spotify limitation: the **search fallback** page (`open.spotify.com/search/…`) on mobile web **without a logged-in session** shows "recent searches/browse" instead of results; direct track links work fine logged-out. This self-heals as matching converts fallbacks into direct links.

Weekly syncs never wipe matches: the 40 Breaks RPC (`apply_chart_tracks_row_updates`) does not list the columns, and `chart-featured-upsert.mjs` only sends `spotify_url` / `tidal_url` when present in the JSON. **After publishing each new edition run** `npm run db:chart:spotify -- --week=<monday>` **and** `npm run db:chart:tidal -- --week=<monday>`. Spotify's Development Mode has a **daily per-account quota** (~1,300 searches): on 429 `QUOTA_EXCEEDED` the script exits cleanly with a summary and resumes where it left off next run (it only processes NULL rows). Per-user Spotify OAuth (add-to-playlist, in-page full playback) is **off the table**: since Feb/Mar 2026 Development Mode apps allow max 5 allowlisted users and Extended Quota Mode requires ≥250k MAU organizations.

---

- **Weekly chart (“40 Breaks Vitales”)** — `npm run db:chart` runs `scripts/chart-40-breaks.mjs` (Beatport genre top 100 + editorial pipeline). Separate from per-artist sales widgets.
- **Top 10 sales on Beatport** — `npm run db:beatport:top -- artist <slug> <beatport_id>` or `label <slug> <beatport_id>` runs `scripts/beatport-top-tracks.mjs`: fetches the public Beatport page, reads embedded **`__NEXT_DATA__`**, extracts the **top-10-tracks** query, and **`UPDATE`s** the matching row in **`artists`** or **`labels`** by `slug` (`beatport_url`, `beatport_id`, `beatport_top_tracks`, `beatport_top_tracks_updated_at`). Requires migration **`046_beatport_top_tracks.sql`** and **`NEXT_PUBLIC_SUPABASE_URL` + service role / secret key**.
- **Finding `beatport_id`** — Open the artist or label on [Beatport](https://www.beatport.com); the canonical URL is `/artist/<slug>/<id>` or `/label/<slug>/<id>`. Pass the same `slug` as in Optimal Breaks (e.g. `deekline` → `https://www.beatport.com/artist/deekline/3171` → `3171`).
- **Batch refresh** — `npm run db:beatport:top -- --all-artists` or `--all-labels` walks every row that already has **`beatport_id`** set (staggered requests). Add **`--missing-only`** to refresh only rows whose **`beatport_top_tracks`** is empty/null. **`--dry-run`** prints previews without writing.
- **Fill missing accordion data (artists)** — `npm run db:beatport:top -- --fill-missing-artists` selects artists with an empty Top 10 list: first **`UPDATE`**s anyone who already had **`beatport_id`** (using the slug from **`beatport_url`** when present), then **searches Beatport** by **exact catalogue `name`** for remaining rows to discover **`beatport_id`**. Optional **`--limit=N`** (testing). Takes several minutes site-wide (~1.5 s pacing per scrape); some artists have **no** Beatport listing or Beatport exposes **zero** chart rows, so the hero accordion still stays hidden until tracks exist.
- **Cloudflare 403 («Just a moment…»)** — Beatport sits behind Cloudflare. Plain HTTP fetch from a clean IP works (this is how the batch above got 177 artists in one go), but **once a single IP issues ~200 sequential scrapes Cloudflare flags it for several hours** and every following request returns `403`. Three options: (1) wait 4–24 h for the IP to be released and rerun the same `--missing-only` / single-artist command; (2) rerun **from a different IP / network**; (3) use `--headless` (e.g. `npm run db:beatport:top -- artist <slug> <id> --headless`), which spins up **Playwright + Chrome** to pass the JS challenge — useful from machines whose Chrome cookies / fingerprint Cloudflare already trusts. Requires `npm i -D playwright` + `npx playwright install chrome` (or `chromium`). The flag also works on `--all-artists`, `--all-labels` and `--fill-missing-artists`.
- **TLS `UNABLE_TO_VERIFY_LEAF_SIGNATURE` ("fetch failed" en Node)** — En redes corporativas con **SSL inspection** (Acttax, muchas VPN/firewall), el certificado que ve Node es re-firmado por una CA interna. Node 20+ **no usa el truststore del SO por defecto**, así que `fetch` muere con `UNABLE_TO_VERIFY_LEAF_SIGNATURE` (visible como **`fetch failed`**). Afecta a **todos** los scripts que pegan a Beatport / Supabase por HTTP: `chart-40-breaks`, `beatport-top-tracks`, `chart-featured-upsert --enrich-release-dates`, `enrich-chart-artists-agent`, `generar-sello-agente`, ad-hoc bajo `scripts/_*`, etc. **Solución limpia (sin desactivar TLS):** lanzar **`node --use-system-ca`** (lee la CA de Windows/macOS) — available from **Node ≥ 22.15** (and recent Node 20).
  - Invocar con `node` directo: `node --use-system-ca scripts/<lo-que-sea>.mjs …`
  - Para los entry-points que se llaman vía `npm run …`: NO se puede usar `NODE_OPTIONS=--use-system-ca` porque **npm rechaza ese flag** (`--use-system-ca is not allowed in NODE_OPTIONS`). Workaround: invocar directamente con `node --use-system-ca scripts/<archivo>.mjs <args>` (saltándose npm), o configurar `NODE_EXTRA_CA_CERTS` a nivel de SO apuntando al `.pem` de la CA del proxy.
  - Alternativa: variable persistente del SO **`NODE_EXTRA_CA_CERTS=C:\ruta\ca-corporativa.pem`** (esa sí la acepta npm).
  - **`guia-base-datos.mjs`** auto-prepends `--use-system-ca` for child Node processes when major ≥ 20. On Node builds that **reject** the flag (e.g. **22.14**), set **`OB_NO_SYSTEM_CA=1`** so children start without it, and use **`NODE_TLS_REJECT_UNAUTHORIZED=0`** only for that shell session if Supabase/OpenAI still fail certificate checks.
  - **No recomendado como default permanente:** `NODE_TLS_REJECT_UNAUTHORIZED=0` (desactiva la verificación TLS para todo el proceso).
- **UI** — `src/components/BeatportTopTracks.tsx` (client): accordion in the **hero** of `/[lang]/artists/[slug]` and `/[lang]/labels/[slug]` when tracks exist. Previews use **`/api/audio-proxy`** (allowed Beatport sample hosts); artwork uses **`next/image`** (optimized/proxied) like the main chart. Track rows are **visually identical** to `ChartTrackRow` (same `PositionBadge`, artwork size, title/artist/label/year layout, BPM/key badges, BEATPORT button). Playback uses the **global `preview` mode** via **`usePreviewAudioGated`** → the persistent `MiniPreviewBar` (see [Global audio system](#global-audio-system-lazydeckaudioprovider--deckaudioprovider)). The **`+`** save button is also wired (same canonical dedupe as charts): saving a Top 10 track adds it to the user's **My Tracks**, and a track saved elsewhere already appears in green here.
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
| `npm run db:beatport:top -- artist <slug> <beatport_id>` | Scrape Beatport **Top 10** for that **artist** → update `beatport_top_tracks` (+ URL/ID/timestamp) in Supabase. Same pattern: `label <slug> <id>`. Flags: `--all-artists`, `--all-labels`, `--missing-only`, `--fill-missing-artists [--limit=N]`, `--dry-run`. See **Beatport: weekly chart vs Top 10 on profiles**. |
| `npm run db:chart` | Weekly **genre chart** pipeline (`chart-40-breaks.mjs`); not the same as per-profile Top 10. |
| `npm run db:chart:featured -- data/charts/picks/<week>.json` | **New Releases** UPSERT (`chart-featured-upsert.mjs` → `chart_featured_tracks`). Required after batch/JSON edits for production. |
| `npm run db:chart:vinyl -- …` | **Retro Vinyl Picks** from JSON (`chart-vinyl-upsert.mjs`). |
| `npm run db:chart:backfill-new-releases` | Backfill **`chart_featured_tracks`** from historical 40 Breaks picks (`backfill-new-releases-from-40breaks.mjs`). |
| `npm run db:chart:artists -- [--all-published\|--week=\|…]` | Sync chart artist names → catalogue (Breakbeat style + starter profiles). See **Discovering artists & labels from charts**. |
| `npm run db:chart:artists:agent -- --bootstrap-min-freq=3 --bootstrap-only` | Agent-create artists with **≥ N** chart credits still missing from `data/artists/`. Editorial default **N=3**. |
| `npm run db:label:agent -- <slug> "Name"` | Create/enrich a **label** (JSON + Supabase). Chart discovery bar for new labels: **≥ 10** real-imprint appearances (never DistroKid/TuneCore). |

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
- [x] Google Analytics 4 (`@next/third-parties/google` + Consent Mode v2 + LCP-deferred `CookieBanner`)
- [x] Core Web Vitals pass (May 2026): lazy `DeckAudioProvider`, deferred fonts, Unbounded 900 preload, charts promo + cookie bar off critical path, home SEO for **breakbeat**
- [x] OG images per section (home / mixes / charts screenshots; **events = poster itself**; per-track overrides on charts, artists and labels — see *Open Graph images & social previews*)
- [ ] RSS feed for blog
- [ ] Newsletter subscription
- [ ] Community submissions (suggest artist, submit event)
- [ ] Dark mode toggle

---

## License

All rights reserved © 2026 Optimal Breaks. Made with breaks and noise from Murcia, Spain.
