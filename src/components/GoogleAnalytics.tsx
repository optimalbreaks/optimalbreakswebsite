// ============================================
// OPTIMAL BREAKS — Google Analytics 4 (gtag.js)
// Only loads when analytics consent is granted.
// ============================================

'use client'

import Script from 'next/script'
import { useEffect, useState, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { readConsent, type CookieConsent } from './CookieBanner'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

declare global {
  interface Window {
    dataLayer: any[]
    gtag: (...args: any[]) => void
  }
}

function AnalyticsTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!enabled || typeof window === 'undefined') return

    const sendPageView = () => {
      if (typeof window.gtag !== 'function') return false
      let path = pathname
      const qs = searchParams.toString()
      if (qs) path += `?${qs}`
      window.gtag('event', 'page_view', {
        page_path: path,
        page_title: document.title,
        page_location: window.location.href,
      })
      return true
    }

    if (sendPageView()) return

    const id = window.setInterval(() => {
      if (sendPageView()) window.clearInterval(id)
    }, 50)
    const maxWait = window.setTimeout(() => window.clearInterval(id), 10_000)
    return () => {
      window.clearInterval(id)
      window.clearTimeout(maxWait)
    }
  }, [pathname, searchParams, enabled])

  return null
}

export default function GoogleAnalytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    const saved = readConsent()
    if (saved?.analytics) setEnabled(true)

    const onConsent = (e: Event) => {
      const consent = (e as CustomEvent<CookieConsent>).detail
      if (consent?.analytics) {
        setEnabled(true)
      } else {
        setEnabled(false)
      }
    }
    window.addEventListener('ob-cookie-consent', onConsent)
    return () => window.removeEventListener('ob-cookie-consent', onConsent)
  }, [])

  if (!GA_ID || !enabled) return null

  return (
    <>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { send_page_view: false });
        `}
      </Script>
      <Suspense fallback={null}>
        <AnalyticsTracker enabled={enabled} />
      </Suspense>
    </>
  )
}
