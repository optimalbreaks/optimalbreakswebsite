'use client'

import { Suspense, useEffect, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import { usePathname, useSearchParams } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { createBrowserSupabase } from '@/lib/supabase'
import { OB_CHART_PLAYALL_BAR_EVENT, useOptionalDeckAudio } from '@/components/DeckAudioProvider'
import { useViewportBottomOffset } from '@/hooks/useViewportBottomOffset'
import { i18n } from '@/lib/i18n-config'
import AgentChat from '@/components/admin/AgentChat'

/** Abrir el widget de chat editorial (admin) desde sidebar, páginas, etc. */
export const OB_ADMIN_CHAT_OPEN_EVENT = 'ob-admin-chat-open'
export const OB_ADMIN_CHAT_CLOSE_EVENT = 'ob-admin-chat-close'

export function openAdminChat() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OB_ADMIN_CHAT_OPEN_EVENT))
}

export function closeAdminChat() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new CustomEvent(OB_ADMIN_CHAT_CLOSE_EVENT))
}

type VvBox = { top: number; height: number; offsetLeft: number; width: number }

/**
 * Widget chatbot admin: FAB → panel.
 * Móvil/PWA: sheet anclado al visualViewport (teclado, notch, home bar).
 * Portal a body para no pelear con z-index del layout.
 */
