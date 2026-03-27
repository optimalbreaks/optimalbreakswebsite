// ============================================
// OPTIMAL BREAKS — Artist Ransom Card
// Responsive borders handled by parent grid
// ============================================

import Link from 'next/link'

interface ArtistCardProps {
  num: number
  name: string
  genres: string[]
  desc: string
  href?: string
}

export default function ArtistCard({ num, name, genres, desc, href }: ArtistCardProps) {
  const inner = (
    <>
      <div
        className="leading-none"
        style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(22px, 6vw, 36px)', color: 'var(--red)' }}
      >
        #{num}
      </div>
      <div
        className="mt-2 break-words"
        style={{
          fontFamily: "'Unbounded', sans-serif",
          fontWeight: 900,
          fontSize: 'clamp(15px, 4vw, 20px)',
          textTransform: 'uppercase',
          letterSpacing: '-0.5px',
        }}
      >
        {name}
      </div>
      <div className="flex flex-wrap gap-1 mt-[6px]">
        {genres.map((g, i) => (
          <span
            key={i}
            className="bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700,
              fontSize: '9px',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              padding: '2px 7px',
            }}
          >
            {g}
          </span>
        ))}
      </div>
      <p className="mt-[10px] flex-grow" style={{ fontSize: '14px', lineHeight: 1.6, color: 'rgba(26,26,26,0.5)' }}>
        {desc}
      </p>
    </>
  )

  const shell = 'p-4 sm:p-[22px_30px] border-b-[3px] sm:border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group min-w-0 flex flex-col h-full'

  if (href) {
    return (
      <Link href={href} className={`${shell} no-underline text-[var(--ink)]`}>
        {inner}
      </Link>
    )
  }

  return <div className={shell}>{inner}</div>
}
