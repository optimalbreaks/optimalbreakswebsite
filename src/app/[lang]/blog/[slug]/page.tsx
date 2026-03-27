// ============================================
// OPTIMAL BREAKS — Blog Post Detail Page
// ============================================

import { createServerSupabase } from '@/lib/supabase'
import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import Link from 'next/link'

type Props = { params: { lang: Locale; slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data } = await supabase.from('blog_posts').select('title_en, title_es, excerpt_en, excerpt_es').eq('slug', slug).single()
  if (!data) return { title: 'Post Not Found' }
  return {
    title: lang === 'es' ? data.title_es : data.title_en,
    description: lang === 'es' ? data.excerpt_es : data.excerpt_en,
    openGraph: {
      title: lang === 'es' ? data.title_es : data.title_en,
      description: lang === 'es' ? data.excerpt_es : data.excerpt_en,
      type: 'article',
    },
  }
}

export default async function BlogPostPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: post } = await supabase.from('blog_posts').select('*').eq('slug', slug).eq('is_published', true).single()

  if (!post) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20 max-w-[800px] mx-auto">
        <Link href={`/${lang}/blog`} className="cutout outline no-underline mb-6 inline-block">
          ← {lang === 'es' ? 'Volver al Blog' : 'Back to Blog'}
        </Link>
        <div className="sec-tag">BLOG</div>
        <h1 className="sec-title text-[clamp(24px,5vw,44px)]">
          <span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span>
        </h1>
        <div className="mt-6 p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>
            {lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}
          </div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>
            {lang === 'es'
              ? 'Este artículo se está preparando. Pronto estará disponible.'
              : 'This article is being prepared. It will be available soon.'}
          </p>
        </div>
      </div>
    )
  }

  const title = lang === 'es' ? post.title_es : post.title_en
  const content = lang === 'es' ? post.content_es : post.content_en

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20 max-w-[800px] mx-auto">
      <Link href={`/${lang}/blog`} className="cutout outline no-underline mb-6 inline-block">
        ← {lang === 'es' ? 'Volver al Blog' : 'Back to Blog'}
      </Link>

      {/* Category + date */}
      <div className="flex items-center gap-3 mb-4">
        <span className="cutout red">{post.category}</span>
        <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
          {new Date(post.published_at).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', { year: 'numeric', month: 'long', day: 'numeric' })}
        </span>
      </div>

      <h1 className="sec-title text-[clamp(24px,5vw,44px)] mb-2">
        <span className="hl">{title}</span>
      </h1>

      {/* Author */}
      <div className="mb-8" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', letterSpacing: '2px', color: 'var(--dim)' }}>
        {lang === 'es' ? 'POR' : 'BY'} {post.author?.toUpperCase()}
      </div>

      {/* Tags */}
      {post.tags?.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-8">
          {post.tags.map((t: string, i: number) => (
            <span key={i} className="cutout fill">{t}</span>
          ))}
        </div>
      )}

      {/* Content */}
      <article
        className="prose-ob"
        style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.9 }}
        dangerouslySetInnerHTML={{ __html: content || '' }}
      />

      {/* Back */}
      <div className="mt-12 pt-8 border-t-4 border-dashed border-[var(--ink)]">
        <Link href={`/${lang}/blog`} className="cutout red no-underline">
          ← {lang === 'es' ? 'MÁS ARTÍCULOS' : 'MORE ARTICLES'}
        </Link>
      </div>
    </div>
  )
}
