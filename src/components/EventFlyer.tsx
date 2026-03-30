// ============================================
// OPTIMAL BREAKS — Event Flyer Card
// Responsive: smaller padding + text on mobile
// ============================================

import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'

interface EventFlyerProps {
  date: string
  name: string
  location: string
  type: string
  imageUrl?: string | null
  /** Si se pasa, la tarjeta enlaza a la ficha del evento */
  href?: string
}

export default function EventFlyer({ date, name, location, type, imageUrl, href }: EventFlyerProps) {
  const shell =
    'border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] min-w-0 sm:hover:rotate-[-1deg] sm:hover:shadow-[6px_6px_0_var(--ink)] flex flex-col h-full overflow-hidden group'

  const body = (
    <>
      <CardThumbnail src={imageUrl} alt={name} aspectClass="aspect-poster w-full" fit="contain" />

      <div className="p-4 sm:p-7 relative flex flex-col flex-grow">
        {/* Tape */}
        <div
          className="absolute -top-[6px] right-[25px] w-[50px] sm:w-[60px] h-[16px] sm:h-[18px] z-[1]"
          style={{ background: 'var(--tape)', transform: 'rotate(2deg)' }}
        />

        <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 2vw, 16px)', color: 'var(--red)' }}>
          {date}
        </div>
        <div
          className="mt-2 leading-none break-words pr-16 sm:pr-0"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(18px, 3vw, 24px)',
            textTransform: 'uppercase',
            letterSpacing: '-0.5px',
          }}
        >
          {name}
        </div>
        <div className="mt-2 flex-grow pb-4" style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: 'var(--text-muted)' }}>
          {location}
        </div>

        {/* Sticker */}
        <div
          className="absolute bottom-3 right-3 bg-[var(--red)] text-white"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '9px',
            letterSpacing: '2px',
            textTransform: 'uppercase',
            padding: '3px 10px',
            transform: 'rotate(3deg)',
          }}
        >
          {type}
        </div>
      </div>
    </>
  )

  if (href) {
    return (
      <Link href={href} className={`${shell} no-underline text-[var(--ink)]`}>
        {body}
      </Link>
    )
  }

  return <div className={shell}>{body}</div>
}
