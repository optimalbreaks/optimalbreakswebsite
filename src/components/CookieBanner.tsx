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
      className="fixed bottom-0 left-0 right-0 z-[200] bg-[var(--ink)] border-t-4 border-[var(--red)] p-4 sm:p-5 flex flex-col sm:flex-row items-start sm:items-center gap-3 sm:gap-5"
      role="dialog"
      aria-label={es ? 'Consentimiento de cookies' : 'Cookie consent'}
    >
      <p className="flex-1 text-[var(--paper)]" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', lineHeight: 1.6, letterSpacing: '0.5px' }}>
        {es
          ? '🍪 Usamos cookies técnicas y analíticas para mejorar tu experiencia. '
          : '🍪 We use technical and analytics cookies to improve your experience. '}
        <Link href={`/${lang}/cookies`} className="underline text-[var(--yellow)] hover:text-white">
          {es ? 'Más info' : 'Learn more'}
        </Link>
      </p>
      <div className="flex gap-2 shrink-0 w-full sm:w-auto">
        <button
          onClick={() => setCookieConsent('rejected')}
          className="flex-1 sm:flex-none px-2 sm:px-4 py-2 border-2 border-white/20 text-white/60 hover:border-white hover:text-white transition-all text-center"
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}
        >
          {es ? 'RECHAZAR' : 'REJECT'}
        </button>
        <button
          onClick={() => setCookieConsent('accepted')}
          className="flex-1 sm:flex-none px-2 sm:px-4 py-2 bg-[var(--yellow)] text-[var(--ink)] border-2 border-[var(--yellow)] hover:bg-[var(--red)] hover:border-[var(--red)] hover:text-white transition-all text-center"
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}
        >
          {es ? 'ACEPTAR' : 'ACCEPT'}
        </button>
      </div>
    </div>
  )
}
