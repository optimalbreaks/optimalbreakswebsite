'use client'

/**
 * Widget SoundCloud modo visual (imagen + barra), alineado con tarjetas tipo YouTube en /mixes.
 * No usar para el deck oculto — ver SoundCloudWidget.tsx.
 */

import { useEffect, useId, useRef } from 'react'
import { loadSoundCloudWidgetAPI } from '@/lib/mix-play-session-log'
import {
  registerYouTubeEmbed,
  releaseYouTubePlay,
  requestYouTubePlay,
  unregisterYouTubeEmbed,
} from '@/lib/youtube-play-coordinator'

type ScWidgetHandle = {
  bind: (ev: string, fn: () => void) => void
  unbind?: (ev: string) => void
  pause: () => void
}

type ScWidgetEvents = { PLAY?: string; PAUSE?: string; FINISH?: string }

/**
 * Integra un iframe visual de SoundCloud en el coordinador «una sola fuente
 * audible». Antes estos iframes quedaban FUERA de la exclusión: dar play
 * dentro del widget no paraba el reproductor global (ni los YouTube), y al
 * revés — la causa típica de «suenan dos cosas a la vez» en móvil.
 *
 * Al detectar PLAY dentro del widget: reclama el slot (para preview/mix/deck
 * y cierra el YouTube activo) y registra cómo pausarse para cuando otra
 * fuente tome el relevo. PAUSE/FINISH liberan el slot.
 */
export function useSoundCloudExclusivePlayback(
  iframeId: string | undefined,
  slotId: string | undefined,
  onPlay?: () => void,
  enabled = true,
) {
  const onPlayRef = useRef(onPlay)
  useEffect(() => { onPlayRef.current = onPlay }, [onPlay])

  useEffect(() => {
    if (!enabled || !iframeId || !slotId) return
    let cancelled = false
    let widget: ScWidgetHandle | null = null
    let events: ScWidgetEvents | undefined
    // El iframe necesita un instante para estar listo para la Widget API.
    const t = window.setTimeout(() => {
      void loadSoundCloudWidgetAPI()
        .then(() => {
          if (cancelled) return
          const el = document.getElementById(iframeId) as HTMLIFrameElement | null
          const SCg = (window as unknown as { SC?: { Widget?: unknown } }).SC
          const Widget = SCg?.Widget as ((iframe: HTMLIFrameElement) => ScWidgetHandle) | undefined
          events = (SCg?.Widget as unknown as { Events?: ScWidgetEvents } | undefined)?.Events
          if (!el || !Widget || !events?.PLAY) return
          try {
            widget = Widget(el)
            widget.bind(events.PLAY, () => {
              requestYouTubePlay(slotId)
              registerYouTubeEmbed(slotId, () => {
                try { widget?.pause() } catch { /* iframe ya fuera del DOM */ }
              })
              onPlayRef.current?.()
            })
            if (events.PAUSE) widget.bind(events.PAUSE, () => releaseYouTubePlay(slotId))
            if (events.FINISH) widget.bind(events.FINISH, () => releaseYouTubePlay(slotId))
          } catch {
            /* Widget API puede fallar según políticas del navegador */
          }
        })
        .catch(() => {})
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      try {
        if (widget && events) {
          if (events.PLAY) widget.unbind?.(events.PLAY)
          if (events.PAUSE) widget.unbind?.(events.PAUSE)
          if (events.FINISH) widget.unbind?.(events.FINISH)
        }
      } catch { /* no-op */ }
      unregisterYouTubeEmbed(slotId)
    }
  }, [enabled, iframeId, slotId])
}

/** URL de track/lista SoundCloud apta para el parámetro `url` del player (no URLs del propio iframe w.soundcloud.com). */
export function isSoundCloudTrackEmbedUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  const u = url.trim().toLowerCase()
  if (!u.includes('soundcloud.com')) return false
  if (u.includes('w.soundcloud.com')) return false
  return true
}

export function buildSoundCloudVisualPlayerSrc(trackUrl: string): string {
  const q = new URLSearchParams()
  q.set('url', trackUrl.trim())
  q.set('visual', 'true')
  q.set('auto_play', 'false')
  q.set('hide_related', 'false')
  q.set('show_comments', 'false')
  q.set('show_user', 'false')
  q.set('show_reposts', 'false')
  q.set('show_teaser', 'false')
  q.set('color', '#d62828')
  return `https://w.soundcloud.com/player/?${q.toString()}`
}

export default function SoundCloudVisualEmbed({
  trackUrl,
  title,
  className = '',
}: {
  trackUrl: string
  title: string
  className?: string
}) {
  const src = buildSoundCloudVisualPlayerSrc(trackUrl)
  const reactId = useId()
  const iframeId = `ob-scv-${reactId.replace(/[^a-zA-Z0-9_-]/g, '')}`
  useSoundCloudExclusivePlayback(iframeId, iframeId)
  return (
    <div
      className={`relative w-full shrink-0 overflow-hidden bg-[var(--paper-dark)] aspect-video ${className}`}
    >
      <iframe
        id={iframeId}
        title={title}
        src={src}
        allow="autoplay"
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  )
}
