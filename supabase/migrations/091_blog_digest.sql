-- Artículo quincenal del blog: datos y textos cortos que la ficha pinta con
-- gráficos y carátulas (FortnightDigest). NULL = artículo normal.
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS digest JSONB;

COMMENT ON COLUMN public.blog_posts.digest IS
  'Quincena: cifras, rankings con carátula y textos ES/EN (scripts/generar-blog-agente.mjs --quincena).';
