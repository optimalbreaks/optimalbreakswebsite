// ============================================
// OPTIMAL BREAKS — Track Share Button (compact)
// Un solo botón por fila de chart / saved track / beatport top. Prioriza
// `navigator.share` (móvil nativo) y cae a `clipboard` con feedback "✓".
// Para páginas de detalle (artista/sello/mix) seguimos usando el bloque
// grande X/WA/FB: `src/components/ShareButtons.tsx`.
//
// Tres modos de uso:
//  1) Charts (40 Breaks / New Releases): `source` + `trackId` + `weekDate`.
//  2) Top Beatport en ficha (artista/sello) o cualquier link interno ya
//     construido: `path` directo (p.ej. `/es/artists/prodigy?play=beatport:123456`).
//  3) URL absoluta externa (beatport_top sin contexto OB interno): `externalUrl`.
//     Vinilos y chart/featured usan path en optimalbreaks.com vía `path`.
//     Beatport Top también genera story IG (`play=beatport:<id>` + snapshot).
// ============================================

'use client'

import { useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import type { Locale } from '@/lib/i18n-config'
import {
  appendTrackStoryMeta,
  buildAbsoluteShareUrl,
  buildTrackSharePath,
  copyShareLink,
  extractBeatportTrackId,
  parsePlayParam,
  storyFromSharePath,
  type TrackStoryMeta,
} from '@/lib/share-track'

interface BaseProps {
  lang: Locale
  /** Texto que se muestra en el prompt nativo (móvil). Típicamente "Título — Artistas". */
  shareTitle: string
  /** `lg` = botón cuadrado del mini reproductor (mismo tacto que play/pause). */
  size?: 'sm' | 'lg'
  /** Fallback de la story IG para Beatport Top (snapshot) si el Top 10 ya rotó. */
  storyMeta?: TrackStoryMeta
}

interface ChartModeProps extends BaseProps {
  source: 'chart' | 'featured'
  trackId: string
  /** Fecha ISO (YYYY-MM-DD) de la edición del chart a la que pertenece. */
  weekDate: string
  path?: never
  externalUrl?: never
}

interface PathModeProps extends BaseProps {
  /** Path relativo ya listo (empezando por '/'). */
  path: string
  source?: never
  trackId?: never
  weekDate?: never
  externalUrl?: never
}

interface ExternalUrlModeProps extends BaseProps {
  /** URL absoluta (http(s)://…). Se copia/comparte tal cual sin prefijar SITE_URL. */
  externalUrl: string
  source?: never
  trackId?: never
  weekDate?: never
  path?: never
}

type Props = ChartModeProps | PathModeProps | ExternalUrlModeProps

function resolveFullUrl(props: Props): string {
  if ('externalUrl' in props && props.externalUrl) {
    return buildAbsoluteShareUrl(props.externalUrl)
  }
  if ('path' in props && props.path) {
    return buildAbsoluteShareUrl(props.path)
  }
  return buildAbsoluteShareUrl(
    buildTrackSharePath(props.lang, props.source!, props.trackId!, props.weekDate!),
  )
}

/**
 * Valor `play=` (chart:<id> / featured:<id> / vinyl:<id> / beatport:<id>)
 * para pedir la imagen de Story a `/api/og/story`. Beatport Top resuelve
 * por ficha (`from=artists|labels/slug`) o por `storyMeta` (snapshot).
 */
function resolveStoryPlayParam(props: Props): string | null {
  if ('source' in props && props.source && props.trackId) {
    return `${props.source}:${props.trackId}`
  }
  if ('path' in props && props.path) {
    const query = props.path.split('?')[1]
    if (!query) return null
    const parsed = parsePlayParam(new URLSearchParams(query).get('play'))
    if (parsed?.kind === 'track') return `${parsed.source}:${parsed.id}`
    if (parsed?.kind === 'vinyl') return `vinyl:${parsed.id}`
    if (parsed?.kind === 'beatport') return `beatport:${parsed.id}`
  }
  if ('externalUrl' in props && props.externalUrl) {
    const bpId = extractBeatportTrackId(props.externalUrl)
    if (bpId) return `beatport:${bpId}`
  }
  return null
}

export default function TrackShareButton(props: Props) {
  const [copied, setCopied] = useState(false)
  const [storyState, setStoryState] = useState<'idle' | 'busy' | 'done'>('idle')
  const { isAdmin } = useAuth()
  const es = props.lang === 'es'
  const fullUrl = resolveFullUrl(props)
  // Botón IG (Story) solo para admins: herramienta de promo del equipo.
  const storyPlay = isAdmin ? resolveStoryPlayParam(props) : null

  /**
   * Botón "IG": baja el PNG 1080×1920 de `/api/og/story` y lo comparte como
   * archivo (`navigator.share({ files })`) → en móvil aparece Instagram y el
   * usuario lo publica en Stories. Antes copiamos el enlace del track al
   * portapapeles para pegarlo en el sticker de enlace. En escritorio (sin
   * share de archivos) se descarga la imagen y se copia el enlace.
   */
  async function onStoryClick() {
    if (!storyPlay || storyState === 'busy') return
    setStoryState('busy')
    try {
      await copyShareLink(fullUrl)
      const params = new URLSearchParams({ play: storyPlay, lang: props.lang })
      const from = 'path' in props ? storyFromSharePath(props.path) : null
      if (from) params.set('from', from)
      appendTrackStoryMeta(params, props.storyMeta)
      const res = await fetch(`/api/og/story?${params.toString()}`)
      if (!res.ok) throw new Error(`story ${res.status}`)
      const blob = await res.blob()
      const file = new File([blob], 'optimal-breaks-story.png', { type: 'image/png' })

      const nav = typeof navigator !== 'undefined' ? navigator : null
      if (nav?.canShare?.({ files: [file] })) {
        try {
          await nav.share({ files: [file], title: props.shareTitle })
        } catch {
          // Cancelación del usuario: no es un error.
        }
      } else {
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = 'optimal-breaks-story.png'
        document.body.appendChild(a)
        a.click()
        a.remove()
        URL.revokeObjectURL(url)
      }
      setStoryState('done')
      setTimeout(() => setStoryState('idle'), 1800)
    } catch {
      setStoryState('idle')
    }
  }

  async function onClick() {
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (nav && typeof nav.share === 'function') {
      try {
        await nav.share({ title: props.shareTitle, url: fullUrl })
        return
      } catch {
        // Cancelación del usuario: silencio. Si es error real, cae al copy.
      }
    }
    const ok = await copyShareLink(fullUrl)
    if (ok) {
      setCopied(true)
      setTimeout(() => setCopied(false), 1800)
    }
  }

  const size = props.size ?? 'sm'
  const base =
    size === 'lg'
      ? 'w-10 h-10 sm:w-9 sm:h-9 flex items-center justify-center text-base sm:text-sm font-black border-2 transition-all touch-manipulation cursor-pointer shrink-0'
      : 'inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 transition-all no-underline touch-manipulation whitespace-nowrap cursor-pointer'
  const stateCls = copied
    ? 'border-[var(--ink)] bg-[var(--acid)] text-white'
    : 'border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'

  const label = copied ? '✓' : '🔗'
  const title = copied
    ? (es ? 'Enlace copiado' : 'Link copied')
    : (es ? 'Copiar / compartir enlace' : 'Copy / share link')

  const storyStateCls = storyState === 'done'
    ? 'border-[var(--ink)] bg-[var(--acid)] text-white'
    : 'border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'
  const storyLabel = storyState === 'done' ? '✓' : storyState === 'busy' ? '…' : 'IG'
  const storyTitle = storyState === 'done'
    ? (es ? 'Imagen lista · enlace copiado' : 'Image ready · link copied')
    : (es
        ? 'Story de Instagram: genera la imagen y copia el enlace'
        : 'Instagram Story: generate image and copy link')

  return (
    <>
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onClick() }}
        className={`${base} ${stateCls}`}
        style={{ fontFamily: "'Courier Prime', monospace" }}
        title={title}
        aria-label={title}
      >
        {label}
      </button>
      {storyPlay ? (
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onStoryClick() }}
          className={`${base} ${storyStateCls}`}
          style={{ fontFamily: "'Courier Prime', monospace" }}
          title={storyTitle}
          aria-label={storyTitle}
          disabled={storyState === 'busy'}
        >
          {storyLabel}
        </button>
      ) : null}
    </>
  )
}

