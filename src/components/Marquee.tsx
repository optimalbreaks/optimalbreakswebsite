// ============================================
// OPTIMAL BREAKS — Marquee Tape Strip
// ============================================

interface MarqueeProps {
  items: string[]
}

export default function Marquee({ items }: MarqueeProps) {
  const doubled = [...items, ...items]

  return (
    <div className="overflow-hidden py-3 bg-[var(--ink)] border-t-4 border-b-4 border-dashed border-[var(--red)]">
      <div className="flex animate-marquee whitespace-nowrap">
        {doubled.map((text, i) => (
          <span
            key={i}
            className="px-8"
            style={{
              fontFamily: "'Permanent Marker', cursive",
              fontSize: 'clamp(14px, 4.5vw, 20px)',
              color: 'var(--yellow)',
            }}
          >
            ★ {text} ★
          </span>
        ))}
      </div>
    </div>
  )
}
