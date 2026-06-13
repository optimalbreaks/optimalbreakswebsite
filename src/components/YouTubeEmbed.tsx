'use client'

import { useEffect, useRef, useState } from 'react'
import {
  registerYouTubeEmbed,
  unregisterYouTubeEmbed,
} from '@/lib/youtube-play-coordinator'

export function extractYouTubeId(url: string | null | undefined): string | null {
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

export function LazyYouTubeEmbed({
  videoId,
  title,
  className = '',
  iframeId,
  autoplay = false,
  playSlotId,
}: {
  videoId: string
  title: string
  className?: string
  iframeId?: string
  /**
   * Si `true`, monta el iframe inmediatamente (sin esperar IntersectionObserver)
   * y añade `autoplay=1` al src. Lo usa el buscador global (⌘K) cuando el
   * usuario llega a la página con `?play=1` en la URL: queremos que el vídeo
   * arranque sin que tenga que volver a hacer clic en «play».
   */
  autoplay?: boolean
  /** Id único de esta instancia (fila de vinilo, mix, Mis Tracks…). Solo uno suena. */
  playSlotId?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [mountIframe, setMountIframe] = useState(autoplay)
  const [embedSrc, setEmbedSrc] = useState<string | null>(null)

  useEffect(() => {
    if (autoplay) {
      setMountIframe(true)
      return
    }
    const el = rootRef.current
    if (!el || mountIframe) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMountIframe(true)
          obs.disconnect()
        }
      },
      { root: null, rootMargin: '380px 0px', threshold: 0.01 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [mountIframe, autoplay])

  useEffect(() => {
    if (!mountIframe) return
    const auto = autoplay ? '&autoplay=1' : ''
    setEmbedSrc(
      `https://www.youtube.com/embed/${videoId}?rel=0&enablejsapi=1${auto}&origin=${encodeURIComponent(window.location.origin)}`,
    )
  }, [mountIframe, videoId, autoplay])

  useEffect(() => {
    if (!playSlotId || !mountIframe || !embedSrc) return
    const stop = () => {
      setMountIframe(false)
      setEmbedSrc(null)
    }
    registerYouTubeEmbed(playSlotId, stop)
    return () => unregisterYouTubeEmbed(playSlotId)
  }, [playSlotId, mountIframe, embedSrc])

  return (
    <div ref={rootRef} className={`relative w-full aspect-video bg-black overflow-hidden ${className}`}>
      {mountIframe && embedSrc ? (
        <iframe
          id={iframeId}
          src={embedSrc}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <div className="absolute inset-0 bg-black" aria-hidden />
      )}
    </div>
  )
}
