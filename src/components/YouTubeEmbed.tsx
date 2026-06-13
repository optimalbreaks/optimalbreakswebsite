'use client'

import { useEffect, useState } from 'react'
import {
  registerYouTubeEmbed,
  requestYouTubePlay,
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
   * Si `true`, monta el iframe inmediatamente (sin pasar por la miniatura) con
   * `autoplay=1`. Lo usan las filas de /charts, Mis Tracks y Top 100 (que ya
   * tienen su propio botón ▶ externo) y el buscador global (⌘K) al llegar con
   * `?play=1`. En /mixes no se pasa: ahí se muestra la portada y el vídeo
   * arranca al pulsar el play sobre la miniatura.
   */
  autoplay?: boolean
  /** Id único de esta instancia (fila de vinilo, mix, Mis Tracks…). Solo uno suena. */
  playSlotId?: string
}) {
  // El iframe (pesado) se monta solo cuando el usuario pulsa play o cuando se
  // pide autoplay vía deep-link. Hasta entonces se muestra la miniatura ligera
  // de YouTube: así no se cargan decenas de iframes a la vez (la página se
  // quedaba "pillada" al montar muchos embeds en el scroll).
  const [mountIframe, setMountIframe] = useState(autoplay)
  const [embedSrc, setEmbedSrc] = useState<string | null>(null)

  useEffect(() => {
    if (autoplay) setMountIframe(true)
  }, [autoplay])

  useEffect(() => {
    if (!mountIframe) return
    setEmbedSrc(
      `https://www.youtube.com/embed/${videoId}?rel=0&enablejsapi=1&autoplay=1&origin=${encodeURIComponent(window.location.origin)}`,
    )
  }, [mountIframe, videoId])

  useEffect(() => {
    if (!playSlotId || !mountIframe || !embedSrc) return
    const stop = () => {
      setMountIframe(false)
      setEmbedSrc(null)
    }
    registerYouTubeEmbed(playSlotId, stop)
    return () => unregisterYouTubeEmbed(playSlotId)
  }, [playSlotId, mountIframe, embedSrc])

  const handlePlay = () => {
    if (playSlotId) requestYouTubePlay(playSlotId)
    setMountIframe(true)
  }

  return (
    <div className={`relative w-full aspect-video bg-black overflow-hidden ${className}`}>
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
        <button
          type="button"
          onClick={handlePlay}
          aria-label={title}
          className="group/yt absolute inset-0 h-full w-full cursor-pointer border-0 p-0"
        >
          <img
            src={`https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`}
            alt={title}
            loading="lazy"
            className="absolute inset-0 h-full w-full object-cover"
          />
          <span className="absolute inset-0 bg-black/15 transition-colors group-hover/yt:bg-black/30" aria-hidden />
          <span
            className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-[58px] h-[40px] rounded-[10px] bg-[#f00] transition-colors group-hover/yt:bg-[#f00] shadow-lg"
            aria-hidden
          >
            <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" aria-hidden>
              <path d="M8 5v14l11-7z" />
            </svg>
          </span>
        </button>
      )}
    </div>
  )
}
