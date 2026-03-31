// ============================================
// OPTIMAL BREAKS — Dashboard Client
// "My Breakbeat App" — full user section
// ============================================

'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { useProfile, useFavoriteArtists, useFavoriteLabels, useFavoriteEvents, useSavedMixes, useEventAttendance, useArtistSightings, useEventRatings, useBreakbeatProfile } from '@/hooks/useUserData'
import type { BreakbeatProfileStats } from '@/types/database'
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

type Tab = 'overview' | 'favorites' | 'sightings' | 'events' | 'reviews' | 'mixes' | 'profile'

const VALID_TABS: Tab[] = ['overview', 'favorites', 'sightings', 'events', 'reviews', 'mixes', 'profile']

export default function DashboardClient({ lang }: { lang: string }) {
  const { user, loading: authLoading, signOut } = useAuth()
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('overview')
  const es = lang === 'es'

  useEffect(() => {
    const t = searchParams.get('tab')
    if (t && (VALID_TABS as string[]).includes(t)) setTab(t as Tab)
  }, [searchParams])

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
    { key: 'reviews', label_en: 'REVIEWS', label_es: 'RESEÑAS', icon: '📝' },
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
        {tab === 'reviews' && <ReviewsTab lang={lang} />}
        {tab === 'mixes' && <MixesTab lang={lang} />}
        {tab === 'profile' && <ProfileTab lang={lang} onSignOut={signOut} />}
      </div>
    </div>
  )
}

// =============================================
// BREAKBEAT DNA — SVG charts + AI analysis
// =============================================

function RadarChart({ styles }: { styles: BreakbeatProfileStats['top_styles'] }) {
  const items = styles.slice(0, 6)
  if (items.length < 3) return null
  const cx = 120, cy = 120, r = 90
  const n = items.length
  const maxPct = Math.max(...items.map(s => s.pct), 0.01)

  const pointsOuter = items.map((_, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    return `${cx + r * Math.cos(angle)},${cy + r * Math.sin(angle)}`
  }).join(' ')

  const pointsData = items.map((s, i) => {
    const angle = (Math.PI * 2 * i) / n - Math.PI / 2
    const ratio = s.pct / maxPct
    return `${cx + r * ratio * Math.cos(angle)},${cy + r * ratio * Math.sin(angle)}`
  }).join(' ')

  const gridLevels = [0.33, 0.66, 1]

  return (
    <svg viewBox="0 0 240 240" className="w-full max-w-[280px] mx-auto">
      {gridLevels.map(level => (
        <polygon
          key={level}
          points={items.map((_, i) => {
            const angle = (Math.PI * 2 * i) / n - Math.PI / 2
            return `${cx + r * level * Math.cos(angle)},${cy + r * level * Math.sin(angle)}`
          }).join(' ')}
          fill="none"
          stroke="var(--ink)"
          strokeWidth="0.5"
          opacity="0.2"
        />
      ))}
      {items.map((_, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2
        return (
          <line key={i} x1={cx} y1={cy}
            x2={cx + r * Math.cos(angle)} y2={cy + r * Math.sin(angle)}
            stroke="var(--ink)" strokeWidth="0.5" opacity="0.15" />
        )
      })}
      <polygon points={pointsOuter} fill="none" stroke="var(--ink)" strokeWidth="1.5" opacity="0.3" />
      <polygon points={pointsData} fill="var(--red)" fillOpacity="0.25" stroke="var(--red)" strokeWidth="2" />
      {items.map((s, i) => {
        const angle = (Math.PI * 2 * i) / n - Math.PI / 2
        const ratio = s.pct / maxPct
        const lx = cx + (r + 18) * Math.cos(angle)
        const ly = cy + (r + 18) * Math.sin(angle)
        const dx = cx + r * ratio * Math.cos(angle)
        const dy = cy + r * ratio * Math.sin(angle)
        return (
          <g key={i}>
            <circle cx={dx} cy={dy} r="3.5" fill="var(--red)" />
            <text x={lx} y={ly} textAnchor="middle" dominantBaseline="central"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '7px', fontWeight: 700, fill: 'var(--ink)', textTransform: 'uppercase' }}>
              {s.name.replace(/_/g, ' ').slice(0, 12)}
            </text>
          </g>
        )
      })}
    </svg>
  )
}

