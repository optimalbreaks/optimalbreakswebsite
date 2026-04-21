-- ============================================
-- OPTIMAL BREAKS — Discogs link on labels
-- Añade discogs_id y discogs_url a public.labels para enlazar cada sello
-- con su ficha canónica en Discogs (p.ej. 5838 → Against The Grain).
-- ============================================

ALTER TABLE public.labels ADD COLUMN IF NOT EXISTS discogs_id  INTEGER;
ALTER TABLE public.labels ADD COLUMN IF NOT EXISTS discogs_url TEXT;

COMMENT ON COLUMN public.labels.discogs_id  IS 'ID numérico del sello en Discogs (p.ej. 5838 para Against The Grain).';
COMMENT ON COLUMN public.labels.discogs_url IS 'URL canónica del sello en Discogs (https://www.discogs.com/label/<id>-<slug>).';
