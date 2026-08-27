// ============================================
// OPTIMAL BREAKS — GDPR Cookie Consent (ePrivacy)
// Granular categories: necessary (always on), analytics
// ============================================

'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

/* ── types ─────────────────────────────────────────── */

export type CookieConsent = {
  necessary: true
  analytics: boolean
}

/** Nombre fijo: el script de Consent Mode en `[lang]/layout.tsx` lee la misma cookie. */
const COOKIE_NAME = 'ob_consent'
const COOKIE_MAX_AGE = 34_164_000 // ~13 months (EU max)
/** Espera antes de mostrar el banner en 1ª visita (LCP = hero, no este texto). */
const CONSENT_SHOW_DELAY_MS = 4500
/** Margen tras registrar LCP antes de abrir el banner. */
const CONSENT_AFTER_LCP_MS = 600

/* ── helpers ───────────────────────────────────────── */

function writeCookie(consent: CookieConsent) {
  const val = encodeURIComponent(JSON.stringify(consent))
  const secure = window.location.protocol === 'https:' ? ';Secure' : ''
  document.cookie = `${COOKIE_NAME}=${val};max-age=${COOKIE_MAX_AGE};path=/;SameSite=Lax${secure}`
}

export function readConsent(): CookieConsent | null {
  if (typeof document === 'undefined') return null
  const match = document.cookie.match(new RegExp(`(?:^|;\\s*)${COOKIE_NAME}=([^;]+)`))
  if (!match) return null
  try {
    return JSON.parse(decodeURIComponent(match[1]))
  } catch {
    return null
  }
}

/* ── component ─────────────────────────────────────── */

