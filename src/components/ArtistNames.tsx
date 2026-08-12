// ============================================
// OPTIMAL BREAKS — Nombres de artista con enlace a ficha interna o URL externa
// ============================================

import Link from 'next/link'
import type { Locale } from '@/lib/i18n-config'
import { findArtistSlug } from '@/lib/artist-slug-map'

export type ArtistCredit = {
  name: string
  beatport_url?: string | null
  url?: string | null
}

type ArtistNamesProps = {
  artists: ArtistCredit[]
  slugMap?: Record<string, string>
  lang?: Locale | string
  className?: string
}

export function ArtistNames({ artists, slugMap, lang, className = 'text-[var(--ink)]/70' }: ArtistNamesProps) {
  if (!artists.length) return <span className={className}>—</span>
  return (
    <span className={className}>
      {artists.map((a, i) => {
        const name = (a.name || '').trim()
        if (!name) return null
        const internalSlug = findArtistSlug(name, slugMap)
        const externalHref = (a.beatport_url || a.url || '').trim()
        return (
          <span key={`${name}-${i}`}>
            {internalSlug && lang ? (
              <Link
                href={`/${lang}/artists/${internalSlug}`}
                className="text-[var(--red)] font-bold hover:underline decoration-2 underline-offset-2 transition-colors"
                title={name}
              >
                {name}
              </Link>
            ) : externalHref ? (
              <a
                href={externalHref}
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-[var(--red)] transition-colors underline decoration-dotted"
              >
                {name}
              </a>
            ) : (
              name
            )}
            {i < artists.length - 1 ? ', ' : null}
          </span>
        )
      })}
    </span>
  )
}

/** Nombre de sello: enlace interno a `/[lang]/labels/<slug>` si consta en BD. */
export function LabelName({
  name,
  slugMap,
  lang,
}: {
  name: string | null | undefined
  slugMap?: Record<string, string>
  lang?: Locale | string
}) {
  const label = (name || '').trim()
  if (!label) return null
  const slug = findArtistSlug(label, slugMap)
  if (slug && lang) {
    return (
      <Link
        href={`/${lang}/labels/${slug}`}
        className="text-[var(--red)] font-bold hover:underline decoration-2 underline-offset-2 transition-colors"
        title={label}
      >
        {label}
      </Link>
    )
  }
  return <span className="text-[var(--ink)]/50">{label}</span>
}
