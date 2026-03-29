// ============================================
// OPTIMAL BREAKS — Google Analytics 4 (gtag.js)
// Solo carga si hay NEXT_PUBLIC_GA_MEASUREMENT_ID y consentimiento analítico.
// ============================================

'use client'

import Script from 'next/script'
import { useEffect, useState } from 'react'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

function cookieHasAnalyticsConsent(): boolean {
  if (typeof document === 'undefined') return false
  return document.cookie.includes('ob_cookie_consent=accepted')
}

export default function GoogleAnalytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    if (cookieHasAnalyticsConsent()) setEnabled(true)
    const onConsent = (e: Event) => {
      const v = (e as CustomEvent<{ value?: string }>).detail?.value
      if (v === 'accepted') setEnabled(true)
    }
    window.addEventListener('ob-cookie-consent', onConsent)
    return () => window.removeEventListener('ob-cookie-consent', onConsent)
  }, [])

  if (!GA_ID || !enabled) return null

  return (
    <>
      <Script src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`} strategy="afterInteractive" />
      <Script id="google-analytics-gtag" strategy="afterInteractive">
        {`
window.dataLayer=window.dataLayer||[];
function gtag(){dataLayer.push(arguments);}
gtag('js',new Date());
gtag('config','${GA_ID}');
        `.trim()}
      </Script>
    </>
  )
}
