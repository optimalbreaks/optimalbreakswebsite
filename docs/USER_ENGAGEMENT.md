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
| `/[lang]/mi-cuenta/perfil` | Profile editing, sign-out, **privacy toggle** for Soulmates / Monthly Top |
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
| **Breakbeat profile** | N/A | Dashboard Overview (generate) | `breakbeat_profiles` | Needs enough favorites **and** saved tracks to unlock |

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
- **`BeatportTopTracks`** (`src/components/BeatportTopTracks.tsx`) — renders a `SaveTrackButton` in URL mode on every row of the artist/label Top 10 accordion. Snapshot includes an `origin` object (`{kind: 'artist'|'label', id, slug, name}`) so My Tracks can later show where the song came from.
- **`TracksSection`** (`src/components/user/TracksSection.tsx`) — lives at `/mi-cuenta/tracks` and also powers `/u/<user>/tracks` via the `publicPayload` prop. Hydrates `beatport_top` rows directly from their embedded `snapshot` (no source-table JOIN needed). Features: sorting by artist / title / release date / added date; "Play all" + "Shuffle" for audio-only tracks; filter by **actual playback source** (Beatport / Bandcamp / YouTube) multi-select; seekable progress bar + prev/next; cross-source dedupe; COPY URL button to share your list.
- **`TrackShareButton`** (`src/components/TrackShareButton.tsx`) — small 🔗 icon rendered **per row** on every surface that lists songs: `ChartView` (40 Breaks + New Releases), `TracksSection` (own list + `/u/<user>/tracks` public list) and `BeatportTopTracks` (artist + label Top 10). Prioritises `navigator.share` on mobile and falls back to `clipboard.writeText` with a ✓ confirmation. Helpers live in `src/lib/share-track.ts` (`buildTrackSharePath`, `buildBeatportSharePath`, `parsePlayParam`).

### Track-level deep-linking (share → autoplay on Optimal Breaks)

Problem this solves: sharing a song via Beatport / Bandcamp links sends the receiver **off** the site. The goal is that every shared song opens inside Optimal Breaks and starts playing immediately.

Single URL scheme per source:

| Source | Shared URL | Destination component |
|--------|-----------|------------------------|
| `chart` (40 Breaks Vitales) | `/[lang]/charts?week=<YYYY-MM-DD>&play=chart:<uuid>` | `ChartView` opens the matching weekly edition, scrolls + highlights the row and calls `playPreviewQueue` |
| `featured` (New Releases) | `/[lang]/charts?week=<YYYY-MM-DD>&play=featured:<uuid>` | same as above |
| `beatport_top` (artist / label Top 10) | `/[lang]/<artists|labels>/<slug>?play=beatport:<beatportId>` | `BeatportTopTracks` expands the Top 10 accordion on that profile, scrolls to the row and calls `playPreviewQueue` |
| `vinyl` (Retro Vinyl Picks) | — no internal share — | stays on the external Discogs / YouTube link (iframe-only playback makes an autoplay link unreliable) |

`parsePlayParam` is defensive: accepts `1` (legacy autoplay flag from ⌘K), `chart:<uuid>`, `featured:<uuid>`, `beatport:<digits>`; anything else returns `null` and the page renders normally.

**Server-side OG overrides.** The same `?play=<source>:<id>` is consumed by `generateMetadata`:

- `/[lang]/charts/page.tsx` → queries the `chart_tracks` / `chart_featured_tracks` row to build OG title `"Title (Mix) — Artists"`, description `"Listen to this track on Optimal Breaks · Label · Year"`, `og:image = artwork_url`.
- `/[lang]/artists/[slug]/page.tsx` and `/[lang]/labels/[slug]/page.tsx` → look up the track inside the cached `beatport_top_tracks` JSONB column and apply the same overrides (artwork, title, description) only when `?play=beatport:<id>` resolves; otherwise fall back to the default profile OG.

Net effect: when you paste the URL into WhatsApp / X / Signal, the preview shows the **track artwork and name** (not a generic chart / profile card), and clicking it lands on Optimal Breaks with the song already playing.

**Autoplay fallback.** Browsers block `audio.play()` with `NotAllowedError` when a shared link is opened in a new tab without prior user interaction on the site (Chrome MEI / Safari autoplay policy). `DeckAudioProvider` catches that specific error and flips `previewBlocked: true` (exposed on the context + `usePreviewAudio` hook). While `previewBlocked` is true the provider renders a full-screen `PreviewAutoplayOverlay` — a single "▶ TAP TO PLAY" card with the track artwork, title and artist. One tap calls `togglePreview()`, which counts as a gesture so `audio.play()` resolves and the overlay self-dismisses (`previewBlocked` is cleared on both a successful play and on `stopPreview`). Any other play error (bad URL, CORS, etc.) does **not** trigger the overlay.

### Admin stats

`/[lang]/administrator/tracks` aggregates saves **across all users** and displays:

- Total saved rows; totals per source; distinct canonical tracks.
- Top tracks / labels / artists by save count (dedupe by canonical key so cross-source copies count once).

