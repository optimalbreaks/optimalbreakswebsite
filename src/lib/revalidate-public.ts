import { revalidatePath, revalidateTag } from 'next/cache'

/** Data Cache tag para lecturas de `/charts` (New Releases + 40 Breaks + vinyl). */
export const PUBLIC_CHARTS_CACHE_TAG = 'public-charts'

/** Data Cache tag para catálogo público (artists, labels, events…). */
export const PUBLIC_CATALOG_CACHE_TAG = 'public-catalog'

const PUBLIC_LANGS = ['es', 'en'] as const

export function revalidatePublicCharts(): void {
  revalidateTag(PUBLIC_CHARTS_CACHE_TAG, 'max')
}

export function revalidatePublicCatalog(): void {
  revalidateTag(PUBLIC_CATALOG_CACHE_TAG, 'max')
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
