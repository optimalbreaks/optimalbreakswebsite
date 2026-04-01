-- Año de publicación del lanzamiento según Beatport (derivado de publish_date / new_release_date en el scrape).
ALTER TABLE public.chart_tracks
  ADD COLUMN IF NOT EXISTS release_year SMALLINT;

COMMENT ON COLUMN public.chart_tracks.release_year IS 'Release year on Beatport (commercial release date), not necessarily studio production year.';
