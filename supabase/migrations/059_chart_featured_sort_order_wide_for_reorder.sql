-- Ampliar el CHECK de sort_order para que los scripts UPSERT puedan mover filas sin colisión UNIQUE
-- (fase intermedia alta → segunda pasada 1…N). Mantener límite smallint Postgres.
ALTER TABLE public.chart_featured_tracks
  DROP CONSTRAINT IF EXISTS chart_featured_tracks_sort_order_check;

ALTER TABLE public.chart_featured_tracks
  ADD CONSTRAINT chart_featured_tracks_sort_order_check
  CHECK (sort_order >= 1 AND sort_order <= 32767);
