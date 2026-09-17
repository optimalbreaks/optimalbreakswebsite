'use client'

import { useEffect, useRef, useState } from 'react'
import { loadYouTubeIframeAPI } from '@/lib/mix-play-session-log'
import {
  registerYouTubeEmbed,
  requestYouTubePlay,
  unregisterYouTubeEmbed,
} from '@/lib/youtube-play-coordinator'
import {
  applyNowPlaying,
  clearNowPlaying,
  refreshNowPlaying,
  type NowPlayingInfo,
} from '@/lib/now-playing-session'

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

/** Miniatura de YouTube servida desde nuestro dominio (proxy). Evita que adblockers
 * / proxies corporativos que bloquean `i.ytimg.com` dejen la portada en negro. */
function proxiedThumbUrl(videoId: string): string {
  const target = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  return `/api/og/image-proxy?src=${encodeURIComponent(target)}`
}

function nowPlayingForVideo(
  videoId: string,
  title: string,
  explicit?: NowPlayingInfo,
): NowPlayingInfo {
  const ytArt = `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`
  if (explicit) {
    return { ...explicit, artworkUrl: explicit.artworkUrl || ytArt }
  }
  const parts = title.split(/\s+[—–-]\s+/)
  if (parts.length >= 2) {
    return {
      title: parts[0]!.trim(),
      artist: parts.slice(1).join(' — ').trim(),
      artworkUrl: ytArt,
    }
  }
  return { title, artworkUrl: ytArt }
}

export function LazyYouTubeEmbed({
  videoId,
  title,
  className = '',
  iframeId,
  autoplay = false,
  playSlotId,
  onPlayRecorded,
  nowPlaying,
}: {
  videoId: string
  title: string
  className?: string
  iframeId?: string
  /**
   * Si `true`, monta el iframe inmediatamente (sin pasar por la portada) con
   * `autoplay=1`. Lo usan las filas de /charts, Mis Tracks y Top 100 (que ya
   * tienen su propio botón ▶ externo) y el buscador global (⌘K) al llegar con
   * `?play=1`. En /mixes no se pasa: se ve la portada y arranca al pulsar play.
   */
  autoplay?: boolean
  /** Id único de esta instancia (fila de vinilo, mix, Mis Tracks…). Solo uno suena. */
  playSlotId?: string
  /** Llamado una vez cuando el usuario inicia la reproducción (click o autoplay). */
  onPlayRecorded?: () => void
  /** Metadatos de lockscreen. Si faltan, se parsea `title` (`Tema — Artista`). */
  nowPlaying?: NowPlayingInfo
}) {
  // El iframe (pesado) se monta solo al pulsar play o con autoplay (deep-link /
  // filas con botón externo). Así /mixes no monta decenas de iframes a la vez
  // (eso pillaba la página) y muestra la portada vía proxy mientras tanto.
  const [mountIframe, setMountIframe] = useState(autoplay)
  const [embedSrc, setEmbedSrc] = useState<string | null>(null)
  const playRecordedRef = useRef(false)
  const nowPlayingGenRef = useRef(0)

  const recordPlayOnce = () => {
    if (!onPlayRecorded || playRecordedRef.current) return
    playRecordedRef.current = true
    onPlayRecorded()
  }

  const pushNowPlaying = () => {
    nowPlayingGenRef.current = applyNowPlaying(nowPlayingForVideo(videoId, title, nowPlaying))
  }

  useEffect(() => {
    if (autoplay) setMountIframe(true)
  }, [autoplay])

  useEffect(() => {
    if (!mountIframe) return
    setEmbedSrc(
      `https://www.youtube.com/embed/${videoId}?rel=0&enablejsapi=1&autoplay=1&origin=${encodeURIComponent(window.location.origin)}`,
    )
  }, [mountIframe, videoId])

  const npTitle = nowPlaying?.title
  const npArtist = nowPlaying?.artist
  const npAlbum = nowPlaying?.album
  const npMix = nowPlaying?.mixName
  const npArt = nowPlaying?.artworkUrl

  useEffect(() => {
    if (!playSlotId || !mountIframe || !embedSrc) return
    const stop = () => {
      setMountIframe(false)
      setEmbedSrc(null)
    }
    registerYouTubeEmbed(playSlotId, stop)
    return () => unregisterYouTubeEmbed(playSlotId)
  }, [playSlotId, mountIframe, embedSrc])

  // Lockscreen mientras el iframe suena: YouTube pisa Media Session con el
  // título del vídeo; re-aplicamos el nuestro y, al bloquear, visibilitychange
  // del módulo lo vuelve a empujar. El token evita borrar una sesión posterior
  // (preview) si este embed se desmonta tarde.
  useEffect(() => {
    if (!mountIframe || !embedSrc) return
    const gen = applyNowPlaying(nowPlayingForVideo(videoId, title, nowPlaying))
    nowPlayingGenRef.current = gen
    const iv = window.setInterval(() => refreshNowPlaying(), 1500)
    return () => {
      window.clearInterval(iv)
      clearNowPlaying(gen)
    }
    // Campos primitivos: el objeto `nowPlaying` es inline en los padres.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mountIframe, embedSrc, videoId, title, npTitle, npArtist, npAlbum, npMix, npArt])

  // Autoplay (deep-link / ?play=1): el iframe no pasa por handlePlay; escuchar PLAYING vía API.
  useEffect(() => {
    if (!mountIframe || !embedSrc || !iframeId || !onPlayRecorded || !autoplay) return
    let cancelled = false
    let player: { destroy?: () => void } | undefined
    const t = window.setTimeout(() => {
      void loadYouTubeIframeAPI()
        .then(() => {
          if (cancelled) return
          const YT = (
            window as unknown as {
              YT?: {
                Player: new (id: string, opts: Record<string, unknown>) => { destroy?: () => void }
                PlayerState: { PLAYING: number }
              }
            }
          ).YT
          if (!YT?.Player || !document.getElementById(iframeId)) return
          try {
            player = new YT.Player(iframeId, {
              events: {
                onStateChange: (e: { data: number }) => {
                  if (e.data === YT.PlayerState.PLAYING) {
                    recordPlayOnce()
                    refreshNowPlaying()
                  }
                },
              },
            }) as { destroy?: () => void }
          } catch {
            /* init API en iframe puede fallar según políticas */
          }
        })
        .catch(() => {})
    }, 200)
    return () => {
      cancelled = true
      window.clearTimeout(t)
      try {
        player?.destroy?.()
      } catch {
        /* */
      }
    }
  }, [mountIframe, embedSrc, iframeId, onPlayRecorded, autoplay])

  const handlePlay = () => {
    if (playSlotId) requestYouTubePlay(playSlotId)
    setMountIframe(true)
    recordPlayOnce()
    pushNowPlaying()
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

/** Portada con la miniatura de YouTube (vía proxy) y un play rojo encima. Si la
 * imagen falla, recae en un placeholder a rayas con el título legible. */
function YouTubePosterButton({
  videoId,
  title,
  onPlay,
}: {
  videoId: string
  title: string
  onPlay: () => void
}) {
  const [broken, setBroken] = useState(false)

  return (
    <button
      type="button"
      onClick={onPlay}
      aria-label={title}
      className="group/yt absolute inset-0 h-full w-full cursor-pointer border-0 p-0 bg-black"
    >
      {!broken ? (
        // eslint-disable-next-line @next/next/no-img-element -- miniatura YouTube vía proxy propio
        <img
          src={proxiedThumbUrl(videoId)}
          alt={title}
          decoding="async"
          onError={() => setBroken(true)}
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
