// ============================================
// OPTIMAL BREAKS — Scenes Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'

const SCENES = [
  { name: 'UK BREAKBEAT', region: 'London, Manchester, Bristol', color: 'var(--red)', era: '1988 — present' },
  { name: 'US BREAKS', region: 'Florida, California', color: 'var(--blue)', era: '1990 — present' },
  { name: 'ANDALUSIAN BREAKBEAT', region: 'Seville, Málaga, Cádiz', color: 'var(--orange)', era: '1992 — 2002' },
  { name: 'AUSTRALIAN BREAKS', region: 'Perth, Melbourne, Sydney', color: 'var(--acid)', era: '2001 — present' },
  { name: 'RUSSIAN / EASTERN EUROPE', region: 'Moscow, St. Petersburg', color: 'var(--uv)', era: '2005 — present' },
  { name: 'LATIN AMERICA', region: 'Mexico, Colombia, Argentina', color: 'var(--pink)', era: '2010 — present' },
]

export default async function ScenesPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)

  return (
    <div className="lined min-h-screen">
      <section className="px-6 py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">SCENES</div>
        <h1 className="sec-title">
          {dict.scenes.title}
          <br />
          <span className="hl">{lang === 'es' ? 'MUNDO' : 'WORLD'}</span>
        </h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>
          {dict.scenes.subtitle}
        </p>
      </section>

      <section className="px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
          {SCENES.map((s, i) => (
            <div key={i} className="p-8 border-r-[3px] border-b-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] cursor-pointer max-md:!border-r-0">
              <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '14px', color: s.color }}>
                {s.era}
              </div>
              <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '24px', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                {s.name}
              </div>
              <div className="mt-1" style={{ fontSize: '14px', color: 'var(--dim)' }}>
                {s.region}
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
