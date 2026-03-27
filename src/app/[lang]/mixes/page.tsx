// ============================================
// OPTIMAL BREAKS — Mixes & Sets Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'

const PLACEHOLDER_MIXES = [
  { title: 'Krafty Kuts — Golden Era Breaks Mix', artist: 'Krafty Kuts', type: 'YOUTUBE', year: 2023, duration: '62 min' },
  { title: 'Lady Waks — In Da Mix #500', artist: 'Lady Waks', type: 'RADIO', year: 2024, duration: '58 min' },
  { title: 'Stanton Warriors — Live at Fabric', artist: 'Stanton Warriors', type: 'CLASSIC SET', year: 2005, duration: '74 min' },
  { title: 'Adam Freeland — Essential Mix BBC', artist: 'Adam Freeland', type: 'ESSENTIAL MIX', year: 2003, duration: '120 min' },
  { title: 'Plump DJs — Beats Working Vol.1', artist: 'Plump DJs', type: 'PODCAST', year: 2008, duration: '65 min' },
  { title: 'Deekline & Ed Solo — Jungle Cakes Mix', artist: 'Deekline', type: 'SOUNDCLOUD', year: 2020, duration: '55 min' },
]

export default async function MixesPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)

  return (
    <div className="lined min-h-screen">
      <section className="px-6 py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">MIXES</div>
        <h1 className="sec-title">
          {dict.mixes.title}
          <br />
          <span className="hl">{lang === 'es' ? 'ESENCIALES' : 'ESSENTIAL'}</span>
        </h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>
          {dict.mixes.subtitle}
        </p>
      </section>

      <section className="px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
          {PLACEHOLDER_MIXES.map((m, i) => (
            <div
              key={i}
              className="border-[3px] border-[var(--ink)] p-7 relative transition-all duration-150 bg-[var(--paper)] hover:rotate-[-1deg] hover:shadow-[6px_6px_0_var(--ink)]"
            >
              {/* Tape */}
              <div
                className="absolute -top-[6px] left-[20px] w-[60px] h-[18px]"
                style={{ background: 'var(--tape)', transform: 'rotate(-2deg)' }}
              />

              <div className="flex items-center gap-2">
                <span className="cutout red">{m.type}</span>
                <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                  {m.year} · {m.duration}
                </span>
              </div>

              <div
                className="mt-3"
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontWeight: 900,
                  fontSize: '18px',
                  textTransform: 'uppercase',
                  letterSpacing: '-0.5px',
                  lineHeight: 1.1,
                }}
              >
                {m.title}
              </div>

              <div className="mt-2" style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '14px', color: 'var(--red)' }}>
                {m.artist}
              </div>

              {/* Play sticker */}
              <div
                className="absolute bottom-3 right-3 bg-[var(--ink)] text-[var(--yellow)]"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  fontWeight: 700,
                  fontSize: '11px',
                  letterSpacing: '2px',
                  padding: '4px 12px',
                  transform: 'rotate(2deg)',
                }}
              >
                ▶ PLAY
              </div>
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
