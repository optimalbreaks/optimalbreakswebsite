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
  bind(event: string, cb: (...args: any[]) => void): void
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
  const scriptLoaded = useRef(false)

  const ensureScript = useCallback((): Promise<void> => {
    if (window.SC?.Widget) return Promise.resolve()
    if (scriptLoaded.current) {
      return new Promise((resolve) => {
        const check = setInterval(() => {
          if (window.SC?.Widget) { clearInterval(check); resolve() }
        }, 100)
      })
    }
    scriptLoaded.current = true
    return new Promise((resolve, reject) => {
      const script = document.createElement('script')
      script.src = 'https://w.soundcloud.com/player/api.js'
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => reject(new Error('Failed to load SC Widget API'))
      document.head.appendChild(script)
    })
  }, [])

  useEffect(() => {
    if (!iframeRef.current || !trackUrl) return

    let cancelled = false
    const iframe = iframeRef.current

    const embedUrl = `https://w.soundcloud.com/player/?url=${encodeURIComponent(trackUrl)}&auto_play=true&buying=false&sharing=false&download=false&show_artwork=false&show_playcount=false&show_user=false&visual=false`
    iframe.src = embedUrl

    ensureScript().then(() => {
      if (cancelled || !window.SC?.Widget) return

      const widget = window.SC.Widget(iframe)
      widgetRef.current = widget
      const E = window.SC.Widget.Events

      widget.bind(E.READY, () => {
        if (cancelled) return
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

      widget.bind(E.PLAY_PROGRESS, (data: any) => {
        if (cancelled) return
        const posMs = data?.currentPosition ?? 0
        widget.getDuration((durMs) => {
          if (!cancelled) onProgress?.(posMs, durMs)
        })
      })
    }).catch(() => {
      onError?.()
    })

    return () => {
      cancelled = true
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
