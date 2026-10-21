// ============================================
// OPTIMAL BREAKS — Ficha de una quincena o un trimestre
// Misma pieza que el blog. El breadcrumb es Novedades / Releases.
// Un artículo que no es de novedades vuelve a /blog/<slug>.
// ============================================

import type { Metadata } from 'next'
import { ArticlePage, generateArticleMetadata } from '@/components/BlogArticle'
import type { Locale } from '@/lib/i18n-config'

type Props = { params: Promise<{ lang: Locale; slug: string }> }

export function generateMetadata(props: Props): Promise<Metadata> {
  return generateArticleMetadata(props, 'topreleases')
}

export default function TopReleaseArticlePage(props: Props) {
  return ArticlePage(props, 'topreleases')
}
