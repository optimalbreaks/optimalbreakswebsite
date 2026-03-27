// ============================================
// OPTIMAL BREAKS — History Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'

type HistoryLink = { label: string; href: string }
type HistoryBlock = { title: string; paragraphs: string[]; links?: HistoryLink[] }

const SECTION_ORDER = [
  { key: 'origins', year: '1970s', color: 'var(--yellow)' },
  { key: 'uk_breakbeat', year: '1980–90s', color: 'var(--red)' },
  { key: 'us_breaks', year: '1990s', color: 'var(--blue)' },
  { key: 'andalusian', year: '1992–2002', color: 'var(--orange)' },
  { key: 'australian', year: '2000s', color: 'var(--acid)' },
  { key: 'rise_decline_revival', year: '2000–2020', color: 'var(--pink)' },
  { key: 'digital_era', year: '2020+', color: 'var(--uv)' },
] as const

export default async function HistoryPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const history = dict.history as {
    title: string
    subtitle: string
    sections: Record<string, HistoryBlock>
  }

  return (
    <div className="lined min-h-screen">
      <section className="px-3 sm:px-6 py-12 sm:py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">HISTORY</div>
        <h1 className="sec-title">
          {history.title}
          <br />
          <span className="hl">BREAKBEAT</span>
        </h1>
        <p
          style={{
            fontFamily: "'Special Elite', monospace",
            fontSize: 'clamp(15px, 3.6vw, 17px)',
            lineHeight: 1.8,
            maxWidth: '820px',
            color: 'var(--dim)',
          }}
        >
          {history.subtitle}
        </p>
      </section>

      <section className="px-3 sm:px-6 py-10 sm:py-12 max-w-[900px]">
        {SECTION_ORDER.map(({ key, year, color }) => {
          const block = history.sections?.[key]
          if (!block) return null

          return (
            <article
              key={key}
              id={key}
              className="mb-16 pb-16 border-b-[3px] border-[var(--ink)] last:border-b-0 last:pb-0"
            >
              <div className="flex flex-wrap items-baseline gap-x-4 gap-y-2 mb-6">
                <span
                  style={{
                    fontFamily: "'Permanent Marker', cursive",
                    fontSize: 'clamp(24px, 5vw, 34px)',
                    color,
                  }}
                >
                  {year}
                </span>
                <h2
                  className="flex-1 min-w-0"
                  style={{
                    fontFamily: "'Unbounded', sans-serif",
                    fontWeight: 900,
                    fontSize: 'clamp(18px, 3.5vw, 26px)',
                    textTransform: 'uppercase',
                    letterSpacing: '-0.5px',
                    lineHeight: 1.15,
                  }}
                >
                  {block.title}
                </h2>
              </div>

              <div
                className="space-y-4"
                style={{
                  fontFamily: "'Special Elite', monospace",
                  fontSize: '15px',
                  lineHeight: 1.85,
                  color: 'var(--ink)',
                }}
              >
                {block.paragraphs.map((p, i) => (
                  <p key={i}>{p}</p>
                ))}
              </div>

              {block.links && block.links.length > 0 && (
                <ul className="mt-8 flex flex-col gap-2 list-none p-0">
                  {block.links.map((link) => (
                    <li key={link.href}>
                      <a
                        href={link.href}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="underline underline-offset-4 decoration-2 decoration-[var(--red)] hover:bg-[var(--yellow)]"
                        style={{
                          fontFamily: "'Courier Prime', monospace",
                          fontSize: '13px',
                          letterSpacing: '0.05em',
                        }}
                      >
                        {link.label} ↗
                      </a>
                    </li>
                  ))}
                </ul>
              )}
            </article>
          )
        })}
      </section>
    </div>
  )
}
