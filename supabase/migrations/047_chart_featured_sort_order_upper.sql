-- Ampliar límite de sort_order en picks semanales (p. ej. 50+ entradas en una semana).
ALTER TABLE public.chart_featured_tracks
  DROP CONSTRAINT IF EXISTS chart_featured_tracks_sort_order_check;

ALTER TABLE public.chart_featured_tracks
  ADD CONSTRAINT chart_featured_tracks_sort_order_check
  CHECK (sort_order >= 1 AND sort_order <= 200);
