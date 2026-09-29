// ============================================
// OPTIMAL BREAKS — Timeline Section
// Responsive: mobile stacked, desktop 3-col grid
// ============================================

import Link from 'next/link'

interface TimelineItem {
  year: string
  title: string
  desc: string
}

interface TimelineProps {
  tag: string
  title1: string
  title2: string
  items: TimelineItem[]
  /** Enlace interno bajo la línea temporal (SEO / retención). */
  footerLink?: { href: string; label: string }
  /**
   * `compact` (home): cabecera de una línea, hitos ordenados por año de inicio
   * en rejilla de tarjetas, texto legible. `full` = lista vertical original.
   */
  variant?: 'full' | 'compact'
}

/** Año de inicio de «1973—1986», «2015—HOY»… (para ordenar cronológicamente). */
function startYear(year: string): number {
  const n = parseInt(year, 10)
  return Number.isNaN(n) ? 9999 : n
}

function CompactTimeline({ tag, title1, title2, items, footerLink }: Omit<TimelineProps, 'variant'>) {
  const sorted = [...items].sort((a, b) => startYear(a.year) - startYear(b.year))
  return (
    <section className="bg-[var(--ink)] text-[var(--paper)] px-3 sm:px-6 py-10 sm:py-14 border-y-[5px] border-[var(--red)] relative z-[1]">
      <div className="home-wrap">
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
          <div className="min-w-0">
            <div className="sec-tag" style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)' }}>
              {tag}
            </div>
            <h2 className="sec-title sec-title--compact text-[var(--paper)]">
              {title1}{' '}
              <span className="relative inline">
                <span
                  aria-hidden
                  className="absolute -left-1 -right-1 bottom-[2px] h-[30%] -z-10 bg-[var(--red)]"
                  style={{ transform: 'rotate(-0.3deg)' }}
                />
                {title2}
              </span>
            </h2>
          </div>
          {footerLink ? (
            <Link
              href={footerLink.href}
              className="shrink-0 sm:max-w-[340px] inline-block no-underline border-[3px] border-[var(--yellow)] px-4 py-2 text-[var(--yellow)] hover:bg-[var(--yellow)] hover:text-[var(--ink)] transition-colors"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' }}
            >
              {footerLink.label} →
            </Link>
          ) : null}
        </div>

        <ol className="list-none m-0 p-0 mt-8 grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 border-t-[3px] border-l-[3px] border-[rgba(232,220,200,0.18)]">
          {sorted.map((item) => (
            <li
              key={`${item.year}-${item.title}`}
              className="p-4 sm:p-5 border-r-[3px] border-b-[3px] border-[rgba(232,220,200,0.18)] transition-colors hover:bg-[rgba(247,231,51,0.06)] min-w-0"
            >
              <div
                className="leading-none"
                style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '22px', color: 'var(--yellow)' }}
              >
                {item.year}
              </div>
              <h3
                className="mt-2"
                style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '14px', lineHeight: 1.2, textTransform: 'uppercase' }}
              >
                {item.title}
              </h3>
              <p
                className="mt-2 line-clamp-4"
                style={{ fontSize: '13px', lineHeight: 1.6, color: 'rgba(232,220,200,0.78)' }}
              >
                {item.desc}
              </p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  )
}

export default function Timeline(props: TimelineProps) {
  if (props.variant === 'compact') return <CompactTimeline {...props} />
  return <FullTimeline {...props} />
}

function FullTimeline({ tag, title1, title2, items, footerLink }: TimelineProps) {
  return (
    <div
      className="bg-[var(--ink)] text-[var(--paper)] -mx-3 sm:-mx-6 px-3 sm:px-6 py-12 sm:py-20 border-t-8 border-b-8 border-[var(--red)]"
      style={{ position: 'relative', zIndex: 1 }}
    >
      <div className="sec-tag" style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)' }}>
        {tag}
      </div>
      <h2 className="sec-title text-[var(--paper)]">
        {title1}
        <br />
        <span className="hl" style={{ position: 'relative', display: 'inline' }}>
          <span
            style={{
              position: 'absolute',
              bottom: '3px',
              left: '-4px',
              right: '-4px',
              height: '30%',
              background: 'var(--red)',
              zIndex: -1,
              transform: 'rotate(-0.3deg)',
            }}
          />
          {title2}
        </span>
      </h2>

      <div className="mt-8 sm:mt-10">
        {items.map((item, i) => (
          <div
            key={`${item.year}-${item.title}`}
            className="grid gap-2 sm:gap-5 py-4 sm:py-6 transition-all duration-200 sm:hover:pl-3 min-w-0"
            style={{
              gridTemplateColumns: 'clamp(48px, 14vw, 100px) 3px minmax(0, 1fr)',
              borderBottom: i < items.length - 1 ? '2px dashed rgba(232,220,200,0.08)' : 'none',
            }}
          >
            <div
              className="text-right leading-none"
              style={{
                fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900,
                fontSize: 'clamp(24px, 5vw, 40px)',
                color: 'var(--yellow)',
              }}
            >
              {item.year}
            </div>
            <div className="rounded-[2px]" style={{ background: 'var(--red)' }} />
            <div>
              <div
                style={{
                  fontFamily: "'Unbounded', sans-serif",
                  fontWeight: 700,
                  fontSize: 'clamp(14px, 3vw, 20px)',
                  textTransform: 'uppercase',
                }}
              >
                {item.title}
              </div>
              <p
                className="mt-1"
                style={{
                  fontSize: 'clamp(13px, 2vw, 15px)',
                  lineHeight: 1.7,
                  color: 'rgba(232,220,200,0.45)',
                }}
              >
                {item.desc}
              </p>
            </div>
          </div>
        ))}
      </div>

      {footerLink ? (
        <div className="mt-10 sm:mt-12 pt-8 border-t border-dashed border-[rgba(232,220,200,0.12)] text-center">
          <Link
            href={footerLink.href}
            className="inline-block no-underline text-[var(--yellow)] hover:text-white transition-colors"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700,
              fontSize: 'clamp(12px, 2vw, 14px)',
              letterSpacing: '2px',
              textTransform: 'uppercase',
            }}
          >
            {footerLink.label} →
          </Link>
        </div>
      ) : null}
    </div>
  )
}
