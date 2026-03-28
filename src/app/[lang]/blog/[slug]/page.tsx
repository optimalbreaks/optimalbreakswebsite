// ============================================
// OPTIMAL BREAKS — Blog Post Detail (Secure)
// + ShareButtons
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { absoluteOgImage, detailPageMetadata, siteNameForLang, SITE_URL } from '@/lib/seo'
import { sanitizeHtml, sanitizeSlug, validateLocale } from '@/lib/security'
import type { Locale } from '@/lib/i18n-config'
import type { BlogPost } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import CardThumbnail from '@/components/CardThumbnail'

type Props = { params: { lang: Locale; slug: string } }
type BlogSeoRow = Pick<BlogPost, 'title_en' | 'title_es' | 'excerpt_en' | 'excerpt_es' | 'image_url'>

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const safeLang = validateLocale(lang)
  const safeSlug = sanitizeSlug(slug)
  if (!safeSlug) return { title: safeLang === 'es' ? 'Entrada no encontrada' : 'Post not found', robots: { index: false, follow: true } }
  const supabase = createServerSupabase()
  const { data: raw } = await supabase
    .from('blog_posts')
    .select('title_en, title_es, excerpt_en, excerpt_es, image_url')
    .eq('slug', safeSlug)
    .eq('is_published', true)
    .single()
  const data = raw as BlogSeoRow | null
  if (!data) return { title: safeLang === 'es' ? 'Entrada no encontrada' : 'Post not found', robots: { index: false, follow: true } }
  const title = safeLang === 'es' ? data.title_es : data.title_en
  const description = safeLang === 'es' ? data.excerpt_es : data.excerpt_en
  const siteName = await siteNameForLang(safeLang)
  return detailPageMetadata(safeLang, `/blog/${safeSlug}`, siteName, title, description, 'article', data.image_url)
}

export default async function BlogPostPage({ params }: Props) {
  const { lang, slug } = await params
  const safeLang = validateLocale(lang)
  const safeSlug = sanitizeSlug(slug)
  const supabase = createServerSupabase()
  let rawPost: unknown = null
  if (safeSlug) {
    const res = await supabase.from('blog_posts').select('*').eq('slug', safeSlug).eq('is_published', true).single()
    rawPost = res.data
  }
  const post = rawPost as BlogPost | null

  if (!post) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20 max-w-[800px] mx-auto">
        <Link href={`/${safeLang}/blog`} className="btn-back"><span className="arrow">←</span> {safeLang === 'es' ? 'Volver al Blog' : 'Back to Blog'}</Link>
        <div className="sec-tag">BLOG</div>
        <h1 className="sec-title text-[clamp(24px,5vw,44px)]"><span className="hl">{safeSlug.replace(/-/g, ' ').toUpperCase()}</span></h1>
        <div className="mt-6 p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>{safeLang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}</div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>{safeLang === 'es' ? 'Este artículo se está preparando.' : 'This article is being prepared.'}</p>
        </div>
      </div>
    )
  }

  const title = safeLang === 'es' ? post.title_es : post.title_en
  const rawContent = safeLang === 'es' ? post.content_es : post.content_en
  const content = sanitizeHtml(rawContent || '')
  const articleUrl = `${SITE_URL}/${safeLang}/blog/${safeSlug}`
  const articleLd = {
    '@context': 'https://schema.org',
    '@type': 'Article',
    headline: title,
    author: { '@type': 'Person', name: post.author || 'Optimal Breaks' },
    datePublished: post.published_at,
    image: absoluteOgImage(post.image_url),
    mainEntityOfPage: { '@type': 'WebPage', '@id': articleUrl },
    inLanguage: safeLang,
  }

  return (
    <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20 max-w-[800px] mx-auto">
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(articleLd) }} />
      <Link href={`/${safeLang}/blog`} className="btn-back"><span className="arrow">←</span> {safeLang === 'es' ? 'Volver al Blog' : 'Back to Blog'}</Link>

      <div className="flex flex-wrap items-center gap-2 sm:gap-3 mb-4">
        <span className="cutout red">{post.category}</span>
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
          {new Date(post.published_at).toLocaleDateString(safeLang === 'es' ? 'es-ES' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <h1 className="sec-title text-[clamp(24px,5vw,44px)] mb-2"><span className="hl">{title}</span></h1>

      {/* Share row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '2px', color: 'var(--dim)' }}>
          {safeLang === 'es' ? 'POR' : 'BY'} {post.author?.toUpperCase()}
        </div>
        <ShareButtons url={`/${safeLang}/blog/${safeSlug}`} title={`${title} | Optimal Breaks`} lang={safeLang} />
      </div>

      <div className="mb-8 -mx-4 sm:mx-0 border-y-[3px] border-[var(--ink)] overflow-hidden">
        <CardThumbnail src={post.image_url} alt={title} aspectClass="aspect-[16/9] sm:aspect-[21/9]" frameClass="border-0" />
      </div>

      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {post.tags.map((t: string, i: number) => <span key={i} className="cutout fill">{t}</span>)}
        </div>
      )}

      <article className="prose-ob" style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.9 }} dangerouslySetInnerHTML={{ __html: content }} />

      {/* Bottom share */}
      <div className="mt-12 pt-8 border-t-4 border-dashed border-[var(--ink)] flex flex-wrap items-center justify-between gap-4">
        <Link href={`/${safeLang}/blog`} className="btn-back !mb-0"><span className="arrow">←</span> {safeLang === 'es' ? 'MÁS ARTÍCULOS' : 'MORE ARTICLES'}</Link>
        <ShareButtons url={`/${safeLang}/blog/${safeSlug}`} title={`${title} | Optimal Breaks`} lang={safeLang} />
      </div>
    </div>
  )
}
