// ============================================
// OPTIMAL BREAKS — Favorites section
// Artists, labels, events (heart), and saved mixes
// ============================================

'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { createBrowserSupabase } from '@/lib/supabase'
import {
  useFavoriteArtists,
  useFavoriteLabels,
  useFavoriteEvents,
  useSavedMixes,
} from '@/hooks/useUserData'
import CardThumbnail from '@/components/CardThumbnail'
import FavoriteButton from '@/components/FavoriteButton'
import type { ViewMode } from '@/components/ViewToggle'
import SoundCloudVisualEmbed, { isSoundCloudTrackEmbedUrl } from '@/components/SoundCloudVisualEmbed'
import {
  DashboardMixPlayButton,
  SectionHeader,
  YouTubeIframe,
  extractYouTubeId,
  formatMixDateLine,
} from './shared'

export default function FavoritesSection({ lang }: { lang: string }) {
  const { favorites: artistIds } = useFavoriteArtists()
  const { favorites: labelIds } = useFavoriteLabels()
  const { favorites: favoriteEventIds } = useFavoriteEvents()
  const { saved: mixIds } = useSavedMixes()
  const [artists, setArtists] = useState<any[]>([])
  const [labels, setLabels] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [mixes, setMixes] = useState<any[]>([])
  const [artistView, setArtistView] = useState<ViewMode>('large')
  const [labelView, setLabelView] = useState<ViewMode>('large')
  const [eventView, setEventView] = useState<ViewMode>('large')
  const [mixView, setMixView] = useState<ViewMode>('large')
  const es = lang === 'es'

  useEffect(() => {
    const supabase = createBrowserSupabase()
    let cancelled = false

    ;(async () => {
      if (artistIds.length === 0) { if (!cancelled) setArtists([]) }
      else {
        const { data } = await supabase.from('artists').select('id, slug, name, name_display, styles, country, era, image_url').in('id', artistIds)
        if (!cancelled) setArtists(data || [])
      }
      if (labelIds.length === 0) { if (!cancelled) setLabels([]) }
      else {
        const { data } = await supabase.from('labels').select('id, slug, name, country, founded_year, is_active, image_url').in('id', labelIds)
        if (!cancelled) setLabels(data || [])
      }
      if (favoriteEventIds.length === 0) { if (!cancelled) setEvents([]) }
      else {
        const { data } = await supabase.from('events').select('id, slug, name, date_start, city, country, venue, event_type, image_url').in('id', favoriteEventIds)
        if (!cancelled) setEvents(data || [])
      }
      if (mixIds.length === 0) { if (!cancelled) setMixes([]) }
      else {
        const { data } = await supabase.from('mixes').select('id, slug, title, artist_name, mix_type, image_url, video_url, published_at, year, duration_minutes, embed_url, platform, audio_url').in('id', mixIds)
        if (!cancelled) setMixes(data || [])
      }
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistIds, labelIds, JSON.stringify(favoriteEventIds), mixIds])

  return (
    <div className="space-y-10">
      {/* Artists */}
      <div>
        <SectionHeader title={es ? 'ARTISTAS FAVORITOS' : 'FAVORITE ARTISTS'} count={artistIds.length} view={artistView} setView={setArtistView} es={es} />
        {artistIds.length === 0 ? (
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
            {es ? 'Aún no tienes artistas favoritos. Explora y marca los que te gusten.' : 'No favorite artists yet. Explore and mark the ones you like.'}
          </p>
        ) : artistView === 'large' ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-0 border-4 border-[var(--ink)]">
            {artists.map((a) => (
              <div key={a.id} className="relative border-b-[3px] sm:border-r-[3px] border-[var(--ink)]">
                <FavoriteButton type="artist" entityId={a.id} lang={lang} />
                <Link href={`/${lang}/artists/${a.slug}`} className="transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden h-full min-h-0">
                  <CardThumbnail src={a.image_url} alt={a.name_display || a.name} aspectClass="aspect-[5/3]" />
                  <div className="p-5 sm:p-[22px_30px] flex flex-col flex-grow min-h-0">
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(16px, 3vw, 20px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>{a.name_display || a.name}</div>
                    <div className="flex flex-wrap gap-1 mt-[6px]">
                      {a.styles?.map((s: string, si: number) => (
                        <span key={si} className="bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', padding: '2px 7px' }}>{s}</span>
                      ))}
                    </div>
                    <div className="flex gap-2 mt-2">
                      {a.country && <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{a.country}</span>}
                      {a.era && <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{a.era}</span>}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        ) : artistView === 'compact' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
            {artists.map((a) => (
              <div key={a.id} className="relative border-b-[3px] border-r-[3px] border-[var(--ink)]">
                <FavoriteButton type="artist" entityId={a.id} lang={lang} />
                <Link href={`/${lang}/artists/${a.slug}`} className="transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden">
                  <CardThumbnail src={a.image_url} alt={a.name_display || a.name} aspectClass="aspect-square" />
                  <div className="p-3 flex flex-col flex-grow min-h-0">
                    <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>{a.name_display || a.name}</div>
                    <div className="flex flex-wrap gap-[2px] mt-1">
                      {a.styles?.slice(0, 2).map((s: string, si: number) => (
                        <span key={si} className="bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '7px', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '1px 4px' }}>{s}</span>
                      ))}
                    </div>
                    <div className="flex gap-1 mt-1">
                      {a.country && <span className="cutout fill" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{a.country}</span>}
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-4 border-[var(--ink)]">
            {artists.map((a) => (
              <div key={a.id} className="relative border-b-[2px] border-[var(--ink)]">
                <Link href={`/${lang}/artists/${a.slug}`} className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 pr-12 transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)]">
                  <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 overflow-hidden border-[2px] border-[var(--ink)]">
                    <CardThumbnail src={a.image_url} alt={a.name_display || a.name} aspectClass="aspect-square" frameClass="" />
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>{a.name_display || a.name}</div>
                    <div className="flex flex-wrap gap-[3px] mt-[2px]">
                      {a.styles?.slice(0, 3).map((s: string, si: number) => (
                        <span key={si} className="bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '8px', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '1px 5px' }}>{s}</span>
                      ))}
                    </div>
                  </div>
                  <div className="hidden sm:flex gap-2 shrink-0">
                    {a.country && <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{a.country}</span>}
                    {a.era && <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{a.era}</span>}
                  </div>
                </Link>
                <FavoriteButton type="artist" entityId={a.id} lang={lang} className="!top-1/2 !-translate-y-1/2 !right-3" />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Labels */}
      <div>
        <SectionHeader title={es ? 'SELLOS FAVORITOS' : 'FAVORITE LABELS'} count={labelIds.length} view={labelView} setView={setLabelView} es={es} />
        {labelIds.length === 0 ? (
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>{es ? 'Aún no tienes sellos favoritos.' : 'No favorite labels yet.'}</p>
        ) : labelView === 'large' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
            {labels.map((l) => (
              <div key={l.id} className="relative border-r-[3px] border-b-[3px] border-[var(--ink)] max-md:!border-r-0">
                <FavoriteButton type="label" entityId={l.id} lang={lang} />
                <Link href={`/${lang}/labels/${l.slug}`} className="transition-all duration-150 hover:bg-[var(--yellow)] no-underline text-[var(--ink)] flex flex-col overflow-hidden group min-h-0">
                  <CardThumbnail src={l.image_url} alt={l.name} aspectClass="aspect-[3/2]" />
                  <div className="p-6 sm:p-8 flex flex-col flex-grow min-h-0">
                    <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--red)' }}>Est. {l.founded_year || '?'}</div>
                    <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>{l.name}</div>
                    <div className="flex gap-2 mt-2">
                      <span className="cutout fill" style={{ margin: 0 }}>{l.country}</span>
                      <span className={`cutout ${l.is_active ? 'acid' : 'outline'}`} style={{ margin: 0 }}>{l.is_active ? (es ? 'ACTIVO' : 'ACTIVE') : (es ? 'INACTIVO' : 'INACTIVE')}</span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        ) : labelView === 'compact' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
            {labels.map((l) => (
              <div key={l.id} className="relative border-b-[3px] border-r-[3px] border-[var(--ink)]">
                <FavoriteButton type="label" entityId={l.id} lang={lang} />
                <Link href={`/${lang}/labels/${l.slug}`} className="transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden">
                  <CardThumbnail src={l.image_url} alt={l.name} aspectClass="aspect-square" />
                  <div className="p-3 flex flex-col flex-grow min-h-0">
                    <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>Est. {l.founded_year || '?'}</div>
                    <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>{l.name}</div>
                    <div className="flex gap-1 mt-1">
                      <span className="cutout fill" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{l.country}</span>
                      <span className={`cutout ${l.is_active ? 'acid' : 'outline'}`} style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{l.is_active ? (es ? 'ACTIVO' : 'ACTIVE') : (es ? 'INACTIVO' : 'INACTIVE')}</span>
                    </div>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        ) : (
          <div className="border-4 border-[var(--ink)]">
            {labels.map((l) => (
              <div key={l.id} className="relative border-b-[2px] border-[var(--ink)]">
                <FavoriteButton type="label" entityId={l.id} lang={lang} className="!top-1/2 !-translate-y-1/2 !right-3" />
                <Link href={`/${lang}/labels/${l.slug}`} className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] pr-12">
                  <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 overflow-hidden border-[2px] border-[var(--ink)]">
                    <CardThumbnail src={l.image_url} alt={l.name} aspectClass="aspect-square" frameClass="" />
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>{l.name}</div>
                    <div className="mt-[2px]" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>Est. {l.founded_year || '?'}</div>
                  </div>
                  <div className="hidden sm:flex gap-2 shrink-0">
                    <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{l.country}</span>
                    <span className={`cutout ${l.is_active ? 'acid' : 'outline'}`} style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{l.is_active ? (es ? 'ACTIVO' : 'ACTIVE') : (es ? 'INACTIVO' : 'INACTIVE')}</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Events (corazón → favorite_events) */}
      <div>
        <SectionHeader title={es ? 'EVENTOS FAVORITOS' : 'FAVORITE EVENTS'} count={favoriteEventIds.length} view={eventView} setView={setEventView} es={es} />
        {favoriteEventIds.length === 0 ? (
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>{es ? 'Aún no has marcado eventos.' : 'No favorite events yet.'}</p>
        ) : eventView === 'large' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
            {events.map((ev) => (
              <Link key={ev.id} href={`/${lang}/events/${ev.slug}`} className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] sm:hover:rotate-[-1deg] sm:hover:shadow-[6px_6px_0_var(--ink)] no-underline text-[var(--ink)] block overflow-hidden group">
                <FavoriteButton type="event" entityId={ev.id} lang={lang} />
                <CardThumbnail src={ev.image_url} alt={ev.name} aspectClass="aspect-poster w-full" frameClass="border-b-[3px] border-[var(--ink)]" fit="contain" />
                <div className="p-5 sm:p-7 relative">
                  <div className="absolute -top-[6px] right-[25px] w-[50px] sm:w-[60px] h-[16px] sm:h-[18px] z-[1]" style={{ background: 'var(--tape)', transform: 'rotate(2deg)' }} />
                  <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 2vw, 16px)', color: 'var(--red)' }}>{ev.date_start || 'TBA'}</div>
                  <div className="mt-2 leading-none" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>{ev.name}</div>
                  <div className="mt-2" style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: 'var(--text-muted)' }}>{ev.venue ? `${ev.venue} — ` : ''}{ev.city}, {ev.country}</div>
                  {ev.event_type && (
                    <div className="absolute bottom-3 right-3 bg-[var(--red)] text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', padding: '3px 10px', transform: 'rotate(3deg)' }}>{ev.event_type.replace('_', ' ')}</div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        ) : eventView === 'compact' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)] items-start">
            {events.map((ev) => (
              <Link key={ev.id} href={`/${lang}/events/${ev.slug}`} className="relative border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden">
                <FavoriteButton type="event" entityId={ev.id} lang={lang} />
                <CardThumbnail src={ev.image_url} alt={ev.name} aspectClass="aspect-poster w-full" fit="cover" />
                <div className="p-3 flex flex-col flex-grow min-h-0">
                  <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '11px', color: 'var(--red)' }}>{ev.date_start || 'TBA'}</div>
                  <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>{ev.name}</div>
                  <div className="flex gap-1 mt-1">
                    <span className="cutout fill" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{ev.country}</span>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        ) : (
          <div className="border-4 border-[var(--ink)]">
            {events.map((ev) => (
              <div key={ev.id} className="relative border-b-[2px] border-[var(--ink)]">
                <FavoriteButton type="event" entityId={ev.id} lang={lang} className="!top-1/2 !-translate-y-1/2 !right-3" />
                <Link href={`/${lang}/events/${ev.slug}`} className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 pr-12 transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)]">
                  <div className="shrink-0 w-[2.75rem] sm:w-14 overflow-hidden border-[2px] border-[var(--ink)]">
                    <CardThumbnail src={ev.image_url} alt={ev.name} aspectClass="aspect-poster w-full" frameClass="" fit="cover" />
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>{ev.name}</div>
                    <div className="mt-[2px]" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>{ev.date_start || 'TBA'}</div>
                  </div>
                  <div className="hidden sm:flex gap-2 shrink-0">
                    <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{ev.city}, {ev.country}</span>
                    {ev.event_type && <span className="cutout red" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{ev.event_type.replace('_', ' ')}</span>}
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Mixes */}
      <div>
        <SectionHeader title={es ? 'MIXES GUARDADOS' : 'SAVED MIXES'} count={mixIds.length} view={mixView} setView={setMixView} es={es} />
        {mixIds.length === 0 ? (
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>{es ? 'Guarda mixes desde la sección de Mixes.' : 'Save mixes from the Mixes section.'}</p>
        ) : mixes.length === 0 ? (
          <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', color: 'var(--dim)' }}>{es ? 'Cargando mixes…' : 'Loading mixes…'}</p>
        ) : mixView === 'large' ? (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
            {mixes.map((m) => {
              const ytId = extractYouTubeId(m.video_url)
              const scTrackUrl = !ytId && isSoundCloudTrackEmbedUrl(m.embed_url) ? m.embed_url!.trim() : null
              return (
                <div key={m.id} className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] overflow-hidden group">
                  <FavoriteButton type="mix" entityId={m.id} lang={lang} />
                  {ytId ? (
                    <YouTubeIframe videoId={ytId} title={m.title} />
                  ) : scTrackUrl ? (
                    <SoundCloudVisualEmbed trackUrl={scTrackUrl} title={m.title} />
                  ) : (
                    <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-video" />
                  )}
                  <div className="p-5 sm:p-7 relative">
                    <div className="absolute -top-[6px] left-[20px] w-[60px] h-[18px] z-[1]" style={{ background: 'var(--tape)', transform: 'rotate(-2deg)' }} />
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="cutout red" style={{ margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                      <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>{formatMixDateLine(m, lang)}</span>
                    </div>
                    <div className="mt-3" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase', letterSpacing: '-0.5px', lineHeight: 1.1 }}>{m.title}</div>
                    <div className="mt-2" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>{m.artist_name}</div>
                    {ytId ? (
                      <a href={m.video_url!} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}>YouTube ↗</a>
                    ) : scTrackUrl ? (
                      <a href={scTrackUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}>SoundCloud ↗</a>
                    ) : (
                      <DashboardMixPlayButton m={m} />
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        ) : mixView === 'compact' ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
            {mixes.map((m) => {
              const ytId = extractYouTubeId(m.video_url)
              return (
                <div key={m.id} className="border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group flex flex-col overflow-hidden relative">
                  <FavoriteButton type="mix" entityId={m.id} lang={lang} />
                  {ytId ? <YouTubeIframe videoId={ytId} title={m.title} className="border-b-[3px] border-[var(--ink)]" /> : <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-video" />}
                  <div className="p-3 flex flex-col flex-grow min-h-0">
                    <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '11px', color: 'var(--red)' }}>{m.artist_name}</div>
                    <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>{m.title}</div>
                    <div className="flex flex-wrap gap-1 mt-1 items-center">
                      <span className="cutout red" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                      <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', color: 'var(--dim)' }}>{formatMixDateLine(m, lang)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        ) : (
          <div className="border-4 border-[var(--ink)]">
            {mixes.map((m) => {
              const ytId = extractYouTubeId(m.video_url)
              return (
                <div key={m.id} className="border-b-[2px] border-[var(--ink)] px-4 sm:px-6 py-3 transition-all duration-150 hover:bg-[var(--yellow)]/40 relative">
                  <FavoriteButton type="mix" entityId={m.id} lang={lang} className="!top-1/2 !-translate-y-1/2 !right-3" />
                  <div className="flex items-center gap-3 sm:gap-5 pr-10">
                    <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 overflow-hidden border-[2px] border-[var(--ink)]">
                      {ytId ? <div className="w-full h-full bg-[var(--ink)] flex items-center justify-center text-[var(--yellow)] text-xs">▶</div> : <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" frameClass="" />}
                    </div>
                    <div className="flex-grow min-w-0">
                      <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>{m.title}</div>
                      <div className="mt-[2px]" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>{m.artist_name}</div>
                    </div>
                    <div className="hidden sm:flex gap-2 shrink-0">
                      <span className="cutout red" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                      <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{formatMixDateLine(m, lang)}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
