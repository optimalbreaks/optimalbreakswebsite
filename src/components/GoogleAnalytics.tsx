// ============================================
// OPTIMAL BREAKS — Google Analytics 4
// Consent Mode V2 + explicit SPA page_view tracking
// ============================================

'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { readConsent, type CookieConsent } from './CookieBanner'

declare global {
  interface Window {
    dataLayer?: Record<string, unknown>[]
    gtag?: (...args: unknown[]) => void
  }
}

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

/**
 * @next/third-parties/google GoogleAnalytics only injects gtag.js + gtag('config')
 * but does NOT track client-side navigations in App Router.
 * We handle everything here: consent default → gtag.js load → config (with
 * send_page_view:false) → explicit page_view on every route change including first.
 */
export default function GoogleAnalytics() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!GA_ID || typeof window.gtag !== 'function') return

    const url = pathname + (searchParams?.toString() ? `?${searchParams}` : '')
    window.gtag('event', 'page_view', {
      page_path: url,
      page_location: window.location.origin + url,
      page_title: document.title,
    })
  }, [pathname, searchParams])

  // Consent updates (initial read + banner interaction)
  useEffect(() => {
    if (!GA_ID) return

    const updateConsent = (granted: boolean) => {
      if (typeof window.gtag !== 'function') return
      const status = granted ? 'granted' : 'denied'
      window.gtag('consent', 'update', {
        analytics_storage: status,
        ad_storage: status,
        ad_user_data: status,
        ad_personalization: status,
      })
    }

    const saved = readConsent()
    if (saved?.analytics) updateConsent(true)

    const onConsent = (e: Event) => {
      const consent = (e as CustomEvent<CookieConsent>).detail
      updateConsent(consent?.analytics === true)
    }

    window.addEventListener('ob-cookie-consent', onConsent)
    return () => window.removeEventListener('ob-cookie-consent', onConsent)
  }, [])

  if (!GA_ID) return null

  return (
    <>
      {/* 1. Consent Mode v2 defaults — MUST run before gtag.js loads */}
      <Script id="ga-consent-default" strategy="beforeInteractive">
        {`window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('consent','default',{'analytics_storage':'denied','ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied'});`}
      </Script>

      {/* 2. Load gtag.js */}
      <Script
        id="ga-gtag"
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />

      {/* 3. Configure GA4 — send_page_view:false because we fire page_view explicitly via usePathname */}
      <Script id="ga-config" strategy="afterInteractive">
        {`window.dataLayer=window.dataLayer||[];if(!window.gtag){function gtag(){dataLayer.push(arguments);}window.gtag=gtag;}gtag('js',new Date());gtag('config','${GA_ID}',{send_page_view:false});`}
      </Script>
    </>
  )
}
