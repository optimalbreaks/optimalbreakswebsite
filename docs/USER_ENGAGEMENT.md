# User engagement: favorites, ratings, attendance (Optimal Breaks)

What a **logged-in user** can do today on the public site and in **My Breaks** (`/[lang]/dashboard`), and which Supabase tables are involved.

**ES:** Misma información; términos UI en inglés/español según diccionario del sitio.

---

## Product policy: who gets 1–5 stars?

**Only experiences you can physically go to** — things that happen in real life:

| Stars? | Entity | Why |
|--------|--------|-----|
| **Yes** | **Artists** | “I saw this DJ / act **live**” (`artist_sightings`). |
| **Yes** | **Events** | “I **went to** this party / festival / club night” (`event_ratings`). |

**No star ratings** (bookmark / save only): **labels**, **mixes**, **blog posts**, **scenes**, etc. Favorites and saves stay **binary** (heart / save) — no numeric score. The schema and UI intentionally do **not** add `label_ratings` or `mix_ratings`.

---

## Summary table

| Action | Stars / score? | Where in UI | Table(s) | Notes |
|--------|----------------|-------------|----------|--------|
| **Favorite artist** | No (binary) | Heart on artist page; Favorites tab | `favorite_artists` | Drives “fan” aggregate via `FanCounter` |
| **Favorite label** | No | Heart on label page | `favorite_labels` | “Followers” count |
| **Favorite event** | No | Heart on event cards/pages | `favorite_events` | |
| **Save mix** | No | Save on mixes | `saved_mixes` | “Saves” count |
| **Seen live (artist)** | **Yes — 1–5** + optional text | **SEEN LIVE** on artist page (`SeenLiveButton`) | `artist_sightings` | Date, venue, city, country, event name, **rating**, **notes** |
| **Event status** | No (state machine) | Event page: wishlist / going / attended | `event_attendance` | Toggles only; “interested” style counts for events |
| **Rate + review event** | **Yes — 1–5** + optional review text | Event page: **`EventReviewButton`** (RATE / VALORAR) — same modal pattern as seen live: date, venue, city, country, stars, notes | `event_ratings` (+ optional `attended_at`, `venue`, `city`, `country` after migration **`032_event_ratings_attendance_fields.sql`**) | Dashboard **Reviews** + **Events**; apply migration on Supabase or upsert errors |
| **Breakbeat profile** | N/A | Dashboard Overview (generate) | `breakbeat_profiles` (if used) | Needs enough favorites to unlock |

---

## Artist: “seen live” (valoración con estrellas)

- **Component:** `src/components/SeenLiveButton.tsx`
- **Hook:** `useArtistSightings()` in `src/hooks/useUserData.ts`
- User records that they saw the artist live, with **mandatory 1–5 rating** and optional fields (date, venue, event, **notes**).
- Listed under dashboard **SEEN LIVE / VISTOS EN VIVO** and duplicated for readability under **REVIEWS / RESEÑAS** (with event reviews).

---

## Event: attendance vs rating

- **Attendance** (no numeric score): `EventStatusButton` → `event_attendance` (`wishlist` | `attending` | `attended`).
- **Rating + review:** `EventReviewButton` on **`/[lang]/events/[slug]`** calls `useEventRatings().rate(eventId, { rating, review, attended_at, venue, city, country })` → `event_ratings`. One row per user per event (upsert).

---

## Favorites vs ratings

- **Favorite** = bookmark / “I like this” — no stars (artists, labels, events, mixes).
- **Rating (1–5)** = **only** **seen live** (artist) and **event review** (event) — both are “I was there” experiences.

---

## Fan counter

- `FanCounter` shows aggregate counts from favorites / attendance (events), not an extra user action.

---

## Code pointers

- `src/hooks/useUserData.ts` — favorites, sightings, attendance, event ratings
- `src/app/[lang]/dashboard/DashboardClient.tsx` — tabs: Overview, Favorites, Seen Live, Events, Reviews, Mixes, Profile
- `src/components/FavoriteButton.tsx`, `SeenLiveButton.tsx`, `EventStatusButton.tsx`, `EventReviewButton.tsx`
