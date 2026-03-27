// ============================================
// OPTIMAL BREAKS — Timeline Section
// ============================================

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
}

export default function Timeline({ tag, title1, title2, items }: TimelineProps) {
  return (
    <div
      className="bg-[var(--ink)] text-[var(--paper)] -mx-6 px-6 py-20 border-t-8 border-b-8 border-[var(--red)]"
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

      <div className="mt-10">
        {items.map((item, i) => (
          <div
            key={i}
            className="grid gap-5 py-6 transition-all duration-200 hover:pl-3"
            style={{
              gridTemplateColumns: '100px 3px 1fr',
              borderBottom: i < items.length - 1 ? '2px dashed rgba(232,220,200,0.08)' : 'none',
            }}
          >
            <div
              className="text-right leading-none"
              style={{
                fontFamily: "'Permanent Marker', cursive",
                fontSize: '40px',
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
                  fontSize: '20px',
                  textTransform: 'uppercase',
                }}
              >
                {item.title}
              </div>
              <p
                className="mt-1"
                style={{
                  fontSize: '15px',
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
    </div>
  )
}