function AdminChatWidgetInner() {
  const { user, loading: authLoading } = useAuth()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { sessionActive, mode } = useOptionalDeckAudio()
  const vvOffset = useViewportBottomOffset()
  const [isAdmin, setIsAdmin] = useState(false)
  const [chartPlayAllBar, setChartPlayAllBar] = useState(false)
  const [isSm, setIsSm] = useState(false)
  const [open, setOpen] = useState(false)
  const [mountedChat, setMountedChat] = useState(false)
  const [domReady, setDomReady] = useState(false)
  const [vvBox, setVvBox] = useState<VvBox | null>(null)

  const seg = pathname?.split('/')[1] || ''
  const lang = i18n.locales.includes(seg as 'es' | 'en') ? seg : i18n.defaultLocale
  const onCapturePage = /\/administrator\/chat\/?$/.test(pathname || '')
  const shareHint =
    searchParams?.get('share') === '1' ||
    Boolean(searchParams?.get('text')) ||
    Boolean(searchParams?.get('images'))

  useEffect(() => {
    setDomReady(true)
  }, [])

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

  useEffect(() => {
    const onOpen = () => {
      setMountedChat(true)
      setOpen(true)
    }
    const onClose = () => setOpen(false)
    window.addEventListener(OB_ADMIN_CHAT_OPEN_EVENT, onOpen)
    window.addEventListener(OB_ADMIN_CHAT_CLOSE_EVENT, onClose)
    return () => {
      window.removeEventListener(OB_ADMIN_CHAT_OPEN_EVENT, onOpen)
      window.removeEventListener(OB_ADMIN_CHAT_CLOSE_EVENT, onClose)
    }
  }, [])

  // Share Target / ruta Captura → abrir el widget
  useEffect(() => {
    if (!isAdmin) return
    if (onCapturePage || shareHint) {
      setMountedChat(true)
      setOpen(true)
    }
  }, [isAdmin, onCapturePage, shareHint])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  // iOS/PWA: anclar al visualViewport (teclado + desfase standalone)
  useEffect(() => {
    if (!open || typeof window === 'undefined') {
      setVvBox(null)
      return
    }
    const vv = window.visualViewport
    const sync = () => {
      if (!vv) {
        setVvBox({
          top: 0,
          height: window.innerHeight,
          offsetLeft: 0,
          width: window.innerWidth,
        })
        return
      }
      setVvBox({
        top: Math.max(0, vv.offsetTop),
        height: Math.max(240, vv.height),
        offsetLeft: vv.offsetLeft || 0,
        width: vv.width || window.innerWidth,
      })
    }
    sync()
    if (!vv) {
      window.addEventListener('resize', sync)
      return () => window.removeEventListener('resize', sync)
    }
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [open])

  // Bloqueo de scroll del body (iOS PWA necesita position:fixed)
  useEffect(() => {
    if (!open || isSm) return
    const scrollY = window.scrollY
    const { style } = document.body
    const prev = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow,
    }
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.left = '0'
    style.right = '0'
    style.width = '100%'
    style.overflow = 'hidden'
    return () => {
      style.position = prev.position
      style.top = prev.top
      style.left = prev.left
      style.right = prev.right
      style.width = prev.width
      style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [open, isSm])

  const bottomBarVisible = sessionActive || mode !== 'idle' || chartPlayAllBar

  if (!domReady || authLoading || !user || !isAdmin) return null

  // Ver BackToTop: `--ob-bottom-bar-h` = altura real del mini reproductor.
  const baseBottom = isSm
    ? bottomBarVisible
      ? 'max(calc(var(--ob-bottom-bar-h, 0px) + 14px), calc(7rem + env(safe-area-inset-bottom, 0px) + 10px))'
      : 'calc(2rem + env(safe-area-inset-bottom, 0px))'
    : bottomBarVisible
      ? 'max(calc(var(--ob-bottom-bar-h, 0px) + 14px), calc(6.75rem + env(safe-area-inset-bottom, 0px) + 10px))'
      : 'calc(1.5rem + env(safe-area-inset-bottom, 0px))'

  const fabBottom = vvOffset ? `calc(${baseBottom} + ${vvOffset}px)` : baseBottom
  const label = lang === 'es' ? 'Chat editorial' : 'Editorial chat'
  const mobileSheet = open && !isSm

  const panelStyle: CSSProperties = mobileSheet
    ? {
        top: vvBox?.top ?? 0,
        height: vvBox?.height ?? '100dvh',
        left: 0,
        right: 0,
        bottom: 'auto',
        width: '100%',
      }
    : open && isSm && vvBox
      ? {
          bottom: fabBottom,
          left: 'max(1rem, env(safe-area-inset-left, 0px))',
          maxHeight: Math.max(280, vvBox.height - 24),
          height: 'min(36rem, calc(100dvh - 6.5rem))',
        }
      : {
          bottom: fabBottom,
          left: 'max(1rem, env(safe-area-inset-left, 0px))',
        }

  const ui = (
    <>
      {!open ? (
        <button
          type="button"
          onClick={() => {
            setMountedChat(true)
            setOpen(true)
          }}
          className="ob-admin-chat-fab fixed z-[220] bg-[var(--red)] text-white border-4 border-[var(--ink)] w-14 h-14 flex items-center justify-center transition-all duration-200 hover:bg-[var(--yellow)] hover:text-[var(--ink)] hover:-translate-y-1 shadow-[4px_4px_0_var(--ink)] touch-manipulation"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '22px',
            fontWeight: 900,
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            bottom: fabBottom,
            left: 'max(1rem, env(safe-area-inset-left, 0px))',
          }}
          aria-label={label}
          aria-expanded={false}
          title={label}
        >
          💬
        </button>
      ) : null}

      {open ? (
        <button
          type="button"
          className={`ob-admin-chat-backdrop fixed inset-0 z-[219] touch-manipulation ${
            mobileSheet ? 'bg-[var(--ink)]/55' : 'bg-[var(--ink)]/25 sm:bg-transparent sm:pointer-events-none'
          }`}
          aria-label={lang === 'es' ? 'Cerrar chat' : 'Close chat'}
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div
        className={`ob-admin-chat-panel fixed z-[220] flex flex-col bg-[var(--paper)] overflow-hidden transition-[opacity,transform] duration-200 ease-out ${
          mobileSheet
            ? 'ob-admin-chat-panel--sheet border-0 border-t-4 border-[var(--ink)] shadow-none'
            : 'border-4 border-[var(--ink)] shadow-[8px_8px_0_var(--ink)]'
        } ${
          open
            ? 'opacity-100 pointer-events-auto translate-y-0'
            : 'opacity-0 pointer-events-none translate-y-3'
        }`}
        style={panelStyle}
        role="dialog"
        aria-modal="true"
        aria-label={label}
        data-ob-overlay
        hidden={!open}
      >
        <header className="ob-admin-chat-panel__bar shrink-0 flex items-center gap-2 px-3 border-b-4 border-[var(--ink)] bg-[var(--red)] text-white">
          <span
            className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wider"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {label}
          </span>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center border-[2px] border-white/80 bg-transparent text-white hover:bg-white hover:text-[var(--red)] touch-manipulation"
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 900, fontSize: '18px' }}
            aria-label={lang === 'es' ? 'Minimizar chat' : 'Minimize chat'}
            onClick={() => setOpen(false)}
          >
            −
          </button>
        </header>
        <div className="ob-admin-chat-panel__body flex-1 min-h-0 flex flex-col">
          {mountedChat ? (
            <AgentChat lang={lang} mode="widget" shareQuery={searchParams} />
          ) : null}
        </div>
      </div>
    </>
  )

  return createPortal(ui, document.body)
}

export default function AdminCaptureFab() {
  return (
    <Suspense fallback={null}>
      <AdminChatWidgetInner />
    </Suspense>
  )
}
