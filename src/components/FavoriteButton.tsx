// ============================================
// OPTIMAL BREAKS — Favorite Button
// Heart toggle for artists, labels, events, mixes
// Always visible (even for guests → prompts signup)
// ============================================

'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
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
  const pathname = usePathname()
  const resolvedLang = lang || getLang(pathname)
  const { isFavorite, loading, toggle, isLoggedIn } = useFavoriteToggle(type, entityId)
  const [showTooltip, setShowTooltip] = useState(false)
  const [mounted, setMounted] = useState(false)
  const tooltipTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  useEffect(() => {
    if (!showTooltip) return
    const handleOutside = (e: MouseEvent | TouchEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) {
        setShowTooltip(false)
      }
    }
    document.addEventListener('mousedown', handleOutside)
    document.addEventListener('touchstart', handleOutside)
    return () => {
      document.removeEventListener('mousedown', handleOutside)
      document.removeEventListener('touchstart', handleOutside)
    }
  }, [showTooltip])

  useEffect(() => {
    if (showTooltip) {
      tooltipTimer.current = setTimeout(() => setShowTooltip(false), 4000)
      return () => { if (tooltipTimer.current) clearTimeout(tooltipTimer.current) }
    }
  }, [showTooltip])

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()

    if (!isLoggedIn) {
      setShowTooltip(true)
      return
    }
    toggle()
  }

  const es = resolvedLang === 'es'

  const heartSvg = (w: number) => (
    <svg width={w} height={w} viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
      <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z" />
    </svg>
  )

  const guestModal =
    mounted &&
    showTooltip &&
    !isLoggedIn &&
    createPortal(
      <>
        <div
          className="fixed inset-0 z-[1100] bg-black/50"
          onClick={() => setShowTooltip(false)}
          aria-hidden
        />
        <div
          className="fixed inset-0 z-[1101] flex items-center justify-center p-4 pointer-events-none"
          role="dialog"
          aria-modal="true"
          aria-labelledby="fav-guest-title"
        >
          <div
            ref={tooltipRef}
            className="pointer-events-auto relative w-full max-w-[280px] bg-[var(--red)] text-[var(--yellow)] border-[4px] border-[var(--ink)] p-5 shadow-[6px_6px_0_var(--ink)]"
            style={{ animation: 'fadeIn 0.15s ease-out', transform: 'rotate(-1deg)' }}
          >
            <button
              type="button"
              onClick={() => setShowTooltip(false)}
              className="absolute top-2 right-3 text-[var(--yellow)] hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '18px', lineHeight: 1 }}
              aria-label="Close"
            >
              ✕
            </button>
            <p
              id="fav-guest-title"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', lineHeight: 1.4, margin: 0, textTransform: 'uppercase', letterSpacing: '-0.3px' }}
            >
              {es
                ? '¡Regístrate para guardar tus favoritos!'
                : 'Sign up to save your favorites!'}
            </p>
            <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', lineHeight: 1.5, margin: '8px 0 0', color: 'rgba(255,255,255,0.8)' }}>
              {es
                ? 'Crea tu colección de artistas, sellos, eventos y mixes.'
                : 'Build your collection of artists, labels, events and mixes.'}
            </p>
            <Link
              href={`/${resolvedLang}/login`}
              className="mt-4 block text-center bg-[var(--yellow)] text-[var(--ink)] no-underline hover:bg-white transition-colors"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '13px', letterSpacing: '2px', padding: '10px 14px' }}
            >
              {es ? '¡ENTRA YA!' : 'JOIN NOW!'}
            </Link>
          </div>
        </div>
      </>,
      document.body
    )

  if (size === 'sm') {
    return (
      <div className={`absolute top-2 right-2 z-10 ${className}`}>
        <button
          onClick={handleClick}
          className={`w-8 h-8 flex items-center justify-center rounded-full border-2 border-[var(--ink)] transition-all duration-200 ${
            isFavorite
              ? 'bg-[var(--red)] text-white border-[var(--red)] shadow-[2px_2px_0_var(--ink)]'
              : 'bg-white text-[var(--ink)] hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] shadow-[1px_1px_0_var(--ink)]'
          }`}
          aria-label={isFavorite ? (es ? 'Quitar de favoritos' : 'Remove from favorites') : (es ? 'Añadir a favoritos' : 'Add to favorites')}
          title={isFavorite ? (es ? 'Quitar de favoritos' : 'Remove from favorites') : (es ? 'Añadir a favoritos' : 'Add to favorites')}
        >
          {heartSvg(16)}
        </button>
        {guestModal}
      </div>
    )
  }

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        onClick={handleClick}
        className={`inline-flex items-center gap-[6px] px-3 py-[5px] border-2 transition-all duration-200 ${
          isFavorite
            ? 'border-[var(--red)] bg-[var(--red)] text-white'
            : 'border-[var(--red)] bg-transparent text-[var(--red)] hover:bg-[var(--red)] hover:text-white'
        }`}
        aria-label={isFavorite ? (es ? 'Quitar de favoritos' : 'Remove from favorites') : (es ? 'Añadir a favoritos' : 'Add to favorites')}
      >
        {heartSvg(14)}
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
      {guestModal}
    </div>
  )
}
