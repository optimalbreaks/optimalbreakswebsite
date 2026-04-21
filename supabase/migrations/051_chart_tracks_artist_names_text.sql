-- 051 · Denormaliza `artists` (JSONB array) → `artist_names_text` (text) en las tres
-- tablas de tracks, para que /api/search pueda filtrar por nombre de artista con
-- `ilike`. PostgREST no permite `ilike` dentro de JSONB sin RPC custom; con esta
-- columna STORED GENERATED la query funciona igual que sobre title/mix_name/label.
--
-- Objetivo UX: buscar "Krafty Kuts" en ⌘K devuelve todas sus canciones en charts
-- semanales, new releases y retro vinyl picks, no sólo la ficha del artista.

CREATE OR REPLACE FUNCTION public.chart_artists_to_text(arr jsonb)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT COALESCE(string_agg(elem ->> 'name', ', '), '')
  FROM jsonb_array_elements(COALESCE(arr, '[]'::jsonb)) AS elem
  WHERE elem ? 'name'
$$;

ALTER TABLE public.chart_tracks
  ADD COLUMN IF NOT EXISTS artist_names_text text
  GENERATED ALWAYS AS (public.chart_artists_to_text(artists)) STORED;

ALTER TABLE public.chart_featured_tracks
  ADD COLUMN IF NOT EXISTS artist_names_text text
  GENERATED ALWAYS AS (public.chart_artists_to_text(artists)) STORED;

ALTER TABLE public.chart_vinyl_tracks
  ADD COLUMN IF NOT EXISTS artist_names_text text
  GENERATED ALWAYS AS (public.chart_artists_to_text(artists)) STORED;

COMMENT ON COLUMN public.chart_tracks.artist_names_text IS
  'Denormalización automática: string_agg de artists[].name. Permite ilike al buscador global.';
COMMENT ON COLUMN public.chart_featured_tracks.artist_names_text IS
  'Denormalización automática: string_agg de artists[].name.';
COMMENT ON COLUMN public.chart_vinyl_tracks.artist_names_text IS
  'Denormalización automática: string_agg de artists[].name.';
