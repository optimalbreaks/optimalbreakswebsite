# User engagement: favorites, ratings, attendance, **saved chart tracks** (Optimal Breaks)

What a **logged-in user** can do today on the public site and in **My Breaks**, and which Supabase tables are involved.

**ES:** Misma información; términos UI en inglés/español según diccionario del sitio.

---

## Page layout (post-refactor, April 2026)

Originally "My Breaks" was a single page at `/[lang]/dashboard` with in-page tabs. It was split into an **overview page** plus one dedicated route per section so each feature can grow without the page becoming a monster:

| Route | What it shows |
|-------|----------------|
| `/[lang]/dashboard` | Overview cards + **Breakbeat DNA** analysis + recent activity |
| `/[lang]/mi-cuenta/favoritos` | Favorite artists, labels and events |
| `/[lang]/mi-cuenta/vistos-en-vivo` | Artist sightings (seen live) |
| `/[lang]/mi-cuenta/eventos` | Event attendance + favorite events |
| `/[lang]/mi-cuenta/resenas` | Reviews: sightings + event ratings combined |
| `/[lang]/mi-cuenta/mixes` | Saved mixes |
| `/[lang]/mi-cuenta/tracks` | **My Tracks** (see dedicated section below) |
| `/[lang]/mi-cuenta/almas-gemelas` | **Soulmates** — top 10 users with highest affinity + recommendations (see *Soulmates* section below) |
| `/[lang]/mi-cuenta/perfil` | Profile editing, sign-out, **privacy toggle** for Soulmates / Community Top |
| `/[lang]/u/<userId>/tracks` | Public, read-only version of another user's My Tracks (shareable URL) |

Legacy `/[lang]/dashboard?tab=xxx` URLs redirect to the new ones via `DashboardLegacyRedirect`.

The shared shell lives in `src/components/user/UserSectionShell.tsx`; each section is one component in `src/components/user/*Section.tsx`.

---

## Product policy: who gets 1–5 stars?

**Only experiences you can physically go to** — things that happen in real life:

| Stars? | Entity | Why |
|--------|--------|-----|
| **Yes** | **Artists** | "I saw this DJ / act **live**" (`artist_sightings`). |
| **Yes** | **Events** | "I **went to** this party / festival / club night" (`event_ratings`). |

**No star ratings** (bookmark / save only): **labels**, **mixes**, **blog posts**, **scenes**, **chart tracks**. Favorites and saves stay **binary** (heart / save / +) — no numeric score.

---

## Summary table

| Action | Stars? | Where in UI | Table(s) | Notes |
|--------|--------|-------------|----------|--------|
| **Favorite artist** | No | Heart on artist page; Favorites section | `favorite_artists` | Drives "fan" aggregate via `FanCounter` |
| **Favorite label** | No | Heart on label page | `favorite_labels` | "Followers" count |
| **Favorite event** | No | Heart on event cards/pages | `favorite_events` | |
| **Save mix** | No | Save on mixes | `saved_mixes` | "Saves" count |
| **Save chart track** | No | "+" button on every chart row (`SaveTrackButton`) | `saved_chart_tracks` (**migration 053** + **054**) | Appears on *40 Breaks Vitales*, *New Releases*, *Retro Vinyl Picks* and the **Beatport Top 10** of artists/labels; see below |
| **Seen live (artist)** | **Yes — 1–5** + optional text | **SEEN LIVE** on artist page (`SeenLiveButton`) | `artist_sightings` | Date, venue, city, country, event name, rating, notes |
| **Event status** | No (state machine) | Event page: wishlist / going / attended | `event_attendance` | Toggles only; "interested" style counts for events |
| **Rate + review event** | **Yes — 1–5** + optional review | Event page: `EventReviewButton` (RATE / VALORAR) | `event_ratings` (migration **`032_event_ratings_attendance_fields.sql`**) | Dashboard Reviews + Events |
| **Breakbeat profile** | N/A | Dashboard Overview (generate) | `breakbeat_profiles` (**064** RLS) | Private per user. Unlock needs enough favorites **and** saved tracks. See *Breakbeat DNA* below. |

---

## Breakbeat DNA (`breakbeat_profiles`)

Generated taste analysis shown on **`/[lang]/dashboard`** (`BreakbeatDNA` inside `OverviewSection`). One row per user (`UNIQUE (user_id)`). **Not** part of Soulmates, Community Top, or the public `/u/<id>/tracks` page — those use `saved_chart_tracks` / `profiles.is_tracks_public`. The DNA text stays **private**.

### Unlock

The UI requires a minimum of **3** combined inputs (favorite artists + labels + events + saved mixes + saved chart tracks + attendance keys) before “generate” is enabled. The API (`POST /api/breakbeat-profile`) also hashes the current catalog IDs so a regenerate is a no-op when inputs have not changed (`input_hash`).

### Table

The table existed in production before it had a repo migration. **`064_breakbeat_profiles_rls.sql`** is idempotent (`CREATE TABLE IF NOT EXISTS`) so new environments get the same shape, then enables RLS.

```
breakbeat_profiles (
  id UUID PK,
  user_id UUID → profiles(id) ON DELETE CASCADE, UNIQUE,
  created_at / updated_at TIMESTAMPTZ,
  analysis_text_en / analysis_text_es TEXT,
  archetype_en / archetype_es TEXT,
  stats JSONB,                 -- styles, countries, eras, samples, saved-track tallies, …
  input_hash TEXT,
  generated_by TEXT CHECK IN ('rules', 'openai', 'manual')
)
```

Trigger `breakbeat_profiles_updated_at` uses `public.update_updated_at()` (same helper as `profiles`).

### RLS and grants (migration **064**)

Supabase advisors flagged the table as **exposed in `public` with RLS off**. With default PostgREST grants, `anon` and `authenticated` could read/modify **every** row.

| Role | Access |
|------|--------|
| **`anon`** | **None** (`REVOKE ALL`). No public-read policy — DNA is not a public profile. |
| **`authenticated`** | SELECT / INSERT / UPDATE / DELETE **own row only**: `(SELECT auth.uid()) = user_id`. No `TRUNCATE` / `REFERENCES` / `TRIGGER` (TRUNCATE is not filtered by RLS). |
| **`service_role`** | Bypasses RLS (admin/scripts). Not used by the DNA generate path. |

Policies are `TO authenticated` so a logged-out client cannot match them even if a grant slipped back.

