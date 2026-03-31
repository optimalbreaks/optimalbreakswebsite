-- Optional context for "I was there" (parity with artist_sightings-style modal)
ALTER TABLE public.event_ratings
  ADD COLUMN IF NOT EXISTS attended_at date,
  ADD COLUMN IF NOT EXISTS venue text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS city text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS country text NOT NULL DEFAULT '';
