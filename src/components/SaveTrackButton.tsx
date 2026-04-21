// ============================================
// OPTIMAL BREAKS — Save Track Button
// "+" toggle for chart/featured/vinyl tracks → saved_chart_tracks
// Always visible (guests → signup modal, like FavoriteButton)
// ============================================

'use client'

import { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { usePathname } from 'next/navigation'
import Link from 'next/link'
import { useSavedChartTracks, type ChartTrackSource } from '@/hooks/useUserData'
import { useAuth } from '@/components/AuthProvider'
import { i18n } from '@/lib/i18n-config'

interface SaveTrackButtonProps {
  source: ChartTrackSource
  trackId: string
  size?: 'sm' | 'md'
  lang?: string
  className?: string
}

function getLang(pathname: string) {
  const seg = pathname.split('/')[1]
  return i18n.locales.includes(seg as any) ? seg : i18n.defaultLocale
}

export default function SaveTrackButton({
  source,
  trackId,
  size = 'sm',
  lang,
  className = '',
}: SaveTrackButtonProps) {
  const pathname = usePathname()
  const resolvedLang = lang || getLang(pathname)
  const { user } = useAuth()
  const { isSaved: isSavedFn, toggle } = useSavedChartTracks()
  const isSaved = isSavedFn(source, trackId)
  const [showGuest, setShowGuest] = useState(false)
  const [mounted, setMounted] = useState(false)
  const modalRef = useRef<HTMLDivElement>(null)

  useEffect(() => { setMounted(true) }, [])

  useEffect(() => {
    if (!showGuest) return
    const h = (e: MouseEvent | TouchEvent) => {
      if (modalRef.current && !modalRef.current.contains(e.target as Node)) setShowGuest(false)
    }
    document.addEventListener('mousedown', h)
    document.addEventListener('touchstart', h)
    const t = setTimeout(() => setShowGuest(false), 4000)
    return () => {
      document.removeEventListener('mousedown', h)
      document.removeEventListener('touchstart', h)
      clearTimeout(t)
    }
  }, [showGuest])

  const es = resolvedLang === 'es'
  const isLoggedIn = !!user

  const handleClick = (e: React.MouseEvent) => {
    e.preventDefault()
    e.stopPropagation()
    if (!isLoggedIn) { setShowGuest(true); return }
    toggle(source, trackId)
  }

  const iconSvg = (w: number) => (
    isSaved ? (
      <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <polyline points="20 6 9 17 4 12" />
      </svg>
    ) : (
      <svg width={w} height={w} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        <line x1="12" y1="5" x2="12" y2="19" />
        <line x1="5" y1="12" x2="19" y2="12" />
      </svg>
    )
  )

  const guestModal =
    mounted &&
    showGuest &&
    !isLoggedIn &&
    createPortal(
      <>
        <div className="fixed inset-0 z-[1100] bg-black/50" onClick={() => setShowGuest(false)} aria-hidden />
        <div className="fixed inset-0 z-[1101] flex items-center justify-center p-4 pointer-events-none" role="dialog" aria-modal="true">
          <div
            ref={modalRef}
            className="pointer-events-auto relative w-full max-w-[280px] bg-[var(--red)] text-[var(--yellow)] border-[4px] border-[var(--ink)] p-5 shadow-[6px_6px_0_var(--ink)]"
            style={{ animation: 'fadeIn 0.15s ease-out', transform: 'rotate(-1deg)' }}
          >
            <button
              type="button"
              onClick={() => setShowGuest(false)}
              className="absolute top-2 right-3 text-[var(--yellow)] hover:text-white transition-colors bg-transparent border-0 cursor-pointer"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '18px', lineHeight: 1 }}
              aria-label="Close"
            >
              ✕
            </button>
            <p style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', lineHeight: 1.4, margin: 0, textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
              {es ? '¡Regístrate para guardar tracks!' : 'Sign up to save tracks!'}
            </p>
            <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', lineHeight: 1.5, margin: '8px 0 0', color: 'rgba(255,255,255,0.8)' }}>
              {es
                ? 'Guarda tracks de los charts y reprodúcelos todos desde Mis Tracks.'
                : 'Save tracks from the charts and replay them all from My Tracks.'}
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

  const ariaLabel = isSaved
    ? (es ? 'Quitar de Mis Tracks' : 'Remove from My Tracks')
    : (es ? 'Guardar en Mis Tracks' : 'Save to My Tracks')

  if (size === 'sm') {
    return (
      <>
        <button
          type="button"
          onClick={handleClick}
          className={`w-8 h-8 flex items-center justify-center rounded-full border-2 border-[var(--ink)] transition-all duration-200 ${
            isSaved
              ? 'bg-[var(--acid)] text-[var(--ink)] shadow-[2px_2px_0_var(--ink)]'
              : 'bg-white text-[var(--ink)] hover:bg-[var(--acid)] hover:text-[var(--ink)] shadow-[1px_1px_0_var(--ink)]'
          } ${className}`}
          aria-label={ariaLabel}
          title={ariaLabel}
        >
          {iconSvg(15)}
        </button>
        {guestModal}
      </>
    )
  }

  return (
    <div className={`relative inline-flex ${className}`}>
      <button
        type="button"
        onClick={handleClick}
        className={`inline-flex items-center gap-2 h-9 px-3.5 border-2 transition-all duration-200 ${
          isSaved
            ? 'border-[var(--acid)] bg-[var(--acid)] text-[var(--ink)]'
            : 'border-white/30 bg-[var(--ink)] text-white/80 hover:border-[var(--acid)] hover:bg-[var(--acid)] hover:text-[var(--ink)]'
        }`}
        aria-label={ariaLabel}
      >
        {iconSvg(14)}
        <span style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase' }}>
          {isSaved ? (es ? 'GUARDADO' : 'SAVED') : (es ? 'GUARDAR' : 'SAVE')}
        </span>
      </button>
      {guestModal}
    </div>
  )
}
