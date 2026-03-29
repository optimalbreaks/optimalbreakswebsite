// ============================================
// OPTIMAL BREAKS — Google Analytics 4 (gtag.js)
// Implements Consent Mode V2
// ============================================

'use client'

import Script from 'next/script'
import { useEffect, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'
import { readConsent, type CookieConsent } from './CookieBanner'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

declare global {
  interface Window {
    dataLayer: any[]
    gtag: (...args: any[]) => void
  }
}

// Helper para asegurar que gtag existe de forma asíncrona segura
const ensureGtag = () => {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  if (typeof window.gtag !== 'function') {
    window.gtag = function () {
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments)
    }
  }
}

function AnalyticsTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (!GA_ID || typeof window === 'undefined') return

    ensureGtag()

    let path = pathname
    const qs = searchParams.toString()
    if (qs) path += `?${qs}`

    // Como ensureGtag() garantiza que window.gtag existe (y empuja a dataLayer),
    // no necesitamos polling. GA lo procesará cuando su script cargue.
    window.gtag('event', 'page_view', {
      page_path: path,
      page_title: document.title,
      page_location: window.location.href,
    })
  }, [pathname, searchParams])

  return null
}

export default function GoogleAnalytics() {
  useEffect(() => {
    if (!GA_ID) return

    const updateConsent = (granted: boolean) => {
      ensureGtag()
      const status = granted ? 'granted' : 'denied'
      window.gtag('consent', 'update', {
        analytics_storage: status,
        ad_storage: status,
        ad_user_data: status,
        ad_personalization: status,
      })
    }

    // Configurar el estado de consentimiento inicial en base a cookies
    const saved = readConsent()
    if (saved?.analytics) updateConsent(true)

    // Escuchar cambios
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
      <Script id="ga-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          
          // Consent Mode por defecto (denied)
          gtag('consent', 'default', {
            'analytics_storage': 'denied',
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
          });

          // Inicializar GA4 sin page_view automático
          gtag('js', new Date());
          gtag('config', '${GA_ID}', { send_page_view: false });
        `}
      </Script>
      <Script
        src={`https://www.googletagmanager.com/gtag/js?id=${GA_ID}`}
        strategy="afterInteractive"
      />
      <Suspense fallback={null}>
        <AnalyticsTracker />
      </Suspense>
    </>
  )
}