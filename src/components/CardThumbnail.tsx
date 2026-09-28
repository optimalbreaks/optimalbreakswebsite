'use client'

// ============================================
// OPTIMAL BREAKS — Imagen de tarjeta (DB image_url + placeholder)
// ----------------------------------------------
// Desde el 28 sep 2026 va sobre `next/image` (Vercel Image Optimization):
// los carteles/retratos se guardan a tamaño original (114 carteles de eventos
// = 38,6 MB; medias de 340 KB, picos de 2 MB) y se pintaban en tarjetas de
// 160–400 px con <img> crudo. Con `fill` + `sizes` el edge sirve la anchura
// que toca en WebP/AVIF y la cachea. Hosts fuera de `images.remotePatterns`
// (next.config.js) caen a `unoptimized` para no romper con 400.
// ============================================

import { useState } from 'react'
import Image from 'next/image'
import { displayImageUrl } from '@/lib/image-url'

/** Marca de sitio cuando no hay retrato/logo en BD (OG home punk). */
const MISSING_IMAGE_FALLBACK = '/images/opengraph_OB_punk.png'

/** Anchura típica de una tarjeta del catálogo: 1 col en móvil, 2 en tablet, ≤ 400 px en escritorio. */
const DEFAULT_SIZES = '(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 400px'

/** Espejo de `images.remotePatterns` en next.config.js. */
const OPTIMIZABLE_HOST = /(^|\.)(supabase\.co|geo-media\.beatport\.com|f4\.bcbits\.com|i\.ytimg\.com|sndcdn\.com|mzstatic\.com|img\.youtube\.com|i\.discogs\.com)$/i

function canOptimize(url: string): boolean {
  if (url.startsWith('/images/')) return true
  try {
    const u = new URL(url)
    return u.protocol === 'https:' && OPTIMIZABLE_HOST.test(u.hostname)
  } catch {
    return false
  }
}

interface CardThumbnailProps {
  src?: string | null
  alt: string
  /** Clase de proporción (p. ej. aspect-[5/3]) */
  aspectClass?: string
  /** Si se define, sustituye aspectClass (p. ej. h-48 sm:h-56) */
  heightClass?: string
  /** cover = rellena el marco (puede recortar); contain = imagen completa (p. ej. carteles 2:3) */
  fit?: 'cover' | 'contain'
  /** Borde del marco (p. ej. lista blog: sm:border-r sin bottom) */
  frameClass?: string
  className?: string
  /**
   * Si el contenedor usa `group/link` (p. ej. tarjetas de eventos), el zoom en hover usa `group-hover/link:`.
   * Sin esto, `group-hover:scale` no coincide con el nombre del grupo y el cartel no reacciona.
   */
  groupHoverGroup?: 'link'
  /**
   * `sizes` de next/image: anchura que ocupará la imagen por breakpoint. Por
   * defecto la de una tarjeta del catálogo; pásalo más ajustado en listas
   * estrechas (p. ej. `160px` en la vista lista de eventos).
   */
  sizes?: string
  /** Primeras tarjetas visibles: precarga en vez de lazy (mejora LCP). */
  preload?: boolean
}

export default function CardThumbnail({
  src,
  alt,
  aspectClass = 'aspect-[5/3]',
  heightClass,
  fit = 'cover',
  frameClass = 'border-b-[3px] border-[var(--ink)]',
  className = '',
  groupHoverGroup,
  sizes = DEFAULT_SIZES,
  preload = false,
}: CardThumbnailProps) {
  const url = displayImageUrl(src)?.trim()
  const box = heightClass ?? aspectClass
  const imgFit =
    fit === 'contain'
      ? 'object-contain object-center'
      : groupHoverGroup === 'link'
        ? 'object-cover object-center transition-transform duration-400 ease-out will-change-transform group-hover/link:scale-[1.08]'
        : 'object-cover object-center transition-transform duration-300 ease-out group-hover:scale-[1.04]'

  return (
    <div
      className={`relative w-full shrink-0 overflow-hidden bg-[var(--paper-dark)] ${frameClass} ${box} ${className}`}
    >
      {url ? (
        <CardThumbnailRemoteImage
          src={url}
          alt={alt}
          fit={fit}
          imgFit={imgFit}
          groupHoverGroup={groupHoverGroup}
          sizes={sizes}
          preload={preload}
        />
      ) : (
        <BrandedMissingThumbnail alt={alt} fit={fit} groupHoverGroup={groupHoverGroup} sizes={sizes} />
      )}
    </div>
  )
}

/** Si la URL de Supabase/CMS devuelve 404 u otro error, mostrar el mismo fallback que sin imagen. */
function CardThumbnailRemoteImage({
  src,
  alt,
  fit,
  imgFit,
  groupHoverGroup,
  sizes,
  preload,
}: {
  src: string
  alt: string
  fit: 'cover' | 'contain'
  imgFit: string
  groupHoverGroup?: 'link'
  sizes: string
  preload: boolean
}) {
  // Se guarda QUÉ src falló: si cambia el src, el fallback se levanta solo.
  const [brokenSrc, setBrokenSrc] = useState<string | null>(null)
  const broken = brokenSrc === src

  if (broken) {
    return <BrandedMissingThumbnail alt={alt} fit={fit} groupHoverGroup={groupHoverGroup} sizes={sizes} />
  }

  return (
    <Image
      src={src}
      alt={alt}
      fill
      sizes={sizes}
      unoptimized={!canOptimize(src)}
      preload={preload || undefined}
      loading={preload ? undefined : 'lazy'}
      onError={() => setBrokenSrc(src)}
      className={imgFit}
    />
  )
}

function BrandedMissingThumbnail({
  alt,
  fit,
  groupHoverGroup,
  sizes,
}: {
  alt: string
  fit: 'cover' | 'contain'
  groupHoverGroup?: 'link'
  sizes: string
}) {
  const fallbackUrl = displayImageUrl(MISSING_IMAGE_FALLBACK) ?? MISSING_IMAGE_FALLBACK
  const imgFit =
    fit === 'contain'
      ? 'object-contain object-center'
      : groupHoverGroup === 'link'
        ? 'object-cover object-center transition-transform duration-400 ease-out will-change-transform group-hover/link:scale-[1.08]'
        : 'object-cover object-center transition-transform duration-300 ease-out group-hover:scale-[1.04]'

  return (
    <div className="absolute inset-0" role="img" aria-label={alt}>
      <Image src={fallbackUrl} alt="" fill sizes={sizes} loading="lazy" className={imgFit} />
      <div
        className="absolute inset-0 bg-[var(--paper-dark)]/35 pointer-events-none"
        aria-hidden
      />
    </div>
  )
}
