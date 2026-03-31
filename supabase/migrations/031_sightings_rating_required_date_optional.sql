-- Make seen_at optional (user may not remember the date)
ALTER TABLE public.artist_sightings
  ALTER COLUMN seen_at DROP NOT NULL;

-- Back-fill existing rows that have NULL rating before adding NOT NULL
UPDATE public.artist_sightings SET rating = 3 WHERE rating IS NULL;

-- Make rating required (minimum 1 star to save a sighting)
ALTER TABLE public.artist_sightings
  ALTER COLUMN rating SET NOT NULL;
