'use client'

// ============================================
// OPTIMAL BREAKS — Imagen de tarjeta (DB image_url + placeholder)
// ============================================

import { useEffect, useState } from 'react'
import { displayImageUrl } from '@/lib/image-url'

/** Marca de sitio cuando no hay retrato/logo en BD (OG home punk). */
const MISSING_IMAGE_FALLBACK = '/images/opengraph_OB_punk.png'

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
        <CardThumbnailRemoteImage src={url} alt={alt} fit={fit} imgFit={imgFit} groupHoverGroup={groupHoverGroup} />
      ) : (
        <BrandedMissingThumbnail alt={alt} fit={fit} groupHoverGroup={groupHoverGroup} />
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
}: {
  src: string
  alt: string
  fit: 'cover' | 'contain'
  imgFit: string
  groupHoverGroup?: 'link'
}) {
  const [broken, setBroken] = useState(false)

  useEffect(() => {
    setBroken(false)
  }, [src])

  if (broken) {
    return <BrandedMissingThumbnail alt={alt} fit={fit} groupHoverGroup={groupHoverGroup} />
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element -- URLs dinámicas desde Supabase / CMS
    <img
      src={src}
      alt={alt}
      onError={() => setBroken(true)}
      className={`absolute inset-0 h-full w-full ${imgFit}`}
      loading="lazy"
      decoding="async"
    />
  )
}

function BrandedMissingThumbnail({
  alt,
  fit,
  groupHoverGroup,
}: {
  alt: string
  fit: 'cover' | 'contain'
  groupHoverGroup?: 'link'
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
      {/* eslint-disable-next-line @next/next/no-img-element -- asset estático bajo /images/ */}
      <img
        src={fallbackUrl}
        alt=""
        className={`absolute inset-0 h-full w-full ${imgFit}`}
        loading="lazy"
        decoding="async"
      />
      <div
        className="absolute inset-0 bg-[var(--paper-dark)]/35 pointer-events-none"
        aria-hidden
      />
    </div>
  )
}
