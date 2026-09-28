// ============================================
// OPTIMAL BREAKS — Hidden SoundCloud Widget
// Offscreen iframe + SC Widget API for background audio
// ============================================

'use client'

import { useEffect, useRef, useCallback } from 'react'

declare global {
  interface Window {
    SC?: {
      Widget: {
        (iframe: HTMLIFrameElement): SCWidgetInstance
        Events: {
          READY: string
          PLAY: string
          PAUSE: string
          FINISH: string
          PLAY_PROGRESS: string
          ERROR: string
        }
      }
    }
  }
}

interface SCWidgetInstance {
  bind(event: string, cb: (data: { currentPosition?: number }) => void): void
  unbind(event: string): void
  play(): void
  pause(): void
  seekTo(ms: number): void
  getDuration(cb: (ms: number) => void): void
  getPosition(cb: (ms: number) => void): void
  isPaused(cb: (paused: boolean) => void): void
  load(url: string, opts?: Record<string, unknown>): void
}

export interface SoundCloudWidgetHandle {
  play: () => void
  pause: () => void
  seekTo: (ms: number) => void
  getDuration: () => Promise<number>
  getPosition: () => Promise<number>
}

interface Props {
  trackUrl: string
  onReady?: () => void
  onPlay?: () => void
  onPause?: () => void
  onFinish?: () => void
  onProgress?: (positionMs: number, durationMs: number) => void
  onError?: () => void
  handleRef?: (handle: SoundCloudWidgetHandle | null) => void
}

/**
 * Carga única de la API del widget, compartida por todas las instancias.
 * Antes, si el script fallaba, las llamadas siguientes quedaban esperando con
 * un setInterval infinito. Ahora hay una sola promesa; si falla, se descarta
 * para poder reintentar en el próximo play.
 */
let scApiPromise: Promise<void> | null = null

function loadScWidgetApi(): Promise<void> {
  if (typeof window === 'undefined') return Promise.reject(new Error('no window'))
  if (window.SC?.Widget) return Promise.resolve()
  if (scApiPromise) return scApiPromise
  scApiPromise = new Promise<void>((resolve, reject) => {
    const script = document.createElement('script')
    script.src = 'https://w.soundcloud.com/player/api.js'
    script.async = true
    script.onload = () => (window.SC?.Widget ? resolve() : reject(new Error('SC API missing')))
    script.onerror = () => reject(new Error('Failed to load SC Widget API'))
    document.head.appendChild(script)
  }).catch((err) => {
    scApiPromise = null
    throw err
  })
  return scApiPromise
}

export default function SoundCloudWidget({
  trackUrl,
  onReady,
  onPlay,
  onPause,
  onFinish,
  onProgress,
  onError,
  handleRef,
}: Props) {
  const iframeRef = useRef<HTMLIFrameElement>(null)
  const widgetRef = useRef<SCWidgetInstance | null>(null)

  const ensureScript = useCallback((): Promise<void> => loadScWidgetApi(), [])

  useEffect(() => {
    if (!iframeRef.current || !trackUrl) return

    let cancelled = false
    const iframe = iframeRef.current

    const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=true&buying=false&sharing=false&download=false&show_artwork=false&show_playcount=false&show_user=false&visual=false`
    iframe.src = embedUrl

    // Si en 15 s el widget no llega a READY (pista privada/borrada, red
    // caída, iframe bloqueado), se avisa como error: la barra no se queda
    // colgada en 0:00 para siempre.
    let ready = false
    const readyTimeout = window.setTimeout(() => {
      if (!cancelled && !ready) onError?.()
    }, 15_000)

    ensureScript().then(() => {
      if (cancelled || !window.SC?.Widget) return

      const widget = window.SC.Widget(iframe)
      widgetRef.current = widget
      const E = window.SC.Widget.Events

      // Duración cacheada: antes se pedía por postMessage en cada PLAY_PROGRESS.
      let durationMs = 0

      widget.bind(E.READY, () => {
        if (cancelled) return
        ready = true
        window.clearTimeout(readyTimeout)
        widget.getDuration((d) => { durationMs = d || 0 })
        onReady?.()

        const handle: SoundCloudWidgetHandle = {
          play: () => widget.play(),
          pause: () => widget.pause(),
          seekTo: (ms) => widget.seekTo(ms),
          getDuration: () => new Promise((res) => widget.getDuration(res)),
          getPosition: () => new Promise((res) => widget.getPosition(res)),
        }
        handleRef?.(handle)
      })

      widget.bind(E.PLAY, () => { if (!cancelled) onPlay?.() })
      widget.bind(E.PAUSE, () => { if (!cancelled) onPause?.() })
      widget.bind(E.FINISH, () => { if (!cancelled) onFinish?.() })
      widget.bind(E.ERROR, () => { if (!cancelled) onError?.() })

      widget.bind(E.PLAY_PROGRESS, (data: { currentPosition?: number }) => {
        if (cancelled) return
        const posMs = data?.currentPosition ?? 0
        if (durationMs > 0) {
          onProgress?.(posMs, durationMs)
          return
        }
        widget.getDuration((durMs) => {
          durationMs = durMs || 0
          if (!cancelled) onProgress?.(posMs, durationMs)
        })
      })
    }).catch(() => {
      window.clearTimeout(readyTimeout)
      if (!cancelled) onError?.()
    })

    return () => {
      cancelled = true
      window.clearTimeout(readyTimeout)
      widgetRef.current = null
      handleRef?.(null)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [trackUrl])

  return (
    <iframe
      ref={iframeRef}
      className="sr-only"
      style={{ position: 'absolute', width: 0, height: 0, border: 0, overflow: 'hidden' }}
      allow="autoplay"
      tabIndex={-1}
      aria-hidden="true"
    />
  )
}
