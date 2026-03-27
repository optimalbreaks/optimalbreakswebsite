// ============================================
// OPTIMAL BREAKS — Blog Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'

const PLACEHOLDER_POSTS = [
  { title: 'The Amen Break: 6 Seconds That Changed Music Forever', category: 'retrospective', date: '2026-03-15' },
  { title: 'Top 50 Breakbeat Tracks of All Time', category: 'ranking', date: '2026-03-10' },
  { title: 'Break Nation: The Documentary That Andalusia Needed', category: 'review', date: '2026-03-05' },
  { title: 'Finger Lickin\' Records: Rise and Legacy', category: 'retrospective', date: '2026-02-28' },
  { title: 'Who Kept Breakbeat Alive? DJs, Radio & YouTube', category: 'article', date: '2026-02-20' },
  { title: 'Buying Vinyl in Camden: A Personal Memory', category: 'opinion', date: '2026-02-15' },
]

export default async function BlogPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)

  return (
    <div className="lined min-h-screen">
      <section className="px-6 py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">BLOG</div>
        <h1 className="sec-title">
          {dict.blog.title}
          <br />
          <span className="hl">{lang === 'es' ? 'ARTÍCULOS' : 'ARTICLES'}</span>
        </h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>
          {dict.blog.subtitle}
        </p>
      </section>

      <section className="px-6 py-16">
        <div className="space-y-0 border-4 border-[var(--ink)]">
          {PLACEHOLDER_POSTS.map((p, i) => (
            <div
              key={i}
              className="p-8 border-b-[3px] border-[var(--ink)] last:border-b-0 transition-all duration-150 hover:bg-[var(--yellow)] hover:pl-12 cursor-pointer"
            >
              <div className="flex items-center gap-3">
                <span className="cutout red">{p.category}</span>
                <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                  {p.date}
                </span>
              </div>
              <div
                className="mt-3"
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontWeight: 900,
                  fontSize: '22px',
                  textTransform: 'uppercase',
                  letterSpacing: '-0.5px',
                  lineHeight: 1.1,
                }}
              >
                {p.title}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
