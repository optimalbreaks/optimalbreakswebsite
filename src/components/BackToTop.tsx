'use client'

import { useState, useEffect } from 'react'
import { OB_CHART_PLAYALL_BAR_EVENT, useOptionalDeckAudio } from '@/components/DeckAudioProvider'
import { useViewportBottomOffset } from '@/hooks/useViewportBottomOffset'

type Props = {
  ariaLabel?: string
}

export default function BackToTop({ ariaLabel = 'Back to top' }: Props) {
  const { sessionActive, mode } = useOptionalDeckAudio()
  const [isVisible, setIsVisible] = useState(false)
  const [chartPlayAllBar, setChartPlayAllBar] = useState(false)
  const vvOffset = useViewportBottomOffset()
  const [isSm, setIsSm] = useState(false)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(min-width: 640px)')
    const sync = () => setIsSm(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

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

  const baseBottom = isSm
    ? bottomBarVisible
      ? 'calc(7rem + env(safe-area-inset-bottom, 0px) + 10px)'
      : 'calc(2rem + env(safe-area-inset-bottom, 0px))'
    : bottomBarVisible
      ? 'calc(6.75rem + env(safe-area-inset-bottom, 0px) + 10px)'
      : 'calc(1.5rem + env(safe-area-inset-bottom, 0px))'

  return (
    <button
      type="button"
      onClick={scrollToTop}
      className="fixed right-4 sm:right-8 z-[200] bg-[var(--yellow)] text-[var(--ink)] border-4 border-[var(--ink)] w-12 h-12 flex items-center justify-center transition-all duration-200 hover:bg-[var(--red)] hover:text-white hover:-translate-y-1 shadow-[4px_4px_0_var(--ink)] cursor-pointer touch-manipulation"
      style={{
        fontFamily: "'Courier Prime', monospace",
        fontSize: '20px',
        fontWeight: 900,
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        appearance: 'none',
        color: 'var(--ink)',
        bottom: vvOffset
          ? `calc(${baseBottom} + ${vvOffset}px)`
          : baseBottom,
      }}
      aria-label={ariaLabel}
    >
      ↑
    </button>
  )
}