**Do not** turn RLS off again, and **do not** add `USING (true)` for SELECT unless product explicitly makes DNA public.

### App paths (JWT, not service role)

Both writes use the **user session** (anon/publishable key + cookies). RLS must allow INSERT + UPDATE for upsert (`onConflict: 'user_id'`).

1. **`POST /api/breakbeat-profile`** — `createServerClient` with the user JWT; computes stats from favorites / attendance / mixes / saved tracks; optional OpenAI (`OPENAI_MODEL_PROFILE` / `OPENAI_MODEL`, fallback `OPENAI_MODEL_PROFILE_FALLBACK` or `gpt-4o`); upserts the row.
2. **`useBreakbeatProfile()`** (`src/hooks/useUserData.ts`) — SELECT own row; after generate, client **upserts again** from the JSON response (`save`).

Types: `BreakbeatProfileRow` / `BreakbeatProfileStats` in `src/types/database.ts`.

---

## My Tracks — saved chart tracks

### Database

**Migrations:** `supabase/migrations/053_saved_chart_tracks.sql` and `supabase/migrations/054_saved_chart_tracks_beatport_top.sql`.

Polymorphic table — one row per (user, track source, track id):

```
saved_chart_tracks (
  id UUID PK,
  user_id UUID → profiles(id) ON DELETE CASCADE,
  track_source TEXT CHECK IN ('chart','featured','vinyl','beatport_top'),
  track_id TEXT,             -- 053 → UUID; 054 → TEXT (to fit beatport_top ids)
  canonical_url TEXT NULL,   -- 054 — normalized canonical URL (Beatport / Bandcamp / YouTube / Discogs)
  snapshot JSONB NULL,       -- 054 — embedded metadata for rows with no source table (e.g. beatport_top)
  created_at TIMESTAMPTZ,
  UNIQUE (user_id, track_source, track_id)
)
```

**Immutable catalogue IDs:** `track_id` is the live row UUID (`chart_tracks` / `chart_featured_tracks` / `chart_vinyl_tracks`). Weekly upserts **must UPDATE that row**, never delete+insert the same song (that minted new UUIDs and orphaned “+” saves — vinyl, 2026, when matching was title+artists). Match keys: Beatport URL (40 Breaks), `link_url` (New Releases), **YouTube video id** (vinyl; not Discogs). New UUID only for a track that is not already in the edition. The “+” always writes `canonical_url` + `snapshot` so My Tracks still renders if a pick is later removed from the week. Rebind URL-bearing orphans: `node scripts/saved-tracks-rebind.mjs`. Rule: `.cursor/rules/charts-ids-inmutables-saves.mdc`.

Migration **054** also **back-fills `canonical_url`** for every pre-existing save by joining each row against its source table (`chart_tracks.beatport_url`, `chart_featured_tracks.link_url`, `chart_vinyl_tracks.youtube_url`). This is what allows the cross-source "already saved" detection to work for rows saved **before** the migration.

RLS keeps each user's rows private (SELECT / INSERT / DELETE). The shared read endpoint (`/api/public/user-tracks`) bypasses RLS via the **service-role** Supabase client; the payload is read-only.

### Canonical grouping (song = Beatport URL = Bandcamp URL = **YouTube video**)

A track can physically exist as **several rows in several tables** (same song promoted as a "New Release" one week and then hitting the "40 Breaks Vitales" top 40 another week). It can also appear as several rows in the **same** table (same song in multiple weekly editions of *40 Breaks Vitales*).

To the user it's a single song. The canonical key used both in `ChartView.tsx` (`canonicalGroups`) and in `TracksSection.tsx` (dedupe on `/mi-cuenta/tracks`) is:

| Source | Canonical key |
|--------|---------------|
| `chart` (40 Breaks Vitales) | Normalized `beatport_url` (`host + pathname`, no querystring) |
| `featured` (New Releases) | Normalized `link_url` (Beatport/Bandcamp) |
| `vinyl` (Retro Vinyl Picks) | **YouTube video ID** (`yt:<id>`, extracted with `extractYouTubeId`) — **NOT** `discogs_url`, because a Discogs release typically contains several songs (A1/A2/B1…) and every song is its own row. Grouping by `discogs_url` would collapse distinct songs and cause the button to treat them as one. |
| `beatport_top` (artist / label Top 10) | Normalized `beatport_url` (stored as `canonical_url` + `snapshot` in the saved row itself — no source table). |

Fallback when URL/ID is missing: `nm:<title>|<mix>|<artists csv>` (all lowercased).

Why this matters: the SAVE button uses the canonical group to decide "is this saved?" (`isAnySavedRefs`) and on toggle it either **inserts one row** (the currently visible one) or **deletes every row in the group** via a single batched query. A bad key either:

- **Merges distinct songs** → saving A deletes B that was saved earlier (reported bug: *"adding more than 3 YouTubes and the last one disappears"*).
- **Leaves the group fragmented** → saving a track in "40 Breaks" does not mark it as saved when it also appears as "New Release".

### Hook: `useSavedChartTracks()` (`src/hooks/useUserData.ts`)

Module-level **shared store** (`savedChartTracksCache` + listener set) — every mount of the hook across the app reads/writes the same in-memory state so that clicking a "+" button on one row instantly repaints **every other row** that represents the same song (tracks often repeat across chart weeks on the same page).

Exported API:

- `saved` (array of `{track_source, track_id, canonical_url, snapshot, created_at}`)
- `isSaved(source, id)` — single row
- `isSavedByUrl(url)` — **URL-based cross-source check** (used by the Beatport Top 10 "+" on artist/label pages to light up when the same song is already saved from a chart, and vice-versa).
- `isAnySaved(source, ids)` — same-source group (legacy)
- `isAnySavedRefs(refs)` — cross-source group using `{source,id}` refs
- `toggle(source, id, canonicalUrl?)` — basic insert/delete; `canonicalUrl` is stored on insert.
- `toggleGroup(source, primaryId, groupIds)` — same-source batch
- `toggleGroupRefs(primary, refs, canonicalUrl?)` — cross-source batch (current default)
- `toggleByUrl(url, { trackId?, snapshot? })` — **URL-based toggle**. If any row already matches by canonical URL it deletes them all; otherwise inserts a `beatport_top` row with `canonical_url = url`, `track_id = trackId || normalized url` and the supplied `snapshot`. Used by the Beatport Top 10 button and by any "+" click that was only green because of a cross-source URL match (not a direct id hit).
- `refetch()`

