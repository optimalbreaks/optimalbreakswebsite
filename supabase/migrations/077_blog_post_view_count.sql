-- Lecturas de artículos: contador en la fila (un UPDATE, no un evento por visita).
-- El incremento público va por service_role + RPC; anon no puede escribir view_count.

ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS view_count integer NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.blog_posts.view_count IS
  'Lecturas de la ficha pública (/blog/[slug]); incrementa vía increment_blog_post_view.';

CREATE INDEX IF NOT EXISTS idx_blog_published_view_count
  ON public.blog_posts (view_count DESC, is_featured DESC, published_at DESC)
  WHERE is_published = true;

CREATE OR REPLACE FUNCTION public.increment_blog_post_view(p_slug text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_slug IS NULL OR length(btrim(p_slug)) = 0 OR length(p_slug) > 200 THEN
    RETURN;
  END IF;
  UPDATE public.blog_posts
  SET view_count = view_count + 1
  WHERE slug = p_slug AND is_published = true;
END;
$$;

REVOKE ALL ON FUNCTION public.increment_blog_post_view(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.increment_blog_post_view(text) TO service_role;
