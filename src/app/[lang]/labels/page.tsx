// ============================================
// OPTIMAL BREAKS — Labels Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'

const PLACEHOLDER_LABELS = [
  { name: "FINGER LICKIN'", country: 'UK', year: 1996 },
  { name: 'BOTCHIT & SCARPER', country: 'UK', year: 1997 },
  { name: 'MARINE PARADE', country: 'UK', year: 2000 },
  { name: 'SKINT RECORDS', country: 'UK', year: 1995 },
  { name: 'TCR', country: 'UK', year: 2001 },
  { name: 'PASSENGER', country: 'UK', year: 2002 },
  { name: 'MOB RECORDS', country: 'UK', year: 1999 },
  { name: 'BREAKBEAT KAOS', country: 'UK', year: 2003 },
]

export default async function LabelsPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)

  return (
    <div className="lined min-h-screen">
      <section className="px-6 py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">LABELS</div>
        <h1 className="sec-title">
          {dict.labels.title}
          <br />
          <span className="hl">{lang === 'es' ? 'DISCOGRÁFICOS' : 'RECORDS'}</span>
        </h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>
          {dict.labels.subtitle}
        </p>
      </section>

      <section className="px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
          {PLACEHOLDER_LABELS.map((l, i) => (
            <div key={i} className="p-8 border-r-[3px] border-b-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] max-md:!border-r-0">
              <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '16px', color: 'var(--red)' }}>
                Est. {l.year}
              </div>
              <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '24px', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
                {l.name}
              </div>
              <span className="cutout fill mt-2">{l.country}</span>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
