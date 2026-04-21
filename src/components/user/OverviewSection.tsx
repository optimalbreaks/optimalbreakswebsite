// ============================================
// OPTIMAL BREAKS — Overview section (formerly Overview tab)
// Shows stats grid + Breakbeat DNA AI analysis
// ============================================

'use client'

import { useState } from 'react'
import {
  useFavoriteArtists,
  useFavoriteLabels,
  useFavoriteEvents,
  useSavedMixes,
  useArtistSightings,
  useEventAttendance,
  useBreakbeatProfile,
  useSavedChartTracks,
} from '@/hooks/useUserData'
import type { BreakbeatProfileStats } from '@/types/database'
import { decadeBucketToMidYearLabel } from '@/lib/breakbeat-profile-era'

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
              style={{ width: `${d.pct * 100}%`, background: color }}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

function barColorForCalendarYear(year: number): string {
  const decade = Math.floor(year / 10) * 10
  const map: Record<number, string> = {
    1980: 'var(--uv)',
    1990: 'var(--acid)',
    2000: 'var(--red)',
    2010: 'var(--pink)',
    2020: 'var(--cyan)',
  }
  return map[decade] || 'var(--yellow)'
}

function buildYearHistogramData(stats: BreakbeatProfileStats): { name: string; pct: number }[] {
  const raw = stats.year_distribution
  if (raw && Object.keys(raw).length > 0) {
    return Object.entries(raw)
      .filter(([, p]) => p > 0)
      .map(([y, pct]) => ({ name: y, pct }))
      .sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10))
  }
  const merged: Record<string, number> = {}
  for (const [era, pct] of Object.entries(stats.era_distribution || {})) {
    const label = decadeBucketToMidYearLabel(era)
    const y = parseInt(label, 10)
    if (!Number.isFinite(y)) continue
    merged[label] = (merged[label] || 0) + pct
  }
  return Object.entries(merged)
    .map(([name, pct]) => ({ name, pct }))
    .sort((a, b) => parseInt(a.name, 10) - parseInt(b.name, 10))
}

function YearHistogramBars({ stats, es }: { stats: BreakbeatProfileStats; es: boolean }) {
  const items = buildYearHistogramData(stats)
  if (items.length === 0) {
    return (
      <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '12px', color: 'var(--dim)' }}>
        {es ? 'Sin datos temporales suficientes.' : 'Not enough temporal data.'}
      </p>
    )
  }

  return (
    <div>
      <p
        className="mb-2"
        style={{ fontFamily: "'Courier Prime', monospace", fontSize: '8px', letterSpacing: '0.4px', color: 'var(--dim)', lineHeight: 1.45 }}
      >
        {es
          ? 'Cada barra es un año: sellos y mixes cuentan con año real; artistas aportan el año centro de su década.'
          : 'Each bar is one year: labels and mixes use exact years; artists use the mid-decade reference year.'}
      </p>
      <div className="max-h-[220px] overflow-y-auto space-y-2 pr-1 border-[2px] border-[var(--ink)] p-2 shadow-[3px_3px_0px_var(--ink)] bg-[var(--paper)]">
        {items.map((d) => {
          const y = parseInt(d.name, 10)
          const color = Number.isFinite(y) ? barColorForCalendarYear(y) : 'var(--acid)'
          return (
            <div key={d.name}>
              <div className="flex justify-between items-center mb-[2px]">
                <span
                  style={{
                    fontFamily: "'Courier Prime', monospace",
                    fontSize: '10px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                  }}
                >
                  {d.name}
                </span>
                <span style={{ fontFamily: "'Darker Grotesque', sans-serif", fontSize: '13px', fontWeight: 900, color }}>
                  {Math.round(d.pct * 100)}%
                </span>
              </div>
              <div className="h-[10px] border-[2px] border-[var(--ink)] relative overflow-hidden">
                <div
                  className="absolute inset-y-0 left-0 transition-all duration-700"
                  style={{ width: `${d.pct * 100}%`, background: color }}
                />
              </div>
            </div>
          )
        })}
      </div>
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
  const { saved: savedTracks } = useSavedChartTracks()
  const { attendance } = useEventAttendance()
  const [error, setError] = useState('')

  // "Mis Tracks" entra aquí: cada track guardada cuenta como una entrada más
  // para desbloquear el ADN y también se envía al endpoint para moldearlo.
  const totalInputs =
    favArtists.length +
    favLabels.length +
    favEvents.length +
    savedMixes.length +
    savedTracks.length +
    Object.keys(attendance).length
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
                ? `Necesitas al menos 3 elementos guardados (artistas, sellos, eventos, mixes o tracks) para desbloquear tu perfil. Llevas ${totalInputs}.`
                : `You need at least 3 saved items (artists, labels, events, mixes or tracks) to unlock your profile. You have ${totalInputs}.`)
              : (es
                ? 'Pulsa "ANALIZAR MI PERFIL" y nuestra IA analizará tus gustos breakbeateros: subgéneros, países, épocas, eventos, mixes y tracks guardadas.'
                : 'Press "ANALYZE MY PROFILE" and our AI will analyze your breakbeat taste: subgenres, countries, eras, events, mixes and saved tracks.')
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
            <div className="p-5 border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)]">
              <div className="mb-3" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase', color: 'var(--red)' }}>
                {es ? 'Subgéneros' : 'Subgenres'}
              </div>
              <RadarChart styles={stats.top_styles} />
            </div>

            <div className="p-5 border-b-[3px] md:border-b-0 md:border-r-[3px] border-[var(--ink)]">
              <div className="mb-3" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase', color: 'var(--uv)' }}>
                {es ? 'Países' : 'Countries'}
              </div>
              <HorizontalBars data={stats.top_countries} color="var(--uv)" />
            </div>

            <div className="p-5">
              <div className="mb-3" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase', color: 'var(--acid)' }}>
                {es ? 'Años' : 'Years'}
              </div>
              <YearHistogramBars stats={stats} es={es} />
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
// OVERVIEW SECTION
// =============================================
export default function OverviewSection({ lang }: { lang: string }) {
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
