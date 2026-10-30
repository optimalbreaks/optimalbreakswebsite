// ============================================
// OPTIMAL BREAKS — Selector del fragmento de audio (IG / R / F)
//
// Antes de generar un vídeo con audio, el admin elige qué 30 s del tema
// suenan, como en Instagram: onda del preview, ventana arrastrable con el
// dedo, escucha previa y arranque sugerido (tramo con más energía). El
// arranque elegido se guarda por tema (`share-audio.ts`): la Story, el reel y
// el vídeo de Facebook abren ya colocados en el mismo sitio.
//
// ▶ Escuchar NO usa Web Audio. En el iPhone eso se queda mudo (interruptor
// de silencio, y un AudioContext distinto del reproductor de la web). Suena
// un `<audio>` con el WAV del tramo ya decodificado: se oye exactamente la
// ventana amarilla, sin buscar en el archivo. Si el blob no arranca, el mismo
// elemento pone la URL del preview y salta al segundo elegido.
// ============================================

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import type { Locale } from '@/lib/i18n-config'
import { isIosDevice } from '@/lib/audio-unlock'
import { audioDiag, playerDiag } from '@/lib/player-diag'
import { releaseYouTubePlay, registerYouTubeEmbed, requestYouTubePlay } from '@/lib/youtube-play-coordinator'
import {
  SHARE_SEGMENT_SEC,
  computePeaks,
  formatClock,
  getSavedSegmentStart,
  loadShareAudio,
  maxSegmentStart,
  saveSegmentStart,
  segmentToWavBlob,
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
  /** Segundos que suenan = duración del vídeo (por defecto, la de un tema). */
  segmentSec?: number
  /** `null` = generar sin audio (si el audio no se pudo cargar). */
  onConfirm: (segment: ShareAudioSegment | null) => void
  onCancel: () => void
}

