// ============================================
// OPTIMAL BREAKS — Artist Ransom Card
// Responsive borders handled by parent grid
// ============================================

interface ArtistCardProps {
  num: number
  name: string
  genres: string[]
  desc: string
}

export default function ArtistCard({ num, name, genres, desc }: ArtistCardProps) {
  return (
    <div className="p-5 sm:p-[22px_30px] border-b-[3px] sm:border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group">
      <div
        className="leading-none"
        style={{ fontFamily: "'Permanent Marker', cursive", fontSize: 'clamp(28px, 5vw, 36px)', color: 'var(--red)' }}
      >
        #{num}
      </div>
      <div
        className="mt-2"
        style={{
          fontFamily: "'Unbounded', sans-serif",
          fontWeight: 900,
          fontSize: 'clamp(16px, 3vw, 20px)',
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
      <p className="mt-[10px]" style={{ fontSize: '14px', lineHeight: 1.6, color: 'rgba(26,26,26,0.5)' }}>
        {desc}
      </p>
    </div>
  )
}