### UI components

- **`SaveTrackButton`** (`src/components/SaveTrackButton.tsx`) — the "+" / ✓ pill. Two modes:
  - **Ref mode** (charts / featured / vinyl): `source`, `trackId`, `relatedRefs` (polymorphic, preferred) or `relatedIds` (same-source legacy). Optional `canonicalUrl` prop so the button also lights up when the same song is saved from another source purely by URL.
  - **URL mode** (Beatport Top 10 on artist/label pages): `externalUrl`, `externalTrackId` (numeric Beatport id), `snapshot` (title, artists, label, artwork, bpm, key, sample_url, origin…). Uses `toggleByUrl` so the save is stored as a `beatport_top` row with the snapshot embedded.
  - Shows a sign-up modal when the viewer is not logged in.
  - **Also rendered inside the global player** (`MiniPreviewBar` in `DeckAudioProvider`) for the track currently playing. Each `PreviewTrack` carries a `save: PreviewSaveData` payload (same discriminated union: `mode: 'ref'` / `mode: 'url'`) populated by the queue producers (`ChartView`, `TracksSection`, `BeatportTopTracks`, `CommunityMonthlyTop`) so the in-bar button shares the exact same `canonicalUrl`, `relatedRefs` and `snapshot` as the row that started the queue. Lets the user add/remove the song that is currently sounding without having to scroll back to its row.
