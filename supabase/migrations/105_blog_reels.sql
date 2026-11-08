-- Reel de la fábrica para cada artículo del blog (8 nov 2026).
-- La web escribe el guion (reel_spec) una vez; la cola de render del PC hace el MP4,
-- lo sube a media/blog-reels/<slug>.mp4 y rellena reel_url. La R del admin lo descarga.
alter table public.blog_posts
  add column if not exists reel_spec jsonb,
  add column if not exists reel_status text,
  add column if not exists reel_url text,
  add column if not exists reel_updated_at timestamptz;

comment on column public.blog_posts.reel_status is
  'null = sin pedir · en_cola · hecho · fallo · pedir (rehacer)';
