// ============================================
// OPTIMAL BREAKS — Overview section (formerly Overview tab)
// Shows stats grid + Breakbeat DNA AI analysis
// ============================================

'use client'

import { useEffect, useState } from 'react'
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

// =============================================
// "Pinchando tu ADN" — modal overlay que se enseña mientras la IA trabaja.
// La generación real tarda ~30-55s (gpt-5.4 + 2 llamadas paralelas), así que
// mostramos una fiesta: bola de discoteca, crew bailando, barra con rayas
// animadas y mensajes rotatorios con humor breakbeatero.
// =============================================

const PARTY_MESSAGES_ES = [
  'Preguntando a Fatboy Slim qué opina de ti…',
  'Midiendo tus BPMs con un metrónomo roto…',
  'Consultando al comité andaluz de breakbeat…',
  'Sacudiendo la maleta en busca del vinilo perfecto…',
  'Avisando al DJ residente de tu llegada…',
  'Calibrando el subgrave de la sala…',
  'Desenterrando tus breaks noventeros…',
  'Sincronizando con la bola de discoteca…',
  'Pidiéndole permiso a Finger Lickin\' Records…',
  'Peinando tus tracks en busca de un patrón…',
  'Montando el lineup de tu ADN…',
  'Abriendo la puerta de la rave mental…',
]

const PARTY_MESSAGES_EN = [
  'Asking Fatboy Slim what he thinks of you…',
  'Measuring your BPMs with a broken metronome…',
  'Consulting the Andalusian breakbeat committee…',
  'Shaking the record bag for the perfect vinyl…',
  'Paging the resident DJ…',
  'Calibrating the sub-bass in the room…',
  'Digging up your 90s breaks…',
  'Syncing with the disco ball…',
  'Asking Finger Lickin\' Records for permission…',
  'Combing your tracks for a pattern…',
  'Building the lineup of your DNA…',
  'Opening the door to the mental rave…',
]

