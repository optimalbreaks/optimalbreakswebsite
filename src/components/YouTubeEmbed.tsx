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
        <YouTubePosterButton videoId={videoId} title={title} onPlay={handlePlay} />
      )}
    </div>
  )
}

/**
 * Botón con la miniatura de YouTube como portada y un play rojo encima. Si la
 * imagen no carga (adblocker bloqueando `i.ytimg.com`, proxy corporativo o el
 * vídeo no tiene `maxres`/`hq`), recae en variantes más pequeñas y, en último
 * caso, en un placeholder con el título visible.
 */
function YouTubePosterButton({
  videoId,
  title,
  onPlay,
}: {
  videoId: string
  title: string
  onPlay: () => void
}) {
  const variants = ['maxresdefault', 'hqdefault', 'mqdefault', 'sddefault', '0']
  const [variantIdx, setVariantIdx] = useState(1)
  const [broken, setBroken] = useState(false)

  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={title}
      className="group/yt absolute inset-0 h-full w-full cursor-pointer border-0 p-0 bg-black"
    >
      {!broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- thumbnail directo de YouTube CDN
        <img
          src={`https://i.ytimg.com/vi/${videoId}/${variants[variantIdx]}.jpg`}
          alt={title}
          decoding="async"
          referrerPolicy="no-referrer"
          onError={() => {
            if (variantIdx < variants.length - 1) {
              setVariantIdx((i) => i + 1)
            } else {
              setBroken(true)
            }
          }}
          className="absolute inset-0 h-full w-full object-cover"
        />
      ) : (
        <span
          className="absolute inset-0 flex items-center justify-center text-center px-3"
          style={{
            background:
              'repeating-linear-gradient(45deg, var(--ink) 0 12px, #2a2a2a 12px 24px)',
            color: 'var(--yellow)',
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(11px, 2.2vw, 16px)',
            textTransform: 'uppercase',
            letterSpacing: '-0.3px',
            lineHeight: 1.2,
          }}
        >
          {title}
        </span>
      )}
      <span className="absolute inset-0 bg-black/15 transition-colors group-hover/yt:bg-black/30" aria-hidden />
      <span
        className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 flex items-center justify-center w-[58px] h-[40px] rounded-[10px] bg-[#f00] shadow-lg"
        aria-hidden
      >
        <svg viewBox="0 0 24 24" className="w-7 h-7 fill-white" aria-hidden>
          <path d="M8 5v14l11-7z" />
        </svg>
      </span>
    </button>
  )
}
