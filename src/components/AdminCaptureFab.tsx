'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { createBrowserSupabase } from '@/lib/supabase'
import { OB_CHART_PLAYALL_BAR_EVENT, useOptionalDeckAudio } from '@/components/DeckAudioProvider'
import { useViewportBottomOffset } from '@/hooks/useViewportBottomOffset'
import { i18n } from '@/lib/i18n-config'

/**
 * FAB admin: Captura editorial (abajo-izquierda).
 * Misma elevación que BackToTop (abajo-derecha) cuando hay barra de reproductor / Play All.
 */
export default function AdminCaptureFab() {
  const { user, loading: authLoading } = useAuth()
  const pathname = usePathname()
  const { sessionActive, mode } = useOptionalDeckAudio()
  const vvOffset = useViewportBottomOffset()
  const [isAdmin, setIsAdmin] = useState(false)
  const [chartPlayAllBar, setChartPlayAllBar] = useState(false)
  const [isSm, setIsSm] = useState(false)

  const seg = pathname?.split('/')[1] || ''
  const lang = i18n.locales.includes(seg as 'es' | 'en') ? seg : i18n.defaultLocale
  const onCapturePage = /\/administrator\/chat\/?$/.test(pathname || '')

  useEffect(() => {
    if (!user?.id) {
      setIsAdmin(false)
      return
    }
    let cancelled = false
    ;(async () => {
      const sb = createBrowserSupabase()
      const { data } = await sb.from('profiles').select('role').eq('id', user.id).single()
      if (!cancelled) setIsAdmin((data as { role?: string } | null)?.role === 'admin')
    })()
    return () => {
      cancelled = true
    }
  }, [user?.id])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(min-width: 640px)')
    const sync = () => setIsSm(mq.matches)
    sync()
    mq.addEventListener('change', sync)
    return () => mq.removeEventListener('change', sync)
  }, [])

  useEffect(() => {
    const onChartBar = (e: Event) => {
      const v = (e as CustomEvent<{ visible?: boolean }>).detail?.visible
      if (typeof v === 'boolean') setChartPlayAllBar(v)
    }
    window.addEventListener(OB_CHART_PLAYALL_BAR_EVENT, onChartBar)
    return () => window.removeEventListener(OB_CHART_PLAYALL_BAR_EVENT, onChartBar)
  }, [])

  const bottomBarVisible = sessionActive || mode !== 'idle' || chartPlayAllBar

  if (authLoading || !user || !isAdmin || onCapturePage) return null

  const baseBottom = isSm
    ? bottomBarVisible
      ? 'calc(7rem + env(safe-area-inset-bottom, 0px) + 10px)'
      : 'calc(2rem + env(safe-area-inset-bottom, 0px))'
    : bottomBarVisible
      ? 'calc(6.75rem + env(safe-area-inset-bottom, 0px) + 10px)'
      : 'calc(1.5rem + env(safe-area-inset-bottom, 0px))'

  return (
    <Link
      href={`/${lang}/administrator/chat`}
      className="fixed left-4 sm:left-8 z-[200] bg-[var(--red)] text-white border-4 border-[var(--ink)] w-12 h-12 flex items-center justify-center transition-all duration-200 hover:bg-[var(--yellow)] hover:text-[var(--ink)] hover:-translate-y-1 shadow-[4px_4px_0_var(--ink)] touch-manipulation no-underline"
      style={{
        fontFamily: "'Courier Prime', monospace",
        fontSize: '18px',
        fontWeight: 900,
        WebkitAppearance: 'none',
        MozAppearance: 'none',
        appearance: 'none',
        bottom: vvOffset ? `calc(${baseBottom} + ${vvOffset}px)` : baseBottom,
      }}
      aria-label={lang === 'es' ? 'Captura editorial' : 'Editorial capture'}
      title={lang === 'es' ? 'Captura editorial' : 'Editorial capture'}
    >
      ⇪
    </Link>
  )
}
