-- Enlace de Bandcamp además de la tienda principal (Beatport).
-- El círculo BANDCAMP solo sale cuando la columna tiene URL.
-- No sustituye a link_url: un tema de Beatport sigue abriendo Beatport.

ALTER TABLE public.chart_featured_tracks
  ADD COLUMN IF NOT EXISTS bandcamp_url TEXT;
