// ============================================
// OPTIMAL BREAKS — Cookie Consent Banner
// Secure: SameSite=Lax + Secure in production
// ============================================

'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'

export default function CookieBanner({ lang }: { lang: string }) {
  const [visible, setVisible] = useState(false)

  useEffect(() => {
    const consent = document.cookie.includes('ob_cookie_consent=')
    if (!consent) setVisible(true)

    const openBanner = () => setVisible(true)
    window.addEventListener('ob-open-cookie-banner', openBanner)
    return () => window.removeEventListener('ob-open-cookie-banner', openBanner)
  }, [])

  const setCookieConsent = (value: 'accepted' | 'rejected') => {
    const isSecure = window.location.protocol === 'https:'
    const securePart = isSecure ? ';Secure' : ''
    document.cookie = `ob_cookie_consent=${value};max-age=31536000;path=/;SameSite=Lax${securePart}`
    window.dispatchEvent(new CustomEvent('ob-cookie-consent', { detail: { value } }))
    setVisible(false)
  }

  if (!visible) return null

  const es = lang === 'es'

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-[200] bg-[var(--paper)] text-[var(--ink)] border-t-[6px] border-[var(--ink)] p-5 sm:p-6 flex flex-col sm:flex-row items-start sm:items-center gap-4 sm:gap-6 shadow-[0_-10px_40px_rgba(0,0,0,0.1)]"
      role="dialog"
      aria-label={es ? 'Consentimiento de cookies' : 'Cookie consent'}
    >
      <div className="flex-1 space-y-2">
        <h3 className="font-black text-lg uppercase tracking-tight" style={{ fontFamily: "'Unbounded', sans-serif" }}>
          {es ? 'Privacidad y Cookies' : 'Privacy & Cookies'}
        </h3>
        <p className="text-[13px] leading-relaxed text-[var(--text-muted)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
          {es
            ? 'Utilizamos cookies propias y de terceros (como Google Analytics) para analizar el tráfico, entender cómo interactúas con la web y mejorar tu experiencia. '
            : 'We use our own and third-party cookies (such as Google Analytics) to analyze traffic, understand how you interact with the site, and improve your experience. '}
          <Link href={`/${lang}/cookies`} className="font-bold underline decoration-[var(--red)] underline-offset-2 hover:text-[var(--red)]">
            {es ? 'Política de cookies' : 'Cookie policy'}
          </Link>
        </p>
      </div>
      <div className="flex flex-col sm:flex-row gap-2 shrink-0 w-full sm:w-auto mt-2 sm:mt-0">
        <button
          onClick={() => setCookieConsent('rejected')}
          className="flex-1 sm:flex-none px-4 py-2.5 border-[3px] border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors text-center"
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}
        >
          {es ? 'Denegar' : 'Deny'}
        </button>
        <button
          onClick={() => setCookieConsent('accepted')}
          className="flex-1 sm:flex-none px-5 py-2.5 bg-[var(--yellow)] text-[var(--ink)] border-[3px] border-[var(--ink)] shadow-[2px_2px_0_0_var(--ink)] hover:translate-y-[2px] hover:shadow-none transition-all text-center"
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}
        >
          {es ? 'Aceptar todas' : 'Accept All'}
        </button>
      </div>
    </div>
  )
}
