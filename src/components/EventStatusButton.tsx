// ============================================
// OPTIMAL BREAKS — Event Status Button
// wishlist → attending → attended → none
// Self-contained: reads/writes event_attendance via hook
// Guest users see a centered modal prompt
// ============================================

'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { createBrowserSupabase } from '@/lib/supabase'
import { i18n } from '@/lib/i18n-config'

type Status = 'wishlist' | 'attending' | 'attended' | null

interface EventStatusButtonProps {
  eventId: string
  lang?: string
}

const STATUS_CONFIG: Record<string, { label_en: string; label_es: string; color: string; icon: string }> = {
  wishlist: { label_en: 'WISHLIST', label_es: 'QUIERO IR', color: 'var(--uv)', icon: '♡' },
  attending: { label_en: 'GOING', label_es: 'VOY', color: 'var(--acid)', icon: '✓' },
  attended: { label_en: 'ATTENDED', label_es: 'FUI', color: 'var(--yellow)', icon: '★' },
}

function getLang(pathname: string) {
  const seg = pathname.split('/')[1]
  return i18n.locales.includes(seg as any) ? seg : i18n.defaultLocale
}

export default function EventStatusButton({ eventId, lang }: EventStatusButtonProps) {
  const { user } = useAuth()
  const pathname = usePathname()
  const resolvedLang = lang || getLang(pathname)
  const es = resolvedLang === 'es'

  const [status, setStatus] = useState<Status>(null)
  const [loading, setLoading] = useState(true)
  const [showTooltip, setShowTooltip] = useState(false)
  const [mounted, setMounted] = useState(false)
  const tooltipRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
  }, [])

  const fetchStatus = useCallback(async () => {
    if (!user) { setStatus(null); setLoading(false); return }
    const supabase: any = createBrowserSupabase()
    const { data } = await supabase
      .from('event_attendance')
      .select('status')
      .eq('user_id', user.id)
      .eq('event_id', eventId)
      .maybeSingle()
    setStatus(data?.status ?? null)
    setLoading(false)
  }, [user, eventId])

  useEffect(() => { fetchStatus() }, [fetchStatus])

  useEffect(() => {
    if (!showTooltip) return
    const handle = (e: MouseEvent | TouchEvent) => {
      if (tooltipRef.current && !tooltipRef.current.contains(e.target as Node)) setShowTooltip(false)
    }
    document.addEventListener('mousedown', handle)
    document.addEventListener('touchstart', handle)
    return () => { document.removeEventListener('mousedown', handle); document.removeEventListener('touchstart', handle) }
  }, [showTooltip])

  useEffect(() => {
    if (showTooltip) {
      const t = setTimeout(() => setShowTooltip(false), 4000)
      return () => clearTimeout(t)
    }
  }, [showTooltip])

  const handleClick = async (newStatus: Status) => {
    if (!user) { setShowTooltip(true); return }
    const supabase: any = createBrowserSupabase()
    const target = status === newStatus ? null : newStatus
    if (target === null) {
      await supabase.from('event_attendance').delete().eq('user_id', user.id).eq('event_id', eventId)
    } else {
      await supabase.from('event_attendance').upsert(
        { user_id: user.id, event_id: eventId, status: target },
        { onConflict: 'user_id,event_id' }
      )
    }
    setStatus(target)
  }

  return (
    <div className="relative inline-flex flex-wrap gap-1">
      {Object.entries(STATUS_CONFIG).map(([key, conf]) => {
        const active = status === key
        return (
          <button
            key={key}
            onClick={() => handleClick(key as Status)}
            className={`border-2 cursor-pointer transition-all duration-150 px-2 py-1 ${
              active
                ? 'text-white'
                : 'bg-transparent text-[var(--ink)]/40 hover:text-[var(--ink)]'
            }`}
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700,
              fontSize: '9px',
              letterSpacing: '1px',
              textTransform: 'uppercase',
              background: active ? conf.color : 'transparent',
              borderColor: active ? conf.color : 'rgba(26,26,26,0.15)',
              color: active ? (key === 'attended' ? 'var(--ink)' : 'white') : undefined,
            }}
          >
            {conf.icon} {es ? conf.label_es : conf.label_en}
          </button>
        )
      })}

      {mounted &&
        showTooltip &&
        !user &&
        createPortal(
          <>
            <div className="fixed inset-0 z-[1100] bg-black/50" onClick={() => setShowTooltip(false)} aria-hidden />
            <div
              className="fixed inset-0 z-[1101] flex items-center justify-center p-4 pointer-events-none"
              role="dialog"
              aria-modal="true"
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
                <p style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', lineHeight: 1.4, margin: 0, textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
                  {es
                    ? '¡Regístrate para seguir eventos!'
                    : 'Sign up to track events!'}
                </p>
                <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', lineHeight: 1.5, margin: '8px 0 0', color: 'rgba(255,255,255,0.8)' }}>
                  {es
                    ? 'Marca los eventos que quieres ir, a los que vas o a los que fuiste.'
                    : 'Mark events as wishlist, going, or attended.'}
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
        )}
    </div>
  )
}
