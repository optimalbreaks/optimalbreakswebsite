-- Previews de Beatport en artículos de blog (álbumes / EP), mismo JSONB que
-- artists.beatport_top_tracks. Vacío = el artículo no monta lista de cortes.
ALTER TABLE public.blog_posts
  ADD COLUMN IF NOT EXISTS beatport_tracks JSONB NOT NULL DEFAULT '[]'::jsonb,
  ADD COLUMN IF NOT EXISTS beatport_release_url TEXT;

COMMENT ON COLUMN public.blog_posts.beatport_tracks IS
  'Lista de cortes Beatport (mismo shape que artists.beatport_top_tracks) para previews en el artículo.';
COMMENT ON COLUMN public.blog_posts.beatport_release_url IS
  'URL pública del release en Beatport, si el artículo cubre un álbum o EP.';
