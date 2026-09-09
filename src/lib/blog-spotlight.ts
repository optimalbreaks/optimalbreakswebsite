import type { SupabaseClient } from '@supabase/supabase-js'
import type { BlogPost, Database } from '@/types/database'

export const BLOG_SPOTLIGHT_LIMIT = 3

export const BLOG_LIST_SELECT =
  'slug, title_en, title_es, excerpt_en, excerpt_es, category, published_at, tags, author, image_url, is_featured, view_count'

export const BLOG_HOME_SELECT =
  'slug, title_en, title_es, excerpt_en, excerpt_es, category, published_at, image_url, is_featured, view_count'

export type BlogSpotlightRow = Pick<
  BlogPost,
  | 'slug'
  | 'title_en'
  | 'title_es'
  | 'excerpt_en'
  | 'excerpt_es'
  | 'category'
  | 'published_at'
  | 'image_url'
  | 'is_featured'
  | 'view_count'
>

/**
 * Destacados del blog: top por lecturas cuando ya hay señal.
 * Si nadie tiene visitas, se mantiene el criterio editorial (`is_featured`).
 */
export async function fetchBlogSpotlight<T extends BlogSpotlightRow>(
  supabase: SupabaseClient<Database>,
  select: string,
  limit = BLOG_SPOTLIGHT_LIMIT,
): Promise<{ posts: T[]; byViews: boolean }> {
  const { data: top } = await supabase
    .from('blog_posts')
    .select(select)
    .eq('is_published', true)
    .gt('view_count', 0)
    .order('view_count', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit)

  const ranked = (top || []) as T[]
  if (ranked.length > 0) return { posts: ranked, byViews: true }

  const { data: featured } = await supabase
    .from('blog_posts')
    .select(select)
    .eq('is_published', true)
    .eq('is_featured', true)
    .order('published_at', { ascending: false })
    .limit(limit)

  return { posts: (featured || []) as T[], byViews: false }
}
