-- ============================================
-- OPTIMAL BREAKS — Beatport Top Tracks + beatport_id / beatport_url
-- Almacena el Top 10 de ventas por artista/sello directamente en la fila.
-- ============================================

-- artists
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS beatport_id   INTEGER;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS beatport_url  TEXT;
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS beatport_top_tracks JSONB DEFAULT '[]';
ALTER TABLE public.artists ADD COLUMN IF NOT EXISTS beatport_top_tracks_updated_at TIMESTAMPTZ;

-- labels
ALTER TABLE public.labels ADD COLUMN IF NOT EXISTS beatport_id   INTEGER;
ALTER TABLE public.labels ADD COLUMN IF NOT EXISTS beatport_url  TEXT;
ALTER TABLE public.labels ADD COLUMN IF NOT EXISTS beatport_top_tracks JSONB DEFAULT '[]';
ALTER TABLE public.labels ADD COLUMN IF NOT EXISTS beatport_top_tracks_updated_at TIMESTAMPTZ;
