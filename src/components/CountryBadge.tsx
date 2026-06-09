import type { Locale } from '@/lib/i18n-config'
import {
  countryDisplayFromCode,
  countryIsoCodesFromCode,
  flagCdnUrl,
} from '@/lib/seo'

type FlagSize = 'xs' | 'sm' | 'md'

const FLAG_DIMS: Record<FlagSize, { w: number; h: number; cdnW: number }> = {
  xs: { w: 16, h: 11, cdnW: 20 },
  sm: { w: 24, h: 17, cdnW: 40 },
  md: { w: 32, h: 22, cdnW: 80 },
}

/** Una bandera PNG desde flagcdn (sin texto). */
export function CountryFlagImg({
  iso,
  size = 'sm',
  className = '',
}: {
  iso: string
  size?: FlagSize
  className?: string
}) {
  const dim = FLAG_DIMS[size]
  return (
    // eslint-disable-next-line @next/next/no-img-element -- flagcdn, igual que ArtistShowcase
    <img
      src={flagCdnUrl(iso, dim.cdnW)}
      alt=""
      width={dim.w}
      height={dim.h}
      loading="lazy"
      decoding="async"
      className={`rounded-[2px] object-cover shadow-sm shrink-0 ${className}`}
      style={{ width: dim.w, height: dim.h }}
    />
  )
}

/**
 * Bandera(s) + nombre del país. Usa flagcdn y los helpers de `seo.ts`
 * (códigos ISO, nombres completos como «Russia», compuestos «AU/UK»).
 */
export default function CountryBadge({
  country,
  lang,
  size = 'sm',
  showLabel = true,
  variant = 'cutout',
  className,
}: {
  country: string | null | undefined
  lang: Locale | string
  size?: FlagSize
  showLabel?: boolean
  /** cutout = etiqueta del listado; overlay = tarjeta oscura home; plain = inline */
  variant?: 'cutout' | 'overlay' | 'plain'
  className?: string
}) {
  const codes = countryIsoCodesFromCode(country)
  if (!codes.length) return null
  const label = showLabel ? countryDisplayFromCode(country, lang as Locale) : null

  const flags = codes.map((iso) => (
    <CountryFlagImg key={iso} iso={iso} size={size} />
  ))

  const labelEl = label ? (
    <span
      className={
        variant === 'overlay'
          ? ''
          : variant === 'cutout'
            ? ''
            : 'text-[var(--ink)]/70'
      }
      style={
        variant === 'overlay'
          ? {
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700,
              fontSize: size === 'xs' ? '9px' : '10px',
              letterSpacing: '2px',
              textTransform: 'uppercase',
              color: '#fff',
            }
          : variant === 'cutout'
            ? {
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }
            : {
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: size === 'xs' ? '8px' : '10px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }
      }
    >
      {label}
    </span>
  ) : null

  const inner = (
    <>
      <span className="inline-flex items-center gap-0.5 shrink-0">{flags}</span>
      {labelEl}
    </>
  )

  if (variant === 'overlay') {
    return (
      <span
        className={`inline-flex items-center gap-2 border-2 border-white/30 bg-black/55 px-2.5 py-1.5 backdrop-blur-sm ${className ?? ''}`}
      >
        {inner}
      </span>
    )
  }

  if (variant === 'cutout') {
    return (
      <span
        className={`cutout fill inline-flex items-center gap-1.5 ${className ?? ''}`}
        style={{
          fontSize: size === 'xs' ? '7px' : '8px',
          padding: size === 'xs' ? '0px 4px' : '1px 6px',
          margin: 0,
        }}
      >
        {inner}
      </span>
    )
  }

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`}>
      {inner}
    </span>
  )
}
