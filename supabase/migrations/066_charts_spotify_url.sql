-- Enlace «Abrir en Spotify» por tema en /charts (Top 40 + New Releases).
-- Lo rellena scripts/spotify-match-charts.mjs (matching vía Spotify Web API);
-- NULL = sin match verificado (la UI cae a un enlace de búsqueda en Spotify).
--
-- Nota: la RPC apply_chart_tracks_row_updates (058) NO toca esta columna a
-- propósito: el sync semanal del Top 40 no debe borrar los matches ya hechos.

ALTER TABLE public.chart_tracks
  ADD COLUMN IF NOT EXISTS spotify_url TEXT;

ALTER TABLE public.chart_featured_tracks
  ADD COLUMN IF NOT EXISTS spotify_url TEXT;
