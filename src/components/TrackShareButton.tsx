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
// ============================================

'use client'

import { useState } from 'react'
import type { Locale } from '@/lib/i18n-config'
import {
  buildAbsoluteShareUrl,
  buildTrackSharePath,
  copyShareLink,
} from '@/lib/share-track'

interface BaseProps {
  lang: Locale
  /** Texto que se muestra en el prompt nativo (móvil). Típicamente "Título — Artistas". */
  shareTitle: string
  /** `lg` = botón cuadrado del mini reproductor (mismo tacto que play/pause). */
  size?: 'sm' | 'lg'
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

export default function TrackShareButton(props: Props) {
  const [copied, setCopied] = useState(false)
  const es = props.lang === 'es'
  const fullUrl = resolveFullUrl(props)

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

  return (
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
  )
}
