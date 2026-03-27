// ============================================
// OPTIMAL BREAKS — Blog Post Detail (placeholder)
// ============================================

import type { Locale } from '@/lib/i18n-config'

export default async function BlogPostPage({ params }: { params: { lang: Locale; slug: string } }) {
  const { lang, slug } = await params

  return (
    <div className="lined min-h-screen px-6 py-20">
      <div className="sec-tag">BLOG</div>
      <h1 className="sec-title" style={{ fontSize: 'clamp(28px, 5vw, 50px)' }}>
        <span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span>
      </h1>
      <div className="mt-8 max-w-[750px]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, color: 'var(--dim)' }}>
        {lang === 'es'
          ? 'El contenido de este artículo se cargará desde Supabase. Aquí irá el texto completo del post con formato editorial.'
          : 'This article\'s content will load from Supabase. Full post text with editorial formatting will appear here.'}
      </div>
    </div>
  )
}
