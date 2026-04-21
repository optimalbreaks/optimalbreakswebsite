-- ============================================
-- OPTIMAL BREAKS — Saved chart tracks: soporte para Beatport Top 10
-- ============================================
-- Amplía saved_chart_tracks para poder guardar canciones procedentes del
-- Top 10 de ventas de Beatport (almacenado como JSONB en artists/labels).
--
-- 1. Nuevo valor 'beatport_top' en track_source.
-- 2. track_id pasa a TEXT (las UUID se siguen almacenando como texto sin
--    pérdida; los nuevos registros usan el id numérico de Beatport o la URL).
-- 3. canonical_url (nullable): URL canónica de la canción (Beatport/Bandcamp/
--    YouTube/Discogs). Permite deduplicar entre fuentes aunque la canción se
--    guarde desde sitios distintos.
-- 4. snapshot (JSONB, nullable): metadatos embebidos para los registros
--    beatport_top (que no tienen fila propia en ninguna tabla de charts).
-- 5. Backfill: rellena canonical_url para los saves existentes (chart,
--    featured, vinyl) uniendo contra sus tablas origen.
-- ============================================

-- 1) Permitir 'beatport_top' como source
ALTER TABLE public.saved_chart_tracks
  DROP CONSTRAINT IF EXISTS saved_chart_tracks_track_source_check;

ALTER TABLE public.saved_chart_tracks
  ADD CONSTRAINT saved_chart_tracks_track_source_check
  CHECK (track_source IN ('chart','featured','vinyl','beatport_top'));

-- 2) track_id → TEXT (UUID se casteaba implícitamente, ahora lo hacemos explícito)
ALTER TABLE public.saved_chart_tracks
  ALTER COLUMN track_id TYPE TEXT USING track_id::text;

-- 3) Nuevas columnas
ALTER TABLE public.saved_chart_tracks
  ADD COLUMN IF NOT EXISTS canonical_url TEXT;

ALTER TABLE public.saved_chart_tracks
  ADD COLUMN IF NOT EXISTS snapshot JSONB;

-- Índice para búsquedas por URL canónica (cross-source dedupe)
CREATE INDEX IF NOT EXISTS idx_sct_canonical
  ON public.saved_chart_tracks(canonical_url)
  WHERE canonical_url IS NOT NULL;

-- 4) Backfill canonical_url para los registros antiguos
UPDATE public.saved_chart_tracks s
   SET canonical_url = ct.beatport_url
  FROM public.chart_tracks ct
 WHERE s.track_source = 'chart'
   AND s.track_id = ct.id::text
   AND s.canonical_url IS NULL
   AND ct.beatport_url IS NOT NULL;

UPDATE public.saved_chart_tracks s
   SET canonical_url = cft.link_url
  FROM public.chart_featured_tracks cft
 WHERE s.track_source = 'featured'
   AND s.track_id = cft.id::text
   AND s.canonical_url IS NULL
   AND cft.link_url IS NOT NULL;

UPDATE public.saved_chart_tracks s
   SET canonical_url = cvt.youtube_url
  FROM public.chart_vinyl_tracks cvt
 WHERE s.track_source = 'vinyl'
   AND s.track_id = cvt.id::text
   AND s.canonical_url IS NULL
   AND cvt.youtube_url IS NOT NULL;
