// ============================================
// OPTIMAL BREAKS — History Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'

export default async function HistoryPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)

  const sections = [
    { key: 'origins', year: '1970s', color: 'var(--yellow)' },
    { key: 'uk_breakbeat', year: '1980-90s', color: 'var(--red)' },
    { key: 'us_breaks', year: '1990s', color: 'var(--blue)' },
    { key: 'andalusian', year: '1992-2002', color: 'var(--orange)' },
    { key: 'australian', year: '2000s', color: 'var(--acid)' },
    { key: 'rise_decline_revival', year: '2000-2020', color: 'var(--pink)' },
    { key: 'digital_era', year: '2020+', color: 'var(--uv)' },
  ]

  return (
    <div className="lined min-h-screen">
      {/* Hero */}
      <section className="px-6 py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">HISTORY</div>
        <h1 className="sec-title">
          {dict.history.title}
          <br />
          <span className="hl">BREAKBEAT</span>
        </h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>
          {dict.history.subtitle}
        </p>
      </section>

      {/* Section cards */}
      <section className="px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0">
          {sections.map((s, i) => (
            <div
              key={s.key}
              className="p-8 border-[3px] border-[var(--ink)] -mt-[1.5px] -ml-[1.5px] transition-all duration-150 hover:bg-[var(--yellow)] cursor-pointer"
            >
              <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '28px', color: s.color }}>
                {s.year}
              </div>
              <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '22px', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                {s.key.replace(/_/g, ' ')}
              </div>
              <p className="mt-2" style={{ fontSize: '14px', lineHeight: 1.6, color: 'rgba(26,26,26,0.5)' }}>
                {lang === 'es' ? 'Próximamente: contenido completo de esta sección.' : 'Coming soon: full content for this section.'}
              </p>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
