// ============================================
// OPTIMAL BREAKS — Imagen de tarjeta (DB image_url + placeholder)
// ============================================

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
}

export default function CardThumbnail({
  src,
  alt,
  aspectClass = 'aspect-[5/3]',
  heightClass,
  fit = 'cover',
  frameClass = 'border-b-[3px] border-[var(--ink)]',
  className = '',
}: CardThumbnailProps) {
  const url = displayImageUrl(src)?.trim()
  const box = heightClass ?? aspectClass
  const imgFit =
    fit === 'contain'
      ? 'object-contain object-center'
      : 'object-cover group-hover:scale-[1.04]'

  return (
    <div
      className={`relative w-full shrink-0 overflow-hidden bg-[var(--paper-dark)] ${frameClass} ${box} ${className}`}
    >
      {url ? (
        // eslint-disable-next-line @next/next/no-img-element -- URLs dinámicas desde Supabase / CMS
        <img
          src={url}
          alt={alt}
          className={`absolute inset-0 h-full w-full transition-transform duration-300 ease-out ${imgFit}`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <BrandedMissingThumbnail alt={alt} fit={fit} />
      )}
    </div>
  )
}

function BrandedMissingThumbnail({ alt, fit }: { alt: string; fit: 'cover' | 'contain' }) {
  const fallbackUrl = displayImageUrl(MISSING_IMAGE_FALLBACK) ?? MISSING_IMAGE_FALLBACK
  const imgFit =
    fit === 'contain'
      ? 'object-contain object-center'
      : 'object-cover object-center group-hover:scale-[1.04] transition-transform duration-300 ease-out'

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
