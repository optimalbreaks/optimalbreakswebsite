-- ============================================
-- OPTIMAL BREAKS — Índices para las páginas que crecen sin límite
-- (/charts archivo por año, /events, /mixes)
-- ============================================
-- Sin estos índices, cada consulta del archivo por año (`release_year = X`,
-- `release_date` entre fechas, `year = X`) y los listados ordenados por fecha
-- recorren la tabla entera: el coste crece con cada tema/evento/mix nuevo y
-- consume Disk IO de Supabase.
-- Idempotente (IF NOT EXISTS): se puede ejecutar varias veces.

-- Archivo de /charts por año (loadArchiveYear)
CREATE INDEX IF NOT EXISTS idx_chart_featured_tracks_release_year
  ON public.chart_featured_tracks (release_year);

CREATE INDEX IF NOT EXISTS idx_chart_featured_tracks_release_date
  ON public.chart_featured_tracks (release_date);

CREATE INDEX IF NOT EXISTS idx_chart_vinyl_tracks_year
  ON public.chart_vinyl_tracks (year);

-- Ediciones publicadas por fecha (resumen de /charts)
CREATE INDEX IF NOT EXISTS idx_chart_editions_published_week
  ON public.chart_editions (is_published, week_date DESC);

-- Listado de /events ordenado por fecha
CREATE INDEX IF NOT EXISTS idx_events_date_start
  ON public.events (date_start DESC NULLS LAST);

-- Listado de /mixes ordenado por año y alta
CREATE INDEX IF NOT EXISTS idx_mixes_year_created
  ON public.mixes (year DESC NULLS LAST, created_at DESC);

-- Mis Tracks (lectura paginada por usuario, más recientes primero)
CREATE INDEX IF NOT EXISTS idx_saved_chart_tracks_user_created
  ON public.saved_chart_tracks (user_id, created_at DESC);
