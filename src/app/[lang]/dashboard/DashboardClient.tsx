// ============================================
// OPTIMAL BREAKS — Dashboard Client
// "My Breakbeat App" — full user section
// ============================================

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { useProfile, useFavoriteArtists, useFavoriteLabels, useFavoriteEvents, useSavedMixes, useEventAttendance, useArtistSightings, useEventRatings } from '@/hooks/useUserData'
import { createBrowserSupabase } from '@/lib/supabase'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import FavoriteButton from '@/components/FavoriteButton'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import { useDeckAudio, type MixTrack } from '@/components/DeckAudioProvider'
import { getMixTrack } from '@/components/MixesExplorer'

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

function formatMixDateLine(m: any, lang: string): string {
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const published = m.published_at
  const datePart = published
    ? new Date(published).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
    : m.year != null
      ? String(m.year)
      : '—'
  const dur = m.duration_minutes != null ? ` · ${m.duration_minutes} min` : ''
  return `${datePart}${dur}`
}

function YouTubeIframe({ videoId, title, className = '' }: { videoId: string; title: string; className?: string }) {
  return (
    <div className={`relative w-full aspect-video bg-black overflow-hidden ${className}`}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?rel=0`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  )
}

function DashboardMixPlayButton({ m }: { m: any }) {
  const { playMix, currentMix, mixPlaying } = useDeckAudio()
  const track = getMixTrack(m)
  if (!track) return null

  const isThisMix = currentMix?.id === m.id
  const label = isThisMix && mixPlaying ? '■ STOP' : '▶ PLAY'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        playMix(track)
      }}
      className={`mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] hover:bg-[var(--red)] hover:text-white transition-colors cursor-pointer border-0 ${isThisMix && mixPlaying ? 'animate-pulse' : ''}`}
      style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}
    >
      {label}
    </button>
  )
}

type Tab = 'overview' | 'favorites' | 'sightings' | 'events' | 'mixes' | 'profile'

export default function DashboardClient({ lang }: { lang: string }) {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('overview')
  const es = lang === 'es'

  // Redirect if not logged in
  if (!authLoading && !user) {
    router.push(`/${lang}/login`)
    return null
  }

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div className="w-16 h-16 rounded-full border-4 border-[var(--ink)] border-t-[var(--red)]" style={{ animation: 'spin 1s linear infinite' }} />
      </div>
    )
  }

  const tabs: { key: Tab; label_en: string; label_es: string; icon: string }[] = [
    { key: 'overview', label_en: 'OVERVIEW', label_es: 'RESUMEN', icon: '◉' },
    { key: 'favorites', label_en: 'FAVORITES', label_es: 'FAVORITOS', icon: '★' },
    { key: 'sightings', label_en: 'SEEN LIVE', label_es: 'VISTOS EN VIVO', icon: '♫' },
    { key: 'events', label_en: 'EVENTS', label_es: 'EVENTOS', icon: '📅' },
    { key: 'mixes', label_en: 'SAVED MIXES', label_es: 'MIXES GUARDADOS', icon: '🎧' },
    { key: 'profile', label_en: 'PROFILE', label_es: 'PERFIL', icon: '⚙' },
  ]

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="bg-[var(--ink)] text-[var(--paper)] px-4 sm:px-6 py-8 sm:py-12 border-b-8 border-[var(--red)]">
        <div className="sec-tag" style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)' }}>MY BREAKS</div>
        <h1 className="mt-4" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(28px, 6vw, 50px)', textTransform: 'uppercase', lineHeight: 0.9 }}>
          <span style={{ color: 'var(--yellow)' }}>
            {user?.user_metadata?.full_name || user?.email?.split('@')[0] || 'BREAKER'}
          </span>
        </h1>
        <p className="mt-2" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', color: 'rgba(232,220,200,0.5)', letterSpacing: '2px' }}>
          {es ? 'TU APP DEL BREAKBEAT' : 'YOUR BREAKBEAT APP'}
        </p>
      </section>

      {/* Tab navigation */}
      <div className="flex overflow-x-auto border-b-4 border-[var(--ink)] bg-[var(--paper)]">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`flex items-center gap-1 px-3 sm:px-4 py-3 border-r-[3px] border-[var(--ink)] whitespace-nowrap transition-all ${
              tab === t.key ? 'bg-[var(--red)] text-white' : 'hover:bg-[var(--yellow)]'
            }`}
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}
          >
            <span>{t.icon}</span>
            <span className="hidden sm:inline">{es ? t.label_es : t.label_en}</span>
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div className="lined px-4 sm:px-6 py-8 sm:py-12">
        {tab === 'overview' && <OverviewTab lang={lang} />}
        {tab === 'favorites' && <FavoritesTab lang={lang} />}
        {tab === 'sightings' && <SightingsTab lang={lang} />}
        {tab === 'events' && <EventsTab lang={lang} />}
        {tab === 'mixes' && <MixesTab lang={lang} />}
        {tab === 'profile' && <ProfileTab lang={lang} onSignOut={signOut} />}
      </div>
    </div>
  )
}

// =============================================
// OVERVIEW TAB
// =============================================
function OverviewTab({ lang }: { lang: string }) {
  const { profile } = useProfile()
  const { favorites: favArtists } = useFavoriteArtists()
  const { favorites: favLabels } = useFavoriteLabels()
  const { saved: savedMixes } = useSavedMixes()
  const { sightings } = useArtistSightings()
  const { attendance } = useEventAttendance()
  const es = lang === 'es'

  const attended = Object.values(attendance).filter((s) => s === 'attended').length
  const planning = Object.values(attendance).filter((s) => s === 'wishlist' || s === 'attending').length

  const stats = [
    { num: favArtists.length, label: es ? 'ARTISTAS FAV' : 'FAV ARTISTS', color: 'var(--red)' },
    { num: favLabels.length, label: es ? 'SELLOS FAV' : 'FAV LABELS', color: 'var(--uv)' },
    { num: sightings.length, label: es ? 'VISTOS EN VIVO' : 'SEEN LIVE', color: 'var(--acid)' },
    { num: planning, label: es ? 'QUIERO IR / VOY' : 'WISHLIST & GOING', color: 'var(--pink)' },
    { num: attended, label: es ? 'EVENTOS ASISTIDOS' : 'EVENTS ATTENDED', color: 'var(--yellow)' },
    { num: savedMixes.length, label: es ? 'MIXES GUARDADOS' : 'SAVED MIXES', color: 'var(--cyan)' },
  ]

  return (
    <div>
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-0 border-4 border-[var(--ink)]">
        {stats.map((s, i) => (
          <div key={i} className="p-5 sm:p-6 border-r-[3px] border-b-[3px] border-[var(--ink)] text-center transition-all hover:bg-[var(--yellow)]">
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(32px, 6vw, 48px)', lineHeight: 1, color: s.color }}>
              {s.num}
            </div>
            <div className="mt-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '1px', color: 'var(--dim)' }}>
              {s.label}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-8 p-6 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
        <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '20px', color: 'var(--yellow)', marginBottom: '8px' }}>
          {es ? '¡Sigue explorando!' : 'Keep exploring!'}
        </div>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'rgba(232,220,200,0.6)', lineHeight: 1.7 }}>
          {es
            ? 'Marca artistas como favoritos, registra a quién has visto en directo, y lleva la cuenta de todos los eventos del breakbeat.'
            : 'Mark artists as favorites, log who you\'ve seen live, and keep track of all breakbeat events.'}
        </p>
      </div>
    </div>
  )
}

// =============================================
// FAVORITES TAB
// =============================================
function viewLabels(es: boolean) {
  return { view_large: es ? 'Grande' : 'Large', view_compact: es ? 'Compacto' : 'Compact', view_list: es ? 'Lista' : 'List' }
}

function SectionHeader({ title, count, view, setView, es }: { title: string; count: number; view: ViewMode; setView: (v: ViewMode) => void; es: boolean }) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
        {title} ({count})
      </h2>
      {count > 0 && <ViewToggle view={view} setView={setView} labels={viewLabels(es)} />}
    </div>
  )
}

function FavoritesTab({ lang }: { lang: string }) {
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
              return (
                <div key={m.id} className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] overflow-hidden group">
                  <FavoriteButton type="mix" entityId={m.id} lang={lang} />
                  {ytId ? <YouTubeIframe videoId={ytId} title={m.title} /> : <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-[16/10]" />}
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
                    ) : getMixTrack(m) ? (
                      <DashboardMixPlayButton m={m} />
                    ) : m.embed_url ? (
                      <a href={m.embed_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}>▶ PLAY</a>
                    ) : m.platform ? (
                      <div className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)]" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}>▶ {m.platform.toUpperCase()}</div>
                    ) : null}
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
                  {ytId ? <YouTubeIframe videoId={ytId} title={m.title} className="border-b-[3px] border-[var(--ink)]" /> : <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" />}
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

// =============================================
// SIGHTINGS TAB — Artists seen live
// =============================================
function SightingsTab({ lang }: { lang: string }) {
  const { sightings, add, remove, loading } = useArtistSightings()
  const [showForm, setShowForm] = useState(false)
  const [form, setForm] = useState({ artist_id: '', seen_at: '', venue: '', city: '', country: '', event_name: '', notes: '', rating: 0 })
  const es = lang === 'es'

  return (
    <div>
      <div className="flex items-center justify-between mb-6">
        <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
          {es ? 'VISTOS EN VIVO' : 'SEEN LIVE'} ({sightings.length})
        </h2>
        <button
          onClick={() => setShowForm(!showForm)}
          className="cutout red"
          style={{ cursor: 'pointer' }}
        >
          {showForm ? '✕' : '+'} {es ? 'AÑADIR' : 'ADD'}
        </button>
      </div>

      {showForm && (
        <div className="p-5 border-4 border-[var(--ink)] mb-6 bg-[var(--paper-dark)]">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <input placeholder={es ? 'Fecha (YYYY-MM-DD)' : 'Date (YYYY-MM-DD)'} value={form.seen_at} onChange={(e) => setForm({ ...form, seen_at: e.target.value })} className="px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }} />
            <input placeholder={es ? 'Lugar / Venue' : 'Venue'} value={form.venue} onChange={(e) => setForm({ ...form, venue: e.target.value })} className="px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }} />
            <input placeholder={es ? 'Ciudad' : 'City'} value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className="px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }} />
            <input placeholder={es ? 'País' : 'Country'} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }} />
            <input placeholder={es ? 'Nombre del evento' : 'Event name'} value={form.event_name} onChange={(e) => setForm({ ...form, event_name: e.target.value })} className="px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)] sm:col-span-2" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }} />
            <input placeholder={es ? 'Notas' : 'Notes'} value={form.notes} onChange={(e) => setForm({ ...form, notes: e.target.value })} className="px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)] sm:col-span-2" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }} />
          </div>
          <div className="flex items-center gap-2 mt-3">
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>{es ? 'Valoración:' : 'Rating:'}</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setForm({ ...form, rating: n })} className={`text-lg ${form.rating >= n ? 'text-[var(--yellow)]' : 'text-[var(--ink)]/20'}`}>★</button>
            ))}
          </div>
          <button
            onClick={async () => {
              if (!form.seen_at || !form.venue) return
              await add(form as any)
              setForm({ artist_id: '', seen_at: '', venue: '', city: '', country: '', event_name: '', notes: '', rating: 0 })
              setShowForm(false)
            }}
            className="mt-3 cutout red"
            style={{ cursor: 'pointer' }}
          >
            {es ? 'GUARDAR' : 'SAVE'}
          </button>
        </div>
      )}

      {sightings.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'Aún no has registrado ningún artista visto en vivo.' : 'No live sightings logged yet.'}
        </p>
      ) : (
        <div className="space-y-0 border-4 border-[var(--ink)]">
          {sightings.map((s) => (
            <div key={s.id} className="p-4 border-b-[3px] border-[var(--ink)] last:border-b-0 flex justify-between items-start gap-3">
              <div>
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>{s.seen_at}</div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: '14px', textTransform: 'uppercase' }}>{s.event_name || s.venue}</div>
                <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>{s.venue} — {s.city}, {s.country}</div>
                {s.rating && <div className="mt-1 text-[var(--yellow)]">{'★'.repeat(s.rating)}{'☆'.repeat(5 - s.rating)}</div>}
                {s.notes && <p className="mt-1" style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px', color: 'var(--dim)' }}>{s.notes}</p>}
              </div>
              <button onClick={() => remove(s.id)} className="cutout outline text-[var(--red)] shrink-0" style={{ cursor: 'pointer', fontSize: '8px' }}>✕</button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

// =============================================
// EVENTS TAB
// =============================================
function EventsTab({ lang }: { lang: string }) {
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

// =============================================
// MIXES TAB
// =============================================
function MixesTab({ lang }: { lang: string }) {
  const { saved } = useSavedMixes()
  const [mixes, setMixes] = useState<any[]>([])
  const [mixesLoading, setMixesLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('large')
  const es = lang === 'es'

  useEffect(() => {
    if (saved.length === 0) { setMixes([]); setMixesLoading(false); return }
    let cancelled = false
    setMixesLoading(true)
    const supabase = createBrowserSupabase()
    ;(async () => {
      const { data, error } = await supabase.from('mixes').select('id, slug, title, artist_name, mix_type, image_url, video_url, published_at, year, duration_minutes, embed_url, platform, audio_url').in('id', saved)
      if (!cancelled) {
        setMixes(data || [])
        setMixesLoading(false)
        if (error) console.warn('[MixesTab] Error fetching mixes:', error.message)
      }
    })()
    return () => { cancelled = true }
  }, [saved])

  return (
    <div>
      <SectionHeader title={es ? 'MIXES GUARDADOS' : 'SAVED MIXES'} count={saved.length} view={view} setView={setView} es={es} />
      {saved.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'Guarda mixes desde la sección de Mixes.' : 'Save mixes from the Mixes section.'}
        </p>
      ) : mixesLoading ? (
        <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', color: 'var(--dim)' }}>
          {es ? 'Cargando mixes…' : 'Loading mixes…'}
        </p>
      ) : mixes.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'No se pudieron cargar los mixes. Puede que hayan sido eliminados.' : 'Could not load mixes. They may have been removed.'}
        </p>
      ) : view === 'large' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
          {mixes.map((m) => {
            const ytId = extractYouTubeId(m.video_url)
            return (
              <div key={m.id} className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] overflow-hidden group">
                <FavoriteButton type="mix" entityId={m.id} lang={lang} />
                {ytId ? <YouTubeIframe videoId={ytId} title={m.title} /> : <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-[16/10]" />}
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
                  ) : getMixTrack(m) ? (
                    <DashboardMixPlayButton m={m} />
                  ) : m.embed_url ? (
                    <a href={m.embed_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}>▶ PLAY</a>
                  ) : m.platform ? (
                    <div className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)]" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}>▶ {m.platform.toUpperCase()}</div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : view === 'compact' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
          {mixes.map((m) => {
            const ytId = extractYouTubeId(m.video_url)
            return (
              <div key={m.id} className="border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group flex flex-col overflow-hidden relative">
                <FavoriteButton type="mix" entityId={m.id} lang={lang} />
                {ytId ? <YouTubeIframe videoId={ytId} title={m.title} className="border-b-[3px] border-[var(--ink)]" /> : <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" />}
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
  )
}

// =============================================
// PROFILE TAB
// =============================================
function ProfileTab({ lang, onSignOut }: { lang: string; onSignOut: () => void }) {
  const { profile, loading, update } = useProfile()
  const { user } = useAuth()
  const [editing, setEditing] = useState(false)
  const [form, setForm] = useState({ display_name: '', bio: '', country: '', favorite_genre: '' })
  const es = lang === 'es'

  const startEdit = () => {
    if (profile) {
      setForm({
        display_name: profile.display_name || '',
        bio: profile.bio || '',
        country: profile.country || '',
        favorite_genre: profile.favorite_genre || '',
      })
    }
    setEditing(true)
  }

  const save = async () => {
    await update(form as any)
    setEditing(false)
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', marginBottom: '16px' }}>
        {es ? 'MI PERFIL' : 'MY PROFILE'}
      </h2>

      <div className="border-4 border-[var(--ink)] p-6">
        {!editing ? (
          <div>
            <div className="flex items-center gap-4 mb-4">
              <div className="w-16 h-16 rounded-full bg-[var(--red)] text-white flex items-center justify-center" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '24px' }}>
                {(profile?.display_name || user?.email || '?')[0].toUpperCase()}
              </div>
              <div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
                  {profile?.display_name || 'Breaker'}
                </div>
                <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                  {user?.email}
                </div>
              </div>
            </div>
            {profile?.bio && <p className="mb-2" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }}>{profile.bio}</p>}
            {profile?.country && <span className="cutout fill">{profile.country}</span>}
            {profile?.favorite_genre && <span className="cutout red">{profile.favorite_genre}</span>}
            <div className="mt-4 flex gap-2">
              <button onClick={startEdit} className="cutout outline" style={{ cursor: 'pointer' }}>{es ? 'EDITAR' : 'EDIT'}</button>
              <button onClick={onSignOut} className="cutout red" style={{ cursor: 'pointer' }}>{es ? 'CERRAR SESIÓN' : 'LOG OUT'}</button>
            </div>
          </div>
        ) : (
          <div className="space-y-3">
            <input placeholder={es ? 'Nombre' : 'Display name'} value={form.display_name} onChange={(e) => setForm({ ...form, display_name: e.target.value })} className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }} />
            <input placeholder="Bio" value={form.bio} onChange={(e) => setForm({ ...form, bio: e.target.value })} className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }} />
            <input placeholder={es ? 'País' : 'Country'} value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }} />
            <input placeholder={es ? 'Género favorito' : 'Favorite genre'} value={form.favorite_genre} onChange={(e) => setForm({ ...form, favorite_genre: e.target.value })} className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }} />
            <div className="flex gap-2">
              <button onClick={save} className="cutout red" style={{ cursor: 'pointer' }}>{es ? 'GUARDAR' : 'SAVE'}</button>
              <button onClick={() => setEditing(false)} className="cutout outline" style={{ cursor: 'pointer' }}>{es ? 'CANCELAR' : 'CANCEL'}</button>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
