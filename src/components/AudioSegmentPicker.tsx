// ============================================
// OPTIMAL BREAKS — Selector del fragmento de audio (IG / R / F)
//
// Antes de generar un vídeo con audio, el admin elige qué 30 s del tema
// suenan, como en Instagram: onda del preview, ventana arrastrable con el
// dedo, escucha previa y arranque sugerido (tramo con más energía). El
// arranque elegido se guarda por tema (`share-audio.ts`): la Story, el reel y
// el vídeo de Facebook abren ya colocados en el mismo sitio.
// ============================================

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Locale } from '@/lib/i18n-config'
import { releaseYouTubePlay, requestYouTubePlay } from '@/lib/youtube-play-coordinator'
import {
  SHARE_SEGMENT_SEC,
  computePeaks,
  formatClock,
  getSavedSegmentStart,
  loadShareAudio,
  maxSegmentStart,
  saveSegmentStart,
  suggestSegmentStart,
  unlockAudioContext,
  type ShareAudioSegment,
} from '@/lib/share-audio'

const COLUMNS = 240
/** Slot del coordinador mientras se escucha el fragmento (una sola fuente audible). */
const SHARE_LISTEN_SLOT = 'ob-share-segment'

type Props = {
  lang: Locale
  /** URL del mismo origen del audio del tema (`audio` de /api/og/story?format=json). */
  audioUrl: string
  /** Clave del tema (`play=`) para recordar el fragmento. */
  segmentKey: string
  /** «Título — Artistas», para que se vea qué tema es. */
  trackTitle: string
  /** Texto del botón principal: «Generar historia», «Generar reel»… */
  confirmLabel: string
  /** `null` = generar sin audio (si el audio no se pudo cargar). */
  onConfirm: (segment: ShareAudioSegment | null) => void
  onCancel: () => void
}

