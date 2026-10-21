// ============================================
// OPTIMAL BREAKS — Blog Post Detail
// Quincena y trimestre redirigen a /topreleases/<slug>.
// ============================================

import type { Metadata } from 'next'
import { ArticlePage, generateArticleMetadata } from '@/components/BlogArticle'
import type { Locale } from '@/lib/i18n-config'

type Props = { params: Promise<{ lang: Locale; slug: string }> }

export function generateMetadata(props: Props): Promise<Metadata> {
  return generateArticleMetadata(props, 'blog')
}

export default function BlogPostPage(props: Props) {
  return ArticlePage(props, 'blog')
}
