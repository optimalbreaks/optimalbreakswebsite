'use client'

import { useState, useEffect } from 'react'

type Props = {
  ariaLabel?: string
}

export default function BackToTop({ ariaLabel = 'Back to top' }: Props) {
  const [isVisible, setIsVisible] = useState(false)

  useEffect(() => {
    const toggleVisibility = () => {
      // Show button when page is scrolled down 300px
      if (window.scrollY > 300) {
        setIsVisible(true)
      } else {
        setIsVisible(false)
      }
    }

    window.addEventListener('scroll', toggleVisibility)
    return () => window.removeEventListener('scroll', toggleVisibility)
  }, [])

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: 'smooth',
    })
  }

  if (!isVisible) return null

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className="fixed bottom-6 left-4 sm:bottom-8 sm:left-8 z-[150] bg-[var(--yellow)] text-[var(--ink)] border-4 border-[var(--ink)] w-12 h-12 flex items-center justify-center transition-all duration-200 hover:bg-[var(--red)] hover:text-white hover:-translate-y-1 shadow-[4px_4px_0_var(--ink)] cursor-pointer touch-manipulation"
      style={{
        fontFamily: "'Courier Prime', monospace",
        fontSize: '20px',
        fontWeight: 900,
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        appearance: 'none',
        color: 'var(--ink)' /* Forzamos el color para que no se ponga blanco en iOS/Safari */
      }}
      aria-label={ariaLabel}
    >
      ↑
    </button>
  )
}