function GeneratingPartyModal({ es, active }: { es: boolean; active: boolean }) {
  const [progress, setProgress] = useState(0)
  const [msgIdx, setMsgIdx] = useState(0)
  const messages = es ? PARTY_MESSAGES_ES : PARTY_MESSAGES_EN

  useEffect(() => {
    if (!active) {
      setProgress(0)
      setMsgIdx(0)
      return
    }
    // Curva asintótica: sube rápido al inicio y frena cerca del 95. El 100 lo
    // dejamos para cuando la llamada termine de verdad; aquí nunca llegamos
    // para no mentir al usuario.
    const tickProgress = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return p
        const step = Math.max(0.35, (95 - p) * 0.04)
        return Math.min(95, p + step)
      })
    }, 350)
    const tickMsg = window.setInterval(() => {
      setMsgIdx((i) => (i + 1) % messages.length)
    }, 2500)
    return () => {
      window.clearInterval(tickProgress)
      window.clearInterval(tickMsg)
    }
  }, [active, messages.length])

  if (!active) return null

  const currentPct = Math.round(progress)

  // Equalizer: 9 barras verticales monocromas que suben y bajan a contratiempo.
  // Cero gradientes, cero brillos: negro sobre paper, estética fanzine.
  const eqBars = [
    { dur: 0.48, delay: 0.00 },
    { dur: 0.62, delay: 0.08 },
    { dur: 0.38, delay: 0.18 },
    { dur: 0.72, delay: 0.02 },
    { dur: 0.50, delay: 0.24 },
    { dur: 0.44, delay: 0.12 },
    { dur: 0.66, delay: 0.30 },
    { dur: 0.40, delay: 0.06 },
    { dur: 0.56, delay: 0.20 },
  ]

  // Cinta superior tipo "caution tape" con el mismo texto repetido en loop.
  const tapeTextEs = 'ANALIZANDO · NO EJECT · OPTIMAL BREAKS · SIDE A — RAW DATA · ANALIZANDO · NO EJECT · OPTIMAL BREAKS · SIDE A — RAW DATA · '
  const tapeTextEn = 'ANALYZING · NO EJECT · OPTIMAL BREAKS · SIDE A — RAW DATA · ANALYZING · NO EJECT · OPTIMAL BREAKS · SIDE A — RAW DATA · '
  const tapeText = es ? tapeTextEs : tapeTextEn

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center px-4"
      style={{ background: 'var(--ink)', opacity: 0.995 }}
      role="dialog"
      aria-modal="true"
      aria-label={es ? 'Generando tu ADN breakbeatero' : 'Generating your breakbeat DNA'}
    >
      <style>{`
        @keyframes dnaEq {
          0%, 100% { transform: scaleY(0.18) }
          50% { transform: scaleY(1) }
        }
        @keyframes dnaTape {
          from { transform: translateX(0) }
          to   { transform: translateX(-50%) }
        }
        @keyframes dnaStripes {
          from { background-position: 0 0 }
          to   { background-position: 40px 0 }
        }
        @keyframes dnaBlink {
          0%, 100% { opacity: 1 }
          50% { opacity: 0 }
        }
      `}</style>

      <div
        className="w-full max-w-[560px] border-[6px] border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]"
        style={{ boxShadow: '10px 10px 0 var(--red)' }}
      >
        {/* Cinta cabecera: caution tape con texto scrolleando */}
        <div
          className="relative overflow-hidden border-b-[6px] border-[var(--ink)]"
          style={{ background: 'var(--yellow)', height: 34 }}
          aria-hidden
        >
          <div
            className="absolute inset-y-0 left-0 flex items-center whitespace-nowrap"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700,
              fontSize: '11px',
              letterSpacing: '2px',
              color: 'var(--ink)',
              animation: 'dnaTape 18s linear infinite',
              minWidth: '200%',
            }}
          >
            <span>{tapeText.repeat(2)}</span>
          </div>
        </div>

        <div className="px-6 sm:px-8 pt-6 pb-7">
          {/* REC indicator + SIDE label */}
          <div className="flex items-center justify-between mb-5" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '2px' }}>
            <div className="flex items-center gap-2">
              <span
                aria-hidden
                style={{
                  display: 'inline-block',
                  width: 10,
                  height: 10,
                  background: 'var(--red)',
                  animation: 'dnaBlink 1s steps(1,end) infinite',
                }}
              />
              <span style={{ color: 'var(--ink)', fontWeight: 700 }}>REC</span>
            </div>
            <span style={{ color: 'var(--ink)', opacity: 0.6 }}>// TRK 01 — SIDE A</span>
          </div>

          {/* Equalizer: 9 barras verticales negras sobre paper */}
          <div
            className="mx-auto mb-6 flex items-end justify-center gap-[6px] border-[3px] border-[var(--ink)] p-3"
            style={{ height: 120, background: 'var(--paper-dark, #e8dcc8)' }}
            aria-hidden
          >
            {eqBars.map((b, i) => (
              <span
                key={i}
                style={{
                  display: 'inline-block',
                  width: 14,
                  height: '100%',
                  background: 'var(--ink)',
                  transformOrigin: 'bottom',
                  animation: `dnaEq ${b.dur}s ease-in-out ${b.delay}s infinite`,
                }}
              />
            ))}
          </div>

          {/* Título brutalista */}
          <div
            className="mb-1"
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(22px, 5vw, 30px)',
              letterSpacing: '-1.2px',
              lineHeight: 1,
              color: 'var(--ink)',
              textTransform: 'uppercase',
            }}
          >
            {es ? 'Pinchando tu ADN' : 'Spinning your DNA'}
          </div>
          <div
            className="mb-5"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontSize: '11px',
              letterSpacing: '2px',
              color: 'var(--ink)',
              opacity: 0.55,
              textTransform: 'uppercase',
            }}
          >
            // {es ? 'Análisis en curso — no cierres la pestaña' : 'Analysis in progress — do not close tab'}
          </div>

          {/* Mensaje rotatorio: bloque duro con borde negro y fondo amarillo */}
          <div
            className="border-[3px] border-[var(--ink)] mb-6 px-3 py-3 flex items-start gap-2 min-h-[64px]"
            style={{ background: 'var(--yellow)' }}
          >
            <span
              aria-hidden
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 900,
                fontSize: '14px',
                color: 'var(--red)',
                lineHeight: 1.45,
                flexShrink: 0,
              }}
            >
              &gt;
            </span>
            <span
              style={{
                fontFamily: "'Special Elite', monospace",
                fontSize: '14px',
                lineHeight: 1.45,
                color: 'var(--ink)',
                textTransform: 'uppercase',
                letterSpacing: '0.5px',
              }}
            >
              {messages[msgIdx]}
            </span>
          </div>

          {/* Barra de progreso: caja con borde grueso + relleno negro + caution stripes */}
          <div className="flex items-end justify-between mb-1" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '2px' }}>
            <span style={{ color: 'var(--ink)', opacity: 0.55 }}>{es ? 'PROGRESO' : 'PROGRESS'}</span>
            <span
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontWeight: 900,
                fontSize: '22px',
                letterSpacing: '-1px',
                color: 'var(--red)',
                lineHeight: 1,
              }}
            >
              {String(currentPct).padStart(2, '0')}%
            </span>
          </div>

          <div
            className="relative h-6 border-[3px] border-[var(--ink)] overflow-hidden"
            style={{ background: 'var(--paper)' }}
            role="progressbar"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={currentPct}
          >
            <div
              className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out"
              style={{ width: `${currentPct}%`, background: 'var(--ink)' }}
            />
            <div
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  'repeating-linear-gradient(45deg, var(--yellow) 0 8px, transparent 8px 16px)',
                animation: 'dnaStripes 0.9s linear infinite',
                mixBlendMode: 'normal',
                opacity: currentPct > 0 ? 0.55 : 0,
              }}
            />
          </div>

          {/* Footer: tip estilo ticker */}
          <div
            className="mt-5 pt-3 border-t-[3px] border-[var(--ink)] flex items-center justify-between gap-3 flex-wrap"
            style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '1.5px', color: 'var(--ink)' }}
          >
            <span style={{ opacity: 0.65 }}>
              [ {es ? 'HASTA 60 SEGUNDOS' : 'UP TO 60 SECONDS'} ]
            </span>
            <span style={{ opacity: 0.65 }}>
              [ {es ? 'NO EJECT' : 'NO EJECT'} ]
            </span>
            <span style={{ opacity: 0.65 }}>
              [ AI / OB — {new Date().getFullYear()} ]
            </span>
          </div>
        </div>
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

      {/* Mientras genera: modal fullscreen con fiesta (bola, crew bailando,
          mensajes rotatorios y barra de progreso asintótica). El modal se
          cierra solo cuando el fetch termina y `generating` vuelve a false. */}
      <GeneratingPartyModal es={es} active={generating} />

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
