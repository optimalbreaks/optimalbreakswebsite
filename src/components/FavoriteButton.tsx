// ============================================
// OPTIMAL BREAKS — Favorite Button
// Heart toggle for artists, labels, events, mixes
// ============================================

'use client'

import { useRouter, usePathname } from 'next/navigation'
import { useFavoriteToggle, type FavoriteType } from '@/hooks/useUserData'
import { i18n } from '@/lib/i18n-config'

interface FavoriteButtonProps {
  type: FavoriteType
  entityId: string
  /** sm = card overlay (icon only), md = detail page (icon + label) */
  size?: 'sm' | 'md'
  lang?: string
  className?: string
}

function getLang(pathname: string) {
  const seg = pathname.split('/')[1]
  return i18n.locales.includes(seg as any) ? seg : i18n.defaultLocale
}

export default function FavoriteButton({
  type,
  entityId,
  size = 'sm',
  lang,
  className = '',
}: FavoriteButtonProps) {
  const router = useRouter()
  const pathname = usePathname()
  const resolvedLang = lang || getLang(pathname)
  const { isFavorite, loading, toggle, isLoggedIn } = useFavoriteToggle(type, entityId)

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!isLoggedIn) {
      router.push(`/${resolvedLang}/login`)
      return
    }
    toggle()
  }

  if (loading && size === 'sm') return null

  const es = resolvedLang === 'es'

  if (size === 'sm') {
    return (
      <button
        onClick={handleClick}
        className={`absolute top-2 right-2 z-10 w-8 h-8 flex items-center justify-center rounded-full transition-all duration-200 ${
          isFavorite
            ? 'bg-[var(--red)] text-white shadow-[2px_2px_0_var(--ink)]'
            : 'bg-[var(--paper)]/90 text-[var(--ink)] hover:bg-[var(--red)] hover:text-white shadow-[1px_1px_0_var(--ink)]'
        } ${className}`}
        aria-label={isFavorite ? (es ? 'Quitar de favoritos' : 'Remove from favorites') : (es ? 'Añadir a favoritos' : 'Add to favorites')}
        title={isFavorite ? (es ? 'Quitar de favoritos' : 'Remove from favorites') : (es ? 'Añadir a favoritos' : 'Add to favorites')}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
        </svg>
      </button>
    )
  }

  return (
    <button
      onClick={handleClick}
      className={`inline-flex items-center gap-[6px] px-3 py-[5px] border-2 transition-all duration-200 ${
        isFavorite
          ? 'border-[var(--red)] bg-[var(--red)] text-white'
          : 'border-[var(--red)] bg-transparent text-[var(--red)] hover:bg-[var(--red)] hover:text-white'
      } ${className}`}
      aria-label={isFavorite ? (es ? 'Quitar de favoritos' : 'Remove from favorites') : (es ? 'Añadir a favoritos' : 'Add to favorites')}
    >
      <svg width="14" height="14" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
        <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
      </svg>
      <span
        style={{
          fontFamily: "'Courier Prime', monospace",
          fontWeight: 700,
          fontSize: '9px',
          letterSpacing: '1px',
          textTransform: 'uppercase',
        }}
      >
        {isFavorite ? (es ? 'FAVORITO' : 'SAVED') : (es ? 'FAVORITO' : 'FAVORITE')}
      </span>
    </button>
  )
}
