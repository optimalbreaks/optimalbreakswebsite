// ============================================
// OPTIMAL BREAKS — Event Flyer Card (home = vista grande /events)
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

/** Misma envoltura y miniatura que `LargeGrid` en `EventsExplorer` (vista grande /events). */
export default function EventFlyer({ date, name, location, type, imageUrl, href }: EventFlyerProps) {
  const shell =
    'border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] sm:hover:rotate-[-1deg] sm:hover:shadow-[6px_6px_0_var(--ink)] no-underline text-[var(--ink)] block overflow-hidden group'

  const body = (
    <>
      <CardThumbnail
        src={imageUrl}
        alt={name}
        aspectClass="aspect-poster w-full"
        frameClass="border-b-[3px] border-[var(--ink)]"
        fit="cover"
      />

      <div className="p-5 sm:p-7 relative">
        {/* Tape */}
        <div
          className="absolute -top-[6px] right-[25px] w-[50px] sm:w-[60px] h-[16px] sm:h-[18px] z-[1]"
          style={{ background: 'var(--tape)', transform: 'rotate(2deg)' }}
        />

        <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 2vw, 16px)', color: 'var(--red)' }}>
          {date}
        </div>
        <div
          className="mt-2 leading-none"
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
        <div className="mt-2" style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: 'var(--text-muted)' }}>
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
      <Link href={href} className={shell}>
        {body}
      </Link>
    )
  }

  return <div className={shell}>{body}</div>
}
