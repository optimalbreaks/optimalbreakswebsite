-- Fecha exacta de lanzamiento en Beatport (publish_date) para picks New Releases.
-- Misma semántica que chart_tracks.release_date.

ALTER TABLE public.chart_featured_tracks
  ADD COLUMN IF NOT EXISTS release_date DATE;

CREATE INDEX IF NOT EXISTS idx_chart_featured_tracks_release_date
  ON public.chart_featured_tracks(release_date);

COMMENT ON COLUMN public.chart_featured_tracks.release_date IS
  'Fecha de release según Beatport (YYYY-MM-DD). Complementa release_year.';
