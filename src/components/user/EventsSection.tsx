// ============================================
// OPTIMAL BREAKS — Events section (attendance: going / wishlist / attended)
// ============================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabase } from '@/lib/supabase'
import { useEventAttendance, useEventRatings } from '@/hooks/useUserData'
import CardThumbnail from '@/components/CardThumbnail'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import { viewLabels } from './shared'

export default function EventsSection({ lang }: { lang: string }) {
  const { attendance } = useEventAttendance()
  const { ratings } = useEventRatings()
  const [eventsData, setEventsData] = useState<Record<string, any>>({})
  const [view, setView] = useState<ViewMode>('list')
  const es = lang === 'es'

  const allEventIds = Object.keys(attendance)
  const wishlist = Object.entries(attendance).filter(([, s]) => s === 'wishlist')
  const attended = Object.entries(attendance).filter(([, s]) => s === 'attended')
  const going = Object.entries(attendance).filter(([, s]) => s === 'attending')

  useEffect(() => {
    if (allEventIds.length === 0) return
    let cancelled = false
    const supabase = createBrowserSupabase()
    ;(async () => {
      const { data } = await supabase.from('events').select('id, slug, name, date_start, city, country, venue, event_type, image_url').in('id', allEventIds)
      if (!cancelled && data) {
        const map: Record<string, any> = {}
        data.forEach((e: any) => { map[e.id] = e })
        setEventsData(map)
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allEventIds)])

  const renderSection = (label: string, cutoutClass: string, entries: [string, unknown][], cutoutStyle?: React.CSSProperties) => {
    if (entries.length === 0) return null
    const ids = entries.map(([id]) => id)
    return (
      <div>
        <span className={`cutout ${cutoutClass}`} style={cutoutStyle}>{label} ({entries.length})</span>
        {view === 'large' ? (
          <div className="mt-2 grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
            {ids.map((id) => {
              const ev = eventsData[id]
              if (!ev) return null
              const r = ratings[id]
              return (
                <Link key={id} href={`/${lang}/events/${ev.slug}`} className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] sm:hover:rotate-[-1deg] sm:hover:shadow-[6px_6px_0_var(--ink)] no-underline text-[var(--ink)] block overflow-hidden group">
                  <CardThumbnail src={ev.image_url} alt={ev.name} aspectClass="aspect-poster w-full" frameClass="border-b-[3px] border-[var(--ink)]" fit="contain" />
                  <div className="p-5 sm:p-7 relative">
                    <div className="absolute -top-[6px] right-[25px] w-[50px] sm:w-[60px] h-[16px] sm:h-[18px] z-[1]" style={{ background: 'var(--tape)', transform: 'rotate(2deg)' }} />
                    <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 2vw, 16px)', color: 'var(--red)' }}>{ev.date_start || 'TBA'}</div>
                    <div className="mt-2 leading-none" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>{ev.name}</div>
                    <div className="mt-2" style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: 'var(--text-muted)' }}>{ev.venue ? `${ev.venue} — ` : ''}{ev.city}, {ev.country}</div>
                    {r && <div className="mt-2 text-[var(--yellow)]">{'★'.repeat(r.rating)}</div>}
                    {ev.event_type && <div className="absolute bottom-3 right-3 bg-[var(--red)] text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', padding: '3px 10px', transform: 'rotate(3deg)' }}>{ev.event_type.replace('_', ' ')}</div>}
                  </div>
                </Link>
              )
            })}
          </div>
        ) : view === 'compact' ? (
          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)] items-start">
            {ids.map((id) => {
              const ev = eventsData[id]
              if (!ev) return null
              return (
                <Link key={id} href={`/${lang}/events/${ev.slug}`} className="relative border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden">
                  <CardThumbnail src={ev.image_url} alt={ev.name} aspectClass="aspect-poster w-full" fit="cover" />
                  <div className="p-3 flex flex-col flex-grow min-h-0">
                    <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '11px', color: 'var(--red)' }}>{ev.date_start || 'TBA'}</div>
                    <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>{ev.name}</div>
                    <div className="flex gap-1 mt-1">
                      <span className="cutout fill" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{ev.country}</span>
                    </div>
                  </div>
                </Link>
              )
            })}
          </div>
        ) : (
          <div className="mt-2 border-4 border-[var(--ink)]">
            {ids.map((id) => {
              const ev = eventsData[id]
              const r = ratings[id]
              return (
                <div key={id} className="p-3 border-b-[3px] border-[var(--ink)] last:border-b-0 flex justify-between items-center gap-3">
                  {ev ? (
                    <Link href={`/${lang}/events/${ev.slug}`} className="flex-grow min-w-0 no-underline text-[var(--ink)] hover:text-[var(--red)]">
                      <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '13px', textTransform: 'uppercase' }}>{ev.name}</div>
                      <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>{ev.date_start || 'TBA'} — {ev.city}, {ev.country}</div>
                    </Link>
                  ) : (
                    <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', color: 'var(--dim)' }}>{id.slice(0, 8)}...</span>
                  )}
                  {r ? <span className="text-[var(--yellow)] shrink-0">{'★'.repeat(r.rating)}</span> : undefined}
                </div>
              )
            })}
          </div>
        )}
      </div>
    )
  }

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
          {es ? 'MIS EVENTOS' : 'MY EVENTS'}
        </h2>
        {allEventIds.length > 0 && <ViewToggle view={view} setView={setView} labels={viewLabels(es)} />}
      </div>

      {allEventIds.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'Explora eventos y marca los que te interesan.' : 'Explore events and mark the ones you\'re interested in.'}
        </p>
      ) : (
        <div className="space-y-6">
          {renderSection(es ? 'VOY' : 'GOING', 'acid', going)}
          {renderSection(es ? 'QUIERO IR' : 'WISHLIST', 'uv', wishlist)}
          {renderSection(es ? 'ASISTÍ' : 'ATTENDED', 'fill', attended, { background: 'var(--yellow)', color: 'var(--ink)' })}
        </div>
      )}
    </div>
  )
}
