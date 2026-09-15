// ============================================
// OPTIMAL BREAKS — Cargador fanzine compartido
// ----------------------------------------------
// La pantalla de carga con estética fanzine (cinta de precaución, ecualizador,
// mensajes rotatorios y barra de progreso) nacida en Almas Gemelas, extraída
// aquí para que NINGUNA espera de la web se quede en un "Cargando…" plano.
// Se usa en: loading.tsx global, Almas Gemelas, Top 100, Mis Tracks/listas
// compartidas, mixes guardados… Cualquier sección nueva con fetch en cliente
// debería renderizar <LoadingBreaks /> mientras espera.
//
// El % sube con curva asintótica y se frena en 95: el 100 real llega cuando
// el contenido sustituye al cargador (no mentimos al usuario).
// ============================================

'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'

const MONO = "'Courier Prime', monospace"
const DISPLAY = "'Unbounded', sans-serif"

const GENERIC_MESSAGES_ES = [
  'Rebobinando la cinta…',
  'Alineando la aguja en el surco…',
  'Sincronizando los platos…',
  'Cargando la maleta de vinilos…',
  'Ajustando el crossfader…',
  'Contando los BPMs…',
  'Desempolvando los breaks…',
  'Abriendo la sala…',
]
const GENERIC_MESSAGES_EN = [
  'Rewinding the tape…',
  'Dropping the needle in the groove…',
  'Syncing the decks…',
  'Loading the record bag…',
  'Adjusting the crossfader…',
  'Counting the BPMs…',
  'Dusting off the breaks…',
  'Opening the venue…',
]

interface LoadingBreaksProps {
  /** Forzar idioma; si no se pasa, se deduce del pathname (/es/…). */
  es?: boolean
  /** Título grande (por defecto "Cargando breaks" / "Loading breaks"). */
  title?: string
  /** Línea pequeña bajo el título. */
  subtitle?: string
  /** Mensajes rotatorios propios (si no, los genéricos del idioma). */
  messages?: string[]
  /** Texto de la cinta superior en loop. */
  tape?: string
}

