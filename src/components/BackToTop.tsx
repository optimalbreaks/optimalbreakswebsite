'use client'

import { useState, useEffect } from 'react'
import { OB_CHART_PLAYALL_BAR_EVENT, useOptionalDeckAudio } from '@/components/DeckAudioProvider'

type Props = {
  ariaLabel?: string
}

export default function BackToTop({ ariaLabel = 'Back to top' }: Props) {
  const { sessionActive, mode } = useOptionalDeckAudio()
  const [isVisible, setIsVisible] = useState(false)
  const [chartPlayAllBar, setChartPlayAllBar] = useState(false)

  const bottomBarVisible =
    sessionActive || mode !== 'idle' || chartPlayAllBar

  useEffect(() => {
    const onChartBar = (e: Event) => {
      const v = (e as CustomEvent<{ visible?: boolean }>).detail?.visible
      if (typeof v === 'boolean') setChartPlayAllBar(v)
    }
    window.addEventListener(OB_CHART_PLAYALL_BAR_EVENT, onChartBar)
    return () => window.removeEventListener(OB_CHART_PLAYALL_BAR_EVENT, onChartBar)
  }, [])

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
      className={`fixed right-4 sm:right-8 z-[200] bg-[var(--yellow)] text-[var(--ink)] border-4 border-[var(--ink)] w-12 h-12 flex items-center justify-center transition-all duration-200 hover:bg-[var(--red)] hover:text-white hover:-translate-y-1 shadow-[4px_4px_0_var(--ink)] cursor-pointer touch-manipulation ${
        bottomBarVisible
          ? 'bottom-[calc(6.75rem+env(safe-area-inset-bottom,0px)+10px)] sm:bottom-[calc(7rem+env(safe-area-inset-bottom,0px)+10px)]'
          : 'bottom-[calc(1.5rem+env(safe-area-inset-bottom,0px))] sm:bottom-[calc(2rem+env(safe-area-inset-bottom,0px))]'
      }`}
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