export default function AudioSegmentPicker(props: Props) {
  const { audioUrl, segmentKey, onConfirm, onCancel } = props
  const es = props.lang === 'es'
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [failed, setFailed] = useState(false)
  const [start, setStart] = useState(0)
  const [suggested, setSuggested] = useState(0)
  const [head, setHead] = useState<number | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ offset: number } | null>(null)
  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<AudioBufferSourceNode | null>(null)
  const rafRef = useRef(0)

  useEffect(() => {
    let alive = true
    loadShareAudio(audioUrl)
      .then((buf) => {
        if (!alive) return
        const sug = suggestSegmentStart(buf)
        const saved = getSavedSegmentStart(segmentKey)
        setBuffer(buf)
        setSuggested(sug)
        setStart(saved != null ? Math.min(saved, maxSegmentStart(buf)) : sug)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [audioUrl, segmentKey])

  const duration = buffer?.duration ?? 0
  const seg = Math.min(SHARE_SEGMENT_SEC, duration || SHARE_SEGMENT_SEC)
  const maxStart = buffer ? maxSegmentStart(buffer) : 0
  const peaks = useMemo(() => (buffer ? computePeaks(buffer, COLUMNS) : null), [buffer])

  const stop = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    const src = srcRef.current
    srcRef.current = null
    if (src) {
      src.onended = null
      try {
        src.stop()
      } catch {
        /* ya parado */
      }
    }
    releaseYouTubePlay(SHARE_LISTEN_SLOT)
    setHead(null)
  }, [])

  useEffect(
    () => () => {
      stop()
      ctxRef.current?.close().catch(() => undefined)
    },
    [stop],
  )

  // Escape cierra; el scroll de la página queda quieto mientras está abierto.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onCancel()
    window.addEventListener('keydown', onKey)
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prev
    }
  }, [onCancel])

  function play() {
    if (!buffer) return
    stop()
    // Reclama el audio: para el preview, el deck y los embeds de YouTube/SoundCloud.
    requestYouTubePlay(SHARE_LISTEN_SLOT)
    const ctx = (ctxRef.current ??= new AudioContext())
    void ctx.resume()
    const src = ctx.createBufferSource()
    src.buffer = buffer
    src.connect(ctx.destination)
    const from = start
    src.start(0, from, seg)
    const t0 = ctx.currentTime
    srcRef.current = src
    src.onended = () => {
      if (srcRef.current === src) stop()
    }
    const tick = () => {
      setHead(from + (ctx.currentTime - t0))
      rafRef.current = requestAnimationFrame(tick)
    }
    tick()
  }

  const clampStart = (v: number) => Math.min(maxStart, Math.max(0, v))

  function timeAt(clientX: number) {
    const r = trackRef.current?.getBoundingClientRect()
    if (!r || !r.width) return 0
    return (Math.min(r.width, Math.max(0, clientX - r.left)) / r.width) * duration
  }

  function onPointerDown(e: React.PointerEvent<HTMLDivElement>) {
    if (!buffer) return
    stop()
    const t = timeAt(e.clientX)
    let offset = t - start
    // Fuera de la ventana: la centra donde tocas y empieza a arrastrar desde ahí.
    if (offset < 0 || offset > seg) {
      offset = seg / 2
      setStart(clampStart(t - offset))
    }
    drag.current = { offset }
    e.currentTarget.setPointerCapture(e.pointerId)
  }

  function onPointerMove(e: React.PointerEvent<HTMLDivElement>) {
    if (!drag.current) return
    setStart(clampStart(timeAt(e.clientX) - drag.current.offset))
  }

  function endDrag() {
    drag.current = null
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLDivElement>) {
    const step = e.shiftKey ? 5 : 1
    if (e.key === 'ArrowLeft') setStart((s) => clampStart(s - step))
    else if (e.key === 'ArrowRight') setStart((s) => clampStart(s + step))
    else return
    e.preventDefault()
    stop()
  }

  function confirm() {
    stop()
    if (!buffer) return onConfirm(null)
    saveSegmentStart(segmentKey, start)
    // Dentro del toque: iOS solo deja sonar audio creado en un gesto del usuario.
    onConfirm({ buffer, start, ctx: unlockAudioContext() })
  }

  const pct = (t: number) => (duration ? (t / duration) * 100 : 0)
  const btn =
    'inline-flex items-center justify-center h-[40px] px-3 text-[11px] font-black tracking-wider uppercase border-2 border-[var(--ink)] touch-manipulation cursor-pointer disabled:opacity-40 disabled:cursor-default'
  const playing = head != null

  const node = (
    <div
      className="fixed inset-0 z-[1000] flex items-end sm:items-center justify-center bg-black/70 p-4"
      style={{ fontFamily: "'Courier Prime', monospace" }}
      // El selector vive dentro de filas clicables: que nada suba a ellas.
      onClick={(e) => {
        e.stopPropagation()
        if (e.target === e.currentTarget) onCancel()
      }}
      onPointerDown={(e) => e.stopPropagation()}
      role="dialog"
      aria-modal="true"
      aria-label={es ? 'Elegir fragmento de audio' : 'Choose audio fragment'}
    >
      <div className="w-full max-w-[560px] bg-[var(--paper)] text-[var(--ink)] border-4 border-[var(--ink)] shadow-[8px_8px_0_var(--ink)] p-4 sm:p-5">
        <div className="text-[11px] font-black tracking-[0.2em] text-[var(--red)] uppercase">
          {es ? `Elige los ${SHARE_SEGMENT_SEC} s que suenan` : `Pick the ${SHARE_SEGMENT_SEC} s that play`}
        </div>
        <div className="mt-1 text-[13px] font-bold leading-snug line-clamp-2">{props.trackTitle}</div>

        <div
          ref={trackRef}
          className="relative mt-4 h-[96px] bg-[var(--ink)] select-none touch-none cursor-grab active:cursor-grabbing"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={endDrag}
          onPointerCancel={endDrag}
        >
          {peaks ? (
            <svg
              viewBox={`0 0 ${COLUMNS} 100`}
              preserveAspectRatio="none"
              className="absolute inset-0 w-full h-full"
              aria-hidden="true"
            >
              {Array.from(peaks, (p, i) => {
                const h = Math.max(2, p * 92)
                const t = ((i + 0.5) / COLUMNS) * duration
                const inside = t >= start && t <= start + seg
                return (
                  <rect
                    key={i}
                    x={i + 0.15}
                    y={50 - h / 2}
                    width={0.7}
                    height={h}
                    // `var()` no vale como atributo SVG: va en style.
                    style={{ fill: inside ? 'var(--yellow)' : 'var(--paper)', opacity: inside ? 1 : 0.35 }}
                  />
                )
              })}
            </svg>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center text-[11px] font-bold tracking-wider uppercase text-[var(--paper)]">
              {failed
                ? es
                  ? 'No se pudo cargar el audio'
                  : 'Could not load the audio'
                : es
                  ? 'Cargando audio…'
                  : 'Loading audio…'}
            </div>
          )}
          {buffer ? (
            <div
              role="slider"
              tabIndex={0}
              aria-label={es ? 'Inicio del fragmento' : 'Fragment start'}
              aria-valuemin={0}
              aria-valuemax={Math.round(maxStart)}
              aria-valuenow={Math.round(start)}
              aria-valuetext={formatClock(start)}
              onKeyDown={onKeyDown}
              className="absolute top-0 bottom-0 border-[3px] border-[var(--yellow)] outline-none focus-visible:border-[var(--red)]"
              style={{ left: `${pct(start)}%`, width: `${pct(seg)}%`, background: 'rgba(244, 196, 48, 0.16)' }}
            />
          ) : null}
          {head != null ? (
            <div
              className="absolute top-0 bottom-0 w-[2px] bg-[var(--red)] pointer-events-none"
              style={{ left: `${pct(head)}%` }}
            />
          ) : null}
        </div>

        <div className="mt-2 flex items-center justify-between text-[11px] font-bold tracking-wider">
          <span>
            {buffer ? `${formatClock(start)} – ${formatClock(start + seg)}` : '–:–'}
          </span>
          <span className="opacity-60">
            {buffer
              ? es
                ? `preview de ${formatClock(duration)}`
                : `${formatClock(duration)} preview`
              : ''}
          </span>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            className={`${btn} ${playing ? 'bg-[var(--ink)] text-white' : 'bg-transparent hover:bg-[var(--yellow)]'}`}
            onClick={() => (playing ? stop() : play())}
            disabled={!buffer}
          >
            {playing ? (es ? '■ Parar' : '■ Stop') : es ? '▶ Escuchar' : '▶ Listen'}
          </button>
          <button
            type="button"
            className={`${btn} bg-transparent hover:bg-[var(--yellow)]`}
            onClick={() => {
              stop()
              setStart(suggested)
            }}
            disabled={!buffer || Math.abs(start - suggested) < 0.25}
            title={es ? 'Vuelve al tramo con más energía' : 'Back to the most energetic part'}
          >
            {es ? 'Sugerido' : 'Suggested'}
          </button>
          <div className="flex-1" />
          <button type="button" className={`${btn} bg-transparent hover:bg-[var(--yellow)]`} onClick={onCancel}>
            {es ? 'Cancelar' : 'Cancel'}
          </button>
          <button
            type="button"
            className={`${btn} bg-[var(--red)] text-white hover:bg-[var(--ink)]`}
            onClick={confirm}
            disabled={!buffer && !failed}
          >
            {failed ? (es ? 'Generar sin audio' : 'Generate without audio') : props.confirmLabel}
          </button>
        </div>
        <p className="mt-3 text-[10px] leading-snug opacity-60">
          {es
            ? 'Arrastra la ventana amarilla. Si el tema está en Instagram, baja a cero el audio original y pon el oficial.'
            : 'Drag the yellow window. If the track is on Instagram, mute the original audio and add the official one.'}
        </p>
      </div>
    </div>
  )

  return typeof document === 'undefined' ? null : createPortal(node, document.body)
}
