import { revalidatePath, revalidateTag } from 'next/cache'
import { isReleaseRoundup } from '@/lib/blog-spotlight'

/** Data Cache tag para lecturas de `/charts` (New Releases + 40 Breaks + vinyl). */
export const PUBLIC_CHARTS_CACHE_TAG = 'public-charts'

/** Data Cache tag para catálogo público (artists, labels, events…). */
export const PUBLIC_CATALOG_CACHE_TAG = 'public-catalog'

/** Data Cache tag para `/parkineo` (solo sesiones publicadas). */
export const PUBLIC_PARKINEO_CACHE_TAG = 'public-parkineo'

const PUBLIC_LANGS = ['es', 'en'] as const

export function revalidatePublicCharts(): void {
  revalidateTag(PUBLIC_CHARTS_CACHE_TAG, 'max')
}

export function revalidatePublicCatalog(): void {
  revalidateTag(PUBLIC_CATALOG_CACHE_TAG, 'max')
}

/** Lista y ficha de Parkineo en ES/EN, más el sitemap que usa el mismo tag. */
export function revalidateParkineo(slug?: string | null): void {
  revalidateTag(PUBLIC_PARKINEO_CACHE_TAG, 'max')
  for (const lang of PUBLIC_LANGS) {
    revalidatePath(`/${lang}/parkineo`)
    const clean = slug?.trim().replace(/^\/+|\/+$/g, '')
    if (clean) revalidatePath(`/${lang}/parkineo/${clean}`)
  }
}

/** Invalida listado y ficha de artista en ES/EN tras un UPSERT editorial. */
export function revalidateArtistSlug(slug: string): string[] {
  const clean = slug.trim().replace(/^\/+|\/+$/g, '')
  const paths: string[] = []
  for (const lang of PUBLIC_LANGS) {
    paths.push(`/${lang}/artists/${clean}`)
    paths.push(`/${lang}/artists`)
  }
  for (const p of paths) {
    revalidatePath(p)
  }
  revalidatePublicCatalog()
  return paths
}

/** Invalida ficha de blog, índice y home (spotlight) en ES/EN. */
export function revalidateBlogSlug(slug: string): string[] {
  const clean = slug.trim().replace(/^\/+|\/+$/g, '')
  const paths: string[] = []
  for (const lang of PUBLIC_LANGS) {
    paths.push(`/${lang}/blog/${clean}`)
    paths.push(`/${lang}/blog`)
    if (isReleaseRoundup(clean)) {
      paths.push(`/${lang}/topreleases/${clean}`)
      paths.push(`/${lang}/topreleases`)
    }
    paths.push(`/${lang}`)
  }
  for (const p of paths) {
    revalidatePath(p)
  }
  revalidatePublicCatalog()
  return paths
}