// ============================================
// Botón «SPOTIFY» compartido (ChartView, BeatportTopTracks, ArtistFeaturedTracks).
// Enlace directo al track si hay match verificado (`spotify_url`, rellenado por
// scripts/spotify-match-charts.mjs); si no, búsqueda en Spotify con artista +
// título para que quien tenga cuenta pueda escuchar el tema entero.
// ============================================

export function SpotifyLinkButton({ url, title, artists, dict, lang }: {
  url?: string | null
  title: string
  artists: Array<{ name?: string } | string>
  /** Diccionario i18n con bloque `charts` (ChartView); opcional fuera de /charts. */
  dict?: { charts?: Record<string, string> }
  lang?: Locale
}) {
  const c = dict?.charts
  const es = lang === 'es'
  const direct = (url || '').trim()
  const names = (Array.isArray(artists) ? artists : [])
    .map((a) => (a && typeof a === 'object' ? a.name : a))
    .filter(Boolean)
    .join(' ')
  const href = direct || `https://open.spotify.com/search/${encodeURIComponent(`${names} ${title}`.trim())}`
  const tooltip = direct
    ? c?.open_spotify || (es ? 'Abrir en Spotify' : 'Open on Spotify')
    : c?.search_spotify || (es ? 'Buscar en Spotify' : 'Search on Spotify')
  return (
    <a
      href={href} target="_blank" rel="noopener noreferrer"
      className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[#1DB954] text-white hover:bg-[#169c46] active:bg-[#169c46] transition-all no-underline touch-manipulation whitespace-nowrap"
      style={{ fontFamily: "'Courier Prime', monospace" }}
      title={tooltip}
    >
      SPOTIFY
    </a>
  )
}
