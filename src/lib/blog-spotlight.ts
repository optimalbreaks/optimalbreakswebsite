import type { SupabaseClient } from '@supabase/supabase-js'
import type { BlogPost, Database } from '@/types/database'

export const BLOG_SPOTLIGHT_LIMIT = 3

/** Quincena y trimestre: la ficha pública es /topreleases/<slug>, no /blog/<slug>. */
export function isReleaseRoundupSlug(slug: string): boolean {
  return slug.startsWith('quincena-breakbeat-') || slug.startsWith('trimestre-breakbeat-')
}

/**
 * Quincena o trimestre. `kind` ausente en un digest antiguo sigue siendo quincena
 * si el slug es `quincena-breakbeat-` / `trimestre-breakbeat-`. Agenda no entra.
 */
export function isReleaseRoundup(slug: string, kind?: string | null): boolean {
  if (kind === 'quincena' || kind === 'trimestre') return true
  if (kind === 'agenda') return false
  return isReleaseRoundupSlug(slug)
}

/** Ruta pública del artículo. */
export function publicArticlePath(lang: string, slug: string, kind?: string | null): string {
  return `/${lang}/${isReleaseRoundup(slug, kind) ? 'topreleases' : 'blog'}/${slug}`
}

export const BLOG_LIST_SELECT =
  'slug, title_en, title_es, excerpt_en, excerpt_es, category, published_at, tags, author, image_url, is_featured, view_count, covers:digest->covers' as const

/** Primeras carátulas distintas de un digest (quincena / trimestre). */
export function digestCoverUrls(covers: unknown, n = 3): string[] {
  if (!Array.isArray(covers)) return []
  const out: string[] = []
  for (const c of covers) {
    if (typeof c !== 'string') continue
    const s = c.trim()
    if (!s || out.includes(s)) continue
    out.push(s)
    if (out.length >= n) break
  }
  return out
}

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
> &
  Pick<BlogPost, 'tags' | 'author'> & {
    /** `digest.covers` cuando el artículo es quincena o trimestre. */
    covers?: unknown
  }

/** Cartel/flyer (no paisaje IA 16:9): mostrar entero, sin recorte 21:9. */
export function isBlogPosterCover(
  imageUrl: string | null | undefined,
  opts?: { album?: boolean; slug?: string },
) {
  if (opts?.album) return true
  if (opts?.slug === 'guau-yo-speed-australian-tour-2026') return true
  const url = imageUrl || ''
  return /\/images\/(blog|events)\//i.test(url) || /-poster\.(webp|jpe?g|png)(?:\?|$)/i.test(url)
}

/**
 * Destacados del blog: top por lecturas cuando ya hay señal.
 * Si nadie tiene visitas, se mantiene el criterio editorial (`is_featured`).
 */
export async function fetchBlogSpotlight(
  supabase: SupabaseClient<Database>,
  limit = BLOG_SPOTLIGHT_LIMIT,
): Promise<{ posts: BlogSpotlightRow[]; byViews: boolean }> {
  const { data: top } = await supabase
    .from('blog_posts')
    .select(BLOG_LIST_SELECT)
    .eq('is_published', true)
    .gt('view_count', 0)
    .order('view_count', { ascending: false })
    .order('published_at', { ascending: false })
    .limit(limit)

  const ranked = (top || []) as BlogSpotlightRow[]
  if (ranked.length > 0) return { posts: ranked, byViews: true }

  const { data: featured } = await supabase
    .from('blog_posts')
    .select(BLOG_LIST_SELECT)
    .eq('is_published', true)
    .eq('is_featured', true)
    .order('published_at', { ascending: false })
    .limit(limit)

  return { posts: (featured || []) as BlogSpotlightRow[], byViews: false }
}