export default function AudioSegmentPicker(props: Props) {
  const { audioUrl, segmentKey, onConfirm, onCancel } = props
  const segSec = props.segmentSec ?? SHARE_SEGMENT_SEC
  const es = props.lang === 'es'
  const [buffer, setBuffer] = useState<AudioBuffer | null>(null)
  const [failed, setFailed] = useState(false)
  const [start, setStart] = useState(0)
  const [suggested, setSuggested] = useState(0)
  const [head, setHead] = useState<number | null>(null)
  const [listening, setListening] = useState(false)
  const [hearError, setHearError] = useState<string | null>(null)
  const trackRef = useRef<HTMLDivElement>(null)
  const drag = useRef<{ offset: number } | null>(null)
  const elRef = useRef<HTMLAudioElement | null>(null)
  const wavRef = useRef<{ key: string; url: string } | null>(null)
  const genRef = useRef(0)
  const phaseRef = useRef<'idle' | 'wav' | 'url' | 'web'>('idle')
  const unbindRef = useRef<(() => void) | null>(null)
  const watchRef = useRef(0)
  const ctxRef = useRef<AudioContext | null>(null)
  const srcRef = useRef<AudioBufferSourceNode | null>(null)
  const rafRef = useRef(0)
  const armRef = useRef(false)

  useEffect(() => {
    let alive = true
    loadShareAudio(audioUrl)
      .then((buf) => {
        if (!alive) return
        const sug = suggestSegmentStart(buf, segSec)
        const saved = getSavedSegmentStart(segmentKey)
        setBuffer(buf)
        setSuggested(sug)
        setStart(saved != null ? Math.min(saved, maxSegmentStart(buf, segSec)) : sug)
      })
      .catch(() => alive && setFailed(true))
    return () => {
      alive = false
    }
  }, [audioUrl, segmentKey, segSec])

  const duration = buffer?.duration ?? 0
  const seg = Math.min(segSec, duration || segSec)
  const maxStart = buffer ? maxSegmentStart(buffer, segSec) : 0
  const peaks = useMemo(() => (buffer ? computePeaks(buffer, COLUMNS) : null), [buffer])

  const stop = useCallback((opts?: { pause?: boolean }) => {
    armRef.current = false
    genRef.current += 1
    phaseRef.current = 'idle'
    window.clearTimeout(watchRef.current)
    unbindRef.current?.()
    unbindRef.current = null
    cancelAnimationFrame(rafRef.current)
    const src = srcRef.current
    srcRef.current = null
    if (src) {
      src.onended = null
      try { src.stop() } catch { /* ya parado */ }
    }
    const el = elRef.current
    if (el) {
      // En iOS, pausar JUSTO antes de cambiar el `src` saca la sesión de
      // WebKit de Playing y el play() siguiente no suena hasta tocar el móvil.
      // Quien para de verdad (botón, arrastre, cerrar) sí pausa.
      if (opts?.pause !== false) {
        el.muted = false
        try { el.pause() } catch { /* ya parado */ }
      }
    }
    releaseYouTubePlay(SHARE_LISTEN_SLOT)
    setHead(null)
    setListening(false)
    setHearError(null)
  }, [])

  useEffect(
    () => () => {
      stop()
      const el = elRef.current
      elRef.current = null
      if (el) {
        try { el.pause() } catch { /* no-op */ }
        el.removeAttribute('src')
        el.remove()
      }
      if (wavRef.current) {
        URL.revokeObjectURL(wavRef.current.url)
        wavRef.current = null
      }
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

  function ensureListenEl(): HTMLAudioElement {
    let el = elRef.current
    if (!el) {
      el = new Audio()
      el.preload = 'auto'
      el.setAttribute('playsinline', '')
      el.setAttribute('webkit-playsinline', 'true')
      el.setAttribute('aria-hidden', 'true')
      el.setAttribute('data-ob-share-listen', '')
      // En el DOM: WebKit no suena un blob en un elemento suelto. Fuera de
      // pantalla, sin display:none (algunos motores no reproducen eso).
      el.style.cssText = 'position:fixed;width:1px;height:1px;left:0;top:0;opacity:0;pointer-events:none'
      document.body.appendChild(el)
      elRef.current = el
    }
    return el
  }

  function play() {
    if (!buffer || armRef.current) return
    armRef.current = true
    const buf = buffer
    const from = Math.max(0, start)
    const length = Math.max(0.05, seg)
    // Para el preview de la web ANTES de arrancar el nuestro.
    stop({ pause: !isIosDevice() })
    requestYouTubePlay(SHARE_LISTEN_SLOT)
    registerYouTubeEmbed(SHARE_LISTEN_SLOT, () => stop())
    armRef.current = true
    const gen = genRef.current
    setListening(true)
    setHearError(null)
    const el = ensureListenEl()
    const alive = () => genRef.current === gen

    const bind = (handlers: Record<string, EventListener>) => {
      unbindRef.current?.()
      const entries = Object.entries(handlers)
      for (const [ev, fn] of entries) el.addEventListener(ev, fn)
      unbindRef.current = () => {
        for (const [ev, fn] of entries) el.removeEventListener(ev, fn)
      }
    }

    const tried = { wav: false, url: false, web: false }

    const fail = (why: string) => {
      if (!alive()) return
      playerDiag('share_listen_err', { via: phaseRef.current, why })
      stop()
      setHearError(
        es
          ? 'No se ha podido oír el fragmento. Sube el volumen y pulsa Escuchar otra vez.'
          : 'Could not play this fragment. Turn the volume up and tap Listen again.',
      )
    }

    let nextAfterUrl = () => { /* se rellena cuando existen los dos caminos */ }
    let nextAfterWav = () => { /* idem */ }

    const startWeb = () => {
      if (!alive() || tried.web) return
      tried.web = true
      phaseRef.current = 'web'
      try { el.pause() } catch { /* el <audio> no pudo; esto toma el relevo */ }
      const Ctor =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
      if (!Ctor) return fail('no-ctx')
      const ctx = ctxRef.current && ctxRef.current.state !== 'closed' ? ctxRef.current : new Ctor()
      ctxRef.current = ctx
      void ctx.resume()
      try {
        const blip = ctx.createBufferSource()
        blip.buffer = ctx.createBuffer(1, 1, ctx.sampleRate)
        blip.connect(ctx.destination)
        blip.start(0)
      } catch { /* el contexto ya iba desbloqueado */ }
      const src = ctx.createBufferSource()
      src.buffer = buf
      src.connect(ctx.destination)
      const offset = Math.min(from, Math.max(0, buf.duration - 0.05))
      const playLen = Math.max(0.05, Math.min(length, buf.duration - offset))
      const now = ctx.currentTime
      try {
        // Sin duración en start(): Safari se queda mudo con el 3.er argumento.
        src.start(now, offset)
        src.stop(now + playLen)
      } catch (err) {
        return fail(err instanceof Error ? err.name : 'start')
      }
      srcRef.current = src
      src.onended = () => {
        if (srcRef.current === src) stop()
      }
      const tick = () => {
        if (srcRef.current !== src || !alive()) return
        setHead(Math.min(duration, offset + (ctx.currentTime - now)))
        rafRef.current = requestAnimationFrame(tick)
      }
      tick()
      window.clearTimeout(watchRef.current)
      watchRef.current = window.setTimeout(() => {
        if (srcRef.current !== src || !alive()) return
        if (ctx.state === 'running') {
          playerDiag('share_listen_ok', { via: 'web', from: Math.round(from * 10) / 10 })
          return
        }
        void ctx.resume()
        fail('suspended')
      }, 700)
    }

    const startUrl = () => {
      if (!alive() || tried.url) return
      tried.url = true
      phaseRef.current = 'url'
      const abs = new URL(audioUrl, window.location.href).href
      el.muted = true
      el.volume = 1
      el.loop = false
      const have = el.getAttribute('src')
      const same = !!have && !have.startsWith('blob:') && el.src === abs
      if (!same) {
        if (!isIosDevice()) {
          try { el.pause() } catch { /* no-op */ }
        }
        el.src = abs
      }
      let seekTries = 0
      const place = () => {
        if (!alive() || phaseRef.current !== 'url') return
        if (el.readyState < 1 || !Number.isFinite(el.duration)) return
        if (from > el.duration + 0.05) return fail('past-end')
        if (Math.abs(el.currentTime - from) > 0.35) {
          try { el.currentTime = from } catch { /* aún no se puede buscar */ }
          return
        }
        if (!el.seeking) {
          el.muted = false
          setHead(Math.min(duration, el.currentTime))
        }
      }
      const onSeeked = () => {
        if (!alive() || phaseRef.current !== 'url') return
        if (Math.abs(el.currentTime - from) > 0.6) {
          seekTries += 1
          if (seekTries > 4) return nextAfterUrl()
          try { el.currentTime = from } catch { /* no-op */ }
          return
        }
        el.muted = false
        setHead(Math.min(duration, el.currentTime))
        playerDiag('share_listen_ok', { via: 'url', from: Math.round(from * 10) / 10 })
      }
      const onTime = () => {
        if (!alive() || phaseRef.current !== 'url') return
        if (el.muted) return place()
        if (el.currentTime + 0.5 < from && seekTries < 4) {
          seekTries += 1
          el.muted = true
          try { el.currentTime = from } catch { /* no-op */ }
          return
        }
        setHead(Math.min(duration, el.currentTime))
        if (el.currentTime >= from + length - 0.08) stop()
      }
      bind({
        loadedmetadata: place,
        progress: place,
        canplay: place,
        seeked: onSeeked,
        timeupdate: onTime,
        ended: () => { if (alive() && phaseRef.current === 'url') stop() },
        error: () => {
          if (!alive() || phaseRef.current !== 'url') return
          playerDiag('share_listen_err', { via: 'url', ...audioDiag(el) })
          nextAfterUrl()
        },
      })
      const pending = el.play()
      place()
      pending.then(() => { if (alive() && phaseRef.current === 'url') place() }).catch((err: unknown) => {
        if (!alive() || phaseRef.current !== 'url') return
        const name = err instanceof Error ? err.name : 'play'
        playerDiag('share_listen_err', { via: 'url', name })
        nextAfterUrl()
      })
      window.clearTimeout(watchRef.current)
      watchRef.current = window.setTimeout(() => {
        if (!alive() || phaseRef.current !== 'url') return
        if (!el.muted && el.currentTime > 0.05) return
        playerDiag('share_listen_err', { via: 'url-timeout', ...audioDiag(el) })
        nextAfterUrl()
      }, 2500)
    }

    const startWav = () => {
      if (!alive() || tried.wav) return
      tried.wav = true
      phaseRef.current = 'wav'
      const key = `${audioUrl}|${Math.round(from * 50)}|${Math.round(length * 50)}`
      let url = wavRef.current?.key === key ? wavRef.current.url : ''
      let revoke: string | null = null
      if (!url) {
        url = URL.createObjectURL(segmentToWavBlob(buf, from, length))
        revoke = wavRef.current?.url ?? null
        wavRef.current = { key, url }
      }
      el.muted = false
      el.volume = 1
      el.loop = false
      const same = el.src === url
      if (!isIosDevice()) {
        try { el.pause() } catch { /* no-op */ }
      }
      el.src = url
      if (revoke && revoke !== url) URL.revokeObjectURL(revoke)
      if (same) {
        try { el.currentTime = 0 } catch { /* aún sin metadata */ }
      }
      bind({
        timeupdate: () => {
          if (!alive() || phaseRef.current !== 'wav') return
          setHead(Math.min(duration, from + el.currentTime))
          if (el.currentTime >= length - 0.08) stop()
        },
        ended: () => { if (alive() && phaseRef.current === 'wav') stop() },
        error: () => {
          if (!alive() || phaseRef.current !== 'wav') return
          playerDiag('share_listen_err', { via: 'wav', ...audioDiag(el) })
          nextAfterWav()
        },
      })
      const pending = el.play()
      pending.then(() => {
        if (!alive() || phaseRef.current !== 'wav') return
        playerDiag('share_listen_ok', { via: 'wav', from: Math.round(from * 10) / 10, ios: isIosDevice() })
      }).catch((err: unknown) => {
        if (!alive() || phaseRef.current !== 'wav') return
        playerDiag('share_listen_err', { via: 'wav', name: err instanceof Error ? err.name : 'play' })
        nextAfterWav()
      })
      window.clearTimeout(watchRef.current)
      watchRef.current = window.setTimeout(() => {
        if (!alive() || phaseRef.current !== 'wav') return
        // El reloj no avanza: el blob no está sonando (iOS a veces «acepta»
        // el play y se queda en 0). La URL del preview toma el relevo.
        if (el.currentTime > 0.05) return
        playerDiag('share_listen_err', { via: 'wav-timeout', ...audioDiag(el) })
        nextAfterWav()
      }, 1200)
    }

    nextAfterUrl = () => {
      if (!alive()) return
      if (!tried.wav) startWav()
      else startWeb()
    }
    nextAfterWav = () => {
      if (!alive()) return
      if (!tried.url) startUrl()
      else startWeb()
    }

    try {
      // iPhone: el play() del gesto va a la URL del preview (el mismo camino
      // que el reproductor de la web). El WAV es el relevo si no se puede
      // saltar al segundo elegido. En el resto, el WAV suena ya el tramo.
      if (isIosDevice()) startUrl()
      else startWav()
    } catch (err) {
      playerDiag('share_listen_err', { via: phaseRef.current, name: err instanceof Error ? err.name : 'throw' })
      try {
        if (isIosDevice()) nextAfterUrl()
        else nextAfterWav()
      } catch {
        fail('throw')
      }
    }
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
  const playing = listening

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
          {es ? `Elige los ${segSec} s que suenan` : `Pick the ${segSec} s that play`}
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
            {playing
              ? head == null
                ? (es ? '▶ …' : '▶ …')
                : (es ? '■ Parar' : '■ Stop')
              : es
                ? '▶ Escuchar'
                : '▶ Listen'}
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
        {hearError ? (
          <p className="mt-2 text-[11px] font-bold leading-snug text-[var(--red)]">{hearError}</p>
        ) : null}
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
