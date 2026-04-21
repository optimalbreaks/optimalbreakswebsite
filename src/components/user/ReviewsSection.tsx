// ============================================
// OPTIMAL BREAKS — Reviews section (event_ratings + artist_sightings)
// ============================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabase } from '@/lib/supabase'
import { useEventRatings, useArtistSightings } from '@/hooks/useUserData'
import CardThumbnail from '@/components/CardThumbnail'
import { DashboardReviewStars } from './shared'

export default function ReviewsSection({ lang }: { lang: string }) {
  const { ratings, loading: ratingsLoading } = useEventRatings()
  const { sightings, loading: sightingsLoading } = useArtistSightings()
  const [eventsData, setEventsData] = useState<Record<string, any>>({})
  const [artistImages, setArtistImages] = useState<Record<string, string | null>>({})
  const [eventsLoading, setEventsLoading] = useState(false)
  const es = lang === 'es'

  const ratedEventIds = Object.keys(ratings)
  const totalReviews = ratedEventIds.length + sightings.length

  useEffect(() => {
    if (ratedEventIds.length === 0) {
      setEventsData({})
      setEventsLoading(false)
      return
    }
    let cancelled = false
    setEventsLoading(true)
    const supabase = createBrowserSupabase()
    ;(async () => {
      const { data } = await supabase.from('events').select('id, slug, name, date_start, city, country, venue, event_type, image_url').in('id', ratedEventIds)
      if (!cancelled) {
        if (data) {
          const map: Record<string, any> = {}
          data.forEach((e: any) => { map[e.id] = e })
          setEventsData(map)
        }
        setEventsLoading(false)
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(ratedEventIds)])

  useEffect(() => {
    if (sightings.length === 0) {
      setArtistImages({})
      return
    }
    const ids = Array.from(new Set(sightings.map((s) => s.artist_id).filter(Boolean)))
    let cancelled = false
    const supabase = createBrowserSupabase()
    ;(async () => {
      const { data } = await supabase.from('artists').select('id, image_url').in('id', ids)
      if (cancelled || !data) return
      const map: Record<string, string | null> = {}
      data.forEach((a: { id: string; image_url: string | null }) => {
        map[a.id] = a.image_url ?? null
      })
      setArtistImages(map)
    })()
    return () => { cancelled = true }
  }, [sightings])

  const pageLoading = ratingsLoading || sightingsLoading || eventsLoading

  return (
    <div>
      <div className="mb-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
            {es ? 'MIS RESEÑAS' : 'MY REVIEWS'} ({totalReviews})
          </h2>
        </div>
        <p className="mt-2 mb-0" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)', lineHeight: 1.5 }}>
          {es
            ? 'Pulsa una fila para abrir la ficha y editar tu valoración o tu directo. También puedes hacerlo desde el botón VALORAR / VISTO EN VIVO en cada página.'
            : 'Tap a row to open the page and edit your rating or live entry. You can also use RATE / SEEN LIVE on each detail page.'}
        </p>
      </div>

      {pageLoading ? (
        <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', color: 'var(--dim)' }}>
          {es ? 'Cargando...' : 'Loading...'}
        </p>
      ) : totalReviews === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es
            ? 'Aún no hay nada aquí: valora un evento al que hayas ido o registra un directo con «Visto en vivo» en un artista.'
            : 'Nothing here yet: rate an event you attended, or log a live show with “Seen live” on an artist page.'}
        </p>
      ) : (
        <div className="space-y-8">
          {ratedEventIds.length > 0 && (
            <div>
              <span className="cutout acid" style={{ margin: 0, fontSize: '10px', letterSpacing: '2px' }}>
                {es ? 'EVENTOS' : 'EVENTS'} ({ratedEventIds.length})
              </span>
              <div className="mt-3 space-y-0 border-4 border-[var(--ink)]">
                {ratedEventIds.map((id) => {
                  const ev = eventsData[id]
                  const r = ratings[id]
                  if (!ev || !r) return null
                  return (
                    <Link
                      key={id}
                      href={`/${lang}/events/${ev.slug}?editReview=1`}
                      className="group p-4 border-b-[3px] border-[var(--ink)] last:border-b-0 flex flex-col sm:flex-row gap-4 items-start no-underline text-inherit cursor-pointer hover:bg-[var(--paper-dark)]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2"
                    >
                      <div className="shrink-0 w-20 sm:w-24 border-[2px] border-[var(--ink)]">
                        <CardThumbnail src={ev.image_url} alt={ev.name} aspectClass="aspect-square" fit="cover" />
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div className="text-[var(--ink)] group-hover:text-[var(--red)] transition-colors" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase' }}>
                            {ev.name}
                          </div>
                          <DashboardReviewStars rating={r.rating} />
                        </div>
                        <div className="mt-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                          {ev.date_start || 'TBA'} — {ev.venue ? `${ev.venue}, ` : ''}{ev.city}, {ev.country}
                        </div>
                        {(r.attended_at || r.venue || r.city || r.country) && (
                          <div className="mt-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', color: 'var(--dim)' }}>
                            {es ? 'Tu experiencia: ' : 'Your experience: '}
                            {r.attended_at ? `${String(r.attended_at).slice(0, 10)}` : ''}
                            {r.attended_at && (r.venue || r.city || r.country) ? ' — ' : ''}
                            {[r.venue, [r.city, r.country].filter(Boolean).join(', ')].filter(Boolean).join(' — ')}
                          </div>
                        )}
                        {r.review && (
                          <div className="mt-3 p-3 bg-[var(--paper-dark)] border-[2px] border-[var(--ink)] relative">
                            <div className="absolute -top-3 left-3 text-[var(--dim)]" style={{ fontFamily: "Georgia, serif", fontSize: '32px', lineHeight: 1 }}>&ldquo;</div>
                            <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'var(--ink)', position: 'relative', zIndex: 1, margin: 0, whiteSpace: 'pre-line' }}>
                              {r.review}
                            </p>
                          </div>
                        )}
                      </div>
                    </Link>
                  )
                })}
              </div>
            </div>
          )}

          {sightings.length > 0 && (
            <div>
              <span className="cutout fill" style={{ margin: 0, fontSize: '10px', letterSpacing: '2px', background: 'var(--acid)', color: 'var(--ink)' }}>
                {es ? 'VISTO EN VIVO (ARTISTAS)' : 'SEEN LIVE (ARTISTS)'} ({sightings.length})
              </span>
              <div className="mt-3 space-y-0 border-4 border-[var(--ink)]">
                {sightings.map((s) => {
                  const editHref = s.artist_slug ? `/${lang}/artists/${s.artist_slug}?editSighting=${encodeURIComponent(s.id)}` : null
                  const title = s.artist_name || s.artist_slug || (es ? 'Artista' : 'Artist')
                  const thumb = artistImages[s.artist_id]
                  const rowInner = (
                    <>
                      <div className="shrink-0 w-20 sm:w-24 border-[2px] border-[var(--ink)] bg-[var(--paper-dark)]">
                        <CardThumbnail src={thumb} alt={title} aspectClass="aspect-square" fit="cover" />
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase' }} className="text-[var(--ink)]">
                            {title}
                          </div>
                          <DashboardReviewStars rating={s.rating} />
                        </div>
                        <div className="mt-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                          {s.seen_at || (es ? 'Sin fecha' : 'No date')}
                          {s.event_name ? ` — ${s.event_name}` : ''}
                        </div>
                        <div className="mt-0.5" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                          {[s.venue, [s.city, s.country].filter(Boolean).join(', ')].filter(Boolean).join(' — ') || (es ? 'Sin lugar' : 'No venue')}
                        </div>
                        {s.notes?.trim() && (
                          <div className="mt-3 p-3 bg-[var(--paper-dark)] border-[2px] border-[var(--ink)] relative">
                            <div className="absolute -top-3 left-3 text-[var(--dim)]" style={{ fontFamily: "Georgia, serif", fontSize: '32px', lineHeight: 1 }}>&ldquo;</div>
                            <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'var(--ink)', position: 'relative', zIndex: 1, margin: 0, whiteSpace: 'pre-line' }}>
                              {s.notes.trim()}
                            </p>
                          </div>
                        )}
                      </div>
                    </>
                  )
                  return editHref ? (
                    <Link
                      key={s.id}
                      href={editHref}
                      className="p-4 border-b-[3px] border-[var(--ink)] last:border-b-0 flex flex-col sm:flex-row gap-4 items-start no-underline text-inherit cursor-pointer hover:bg-[var(--paper-dark)]/50 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2"
                    >
                      {rowInner}
                    </Link>
                  ) : (
                    <div key={s.id} className="p-4 border-b-[3px] border-[var(--ink)] last:border-b-0 flex flex-col sm:flex-row gap-4 items-start">
                      {rowInner}
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
