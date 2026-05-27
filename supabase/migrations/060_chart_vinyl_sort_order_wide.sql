-- Ampliar CHECK de sort_order en vinilos: catálogos grandes (p. ej. Finger Lickin')
-- pueden superar 200 pistas por edición semanal.
ALTER TABLE public.chart_vinyl_tracks
  DROP CONSTRAINT IF EXISTS chart_vinyl_tracks_sort_order_check;

ALTER TABLE public.chart_vinyl_tracks
  ADD CONSTRAINT chart_vinyl_tracks_sort_order_check
  CHECK (sort_order >= 1 AND sort_order <= 32767);
