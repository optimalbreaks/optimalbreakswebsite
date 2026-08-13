// ============================================
// OPTIMAL BREAKS — Google Analytics 4
// Consent Mode V2 + explicit SPA page_view tracking
// ============================================

'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { usePathname } from 'next/navigation'
import { type CookieConsent } from './CookieBanner'

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
    gtag?: (...args: unknown[]) => void
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

/**
 * Dedupe across remounts (React Strict Mode, next/dynamic, Suspense).
 * Same path within this window = one page_view, not two.
 * A → B → A still counts: last path is B, then A is sent again.
 */
let lastSentPath = ''
let lastSentAt = 0
const PAGE_VIEW_DEDUPE_MS = 2000

function sendPageView(pathname: string) {
  if (!GA_ID || typeof window.gtag !== 'function') return
  const now = Date.now()
  if (lastSentPath === pathname && now - lastSentAt < PAGE_VIEW_DEDUPE_MS) return
  lastSentPath = pathname
  lastSentAt = now

  window.gtag('event', 'page_view', {
    page_title: document.title,
    page_location: window.location.href,
    page_path: pathname,
  })
}

/**
 * Custom gtag (not @next/third-parties): that helper only injects gtag.js +
 * gtag('config') and does not track App Router client navigations.
 *
 * send_page_view:false — we fire page_view ourselves on pathname change.
 * Consent default lives in [lang]/layout.tsx <head> (cookie-aware) so a
 * returning visitor is not counted twice (denied ping, then granted session).
 */
export default function GoogleAnalytics() {
  const pathname = usePathname()

  useEffect(() => {
    sendPageView(pathname)
  }, [pathname])

  useEffect(() => {
    if (!GA_ID) return

    const onConsent = (e: Event) => {
      if (typeof window.gtag !== 'function') return
      const consent = (e as CustomEvent<CookieConsent>).detail
      window.gtag('consent', 'update', {
        analytics_storage: consent?.analytics === true ? 'granted' : 'denied',
      })
    }

    window.addEventListener('ob-cookie-consent', onConsent)
    return () => window.removeEventListener('ob-cookie-consent', onConsent)
  }, [])

  if (!GA_ID) return null

  return (
    <>
      {/* Config must be in dataLayer before gtag.js processes the ?id= auto-config */}
      <Script id="ga-config" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];if(!window.gtag){function gtag(){dataLayer.push(arguments);}window.gtag=gtag;}gtag('js',new Date());gtag('config','${GA_ID}',{send_page_view:false});`}
      </Script>
      <Script
        id="ga-gtag"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
        onLoad={() => sendPageView(pathname)}
      />
    </>
  )
}