export default function CookieBanner({ lang }: { lang: string }) {
  const es = lang === 'es'
  const [visible, setVisible] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [analytics, setAnalytics] = useState(false)

  useEffect(() => {
    const saved = readConsent()
    if (saved) {
      setAnalytics(saved.analytics)
      return
    }

    let cancelled = false
    let delayTimer: ReturnType<typeof setTimeout> | null = null
    let lcpTimer: ReturnType<typeof setTimeout> | null = null
    let lcpObserver: PerformanceObserver | null = null

    const showFirstVisit = () => {
      if (cancelled) return
      setVisible(true)
    }

    const scheduleAfterLcp = () => {
      if (delayTimer) clearTimeout(delayTimer)
      lcpTimer = setTimeout(showFirstVisit, CONSENT_AFTER_LCP_MS)
    }

    delayTimer = setTimeout(showFirstVisit, CONSENT_SHOW_DELAY_MS)

    if (typeof PerformanceObserver !== 'undefined') {
      try {
        lcpObserver = new PerformanceObserver((list) => {
          if (list.getEntries().length > 0) scheduleAfterLcp()
        })
        lcpObserver.observe({ type: 'largest-contentful-paint', buffered: true })
      } catch {
        /* LCP API no disponible */
      }
    }

    const openBanner = () => {
      const current = readConsent()
      if (current) setAnalytics(current.analytics)
      setShowSettings(true)
      setVisible(true)
    }
    window.addEventListener('ob-open-cookie-banner', openBanner)

    return () => {
      cancelled = true
      if (delayTimer) clearTimeout(delayTimer)
      if (lcpTimer) clearTimeout(lcpTimer)
      lcpObserver?.disconnect()
      window.removeEventListener('ob-open-cookie-banner', openBanner)
    }
  }, [])

  const save = useCallback((consent: CookieConsent) => {
    writeCookie(consent)
    if (typeof window !== 'undefined' && (window as any).gtag) {
      ;(window as any).gtag('consent', 'update', {
        analytics_storage: consent.analytics ? 'granted' : 'denied',
        ad_storage: 'denied',
        ad_user_data: 'denied',
        ad_personalization: 'denied',
      })
    }
    window.dispatchEvent(
      new CustomEvent('ob-cookie-consent', { detail: consent }),
    )
    setVisible(false)
    setShowSettings(false)
  }, [])

  const acceptAll = () => save({ necessary: true, analytics: true })
  const rejectAll = () => save({ necessary: true, analytics: false })
  const saveSelection = () => save({ necessary: true, analytics })

  // Reabierto desde footer vs 1ª visita (animación distinta).
  const isReopen = visible && readConsent() !== null

  if (!visible) return null

  const font = { fontFamily: 'ui-monospace, "Courier Prime", monospace' } as const
  const btnBase =
    'px-5 py-2.5 border-[3px] border-[var(--ink)] text-center transition-all'
  const btnOutline = `${btnBase} text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]`
  const btnAccept = `${btnBase} bg-[var(--red)] text-white border-[var(--red)] shadow-[3px_3px_0_0_var(--ink)] hover:translate-y-[1px] hover:shadow-[1px_1px_0_0_var(--ink)]`
  const btnSave = `${btnBase} bg-[var(--yellow)] text-[var(--ink)] shadow-[2px_2px_0_0_var(--ink)] hover:translate-y-[2px] hover:shadow-none`
  const btnStyle = { ...font, fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' as const }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200]"
      role="dialog"
      aria-modal="true"
      aria-label={es ? 'Consentimiento de cookies' : 'Cookie consent'}
    >
      <div
        className={`bg-[var(--paper)] text-[var(--ink)] border-t-[6px] border-[var(--ink)] shadow-[0_-6px_0_rgba(0,0,0,0.12)] ${
          isReopen ? '' : 'motion-safe:animate-[cookie-bar-in_0.35s_ease-out]'
        }`}
      >
        <div className="p-4 sm:p-5 max-w-4xl mx-auto">
          <h3
            className="font-black text-base sm:text-lg uppercase tracking-tight mb-2 text-center sm:text-left"
            style={{ fontFamily: 'system-ui, "Unbounded", sans-serif' }}
          >
            {es ? 'Privacidad y Cookies' : 'Privacy & Cookies'}
          </h3>

          <p
            className="text-[12px] sm:text-[13px] leading-relaxed text-[var(--text-muted)] mb-4 text-center sm:text-left"
            style={font}
          >
            {es
              ? 'Usamos cookies necesarias para que el sitio funcione y cookies analíticas (Google Analytics) para mejorar tu experiencia. '
              : 'We use necessary cookies for the site to work and analytics cookies (Google Analytics) to improve your experience. '}
            <Link
              href={`/${lang}/cookies`}
              className="font-bold underline decoration-[var(--red)] underline-offset-2 hover:text-[var(--red)]"
            >
              {es ? 'Política de cookies' : 'Cookie policy'}
            </Link>
          </p>

          {/* ── settings panel ── */}
          {showSettings && (
            <div className="mb-5 border-[3px] border-[var(--ink)] divide-y-[2px] divide-[var(--ink)]">
              <div className="flex items-center justify-between p-3 sm:p-4">
                <div className="flex-1 pr-4">
                  <p className="font-black text-sm uppercase tracking-tight" style={{ fontFamily: "'Unbounded', sans-serif" }}>
                    {es ? 'Necesarias' : 'Necessary'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1" style={font}>
                    {es
                      ? 'Sesión, idioma, preferencia de cookies. Siempre activas.'
                      : 'Session, language, cookie preferences. Always active.'}
                  </p>
                </div>
                <div
                  className="relative w-12 h-7 rounded-full bg-[var(--ink)] cursor-not-allowed opacity-60 shrink-0"
                  title={es ? 'Siempre activas' : 'Always active'}
                >
                  <div className="absolute right-1 top-1 w-5 h-5 rounded-full bg-[var(--yellow)]" />
                </div>
              </div>

              <div className="flex items-center justify-between p-3 sm:p-4">
                <div className="flex-1 pr-4">
                  <p className="font-black text-sm uppercase tracking-tight" style={{ fontFamily: "'Unbounded', sans-serif" }}>
                    {es ? 'Analíticas' : 'Analytics'}
                  </p>
                  <p className="text-[11px] text-[var(--text-muted)] mt-1" style={font}>
                    {es
                      ? 'Google Analytics: datos anónimos para mejorar el sitio.'
                      : 'Google Analytics: anonymous data to improve the site.'}
                  </p>
                </div>
                <button
                  type="button"
                  role="switch"
                  aria-checked={analytics}
                  onClick={() => setAnalytics((v) => !v)}
                  className={`relative w-12 h-7 rounded-full shrink-0 transition-colors border-2 border-[var(--ink)] ${
                    analytics ? 'bg-[var(--ink)]' : 'bg-[var(--paper-dark)]'
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full transition-transform ${
                      analytics
                        ? 'translate-x-[22px] bg-[var(--yellow)]'
                        : 'translate-x-[3px] bg-[var(--ink)]'
                    }`}
                  />
                </button>
              </div>
            </div>
          )}

          {/* ── buttons ── */}
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2">
            {showSettings ? (
              <button onClick={saveSelection} className={`${btnSave} sm:flex-1`} style={btnStyle}>
                {es ? 'Guardar preferencias' : 'Save preferences'}
              </button>
            ) : (
              <>
                <button onClick={acceptAll} className={`${btnAccept} sm:flex-1`} style={{ ...btnStyle, fontSize: '13px', padding: '12px 16px' }}>
                  {es ? 'Aceptar todas' : 'Accept all'}
                </button>
                <button onClick={rejectAll} className={`${btnOutline} sm:flex-1`} style={btnStyle}>
                  {es ? 'Rechazar' : 'Reject'}
                </button>
                <button
                  onClick={() => setShowSettings(true)}
                  className={`${btnOutline} sm:flex-1`}
                  style={btnStyle}
                >
                  {es ? 'Configurar' : 'Customize'}
                </button>
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