export default function LoadingBreaks({ es, title, subtitle, messages, tape }: LoadingBreaksProps) {
  const pathname = usePathname()
  const isEs = typeof es === 'boolean' ? es : (pathname?.startsWith('/es') ?? false)
  const msgs = messages && messages.length > 0 ? messages : (isEs ? GENERIC_MESSAGES_ES : GENERIC_MESSAGES_EN)
  const [progress, setProgress] = useState(0)
  const [msgIdx, setMsgIdx] = useState(0)

  useEffect(() => {
    const tickProgress = window.setInterval(() => {
      setProgress((p) => {
        if (p >= 95) return p
        const step = Math.max(0.6, (95 - p) * 0.06)
        return Math.min(95, p + step)
      })
    }, 300)
    const tickMsg = window.setInterval(() => {
      setMsgIdx((i) => (i + 1) % msgs.length)
    }, 2200)
    return () => {
      window.clearInterval(tickProgress)
      window.clearInterval(tickMsg)
    }
  }, [msgs.length])

  const currentPct = Math.round(progress)
  const eqBars = [
    { dur: 0.48, delay: 0.00 }, { dur: 0.62, delay: 0.08 }, { dur: 0.38, delay: 0.18 },
    { dur: 0.72, delay: 0.02 }, { dur: 0.50, delay: 0.24 }, { dur: 0.44, delay: 0.12 },
    { dur: 0.66, delay: 0.30 }, { dur: 0.40, delay: 0.06 }, { dur: 0.56, delay: 0.20 },
  ]
  const tapeText = tape
    ?? (isEs
      ? 'CARGANDO · OPTIMAL BREAKS · SIDE A — RAW DATA · CARGANDO · OPTIMAL BREAKS · SIDE A — RAW DATA · '
      : 'LOADING · OPTIMAL BREAKS · SIDE A — RAW DATA · LOADING · OPTIMAL BREAKS · SIDE A — RAW DATA · ')

  return (
    <div aria-busy="true" aria-live="polite" className="flex justify-center py-6">
      <style>{`
        @keyframes lbEq { 0%,100% { transform: scaleY(0.18) } 50% { transform: scaleY(1) } }
        @keyframes lbTape { from { transform: translateX(0) } to { transform: translateX(-50%) } }
        @keyframes lbScan { from { background-position: 0 0 } to { background-position: 40px 0 } }
        @keyframes lbBlink { 0%,100% { opacity: 1 } 50% { opacity: 0 } }
      `}</style>

      <div
        className="w-full max-w-[560px] border-[6px] border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)]"
        style={{ boxShadow: '10px 10px 0 var(--red)' }}
      >
        {/* Cinta cabecera con texto en loop */}
        <div className="relative overflow-hidden border-b-[6px] border-[var(--ink)]" style={{ background: 'var(--yellow)', height: 34 }} aria-hidden>
          <div
            className="absolute inset-y-0 left-0 flex items-center whitespace-nowrap"
            style={{ fontFamily: MONO, fontWeight: 700, fontSize: '11px', letterSpacing: '2px', color: 'var(--ink)', animation: 'lbTape 18s linear infinite', minWidth: '200%' }}
          >
            <span>{tapeText.repeat(2)}</span>
          </div>
        </div>

        <div className="px-6 sm:px-8 pt-6 pb-7">
          {/* Indicador + etiqueta */}
          <div className="flex items-center justify-between mb-5" style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '2px' }}>
            <div className="flex items-center gap-2">
              <span aria-hidden style={{ display: 'inline-block', width: 10, height: 10, background: 'var(--red)', animation: 'lbBlink 1s steps(1,end) infinite' }} />
              <span style={{ fontWeight: 700 }}>SCAN</span>
            </div>
            <span style={{ opacity: 0.6 }}>// TRK 01 — SIDE A</span>
          </div>

          {/* Ecualizador */}
          <div className="mx-auto mb-6 flex items-end justify-center gap-[6px] border-[3px] border-[var(--ink)] p-3" style={{ height: 120, background: 'var(--paper-dark, #e8dcc8)' }} aria-hidden>
            {eqBars.map((b, i) => (
              <span key={i} style={{ display: 'inline-block', width: 14, height: '100%', background: 'var(--ink)', transformOrigin: 'bottom', animation: `lbEq ${b.dur}s ease-in-out ${b.delay}s infinite` }} />
            ))}
          </div>

          {/* Título */}
          <div className="mb-1" style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: 'clamp(22px, 5vw, 30px)', letterSpacing: '-1.2px', lineHeight: 1, textTransform: 'uppercase' }}>
            {title ?? (isEs ? 'Cargando breaks' : 'Loading breaks')}
          </div>
          <div className="mb-5" style={{ fontFamily: MONO, fontSize: '11px', letterSpacing: '2px', opacity: 0.55, textTransform: 'uppercase' }}>
            // {subtitle ?? (isEs ? 'Un momento — montando la sesión' : 'One moment — setting up the session')}
          </div>

          {/* Mensaje rotatorio */}
          <div className="border-[3px] border-[var(--ink)] mb-6 px-3 py-3 flex items-start gap-2 min-h-[64px]" style={{ background: 'var(--yellow)' }}>
            <span aria-hidden style={{ fontFamily: MONO, fontWeight: 900, fontSize: '14px', color: 'var(--red)', lineHeight: 1.45, flexShrink: 0 }}>&gt;</span>
            <span style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.45, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
              {msgs[msgIdx]}
            </span>
          </div>

          {/* Barra de progreso */}
          <div className="flex items-end justify-between mb-1" style={{ fontFamily: MONO, fontSize: '10px', letterSpacing: '2px' }}>
            <span style={{ opacity: 0.55 }}>{isEs ? 'PROGRESO' : 'PROGRESS'}</span>
            <span style={{ fontFamily: DISPLAY, fontWeight: 900, fontSize: '22px', letterSpacing: '-1px', color: 'var(--red)', lineHeight: 1 }}>
              {String(currentPct).padStart(2, '0')}%
            </span>
          </div>
          <div className="relative h-6 border-[3px] border-[var(--ink)] overflow-hidden" style={{ background: 'var(--paper)' }} role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={currentPct}>
            <div className="absolute inset-y-0 left-0 transition-[width] duration-300 ease-out" style={{ width: `${currentPct}%`, background: 'var(--ink)' }} />
            <div className="absolute inset-0 pointer-events-none" style={{ background: 'repeating-linear-gradient(45deg, var(--yellow) 0 8px, transparent 8px 16px)', animation: 'lbScan 0.9s linear infinite', opacity: currentPct > 0 ? 0.55 : 0 }} />
          </div>
        </div>
      </div>
    </div>
  )
}