function HorizontalBars({ data, color, maxItems = 5 }: { data: { name: string; pct: number }[]; color: string; maxItems?: number }) {
  const items = data.slice(0, maxItems)
  if (items.length === 0) return null
  const maxPct = Math.max(...items.map(d => d.pct), 0.01)

  return (
    <div className="space-y-2">
      {items.map((d) => (
        <div key={d.name}>
          <div className="flex justify-between items-center mb-[2px]">
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {d.name.replace(/_/g, ' ')}
            </span>
            <span style={{ fontFamily: "'Darker Grotesque', sans-serif", fontSize: '13px', fontWeight: 900, color }}>
              {Math.round(d.pct * 100)}%
            </span>
          </div>
          <div className="h-[10px] border-[2px] border-[var(--ink)] relative overflow-hidden">
            <div
              className="absolute inset-y-0 left-0 transition-all duration-700"
              style={{ width: `${(d.pct / maxPct) * 100}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function EraTreemap({ eras }: { eras: Record<string, number> }) {
  const sorted = Object.entries(eras)
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)

  if (sorted.length === 0) return null

  const colors: Record<string, string> = {
    '1980s': 'var(--uv)', '1990s': 'var(--acid)', '2000s': 'var(--red)',
    '2010s': 'var(--pink)', '2020s': 'var(--cyan)',
  }

  let currentX = 0;
  let currentY = 0;
  let currentW = 100;
  let currentH = 100;
  let visW = 200;
  let visH = 100;
  let sum = sorted.reduce((acc, [, pct]) => acc + pct, 0);

  const boxes = sorted.map(([era, pct]) => {
    const ratio = pct / sum;
    let box = { x: 0, y: 0, w: 0, h: 0 };
    
    if (visW > visH) {
      const width = currentW * ratio;
      const vWidth = visW * ratio;
      box = { x: currentX, y: currentY, w: width, h: currentH };
      currentX += width;
      currentW -= width;
      visW -= vWidth;
    } else {
      const height = currentH * ratio;
      const vHeight = visH * ratio;
      box = { x: currentX, y: currentY, w: currentW, h: height };
      currentY += height;
      currentH -= height;
      visH -= vHeight;
    }
    
    sum -= pct;
    return { era, pct, box };
  });

  return (
    <div className="relative w-full h-[140px] border-[3px] border-[var(--ink)] overflow-hidden shadow-[4px_4px_0px_var(--ink)]">
      {boxes.map(({ era, pct, box }) => {
        return (
          <div
            key={era}
            className="absolute flex flex-col items-center justify-center border-[1.5px] border-[var(--ink)] transition-all duration-700 hover:brightness-110 overflow-hidden"
            style={{
              left: `${box.x}%`,
              top: `${box.y}%`,
              width: `${box.w}%`,
              height: `${box.h}%`,
              background: colors[era] || 'var(--yellow)',
            }}
            title={`${era}: ${Math.round(pct * 100)}%`}
          >
            {box.w > 15 && box.h > 20 && (
              <div className="flex flex-col items-center px-1 overflow-hidden w-full">
                <span
                  className="truncate w-full text-center"
                  style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(10px, 2vw, 16px)', color: 'var(--ink)' }}
                >
                  {era}
                </span>
                {box.h > 35 && (
                  <span style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', color: 'var(--ink)', marginTop: '2px' }}>
                    {Math.round(pct * 100)}%
                  </span>
                )}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function BreakbeatDNA({ lang }: { lang: string }) {
  const es = lang === 'es'
  const { profile: bpProfile, loading: bpLoading, generating, setGenerating, save: saveBP } = useBreakbeatProfile()
  const { favorites: favArtists } = useFavoriteArtists()
  const { favorites: favLabels } = useFavoriteLabels()
  const { favorites: favEvents } = useFavoriteEvents()
  const { saved: savedMixes } = useSavedMixes()
  const { attendance } = useEventAttendance()
  const [error, setError] = useState('')

  const totalInputs = favArtists.length + favLabels.length + favEvents.length + savedMixes.length + Object.keys(attendance).length
  const hasEnoughData = totalInputs >= 3

  const generate = async () => {
    setGenerating(true)
    setError('')
    try {
      const res = await fetch('/api/breakbeat-profile', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lang }),
      })
      if (!res.ok) {
        const err = await res.json()
        setError(err.error || 'Error generating profile')
        return
      }
      await saveBP(await res.json())
    } catch {
      setError(es ? 'Error de conexión' : 'Connection error')
    } finally {
      setGenerating(false)
    }
  }

  const stats = bpProfile?.stats as BreakbeatProfileStats | undefined
  const archetype = es ? bpProfile?.archetype_es : bpProfile?.archetype_en
  const analysisText = es ? bpProfile?.analysis_text_es : bpProfile?.analysis_text_en

  if (bpLoading) return null

  return (
    <div className="mb-8 border-4 border-[var(--ink)] overflow-hidden">
      {/* Header */}
      <div className="bg-[var(--ink)] text-[var(--paper)] px-5 py-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <span style={{ fontSize: '28px' }}>&#x1F9EC;</span>
          <div>
            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 3vw, 18px)', textTransform: 'uppercase', letterSpacing: '-0.5px', color: 'var(--yellow)' }}>
              {es ? 'TU ADN BREAKBEATERO' : 'YOUR BREAKBEAT DNA'}
            </div>
            {archetype && (
              <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', letterSpacing: '1px', color: 'var(--red)', marginTop: '2px' }}>
                {archetype}
              </div>
            )}
          </div>
        </div>
        <button
          onClick={generate}
          disabled={generating || !hasEnoughData}
          className="transition-all duration-150 border-0 cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
          style={{
            fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px',
            padding: '6px 16px', textTransform: 'uppercase',
            background: generating ? 'var(--dim)' : 'var(--red)', color: 'white',
          }}
        >
          {generating
            ? (es ? '⏳ ANALIZANDO...' : '⏳ ANALYZING...')
            : bpProfile
              ? (es ? '↻ REGENERAR' : '↻ REGENERATE')
              : (es ? '▶ ANALIZAR MI PERFIL' : '▶ ANALYZE MY PROFILE')
          }
        </button>
      </div>

      {/* Content */}
      {!bpProfile && !generating && (
        <div className="p-5 bg-[var(--paper-dark)]">
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'var(--dim)', lineHeight: 1.7 }}>
            {!hasEnoughData
              ? (es
                ? `Necesitas al menos 3 favoritos (artistas, sellos, eventos o mixes) para desbloquear tu perfil. Llevas ${totalInputs}.`
                : `You need at least 3 favorites (artists, labels, events or mixes) to unlock your profile. You have ${totalInputs}.`)
              : (es
                ? 'Pulsa "ANALIZAR MI PERFIL" y nuestra IA analizará tus gustos breakbeateros: subgéneros, países, épocas, eventos y mixes.'
                : 'Press "ANALYZE MY PROFILE" and our AI will analyze your breakbeat taste: subgenres, countries, eras, events and mixes.')
            }
          </p>
        </div>
      )}

      {generating && (
        <div className="p-8 flex flex-col items-center gap-4 bg-[var(--paper-dark)]">
          <div className="w-16 h-16 rounded-full border-4 border-[var(--ink)] border-t-[var(--red)]" style={{ animation: 'spin 1s linear infinite' }} />
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'var(--dim)' }}>
            {es ? 'Analizando tu ADN breakbeatero...' : 'Analyzing your breakbeat DNA...'}
          </p>
        </div>
      )}

      {error && (
        <div className="px-5 py-3 bg-[var(--red)] text-white">
          <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}>{error}</p>
        </div>
      )}

      {bpProfile && stats && !generating && (
        <div>
          {/* AI Text */}
          {analysisText && (
            <div className="p-5 border-b-[3px] border-[var(--ink)] bg-[var(--paper-dark)]">
              <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, whiteSpace: 'pre-line' }}>
                {analysisText}
              </p>
              {bpProfile.generated_by === 'openai' && (
                <span className="mt-3 inline-block" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '8px', color: 'var(--dim)', letterSpacing: '1px' }}>
                  {es ? 'GENERADO CON IA' : 'AI GENERATED'}
                </span>
              )}
            </div>
          )}

          {/* Charts grid */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-0">
            {/* Radar: subgenres */}
            <div className="p-5 border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)]">
              <div className="mb-3" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase', color: 'var(--red)' }}>
                {es ? 'Subgéneros' : 'Subgenres'}
              </div>
              <RadarChart styles={stats.top_styles} />
            </div>

            {/* Bars: countries */}
            <div className="p-5 border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)]">
              <div className="mb-3" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase', color: 'var(--uv)' }}>
                {es ? 'Países' : 'Countries'}
              </div>
              <HorizontalBars data={stats.top_countries} color="var(--uv)" />
            </div>

            {/* Timeline: eras */}
            <div className="p-5">
              <div className="mb-3" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase', color: 'var(--acid)' }}>
                {es ? 'Épocas' : 'Eras'}
              </div>
              <EraTreemap eras={stats.era_distribution} />
              {/* Category badges */}
              {Object.keys(stats.category_breakdown).length > 0 && (
                <div className="flex flex-wrap gap-1 mt-4">
                  {Object.entries(stats.category_breakdown)
                    .sort(([, a], [, b]) => b - a)
                    .map(([cat, count]) => (
                      <span key={cat} className="bg-[var(--ink)] text-[var(--paper)]"
                        style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '8px', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '2px 6px' }}>
                        {cat.replace(/_/g, ' ')} ×{count}
                      </span>
                    ))
                  }
                </div>
              )}
            </div>
          </div>

          {/* Footer stats */}
          <div className="bg-[var(--ink)] text-[var(--paper)] px-5 py-3 flex flex-wrap gap-4 items-center">
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '1px', color: 'var(--dim)' }}>
              {es ? 'DATOS ANALIZADOS' : 'DATA ANALYZED'}: {stats.total_data_points}
            </span>
            {stats.event_profile.festivals + stats.event_profile.club_nights > 0 && (
              <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '1px', color: 'var(--dim)' }}>
                {es ? 'EVENTOS' : 'EVENTS'}: {stats.event_profile.festivals}F / {stats.event_profile.club_nights}CN
              </span>
            )}
            {Object.keys(stats.mix_taste).length > 0 && (
              <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', letterSpacing: '1px', color: 'var(--dim)' }}>
                MIXES: {Object.entries(stats.mix_taste).map(([t, n]) => `${t.replace(/_/g, ' ')} ×${n}`).join(', ')}
              </span>
            )}
          </div>
        </div>
      )}
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
      {/* Breakbeat DNA Analysis */}
      <BreakbeatDNA lang={lang} />

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
            <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: form.rating < 1 ? 'var(--red)' : 'var(--dim)', fontWeight: 700, letterSpacing: '1px' }}>RATING *</span>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} onClick={() => setForm({ ...form, rating: form.rating === n ? 0 : n })} className={`text-lg cursor-pointer border-0 bg-transparent transition-transform hover:scale-125 ${form.rating >= n ? 'text-[var(--yellow)]' : 'text-[var(--ink)]/20'}`}>★</button>
            ))}
          </div>
          <button
            onClick={async () => {
              if (form.rating < 1) return
              await add(form as any)
              setForm({ artist_id: '', seen_at: '', venue: '', city: '', country: '', event_name: '', notes: '', rating: 0 })
              setShowForm(false)
            }}
            disabled={form.rating < 1}
            className="mt-3 cutout red disabled:opacity-40 disabled:cursor-not-allowed"
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
                <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>
                  {s.seen_at || (es ? 'Sin fecha' : 'No date')}
                </div>
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 700, fontSize: '14px', textTransform: 'uppercase' }}>
                  {s.artist_slug ? (
                    <Link href={`/${lang}/artists/${s.artist_slug}`} className="text-[var(--ink)] no-underline hover:underline">
                      {s.artist_name || s.artist_slug}
                    </Link>
                  ) : (
                    s.artist_name || s.event_name || s.venue || (es ? 'Visto en vivo' : 'Live sighting')
                  )}
                </div>
                {(s.artist_name || s.artist_slug) && s.event_name && (
                  <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>{s.event_name}</div>
                )}
                {!s.artist_name && !s.artist_slug && (s.event_name || s.venue) && (
                  <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>{s.event_name || s.venue}</div>
                )}
                {[s.venue, s.city, s.country].some(Boolean) && (
                  <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                    {[s.venue, [s.city, s.country].filter(Boolean).join(', ')].filter(Boolean).join(' — ')}
                  </div>
                )}
                {s.rating >= 1 && <div className="mt-1 text-[var(--yellow)]">{'★'.repeat(s.rating)}{'☆'.repeat(5 - s.rating)}</div>}
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

/** Estrellas en pestaña Reviews: borde rojo + fondo oscuro para contraste sobre papel. */
function DashboardReviewStars({ rating }: { rating: number }) {
  if (rating < 1) return null
  return (
    <span
      className="inline-flex shrink-0 items-center border-[3px] border-[var(--red)] bg-[var(--ink)] px-2 py-1"
      style={{ fontSize: '16px', lineHeight: 1, letterSpacing: '2px' }}
      aria-label={`${rating}/5`}
    >
      <span className="text-[var(--yellow)]">{'★'.repeat(rating)}</span>
      <span style={{ color: 'rgba(232,220,200,0.4)' }}>{'☆'.repeat(5 - rating)}</span>
    </span>
  )
}

// =============================================
// REVIEWS TAB — event_ratings + artist_sightings (visto en vivo)
// =============================================
function ReviewsTab({ lang }: { lang: string }) {
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
            ? 'Aquí aparecen las reseñas de eventos y las valoraciones que das desde «Visto en vivo» en fichas de artista (no es lo mismo que solo guardar favoritos).'
            : 'Event reviews plus ratings you submit from “Seen live” on artist pages (not the same as favorites only).'}
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
                    <div key={id} className="p-4 border-b-[3px] border-[var(--ink)] last:border-b-0 flex flex-col sm:flex-row gap-4 items-start">
                      <div className="shrink-0 w-20 sm:w-24 border-[2px] border-[var(--ink)]">
                        <Link href={`/${lang}/events/${ev.slug}`}>
                          <CardThumbnail src={ev.image_url} alt={ev.name} aspectClass="aspect-square" fit="cover" />
                        </Link>
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          <Link href={`/${lang}/events/${ev.slug}`} className="no-underline text-[var(--ink)] hover:text-[var(--red)]">
                            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase' }}>{ev.name}</div>
                          </Link>
                          <DashboardReviewStars rating={r.rating} />
                        </div>
                        <div className="mt-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                          {ev.date_start || 'TBA'} — {ev.venue ? `${ev.venue}, ` : ''}{ev.city}, {ev.country}
                        </div>
                        {r.review && (
                          <div className="mt-3 p-3 bg-[var(--paper-dark)] border-[2px] border-[var(--ink)] relative">
                            <div className="absolute -top-3 left-3 text-[var(--dim)]" style={{ fontFamily: "Georgia, serif", fontSize: '32px', lineHeight: 1 }}>&ldquo;</div>
                            <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'var(--ink)', position: 'relative', zIndex: 1, margin: 0, whiteSpace: 'pre-line' }}>
                              {r.review}
                            </p>
                          </div>
                        )}
                      </div>
                    </div>
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
                  const href = s.artist_slug ? `/${lang}/artists/${s.artist_slug}` : null
                  const title = s.artist_name || s.artist_slug || (es ? 'Artista' : 'Artist')
                  const thumb = artistImages[s.artist_id]
                  return (
                    <div key={s.id} className="p-4 border-b-[3px] border-[var(--ink)] last:border-b-0 flex flex-col sm:flex-row gap-4 items-start">
                      <div className="shrink-0 w-20 sm:w-24 border-[2px] border-[var(--ink)] bg-[var(--paper-dark)]">
                        {href ? (
                          <Link href={href}>
                            <CardThumbnail src={thumb} alt={title} aspectClass="aspect-square" fit="cover" />
                          </Link>
                        ) : (
                          <CardThumbnail src={thumb} alt={title} aspectClass="aspect-square" fit="cover" />
                        )}
                      </div>
                      <div className="flex-grow min-w-0">
                        <div className="flex flex-wrap items-baseline justify-between gap-2">
                          {href ? (
                            <Link href={href} className="no-underline text-[var(--ink)] hover:text-[var(--red)]">
                              <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase' }}>{title}</div>
                            </Link>
                          ) : (
                            <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase' }}>{title}</div>
                          )}
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
