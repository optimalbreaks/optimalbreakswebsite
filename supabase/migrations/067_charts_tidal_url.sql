-- Enlace «Abrir en TIDAL» por tema en /charts (Top 40 + New Releases).
-- Lo rellena scripts/spotify-match-charts.mjs --service=tidal (matching vía TIDAL API).
-- A diferencia de spotify_url, la UI solo muestra el botón TIDAL cuando hay match
-- verificado (sin fallback de búsqueda): su catálogo de breakbeat es más limitado.

ALTER TABLE public.chart_tracks
  ADD COLUMN IF NOT EXISTS tidal_url TEXT;

ALTER TABLE public.chart_featured_tracks
  ADD COLUMN IF NOT EXISTS tidal_url TEXT;
