'use client'

import { useState } from 'react'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import type { BreakEvent } from '@/types/database'

interface Props {
  events: BreakEvent[]
  dict: { view_large: string; view_compact: string; view_list: string }
  lang: string
}

export default function EventsExplorer({ events, dict, lang }: Props) {
  const [view, setView] = useState<ViewMode>('compact')

  return (
    <div>
      <div className="flex justify-end mb-5">
        <ViewToggle view={view} setView={setView} labels={dict} />
      </div>

      {view === 'large' ? (
        <LargeGrid events={events} lang={lang} />
      ) : view === 'compact' ? (
        <CompactGrid events={events} lang={lang} />
      ) : (
        <ListView events={events} lang={lang} />
      )}
    </div>
  )
}

function LargeGrid({ events, lang }: { events: BreakEvent[]; lang: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
      {events.map((e) => (
        <Link
          key={e.slug}
          href={`/${lang}/events/${e.slug}`}
          className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] sm:hover:rotate-[-1deg] sm:hover:shadow-[6px_6px_0_var(--ink)] no-underline text-[var(--ink)] block overflow-hidden group"
        >
          <CardThumbnail
            src={e.image_url}
            alt={e.name}
            aspectClass="aspect-[2/3]"
            frameClass="border-b-[3px] border-[var(--ink)]"
            fit="contain"
          />
          <div className="p-5 sm:p-7 relative">
            <div className="absolute -top-[6px] right-[25px] w-[50px] sm:w-[60px] h-[16px] sm:h-[18px] z-[1]" style={{ background: 'var(--tape)', transform: 'rotate(2deg)' }} />
            <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 2vw, 16px)', color: 'var(--red)' }}>
              {e.date_start || 'TBA'}
            </div>
            <div className="mt-2 leading-none" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
              {e.name}
            </div>
            <div className="mt-2" style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: 'var(--text-muted)' }}>
              {e.venue ? `${e.venue} — ` : ''}{e.city}, {e.country}
            </div>
            <div className="absolute bottom-3 right-3 bg-[var(--red)] text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', padding: '3px 10px', transform: 'rotate(3deg)' }}>
              {e.event_type?.replace('_', ' ')}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function CompactGrid({ events, lang }: { events: BreakEvent[]; lang: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
      {events.map((e) => (
        <Link
          key={e.slug}
          href={`/${lang}/events/${e.slug}`}
          className="border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden"
        >
          <CardThumbnail src={e.image_url} alt={e.name} aspectClass="aspect-[2/3]" fit="contain" />
          <div className="p-3 flex flex-col flex-grow min-h-0">
            <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '11px', color: 'var(--red)' }}>
              {e.date_start || 'TBA'}
            </div>
            <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              {e.name}
            </div>
            <div className="flex gap-1 mt-1">
              <span className="cutout fill" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{e.country}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function ListView({ events, lang }: { events: BreakEvent[]; lang: string }) {
  return (
    <div className="border-4 border-[var(--ink)]">
      {events.map((e) => (
        <Link
          key={e.slug}
          href={`/${lang}/events/${e.slug}`}
          className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 border-b-[2px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)]"
        >
          <div className="shrink-0 w-[2.75rem] sm:w-14 overflow-hidden border-[2px] border-[var(--ink)]">
            <CardThumbnail src={e.image_url} alt={e.name} aspectClass="aspect-[2/3]" frameClass="" fit="contain" />
          </div>
          <div className="flex-grow min-w-0">
            <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
              {e.name}
            </div>
            <div className="mt-[2px]" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>
              {e.date_start || 'TBA'}
            </div>
          </div>
          <div className="hidden sm:flex gap-2 shrink-0">
            <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{e.city}, {e.country}</span>
            <span className="cutout red" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{e.event_type?.replace('_', ' ')}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
