'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'

export type CookieConsent = {
  necessary: true
  analytics: boolean
  functional: boolean
  marketing: boolean
}

/** Nombre fijo: el script de Consent Mode en `[lang]/layout.tsx` lee la misma cookie. */
const COOKIE_NAME = 'ob_consent'
const COOKIE_MAX_AGE = 34_164_000 // ~13 months (EU max)
/** Espera antes de mostrar el banner en 1ª visita (LCP = hero, no este texto). */
const CONSENT_SHOW_DELAY_MS = 4500
/** Margen tras registrar LCP antes de abrir el banner. */
const CONSENT_AFTER_LCP_MS = 600

const ALL_ON: CookieConsent = { necessary: true, analytics: true, functional: true, marketing: true }
const ONLY_NECESSARY: CookieConsent = { necessary: true, analytics: false, functional: false, marketing: false }

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
    const parsed = JSON.parse(decodeURIComponent(match[1])) as Partial<CookieConsent>
    return {
      necessary: true,
      analytics: Boolean(parsed.analytics),
      functional: Boolean(parsed.functional),
      marketing: Boolean(parsed.marketing),
    }
  } catch {
    return null
  }
}

function applyGtag(consent: CookieConsent) {
  if (typeof window === 'undefined' || !(window as any).gtag) return
  const ads = consent.marketing ? 'granted' : 'denied'
  ;(window as any).gtag('consent', 'update', {
    analytics_storage: consent.analytics ? 'granted' : 'denied',
    ad_storage: ads,
    ad_user_data: ads,
    ad_personalization: ads,
  })
}

function CookieGlyph({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path d="M12 2a9.5 9.5 0 0 0-1.2 18.93A10 10 0 1 0 21.8 11.4 7 7 0 0 1 12 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
      <circle cx="8.2" cy="10" r="1.1" fill="currentColor" />
      <circle cx="12.5" cy="8" r="1" fill="currentColor" />
      <circle cx="10.5" cy="14.2" r="1.15" fill="currentColor" />
    </svg>
  )
}