- **`BeatportTopTracks`** (`src/components/BeatportTopTracks.tsx`) — renders a `SaveTrackButton` in URL mode on every row of the artist/label Top 10 accordion. Snapshot includes an `origin` object (`{kind: 'artist'|'label', id, slug, name}`) so My Tracks can later show where the song came from. The same `save` payload is attached to each `PreviewTrack` so the player's in-bar button operates on the exact same Beatport URL.
- **`TracksSection`** (`src/components/user/TracksSection.tsx`) — lives at `/mi-cuenta/tracks` and also powers `/u/<user>/tracks` via the `publicPayload` prop. Hydrates `beatport_top` rows directly from their embedded `snapshot` (no source-table JOIN needed). Features: sorting by artist / title / release date / added date; "Play all" + "Shuffle" for audio-only tracks; filter by **actual playback source** (Beatport / Bandcamp / YouTube) multi-select; seekable progress bar + prev/next; cross-source dedupe; COPY URL button to share your list. `toPreviewTrack` mirrors the per-row save logic (URL mode for shared-list `beatport_top` entries, ref mode with `relatedRefs` on the owner's list) so the in-bar `SaveTrackButton` operates on the same record the row would.
- **`TrackShareButton`** (`src/components/TrackShareButton.tsx`) — small 🔗 icon rendered **per row** on every surface that lists songs: `ChartView` (40 Breaks + New Releases), `TracksSection` (own list + `/u/<user>/tracks` public list) and `BeatportTopTracks` (artist + label Top 10). Prioritises `navigator.share` on mobile and falls back to `clipboard.writeText` with a ✓ confirmation. Helpers live in `src/lib/share-track.ts` (`buildTrackSharePath`, `buildBeatportSharePath`, `parsePlayParam`).

### Track-level deep-linking (share → autoplay on Optimal Breaks)

Problem this solves: sharing a song via Beatport / Bandcamp links sends the receiver **off** the site. The goal is that every shared song opens inside Optimal Breaks and starts playing immediately.

Single URL scheme per source:

| Source | Shared URL | Destination component |
|--------|-----------|------------------------|
| `chart` (40 Breaks Vitales) | `/[lang]/charts?week=<YYYY-MM-DD>&play=chart:<uuid>` | `ChartView` opens the matching weekly edition, scrolls + highlights the row and calls `playPreviewQueue` (via **`usePreviewAudioGated`** → loads engine if needed) |
| `featured` (New Releases) | `/[lang]/charts?week=<YYYY-MM-DD>&play=featured:<uuid>` | same as above |
| `beatport_top` (artist / label Top 10) | `/[lang]/<artists|labels>/<slug>?play=beatport:<beatportId>` | `BeatportTopTracks` expands the Top 10 accordion on that profile, scrolls to the row and calls `playPreviewQueue` |
| `vinyl` (Retro Vinyl Picks) | — no internal share — | stays on the external Discogs / YouTube link (iframe-only playback makes an autoplay link unreliable) |

`parsePlayParam` is defensive: accepts `1` (legacy autoplay flag from ⌘K), `chart:<uuid>`, `featured:<uuid>`, `beatport:<digits>`, `vinyl:<uuid>`; anything else returns `null` and the page renders normally.

The **admin users drawer** (`/[lang]/administrator/users` → click a Tracks count) uses this **same** URL scheme. A `beatport_top` save must open the artist/label ficha with `?play=beatport:<id>` (expand Top 10, scroll, highlight, autoplay) — **never** `canonical_url` / Beatport. Helpers: `buildBeatportTopInternalPath`, `resolveBeatportPlayId`, `beatportShareOriginFromSnapshot` in `src/lib/share-track.ts`. Origin comes from `snapshot.origin` (`kind` + `slug`); if an old save has `origin.id` but no slug, `GET /api/admin/users/[id]/engagement` resolves it. If the track has dropped out of that ficha’s current Top 10, the page still opens; highlight/autoplay no-ops.

**Server-side OG overrides.** The same `?play=<source>:<id>` is consumed by `generateMetadata`:

- `/[lang]/charts/page.tsx` → queries the `chart_tracks` / `chart_featured_tracks` row to build OG title `"Title (Mix) — Artists"`, description `"Listen to this track on Optimal Breaks · Label · Year"`, `og:image = artwork_url`.
- `/[lang]/artists/[slug]/page.tsx` and `/[lang]/labels/[slug]/page.tsx` → look up the track inside the cached `beatport_top_tracks` JSONB column and apply the same overrides (artwork, title, description) only when `?play=beatport:<id>` resolves; otherwise fall back to the default profile OG.

Net effect: when you paste the URL into WhatsApp / X / Signal, the preview shows the **track artwork and name** (not a generic chart / profile card), and clicking it lands on Optimal Breaks with the song already playing.

**Autoplay fallback.** Browsers block `audio.play()` with `NotAllowedError` when a shared link is opened in a new tab without prior user interaction on the site (Chrome MEI / Safari autoplay policy). Once **`LazyDeckAudioProvider`** has loaded **`DeckAudioProvider`**, the provider catches that specific error and flips `previewBlocked: true` (exposed on the full **`DeckAudioContext`** and on **`usePreviewAudio().previewBlocked`** — consumer pages use **`usePreviewAudioGated`**, which forwards to the live API after load). While `previewBlocked` is true the provider renders a full-screen **`PreviewAutoplayOverlay`** — a single "▶ TAP TO PLAY" card with the track artwork, title and artist. One tap calls `togglePreview()`, which counts as a gesture so `audio.play()` resolves and the overlay self-dismisses (`previewBlocked` is cleared on both a successful play and on `stopPreview`). Any other play error (bad URL, CORS, etc.) does **not** trigger the overlay.

**Cover art in the overlay.** Do not use a raw `<img src={artworkUrl}>` for Beatport CDN URLs: `geo-media.beatport.com` often returns **403** when hotlinked from a third-party page `Referer`. The overlay uses **`next/image`** with `fill` + `sizes` so the browser requests **`/_next/image?url=…`** — the same pattern as `ChartView` row thumbnails and `BeatportTopTracks`. Allowed hostnames must stay in **`next.config.js`** → `images.remotePatterns`. If the image still fails, `onError` sets local state and shows a **♪** placeholder instead of the browser's broken-image icon. State resets when `artworkUrl` changes (next track in queue).

### Admin stats

`/[lang]/administrator/tracks` aggregates saves **across all users** and displays:

- Total saved rows; totals per source; distinct canonical tracks.
- Top tracks / labels / artists by save count (dedupe by canonical key so cross-source copies count once).

Source of truth: `src/app/api/admin/tracks/route.ts` + page at `src/app/[lang]/administrator/tracks/page.tsx`. Also summarised on the main admin dashboard (`/administrator`) as a stat card.

### Admin users (list + engagement drawer)

`/[lang]/administrator/users` is Auth + `profiles` (not a public page). Columns include role, editorial artist level, **Favorites / Mixes / Tracks** counts and last activity. Clicking a non-zero count opens **`AdminUserEngagementDrawer`** (`src/components/admin/AdminUserEngagementDrawer.tsx`) with lazy tabs. API: `GET /api/admin/users/[id]/engagement?type=favorites|mixes|tracks` (`src/app/api/admin/users/[id]/engagement/route.ts`).

**Row links stay on Optimal Breaks** (same `?play=` as share / player):

| Saved source | Click destination |
|--------------|-------------------|
| `chart` / `featured` (live) | `/[lang]/charts?week=<YYYY-MM-DD>&play=<chart\|featured>:<uuid>` |
| `vinyl` (live) | `/[lang]/charts?play=vinyl:<uuid>` |
| `beatport_top` | `/[lang]/<artists\|labels>/<slug>?play=beatport:<id>` from `snapshot.origin` + Beatport numeric id. **Never** open Beatport for this source. |
| Orphan chart/featured/vinyl without enough context | last resort: `canonical_url` (external) |

Engagement payload for tracks includes `origin: { kind, slug } | null` and `beatport_url` so the drawer can build the internal path without re-reading JSONB on the client.

**Search** (`GET /api/admin/users?search=`):

- Matches **email** (Auth `listUsers`), **display_name** and **username** (`profiles` `ilike`). Email is not a column on `profiles`; a name-only filter made the first table column unsearchable.
- `AdminTable` **debounces** 280 ms while typing; **clearing the box (or ×) applies immediately** so a slow in-flight filter cannot leave “4 rows” on screen with an empty field.
- The users page **ignores stale responses** (monotonic request seq) and surfaces load errors. Placeholder: “Buscar por email, nombre o usuario…”.

List API: `src/app/api/admin/users/route.ts`. Client: `src/app/[lang]/administrator/users/page.tsx`. Editorial mark UI on `/administrator/users/[id]` is unchanged (see *Three account levels* below).

---

## Community Top (public, all-time)

**Campaign (26 Aug 2026):** registered users with few saves were emailed to use **My Tracks** (same `+`). Technique, design, SMTP: [`docs/GUIA_MAILS.md`](./GUIA_MAILS.md). Do not put community vote totals in that mail.

Public, on-demand ranking of every **"+" save** in **My Tracks** (`saved_chart_tracks`) **across all time**. One save = one click on `SaveTrackButton`. Page: **`/[lang]/top100`** (`src/app/[lang]/top100/page.tsx`). `/[lang]/charts` only keeps a teaser card that links there (the ranking used to sit under *Retro Vinyl Picks* inside `ChartView`). Originally a monthly window; switched to an all-time accumulator after calendar months kept "drying up" the ranking once active users had emptied that month's catalogue into their lists. The slug `community-monthly` is preserved for compatibility — both the endpoint and the component file keep the historical name even though they no longer expose any monthly window.

- **Endpoint:** `GET /api/public/charts/community-monthly?limit=N` (default `limit` 40, max 100 — the public page requests **100**). No `month` parameter — the response is always the all-time aggregate. **`top_tracks`** and **`top_artists`** (top **50** by save credits) come from the **same** pass over the same rows.
- **Component:** `src/components/CommunityMonthlyTop.tsx`. Two blocks: **most-saved artists** then the track list. Heading / kicker stay **«Top 10 artistas»** (not renamed when the list expands). First view shows **10** rows; **Cargar más** reveals the rest (up to 50); **Ver menos** at the bottom collapses back to 10 and smooth-scrolls to `#community-top-artists`. Each row: save credits · unique fans · unique tracks. Track block: header, summary chip with `tracks · fans · saves`, "play all" of available previews and a `SaveTrackButton` per row. Each track in the play-all queue also carries its own `save` payload (URL mode for `beatport_top` primaries, ref mode for the rest) so the global `MiniPreviewBar` exposes the same "+/✓" button for whichever song is currently sounding.
- **Aggregation:** reads **every** row of `saved_chart_tracks` (paginated server-side, 1000 per page), hydrates source metadata from `chart_tracks` / `chart_featured_tracks` / `chart_vinyl_tracks` (and from the embedded `snapshot` for `beatport_top` rows **and** for chart/featured/vinyl orphans), and groups by **canonical key** (same normalization as `/api/admin/tracks` and `useSavedChartTracks`). Track sort: **unique users first**, then total saves, then play count, then **most-recent save**, then alphabetical. Artist sort: save credits → unique users → unique tracks → name. **Remixer credits:** names in `artists[]` **plus** remixers parsed from `mix_name` / Beatport `remixers[]` (`src/lib/remixer-credits.ts`) each get one credit per save (deduped). *Original Mix* / *VIP Remix* / *Breakbeat Remix* do not invent a name. The **track** Top 100 is unchanged (still one row per song). UI (`ArtistNames` `mixName`) shows the remixer on `/top100`, `/charts`, My Tracks and artist/label lists.
- **Hydration `.in()` must be chunked (`IN_CHUNK = 200`, same helper pattern as `/api/public/user-tracks`).** A single PostgREST `.in('id', featIds)` with hundreds of New Releases UUIDs (GET URL / payload limit) **drops metadata**. Saves **without `snapshot`** then look like orphans and are discarded — the public totals fall below the real `saved_chart_tracks` count (seen August 2026: ~968 rows in DB vs ~803 on `/top100`; artist numbers such as Paket 17→15). **Do not** collapse those lookups back into one unchunked `.in()`. Check lookup errors (empty `data` + ignored `error` silently under-counts).
- **What counts / what does not:** `totals.saves` is the sum of hydratable rows (identity: Σ `save_count` == `totals.saves`). True orphans (source row gone **and** no snapshot / no remappable `canonical_url`) stay out of both the track list and the artist board — they cannot be rendered. Users with `profiles.is_tracks_public = false` are excluded. Migration `056_community_top_and_soulmates.sql` adds the `is_tracks_public` column (default `TRUE`) plus an `idx_sct_created` index (originally added for monthly windowing; still useful for the recency tie-break and any future filtering).
- **Self-credits (artist board + Soulmates — not the track Top 100):** see **Three account levels** below. If the account is **editorially marked** or has an **approved claim**, a save of a track where **they** are credited does **not** add a credit to *their* name on the artist board **and** does **not** enter *their* Jaccard set on Almas Gemelas. That same save **does** count toward the **track** Top 100 and stays in **My Tracks**. Collaborator names on the same track still get the artist-board credit. Their saves of **other** artists still count in Soulmates.

### Three account levels (normal / marked / claimed)

Product decision (agosto 2026): with a small save base, an artist can put themselves #1 on the artist board by saving their whole catalogue. Identity is **never** inferred from display name or email (an alias would dodge it; a fan named like an artist would be punished). The editor marks known accounts; a later **approved claim** is the same skip plus bookings.

| Level | How it happens | My Tracks | Track Top 100 | Artist board (own name) | Soulmates Jaccard | Bookings |
| --- | --- | --- | --- | --- | --- | --- |
| **1. Normal user** | Sign-up | Yes | Yes | Counts | All their saves | No |
| **2. Editorially marked** | Admin fichaje (`editorial_artist_marks`) | Yes | Yes | **Skip** that credit name | **Skip** tracks where they are credited; other saves count | **No** (`claimed_by` untouched) |
| **3. Claimed** | Approved `artist_claims` → `artists.claimed_by` | Yes | Yes | **Skip** (same as 2) | **Skip** (same as 2) | **Can** open (`accepts_bookings`, default **false** until they toggle) |

**If you mark first and they later claim:** they already had 2; claim adds 3.  
**If they claim with no prior mark:** approve → 2 + 3 in one step.  
**Revoke claim:** `claimed_by` / bookings go away; an editorial mark **stays** (phase 2 remains).

**Do not** write `claimed_by` to “fix the ranking”. That would treat them as verified for bookings RLS. The editorial table is a separate identity map: `user_id` + normalized credit key (`normalizeArtistKey`, e.g. `afghan headspin`, `gruv42`). A catalogue ficha (`artist_id`) is optional — the skip works without `/artists/<slug>`.

**Collabs and other artists:** the artist board stays ranked by **songs saved** (save credits), not by unique fans and not by a “1 credit per user per artist” cap. A marked/claimed account **does not** credit *their own* name. The same save **does** credit everyone else on the track — **including the remixer** — **unless** the editor also marked that account against the track’s **label** (`editorial_label_marks`). Example without a label mark: Afghan Headspin saves “Mamacita” (J-Break, Jan-B, Afghan Headspin) → **0** to Afghan Headspin, **+1** to J-Break and **+1** to Jan-B. With a label mark on **DIRTY KITCHEN RAVE**, that same save credits **nobody** on the artist board (My Tracks + track Top 100 unchanged). Saves of other labels still credit collaborators. Do **not** “fix” inflation by fichando the whole roster as artists, zeroing all of that account’s artist-board credits, or changing the sort to unique fans.

**What does not count as a fix**

- Matching name / username / email local-part automatically.
- Setting `is_tracks_public = false` (that also hides them from Soulmates and the rest of the community top).
- Deleting their “+” (they should still see the tracks in My Tracks).
- Auto-enabling `accepts_bookings` on claim approve (they opt in from Mi cuenta).
- Capping credits at 1 per `(user, artist)` or sorting the artist board by unique fans (the ranking is **songs saved**).
- Silencing a marked account’s votes for **other labels** (collaborators outside the fichado sello).

**Admin**

- List: `/[lang]/administrator/users` columns **Artista** — `—` / **Marcado** / **Reclamado** — and **Sello** — `—` / **Marcado**.
- Detail: `/[lang]/administrator/users/[id]` — add credit name (**Marcar artista (fase 2)**) or label name (**Marcar sello**). Claimed fichas listed read-only (bookings open/closed).
- API: `GET`/`PATCH /api/admin/users/[id]` with `editorial_artist_name` / `remove_editorial_artist_key` and `editorial_label_name` / `remove_editorial_label_key`.

**Implementation**

- Skip map: `src/lib/artist-self-credit.ts` (`loadSelfCreditSkipMap` = editorial rows + every `artists.claimed_by` name / `name_display` / slug). `isArtistSelfCreditSave` = that user is credited on the track (artists + remixer).
- Artist board: bump skip in `src/app/api/public/charts/community-monthly/route.ts` (live **and** Monday snapshots). Track aggregates unchanged. Label skip: if `shouldSkipLabelSave`, **no** artist credits from that save.
- Soulmates (26 Aug 2026): same self-credit tracks omitted from **that user’s** Jaccard set in `src/app/api/breakbeat/soulmates/route.ts`. Not from everyone else’s sets. Recommendations use the same filtered sets. Label marks do **not** change Soulmates.
- Schema: `supabase/migrations/070_editorial_artist_marks.sql` + `071_editorial_label_marks.sql` — service-role only (no policies for `anon` / `authenticated`), same idea as `booking_sender_bans`.
- Bookings product stays in [`docs/GUIA_IMPLEMENTACION_BOOKINGS.md`](./GUIA_IMPLEMENTACION_BOOKINGS.md). Cursor rule: `.cursor/rules/top100-auto-voto-artistas.mdc`.

### Editorial marks in production (ops)

How to mark: `/[lang]/administrator/users` → open the row → **Marcar artista (fase 2)** with the **credit name** as it appears on tracks (`Devis Hard`, not the email). That upserts `editorial_artist_marks` (`user_id` + `normalizeArtistKey`). Optional `artist_id` if `/artists/<slug>` exists. **Do not** write `claimed_by` or flip `accepts_bookings`.

**Marcar sello:** same page → **Marcar sello** with the label string as it appears on tracks (`DIRTY KITCHEN RAVE`). Upserts `editorial_label_marks`. Optional `label_id` if `/labels/<slug>` exists. Not an ownership claim — it is a conduct mark (owner, roster artist, or erratic dump).

Identity is **never** guessed from display name or email. Look the row up in Usuarios. Known email traps (do not invent the local-part):

| Wrong guess | Real email |
| --- | --- |
| `afganheadspin@…` | `afghanheadspin@gmail.com` |
| `gruv42ruv42@…` | `gruv42@me.com` |
| `ranniadj@…` | `aranniadj@gmail.com` |

Marks live in BD (25 Aug 2026). Add a row here when you fichas someone new.

| Email | Credit name | `artist_key` | Slug | `user_id` |
| --- | --- | --- | --- | --- |
| `afghanheadspin@gmail.com` | Afghan Headspin | `afghan headspin` | `afghan-headspin` | `4df84b27-8162-493e-8bbd-67284b277513` |
| `gruv42@me.com` | Gruv42 | `gruv42` | `gruv42` | `535d437f-5641-42aa-8c0a-a939ded2f6c3` |
| `aranniadj@gmail.com` | Lady Arannia | `lady arannia` | `lady-arannia` | `18673d03-b462-4ddd-a56f-06a5f388c555` |
| `davisoto@hotmail.com` | Devis Hard | `devis hard` | `devis-hard` | `9b83800a-5a40-4cdd-9e3d-f4b1a61160af` |

**Label marks** (26 Aug 2026). Add a row when you fichas a account+label.

| Email | Label as on tracks | `label_key` | `user_id` |
| --- | --- | --- | --- |
| `afghanheadspin@gmail.com` | DIRTY KITCHEN RAVE | `dirty kitchen rave` | `4df84b27-8162-493e-8bbd-67284b277513` |

**How to read a row that is still high after a mark.** `20 saves · 3 fans · 18 tracks` is **not** that account’s library. The skip already dropped their self-credits. Remaining credits are **other** public users (`is_tracks_public`). With a small base, the editorial login (`contacto@eskaladigital.com`, display **Optimal Breaks**) often dominates. Do **not** treat a leftover #7 as a broken skip, and do **not** hide the list or cap credits to “fix” it.

**Audit — Afghan Headspin (25 Aug 2026).** First case: he saved his catalogue and sat #1. After the artist mark, **24** of his own «+» were skipped (Darkness, Mamacita, Ghost Mode, …). The board then showed **20 saves · 3 fans · 18 tracks**:

| Fan | Email | Role | Saves that still credit him |
| --- | --- | --- | --- |
| Optimal Breaks | `contacto@eskaladigital.com` | admin | **16** (Negative Spit, ACIDICA, Mamacita, JUMP, Need To Believe, Let It Be, ROMERO, Mind Control remix, Work It, Know How, Darkness VIP + original, Say Wannabe, Ghost Mode, ILL Behavior, Fly So High) |
| MestasDeejay | `mestasdeejay@gmail.com` | admin | **3** (Let It Be, My apocolypse, Wildcat) |
| jennie | `jenniev52@outlook.com` | user | **1** (Let It Be) |

16 + 3 + 1 = 20. Eighteen tracks because *Let It Be* is shared. His Mis Tracks and the **song** Top 100 still include his 24 saves.

**Audit — DKR dump (26 Aug 2026).** The same account had **107** public saves, **95** on DIRTY KITCHEN RAVE, injecting **132** artist-board credits (WeZ WhaTevR 18, J-Break 14, Kid Ellipsis 10, DJ Brownie 8, …). J-Break sat **#1** (35 saves, 14 from Afghan). After the label mark, those DKR saves credit nobody on the artist board. Collabs on **other** labels (Darkness / Raveart, Work It / Elektroshok, Fly So High / 13monkeys) still count.

### Artist board — weekly movement (not daily)

Same visual language as **40 Breaks Vitales** (`ChartView` `MovementIndicator`): **NUEVO** / **▲ N** / **▼ N** / **═**, plus a weeks label. The ranking itself stays **all-time**.

- **Two clocks (do not mix them):**
  - **The list is live.** Rank #1 / #4 / #12 updates as soon as someone saves (or unsaves). The page does **not** wait until next Monday to move a name.
  - **The variation is Monday-to-Monday.** Arrows compare **live rank now** vs **rank at this ISO Monday 00:00 UTC** (saves with `created_at` before that cutoff). ═ means “same as Monday”, not “same as yesterday”.
- **Cadence:** **weekly**, not daily. Same week boundary as the editorial charts. Next Monday a new baseline is taken.
- **Live inside the week:** because “now” keeps moving, arrows can change mid-week (e.g. Monday #4 → Thursday #3 → **▲ 1**). The Monday snapshot stays fixed until the following Monday.
- **No snapshot table / no cron.** Rebuilt on each request from `saved_chart_tracks.created_at` (`artistMondaySnapshots` in `community-monthly/route.ts`). `idx_sct_created` (migration **056**) helps the recency tie-break and this reconstruction.
- **Caveat:** an unsave **deletes** the row, so last week’s reconstructed board is “current remaining saves before Monday”, not a photographic archive of what was on screen then.

**API fields on each `top_artists` row**

| Field | Meaning |
| --- | --- |
| `previous_rank` | Rank on this board (top 50) at Monday 00:00 UTC. `null` = was **not** in last week’s top 50 → UI **NUEVO**. |
| `weeks_in_top10` | Consecutive ISO weeks **on the board** (the 50), **not** weeks at the current rank. Field name is historical (the board used to be 10). UI label `X sem.` on ranks 2–50 when `> 1`. |
| `weeks_at_1` | Consecutive ISO weeks at **#1** only. UI label `X sem. nº 1` when the leader has `> 1`. |

**UI**

- On-page copy: `charts.community_monthly.artists_subtitle` (ES/EN) states live list + Monday-to-Monday arrows.
- Arrows = this week’s **position change** vs Monday. Weeks = **tenure** (board vs throne).
- Rank **#1** box is always red. One editorial line under the subtitle, #1 only: new leader / climbs to #1 / holds / streak (≥ 4 weeks at #1). Copy in `charts.community_monthly` (`leader_new`, `leader_climbs`, `leader_holds`, `leader_streak`).
- Movement is **not** shown on the Top 100 **tracks** list.

---

## Soulmates ("Almas Gemelas")

User-facing affinity tool inspired by FilmAffinity's *Almas Gemelas*: the user's saved tracks are crossed against everyone else's to surface the people whose lists overlap the most, plus the tracks those people have that the user is missing.

- **Page:** `/[lang]/mi-cuenta/almas-gemelas` → `src/app/[lang]/mi-cuenta/almas-gemelas/page.tsx` mounting `SoulmatesSection` inside `UserSectionShell`.
- **Component:** `src/components/user/SoulmatesSection.tsx` — top 10 cards with avatar, % Jaccard, common-count, sample of common tracks and CTA to the public list (`/u/<id>/tracks`); plus a "What you're missing" list with up to 25 recommended tracks.
- **Endpoint:** `GET /api/breakbeat/soulmates` (authenticated). Builds, per public user, the set of canonical keys they have saved and computes Jaccard against the requester's set. Thresholds: requester ≥ 5 saves, candidate ≥ 3 saves, intersection ≥ 2 tracks. Recommendations require ≥ 2 soulmates having the track.
- **Self-credits (closed 26 Aug 2026):** a **marked** or **claimed** account does **not** put tracks where **they** are credited into their Jaccard set (catalogue dump would make them everyone’s soulmate). Those «+» stay in My Tracks and the track Top 100. Saves of other artists still count. Same helper as the artist board (`isArtistSelfCreditSave`). Do **not** hide the account (`is_tracks_public`) or drop their whole list.
- **Privacy contract:**
  - The user must have `profiles.is_tracks_public = TRUE` themselves (otherwise the endpoint returns `disabled: true` + reason `'private'` and the UI renders an "Activate" button that flips the flag).
  - Only candidates with `is_tracks_public = TRUE` are considered.
  - The detailed list is **never** included in the soulmates payload — only counts, percentages and a small sample of common-track titles. Anyone wanting the full list still has to follow the public link `/u/<id>/tracks` (which is itself opt-out via the same flag, since it's already public-by-link only).
- **UI controls:** the toggle lives on `/[lang]/mi-cuenta/perfil` ("Lista pública para Almas Gemelas y Top de la Comunidad"). It writes `profiles.is_tracks_public` via `useProfile().update`.

---

## Artist: "seen live" (valoración con estrellas)

- **Component:** `src/components/SeenLiveButton.tsx`
- **Hook:** `useArtistSightings()` in `src/hooks/useUserData.ts`
- User records that they saw the artist live, with **mandatory 1–5 rating** and optional fields (date, venue, event, notes).
- Listed under **SEEN LIVE / VISTOS EN VIVO** (`/mi-cuenta/vistos-en-vivo`) and aggregated with event ratings under **REVIEWS / RESEÑAS** (`/mi-cuenta/resenas`).

---

## Event: attendance vs rating

- **Attendance** (no numeric score): `EventStatusButton` → `event_attendance` (`wishlist` | `attending` | `attended`).
- **Rating + review:** `EventReviewButton` on `/[lang]/events/[slug]` calls `useEventRatings().rate(eventId, { rating, review, attended_at, venue, city, country })` → `event_ratings`. One row per user per event (upsert).

---

## Favorites vs ratings vs saves

- **Favorite** = bookmark / "I like this" — no stars (artists, labels, events, mixes).
- **Save** = "+" on a chart row — adds it to My Tracks, no stars (`saved_chart_tracks`).
- **Rating (1–5)** = **only** **seen live** (artist) and **event review** (event) — both are "I was there" experiences.

---

## Fan counter

`FanCounter` shows aggregate counts from favorites / attendance (events), not an extra user action.

---

## Code pointers

- `src/hooks/useUserData.ts` — every user hook: favorites, sightings, attendance, event ratings, **saved_chart_tracks** (`useSavedChartTracks`), **Breakbeat DNA** (`useBreakbeatProfile`).
- `src/components/user/` — `UserSectionShell`, `OverviewSection` (**`BreakbeatDNA`**), `FavoritesSection`, `SightingsSection`, `EventsSection`, `ReviewsSection`, `MixesSection`, `TracksSection`, **`SoulmatesSection`**, `ProfileSection`.
- `src/app/api/breakbeat-profile/route.ts` — generate + upsert DNA (user JWT; RLS applies).
- `src/components/FavoriteButton.tsx`, `SeenLiveButton.tsx`, `EventStatusButton.tsx`, `EventReviewButton.tsx`, **`SaveTrackButton.tsx`**, **`TrackShareButton.tsx`**.
- `src/lib/share-track.ts` — builders + parser for `?play=<source>:<id>` URLs (chart / featured / beatport / vinyl); **`buildBeatportTopInternalPath`**, **`resolveBeatportPlayId`**, **`beatportShareOriginFromSnapshot`** for Top 10 fichas; **`formatTrackReleaseDisplay`** for saved-track release lines.
- `src/components/ChartView.tsx` — renders the three chart sections (chart / featured / vinyl), hosts the `canonicalGroups` memo that feeds `relatedRefs` to every `SaveTrackButton`, and resolves `?week=…&play=<source>:<id>` deep-links into scroll + highlight + `playPreviewQueue`.
- `src/components/BeatportTopTracks.tsx` — resolves `?play=beatport:<id>` inside the artist/label profile (expand accordion + scroll + autoplay) and embeds a `TrackShareButton` per row.
- `src/app/api/public/user-tracks/route.ts` — read-only public payload for shared lists; joins `chart_editions` to expose `week_date` so the client can build share links.
- `src/app/api/admin/tracks/route.ts` — aggregated admin stats.
- `src/app/api/admin/users/route.ts` — admin user list (search by email + name + username; sortable counts).
- `src/app/api/admin/users/[id]/engagement/route.ts` — favorites / mixes / saved tracks for the users drawer (`origin` + `beatport_url` on `beatport_top` rows).
- `src/components/admin/AdminUserEngagementDrawer.tsx` — drawer from `/administrator/users`; internal `?play=` links (Beatport Top 10 → ficha, not Beatport.com).
- `src/components/admin/AdminTable.tsx` — shared admin table; search debounce + immediate clear.
- `src/app/[lang]/administrator/users/page.tsx` — users list (stale-response guard).
- `src/components/LazyDeckAudioProvider.tsx` — gate + dynamic import of the audio engine; **`PendingActionRunner`** for first-play deep links. Keeps a **stable shell** around `{children}` (`engineOnly` + `onBind`) so the first Play doesn't remount the page tree (the weekly accordion in `/charts` preserves `openPicks` / `openForty`). **Portals** the player overlays to `<div id="ob-audio-overlays">` under `document.body` so `position: fixed` always resolves against the viewport.
- `src/components/deck-audio-context.ts` — shared `DeckAudioContext` so the lazy provider and the engine module publish/consume the same value without import cycles.
- `src/hooks/useGatedDeckAudio.ts` — **`usePreviewAudioGated`**, **`useMixAudioGated`** for list UIs before the engine is mounted.
- `src/components/DeckAudioProvider.tsx` — global preview `<audio>` + **`MiniPreviewBar`**; **`previewBlocked`** flag and **`PreviewAutoplayOverlay`** when `audio.play()` hits `NotAllowedError` (shared links in a new tab); overlay artwork via **`next/image`** (`/_next/image`) + ♪ placeholder on `onError`; **`usePreviewAudio()`** / **`usePreviewAudioMaybe()`** re-export preview API (gated hook delegates here after load). Supports an **`engineOnly`** mode that returns `null` and reports its context value / overlays via `onBind`. `MiniPlayerShell` reads **`useViewportBottomOffset`** so the bar stays glued to the visible bottom edge in iOS PWA standalone after lock/unlock, orientation change or returning from Web Share (Facebook / WhatsApp / etc.).
- `src/components/BackToTop.tsx` — same `useViewportBottomOffset` compensation as the player so the up-arrow doesn't float mid-screen in PWA after sleep/wake or share-and-return.
- `src/hooks/useViewportBottomOffset.ts` — shared hook for the iOS PWA viewport drift fix. Listens to `visualViewport.resize/scroll`, `pageshow`, `focus`, `orientationchange`, `visibilitychange` and re-measures at 80/250/600 ms after each wake event.
- `src/app/[lang]/top100/page.tsx` — public Community Top 100 page.
- `src/app/api/public/charts/community-monthly/route.ts` — Community Top (public, all-time; slug preserved; **chunked `.in()`**; artist movement rebuilt from `created_at` vs ISO Monday UTC; **self-credits skipped** via `artist-self-credit.ts`; **remixer names** from `mix_name` via `remixer-credits.ts`).
- `src/lib/remixer-credits.ts` — parse remixer names from `mix_name`; merge Beatport `remixers[]` into `artists[]` (scripts copy: `scripts/lib/remixer-credits.mjs`).
- `src/lib/artist-related-content.ts` — artist/label chart links + New Releases accordion (`fetchArtistFeaturedPicks` matches `artist_names_text` **or** remixer in `mix_name`).
- `src/lib/artist-self-credit.ts` — skip map (editorial artist marks + `claimed_by`; editorial label marks); artist-board bump + Soulmates Jaccard (`isArtistSelfCreditSave`). Label skip is artist-board only (`shouldSkipLabelSave`). Live marks + Afghan/DKR audit: *Editorial marks in production* above.
- `src/app/api/admin/users/[id]/route.ts` — user detail + editorial artist/label mark / unmark.
- `src/components/CommunityMonthlyTop.tsx` — `/top100` UI (artist board 10→50 + track list).
- `supabase/migrations/070_editorial_artist_marks.sql` — `editorial_artist_marks` (phase 2, no bookings).
- `supabase/migrations/071_editorial_label_marks.sql` — `editorial_label_marks` (conduct mark, artist-board skip for that label).
- `src/app/api/breakbeat/soulmates/route.ts` — Soulmates affinity (authenticated).
- `supabase/migrations/053_saved_chart_tracks.sql` — table + RLS.
- `supabase/migrations/056_community_top_and_soulmates.sql` — `profiles.is_tracks_public` + `idx_sct_created`.
- `supabase/migrations/064_breakbeat_profiles_rls.sql` — `breakbeat_profiles` shape (IF NOT EXISTS) + **owner-only RLS** + revoke `anon`.
- `supabase/migrations/057_chart_featured_tracks_release_date.sql` — `chart_featured_tracks.release_date DATE` (full publish day for *New Releases*; complements the existing `release_year`). The same field also lives in `chart_tracks.release_date` and inside `artists.beatport_top_tracks` / `labels.beatport_top_tracks` JSONB so every list (including *My Tracks*, the public shared list, Community Top, Soulmates recommendations and admin stats) can render `YYYY-MM-DD`.

### Release-date display in saved snapshots

Every consumer of `saved_chart_tracks` (My Tracks own + public, Community Top, Soulmates recommendations, admin Tracks dashboard) renders the full publish day via the helper **`formatTrackReleaseDisplay(release_date, release_year)`** in `src/lib/share-track.ts`. The fallbacks are explicit:

1. `release_date` matches `YYYY-MM-DD` → render `YYYY-MM-DD`.
2. Else `release_year` → render the year as string.
3. Else `null` → render nothing.

`saved_chart_tracks.snapshot` carries `release_date` for `beatport_top` saves so the date survives even after the source row is rotated out of `artists.beatport_top_tracks`. The reverse path (filling `release_date` on **pre-existing** snapshots) is `scripts/saved-tracks-backfill.mjs`, which performs an **additive merge** (`mergeSnapshotAdditive`): only missing fields get written, user-visible metadata is never overwritten. Flag **`--scrape-beatport`** scrapes Beatport directly for `beatport_top` saves whose snapshot lacks the date and whose origin artist/label JSONB no longer carries the track. Sorting on `My Tracks → release` is deterministic via **`releaseSortTimestampMs`** (UTC milliseconds: day precision when known, Jan 1 of the year otherwise) so two saves added the same week sort by **release date**, not by `created_at`.