Source of truth: `src/app/api/admin/tracks/route.ts` + page at `src/app/[lang]/administrator/tracks/page.tsx`. Also summarised on the main admin dashboard (`/administrator`) as a stat card.

---

## Community Monthly Top (public)

Public, on-demand ranking of the most-saved tracks for a calendar month, rendered inside `ChartView` **after** *Retro Vinyl Picks*.

- **Endpoint:** `GET /api/public/charts/community-monthly?month=YYYY-MM&limit=N` (default `month` = current UTC month, `limit` 30, max 100).
- **Component:** `src/components/CommunityMonthlyTop.tsx`. Selector with the last 12 months (months without saves are disabled), play-all of available previews and `SaveTrackButton` per row so a logged-in user can add the track to their own list with one click.
- **Aggregation:** reads every row of `saved_chart_tracks` whose `created_at` falls inside the requested month, hydrates source metadata from `chart_tracks` / `chart_featured_tracks` / `chart_vinyl_tracks` (and from the embedded `snapshot` for `beatport_top` rows), and groups by **canonical key** (same normalization as `/api/admin/tracks` and `useSavedChartTracks`). Sorting: **unique users first**, then total saves, then alphabetical.
- **Privacy:** users with `profiles.is_tracks_public = false` are excluded from both the ranking and the available-months histogram. Migration `056_community_top_and_soulmates.sql` adds the `is_tracks_public` column (default `TRUE`) plus an `idx_sct_created` index for monthly windowing.

---

## Soulmates ("Almas Gemelas")

User-facing affinity tool inspired by FilmAffinity's *Almas Gemelas*: the user's saved tracks are crossed against everyone else's to surface the people whose lists overlap the most, plus the tracks those people have that the user is missing.

- **Page:** `/[lang]/mi-cuenta/almas-gemelas` → `src/app/[lang]/mi-cuenta/almas-gemelas/page.tsx` mounting `SoulmatesSection` inside `UserSectionShell`.
- **Component:** `src/components/user/SoulmatesSection.tsx` — top 10 cards with avatar, % Jaccard, common-count, sample of common tracks and CTA to the public list (`/u/<id>/tracks`); plus a "What you're missing" list with up to 25 recommended tracks.
- **Endpoint:** `GET /api/breakbeat/soulmates` (authenticated). Builds, per public user, the set of canonical keys they have saved and computes Jaccard against the requester's set. Thresholds: requester ≥ 5 saves, candidate ≥ 3 saves, intersection ≥ 2 tracks. Recommendations require ≥ 2 soulmates having the track.
- **Privacy contract:**
  - The user must have `profiles.is_tracks_public = TRUE` themselves (otherwise the endpoint returns `disabled: true` + reason `'private'` and the UI renders an "Activate" button that flips the flag).
  - Only candidates with `is_tracks_public = TRUE` are considered.
  - The detailed list is **never** included in the soulmates payload — only counts, percentages and a small sample of common-track titles. Anyone wanting the full list still has to follow the public link `/u/<id>/tracks` (which is itself opt-out via the same flag, since it's already public-by-link only).
- **UI controls:** the toggle lives on `/[lang]/mi-cuenta/perfil` ("Lista pública para Almas Gemelas y Top Mensual"). It writes `profiles.is_tracks_public` via `useProfile().update`.

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

- `src/hooks/useUserData.ts` — every user hook: favorites, sightings, attendance, event ratings, **saved_chart_tracks** (`useSavedChartTracks`).
- `src/components/user/` — `UserSectionShell`, `OverviewSection`, `FavoritesSection`, `SightingsSection`, `EventsSection`, `ReviewsSection`, `MixesSection`, `TracksSection`, **`SoulmatesSection`**, `ProfileSection`.
- `src/components/FavoriteButton.tsx`, `SeenLiveButton.tsx`, `EventStatusButton.tsx`, `EventReviewButton.tsx`, **`SaveTrackButton.tsx`**, **`TrackShareButton.tsx`**.
- `src/lib/share-track.ts` — builders + parser for `?play=<source>:<id>` URLs (chart / featured / beatport).
- `src/components/ChartView.tsx` — renders the three chart sections (chart / featured / vinyl), hosts the `canonicalGroups` memo that feeds `relatedRefs` to every `SaveTrackButton`, and resolves `?week=…&play=<source>:<id>` deep-links into scroll + highlight + `playPreviewQueue`.
- `src/components/BeatportTopTracks.tsx` — resolves `?play=beatport:<id>` inside the artist/label profile (expand accordion + scroll + autoplay) and embeds a `TrackShareButton` per row.
- `src/app/api/public/user-tracks/route.ts` — read-only public payload for shared lists; joins `chart_editions` to expose `week_date` so the client can build share links.
- `src/app/api/admin/tracks/route.ts` — aggregated admin stats.
- `src/app/api/public/charts/community-monthly/route.ts` — Community Monthly Top (public).
- `src/app/api/breakbeat/soulmates/route.ts` — Soulmates affinity (authenticated).
- `supabase/migrations/053_saved_chart_tracks.sql` — table + RLS.
- `supabase/migrations/056_community_top_and_soulmates.sql` — `profiles.is_tracks_public` + `idx_sct_created`.
