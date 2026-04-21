-- Fecha exacta de lanzamiento del track en Beatport (publish_date / new_release_date).
-- Complementa a release_year (SMALLINT) con la fecha completa (YYYY-MM-DD),
-- necesaria para inyectar retrospectivamente tracks de 40 Breaks Vitales en
-- la edición semanal de "New Releases" (chart_featured_tracks) que corresponda.
ALTER TABLE public.chart_tracks
  ADD COLUMN IF NOT EXISTS release_date DATE;

CREATE INDEX IF NOT EXISTS idx_chart_tracks_release_date
  ON public.chart_tracks(release_date);

COMMENT ON COLUMN public.chart_tracks.release_date IS
  'Fecha completa de release según Beatport (publish_date / new_release_date). Puede ser NULL si no se pudo obtener.';
