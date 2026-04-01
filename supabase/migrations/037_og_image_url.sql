-- ============================================
-- OPTIMAL BREAKS — Campo og_image_url para imágenes OpenGraph generadas por IA
-- ============================================

ALTER TABLE public.artists   ADD COLUMN IF NOT EXISTS og_image_url TEXT;
ALTER TABLE public.events    ADD COLUMN IF NOT EXISTS og_image_url TEXT;
ALTER TABLE public.labels    ADD COLUMN IF NOT EXISTS og_image_url TEXT;
ALTER TABLE public.scenes    ADD COLUMN IF NOT EXISTS og_image_url TEXT;
ALTER TABLE public.blog_posts ADD COLUMN IF NOT EXISTS og_image_url TEXT;
