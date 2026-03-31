// ============================================
// OPTIMAL BREAKS — Dashboard Client
// "My Breakbeat App" — full user section
// ============================================

'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { useProfile, useFavoriteArtists, useFavoriteLabels, useSavedMixes, useEventAttendance, useArtistSightings, useEventRatings } from '@/hooks/useUserData'
import { createBrowserSupabase } from '@/lib/supabase'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'

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
  const wishlist = Object.values(attendance).filter((s) => s === 'wishlist').length

  const stats = [
    { num: favArtists.length, label: es ? 'ARTISTAS FAV' : 'FAV ARTISTS', color: 'var(--red)' },
    { num: favLabels.length, label: es ? 'SELLOS FAV' : 'FAV LABELS', color: 'var(--uv)' },
    { num: sightings.length, label: es ? 'VISTOS EN VIVO' : 'SEEN LIVE', color: 'var(--acid)' },
    { num: attended, label: es ? 'EVENTOS ASISTIDOS' : 'EVENTS ATTENDED', color: 'var(--yellow)' },
    { num: wishlist, label: es ? 'EN MI LISTA' : 'WISHLIST', color: 'var(--pink)' },
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
function FavoritesTab({ lang }: { lang: string }) {
  const { favorites: artistIds } = useFavoriteArtists()
  const { favorites: labelIds } = useFavoriteLabels()
  const { attendance } = useEventAttendance()
  const { saved: mixIds } = useSavedMixes()
  const [artists, setArtists] = useState<any[]>([])
  const [labels, setLabels] = useState<any[]>([])
  const [events, setEvents] = useState<any[]>([])
  const [mixes, setMixes] = useState<any[]>([])
  const es = lang === 'es'

  const wishlistIds = Object.entries(attendance).filter(([, s]) => s === 'wishlist').map(([id]) => id)

  useEffect(() => {
    const supabase = createBrowserSupabase()
    let cancelled = false

    ;(async () => {
      if (artistIds.length === 0) { if (!cancelled) setArtists([]) }
      else {
        const { data } = await supabase.from('artists').select('id, slug, name, name_display, styles, country, image_url').in('id', artistIds)
        if (!cancelled) setArtists(data || [])
      }
      if (labelIds.length === 0) { if (!cancelled) setLabels([]) }
      else {
        const { data } = await supabase.from('labels').select('id, slug, name, country, image_url').in('id', labelIds)
        if (!cancelled) setLabels(data || [])
      }
      if (wishlistIds.length === 0) { if (!cancelled) setEvents([]) }
      else {
        const { data } = await supabase.from('events').select('id, slug, name, date_start, city, country, image_url').in('id', wishlistIds)
        if (!cancelled) setEvents(data || [])
      }
      if (mixIds.length === 0) { if (!cancelled) setMixes([]) }
      else {
        const { data } = await supabase.from('mixes').select('id, slug, title, artist_name, mix_type, image_url, video_url').in('id', mixIds)
        if (!cancelled) setMixes(data || [])
      }
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [artistIds, labelIds, JSON.stringify(wishlistIds), mixIds])

  return (
    <div className="space-y-10">
      {/* Artists */}
      <div>
        <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', marginBottom: '16px' }}>
          {es ? 'ARTISTAS FAVORITOS' : 'FAVORITE ARTISTS'} ({artistIds.length})
        </h2>
        {artistIds.length === 0 ? (
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
            {es ? 'Aún no tienes artistas favoritos. Explora y marca los que te gusten.' : 'No favorite artists yet. Explore and mark the ones you like.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
            {artists.map((a) => (
              <Link key={a.id} href={`/${lang}/artists/${a.slug}`} className="group flex flex-col border-b-[3px] sm:border-r-[3px] border-[var(--ink)] hover:bg-[var(--yellow)] no-underline text-[var(--ink)] transition-all overflow-hidden">
                <CardThumbnail src={a.image_url} alt={a.name_display || a.name} heightClass="h-28 sm:h-32" frameClass="border-b-[3px] border-[var(--ink)]" />
                <div className="p-4">
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '16px', textTransform: 'uppercase' }}>{a.name_display || a.name}</div>
                  <div className="flex gap-1 mt-1 flex-wrap">{a.styles?.map((s: string, i: number) => <span key={i} className="cutout fill" style={{ fontSize: '8px', padding: '1px 5px', margin: 0 }}>{s}</span>)}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Labels */}
      <div>
        <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', marginBottom: '16px' }}>
          {es ? 'SELLOS FAVORITOS' : 'FAVORITE LABELS'} ({labelIds.length})
        </h2>
        {labelIds.length === 0 ? (
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
            {es ? 'Aún no tienes sellos favoritos.' : 'No favorite labels yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
            {labels.map((l) => (
              <Link key={l.id} href={`/${lang}/labels/${l.slug}`} className="group flex flex-col border-b-[3px] sm:border-r-[3px] border-[var(--ink)] hover:bg-[var(--yellow)] no-underline text-[var(--ink)] transition-all overflow-hidden">
                <CardThumbnail src={l.image_url} alt={l.name} heightClass="h-28 sm:h-32" frameClass="border-b-[3px] border-[var(--ink)]" />
                <div className="p-4">
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '16px', textTransform: 'uppercase' }}>{l.name}</div>
                  <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 5px', margin: 0 }}>{l.country}</span>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Events (wishlist) */}
      <div>
        <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', marginBottom: '16px' }}>
          {es ? 'EVENTOS FAVORITOS' : 'FAVORITE EVENTS'} ({wishlistIds.length})
        </h2>
        {wishlistIds.length === 0 ? (
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
            {es ? 'Aún no has marcado eventos.' : 'No favorite events yet.'}
          </p>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
            {events.map((ev) => (
              <Link key={ev.id} href={`/${lang}/events/${ev.slug}`} className="group flex flex-col border-b-[3px] sm:border-r-[3px] border-[var(--ink)] hover:bg-[var(--yellow)] no-underline text-[var(--ink)] transition-all overflow-hidden">
                <CardThumbnail src={ev.image_url} alt={ev.name} heightClass="h-28 sm:h-32" frameClass="border-b-[3px] border-[var(--ink)]" fit="contain" />
                <div className="p-4">
                  <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '13px', color: 'var(--red)' }}>{ev.date_start || 'TBA'}</div>
                  <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '16px', textTransform: 'uppercase' }}>{ev.name}</div>
                  <div className="mt-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>{ev.city}, {ev.country}</div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* Mixes */}
      <div>
        <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', marginBottom: '16px' }}>
          {es ? 'MIXES GUARDADOS' : 'SAVED MIXES'} ({mixIds.length})
        </h2>
        {mixIds.length === 0 ? (
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
            {es ? 'Guarda mixes desde la sección de Mixes.' : 'Save mixes from the Mixes section.'}
          </p>
        ) : (
          <div className="border-4 border-[var(--ink)]">
            {mixes.map((m) => (
              <div key={m.id} className="flex items-center gap-4 p-4 border-b-[3px] border-[var(--ink)] last:border-b-0 hover:bg-[var(--yellow)] transition-all">
                <div className="shrink-0 w-14 h-14 overflow-hidden border-[2px] border-[var(--ink)]">
                  <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" frameClass="" />
                </div>
                <div className="flex-grow min-w-0">
                  <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase' }}>{m.title}</div>
                  <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '13px', color: 'var(--red)' }}>{m.artist_name}</div>
                  <span className="cutout red" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                </div>
                {m.video_url && (
                  <a href={m.video_url} target="_blank" rel="noopener noreferrer" className="shrink-0 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '4px 10px' }}>
                    YouTube ↗
                  </a>
                )}
              </div>
            ))}
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
      const { data } = await supabase.from('events').select('id, slug, name, date_start, city, country').in('id', allEventIds)
      if (!cancelled && data) {
        const map: Record<string, any> = {}
        data.forEach((e: any) => { map[e.id] = e })
        setEventsData(map)
      }
    })()
    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [JSON.stringify(allEventIds)])

  const renderEventRow = (id: string, extra?: React.ReactNode) => {
    const ev = eventsData[id]
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
        {extra}
      </div>
    )
  }

  return (
    <div>
      <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', marginBottom: '16px' }}>
        {es ? 'MIS EVENTOS' : 'MY EVENTS'}
      </h2>

      {allEventIds.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'Explora eventos y marca los que te interesan.' : 'Explore events and mark the ones you\'re interested in.'}
        </p>
      ) : (
        <div className="space-y-6">
          {going.length > 0 && (
            <div>
              <span className="cutout acid">{es ? 'VOY' : 'GOING'} ({going.length})</span>
              <div className="mt-2 border-4 border-[var(--ink)]">
                {going.map(([id]) => renderEventRow(id))}
              </div>
            </div>
          )}
          {wishlist.length > 0 && (
            <div>
              <span className="cutout uv">{es ? 'QUIERO IR' : 'WISHLIST'} ({wishlist.length})</span>
              <div className="mt-2 border-4 border-[var(--ink)]">
                {wishlist.map(([id]) => renderEventRow(id))}
              </div>
            </div>
          )}
          {attended.length > 0 && (
            <div>
              <span className="cutout fill" style={{ background: 'var(--yellow)', color: 'var(--ink)' }}>{es ? 'ASISTÍ' : 'ATTENDED'} ({attended.length})</span>
              <div className="mt-2 border-4 border-[var(--ink)]">
                {attended.map(([id]) => {
                  const r = ratings[id]
                  return renderEventRow(id, r ? <span className="text-[var(--yellow)] shrink-0">{'★'.repeat(r.rating)}</span> : undefined)
                })}
              </div>
            </div>
          )}
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
  const es = lang === 'es'

  useEffect(() => {
    if (saved.length === 0) { setMixes([]); return }
    let cancelled = false
    const supabase = createBrowserSupabase()
    ;(async () => {
      const { data } = await supabase.from('mixes').select('id, slug, title, artist_name, mix_type, image_url, video_url').in('id', saved)
      if (!cancelled) setMixes(data || [])
    })()
    return () => { cancelled = true }
  }, [saved])

  return (
    <div>
      <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase', marginBottom: '16px' }}>
        {es ? 'MIXES GUARDADOS' : 'SAVED MIXES'} ({saved.length})
      </h2>
      {saved.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'Guarda mixes desde la sección de Mixes.' : 'Save mixes from the Mixes section.'}
        </p>
      ) : (
        <div className="border-4 border-[var(--ink)]">
          {mixes.map((m) => (
            <div key={m.id} className="flex items-center gap-4 p-4 border-b-[3px] border-[var(--ink)] last:border-b-0 hover:bg-[var(--yellow)] transition-all">
              <div className="shrink-0 w-12 h-12 overflow-hidden border-[2px] border-[var(--ink)]">
                <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" frameClass="" />
              </div>
              <div className="flex-grow min-w-0">
                <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase' }}>{m.title}</div>
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '13px', color: 'var(--red)' }}>{m.artist_name}</div>
                <span className="cutout red" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
              </div>
              {m.video_url && (
                <a href={m.video_url} target="_blank" rel="noopener noreferrer" className="shrink-0 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '4px 10px' }}>
                  YouTube ↗
                </a>
              )}
            </div>
          ))}
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
