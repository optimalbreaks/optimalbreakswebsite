'use client'

import { useEffect, useState } from 'react'
import type { Locale } from '@/lib/i18n-config'

/**
 * Emergente «Toca para escuchar» de los enlaces compartidos de un tema.
 * Compartido por /charts (chart/featured/vinyl, en ChartView) y por el Top 10
 * Beatport de las fichas de artista/sello (BeatportTopTracks).
 *
 * Un link compartido de un tema DEBE acabar sonando: los navegadores (móvil
 * sobre todo) bloquean el `play()` sin gesto, así que el emergente ofrece ese
 * gesto con el nombre del tema. Tocar fuera lo cierra sin reproducir.
 * Regla de producto (sep 2026): los enlaces compartidos NO hacen autoplay;
 * SIEMPRE este modal + tap del receptor.
 */
export default function TapToPlayOverlay({
  title,
  mixName,
  artistText,
  artworkCandidates,
  resetKey,
  ariaLabel,
  lang,
  onPlay,
  onDismiss,
}: {
  title: string
  mixName?: string | null
  artistText: string
  /** Fuentes de carátula en orden de preferencia; se salta a la siguiente si una falla. */
  artworkCandidates: string[]
  /** Cambiar de tema reinicia el fallback de carátula. */
  resetKey: string
  ariaLabel: string
  lang: Locale
  onPlay: () => void
  onDismiss: () => void
}) {
  const es = lang === 'es'
  const [idx, setIdx] = useState(0)

  useEffect(() => { setIdx(0) }, [resetKey])

  const src = artworkCandidates[idx] ?? null

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[var(--ink)]/70 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-label={ariaLabel}
      onClick={onDismiss}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPlay() }}
        className="flex items-center gap-3 sm:gap-4 bg-[var(--paper)] border-[4px] border-[var(--ink)] px-3 sm:px-5 py-3 sm:py-4 max-w-[520px] w-full hover:bg-[var(--yellow)] active:bg-[var(--yellow)] transition-colors cursor-pointer touch-manipulation text-left"
        style={{ fontFamily: "'Courier Prime', monospace" }}
      >
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] bg-[var(--paper-dark)] shrink-0 overflow-hidden">
          {src ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={`${resetKey}-${idx}-${src}`}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => {
                setIdx((i) => (i + 1 < artworkCandidates.length ? i + 1 : artworkCandidates.length))
              }}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[var(--ink)]/50 text-xl font-black" aria-hidden>♪</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] sm:text-xs font-black tracking-widest text-[var(--red)] mb-0.5 sm:mb-1">
            {es ? '▶ TOCA PARA ESCUCHAR' : '▶ TAP TO PLAY'}
          </div>
          <div className="text-sm sm:text-base font-black text-[var(--ink)] truncate leading-tight" style={{ fontFamily: "'Unbounded', sans-serif" }}>
            {title}
            {(mixName || '').trim() ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{mixName}</span> : null}
          </div>
          {artistText && <div className="text-[11px] sm:text-xs text-[var(--ink)]/70 truncate">{artistText}</div>}
        </div>
        <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 border-[3px] border-[var(--ink)] bg-[var(--red)] text-white text-lg font-black" aria-hidden>▶</span>
      </button>
    </div>
  )
}