export default function CookieBanner({ lang }: { lang: string }) {
  const es = lang === 'es'
  const [visible, setVisible] = useState(false)
  const [showSettings, setShowSettings] = useState(false)
  const [prefs, setPrefs] = useState<CookieConsent>(ALL_ON)

  useEffect(() => {
    const saved = readConsent()
    if (saved) {
      setPrefs(saved)
      applyGtag(saved)
    }

    const openBanner = () => {
      const current = readConsent()
      if (current) setPrefs(current)
      setShowSettings(true)
      setVisible(true)
    }
    window.addEventListener('ob-open-cookie-banner', openBanner)

    if (saved) {
      return () => window.removeEventListener('ob-open-cookie-banner', openBanner)
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
    applyGtag(consent)
    window.dispatchEvent(new CustomEvent('ob-cookie-consent', { detail: consent }))
    setPrefs(consent)
    setVisible(false)
    setShowSettings(false)
  }, [])

  const acceptAll = () => save(ALL_ON)
  const rejectAll = () => save(ONLY_NECESSARY)
  const saveSelection = () => save(prefs)

  if (!visible) return null

  const accent = 'var(--red)'

  if (showSettings) {
    return (
      <div className="fixed inset-0 z-[210] flex items-center justify-center p-4 bg-black/50" role="dialog" aria-modal="true" aria-labelledby="cookie-settings-title">
        <div className="bg-white rounded-2xl shadow-xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex items-center gap-3">
              <CookieGlyph className="h-8 w-8" />
              <h2 id="cookie-settings-title" className="text-xl font-bold text-gray-900">
                {es ? 'Configuración de cookies' : 'Cookie settings'}
              </h2>
            </div>
            <button
              type="button"
              onClick={() => {
                setShowSettings(false)
                if (readConsent()) setVisible(false)
              }}
              className="p-2 text-gray-400 hover:text-gray-600 hover:bg-gray-100 rounded-lg"
              aria-label={es ? 'Cerrar' : 'Close'}
            >
              <span className="block w-5 h-5 text-lg leading-none">×</span>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-6">
            <p className="text-gray-600 mb-6">
              {es
                ? 'Elige qué tipos de cookies deseas aceptar. Las cookies necesarias no se pueden desactivar ya que son imprescindibles para el funcionamiento del sitio.'
                : 'Choose which cookies to accept. Necessary cookies cannot be turned off because they are essential for the site to work.'}
            </p>
            <div className="space-y-4">
              <ObCategory
                title={es ? 'Cookies necesarias' : 'Necessary cookies'}
                description={es ? 'Estas cookies son esenciales para el funcionamiento del sitio web. Sin ellas, el sitio no funcionaría correctamente.' : 'These cookies are essential for the website to work. Without them, the site would not function correctly.'}
                enabled
                required
                alwaysOn={es ? 'Siempre activas' : 'Always on'}
                accent={accent}
              />
              <ObCategory
                title={es ? 'Cookies analíticas' : 'Analytics cookies'}
                description={es ? 'Nos permiten contar las visitas y analizar cómo los usuarios navegan por el sitio para mejorarlo (Google Analytics).' : 'Allow us to count visits and analyse how users browse the site (Google Analytics).'}
                enabled={prefs.analytics}
                onChange={(v) => setPrefs((p) => ({ ...p, analytics: v }))}
                accent={accent}
              />
              <ObCategory
                title={es ? 'Cookies funcionales' : 'Functional cookies'}
                description={es ? 'Permiten recordar tus preferencias para una experiencia más personalizada.' : 'Remember your preferences for a more personalised experience.'}
                enabled={prefs.functional}
                onChange={(v) => setPrefs((p) => ({ ...p, functional: v }))}
                accent={accent}
              />
              <ObCategory
                title={es ? 'Cookies de marketing' : 'Marketing cookies'}
                description={es ? 'Se utilizan para mostrarte anuncios relevantes y medir la efectividad de las campañas publicitarias.' : 'Used to show you relevant ads and measure the effectiveness of advertising campaigns.'}
                enabled={prefs.marketing}
                onChange={(v) => setPrefs((p) => ({ ...p, marketing: v }))}
                accent={accent}
              />
            </div>
            <p className="text-sm text-gray-500 mt-6">
              {es ? 'Para más información sobre cómo utilizamos las cookies, consulta nuestra' : 'For more information on how we use cookies, see our'}{' '}
              <Link href={`/${lang}/cookies`} className="hover:underline" style={{ color: accent }} onClick={() => { setShowSettings(false); setVisible(false) }}>
                {es ? 'Política de Cookies' : 'Cookie policy'}
              </Link>
              .
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 p-6 border-t border-gray-200 bg-gray-50">
            <button type="button" onClick={rejectAll} className="flex-1 px-4 py-2.5 text-gray-700 border border-gray-300 rounded-lg font-medium hover:bg-white">
              {es ? 'Rechazar todas' : 'Reject all'}
            </button>
            <button type="button" onClick={saveSelection} className="flex-1 px-4 py-2.5 text-gray-700 bg-white border border-gray-300 rounded-lg font-medium hover:bg-gray-50">
              {es ? 'Guardar preferencias' : 'Save preferences'}
            </button>
            <button type="button" onClick={acceptAll} className="flex-1 px-4 py-2.5 text-white rounded-lg font-medium" style={{ backgroundColor: accent }}>
              {es ? 'Aceptar todas' : 'Accept all'}
            </button>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-[200] p-4 bg-white border-t border-gray-200 shadow-lg md:p-6" role="region" aria-label={es ? 'Banner de consentimiento de cookies' : 'Cookie consent banner'}>
      <div className="container mx-auto max-w-6xl">
        <div className="flex flex-col md:flex-row md:items-center gap-4 md:gap-6">
          <div className="flex-1 flex items-start gap-3">
            <CookieGlyph className="h-8 w-8 flex-shrink-0 mt-1" />
            <div>
              <h3 className="text-lg font-bold text-gray-900 mb-1">{es ? 'Utilizamos cookies' : 'We use cookies'}</h3>
              <p className="text-gray-600 text-sm">
                {es
                  ? 'Usamos cookies propias y de terceros para mejorar tu experiencia, analizar el tráfico y mostrarte contenido personalizado. Puedes aceptar todas o configurar tus preferencias. '
                  : 'We use our own and third-party cookies to improve your experience, analyse traffic and show you personalised content. You can accept all or set your preferences. '}
                <Link href={`/${lang}/cookies`} className="hover:underline" style={{ color: accent }}>
                  {es ? 'Política de cookies' : 'Cookie policy'}
                </Link>
              </p>
            </div>
          </div>
          <div className="flex flex-col sm:flex-row gap-2 sm:gap-3 flex-shrink-0">
            <button type="button" onClick={() => setShowSettings(true)} className="px-4 py-2 text-gray-700 bg-gray-100 rounded-lg font-medium hover:bg-gray-200 text-sm">
              {es ? 'Configurar' : 'Settings'}
            </button>
            <button type="button" onClick={acceptAll} className="px-4 py-2 text-white rounded-lg font-medium text-sm" style={{ backgroundColor: accent }}>
              {es ? 'Aceptar todas' : 'Accept all'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

function ObCategory({
  title,
  description,
  enabled,
  required,
  alwaysOn,
  onChange,
  accent,
}: {
  title: string
  description: string
  enabled: boolean
  required?: boolean
  alwaysOn?: string
  onChange?: (v: boolean) => void
  accent: string
}) {
  return (
    <div className="p-4 rounded-xl border-2" style={enabled ? { borderColor: accent, backgroundColor: 'rgba(227, 30, 36, 0.05)' } : { borderColor: '#e5e7eb', backgroundColor: '#f9fafb' }}>
      <div className="flex items-start gap-4">
        <div className="flex-1">
          <div className="flex items-center justify-between gap-3 mb-1">
            <h3 className="font-semibold text-gray-900">{title}</h3>
            {required ? (
              <span className="text-xs bg-gray-200 text-gray-600 px-2 py-1 rounded-full whitespace-nowrap">{alwaysOn}</span>
            ) : (
              <label className="relative inline-flex items-center cursor-pointer">
                <input type="checkbox" className="sr-only peer" checked={enabled} onChange={(e) => onChange?.(e.target.checked)} aria-label={title} />
                <span className="w-11 h-6 bg-gray-200 rounded-full peer-checked:bg-[var(--red)] transition-colors" />
                <span className="absolute left-0.5 top-0.5 w-5 h-5 bg-white rounded-full border border-gray-300 shadow transition-transform peer-checked:translate-x-5" />
              </label>
            )}
          </div>
          <p className="text-sm text-gray-600">{description}</p>
        </div>
      </div>
    </div>
  )
}
