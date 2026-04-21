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
| `/[lang]/mi-cuenta/perfil` | Profile editing, sign-out |
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

### Admin stats

`/[lang]/administrator/tracks` aggregates saves **across all users** and displays:

- Total saved rows; totals per source; distinct canonical tracks.
- Top tracks / labels / artists by save count (dedupe by canonical key so cross-source copies count once).

Source of truth: `src/app/api/admin/tracks/route.ts` + page at `src/app/[lang]/administrator/tracks/page.tsx`. Also summarised on the main admin dashboard (`/administrator`) as a stat card.

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
- `src/components/user/` — `UserSectionShell`, `OverviewSection`, `FavoritesSection`, `SightingsSection`, `EventsSection`, `ReviewsSection`, `MixesSection`, `TracksSection`, `ProfileSection`.
- `src/components/FavoriteButton.tsx`, `SeenLiveButton.tsx`, `EventStatusButton.tsx`, `EventReviewButton.tsx`, **`SaveTrackButton.tsx`**.
- `src/components/ChartView.tsx` — renders the three chart sections (chart / featured / vinyl) and hosts the `canonicalGroups` memo that feeds `relatedRefs` to every `SaveTrackButton`.
- `src/app/api/public/user-tracks/route.ts` — read-only public payload for shared lists.
- `src/app/api/admin/tracks/route.ts` — aggregated admin stats.
- `supabase/migrations/053_saved_chart_tracks.sql` — table + RLS.
