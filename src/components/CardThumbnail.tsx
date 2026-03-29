// ============================================
// OPTIMAL BREAKS — Imagen de tarjeta (DB image_url + placeholder)
// ============================================

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
  const url = src?.trim()
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
          className={`h-full w-full transition-transform duration-300 ease-out ${imgFit}`}
          loading="lazy"
          decoding="async"
        />
      ) : (
        <ThumbnailPlaceholder alt={alt} />
      )}
    </div>
  )
}

function ThumbnailPlaceholder({ alt }: { alt: string }) {
  const letters = alt
    .replace(/[^a-zA-ZÀ-ÿ0-9]/g, ' ')
    .trim()
    .split(/\s+/)
    .filter(Boolean)
  const a = letters[0]?.[0] ?? '?'
  const b = letters[1]?.[0] ?? letters[0]?.[1] ?? ''
  const initials = `${a}${b}`.toUpperCase()

  return (
    <div
      className="flex h-full min-h-[4.5rem] w-full items-center justify-center"
      style={{
        backgroundImage:
          'repeating-linear-gradient(-45deg, var(--paper-dark), var(--paper-dark) 6px, rgba(26,26,26,0.06) 6px, rgba(26,26,26,0.06) 12px)',
      }}
      role="img"
      aria-label={alt}
    >
      <span
        aria-hidden
        className="select-none font-black tracking-tighter text-[var(--ink)]/25"
        style={{
          fontFamily: "'Unbounded', sans-serif",
          fontSize: 'clamp(1.75rem, 7vw, 3rem)',
        }}
      >
        {initials}
      </span>
    </div>
  )
}
