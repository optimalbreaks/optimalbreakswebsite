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

function AnalyticsTracker() {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (typeof window === 'undefined') return

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

    // Si gtag no está listo aún, reintentar un poco
    const id = window.setInterval(() => {
      if (sendPageView()) window.clearInterval(id)
    }, 50)
    const maxWait = window.setTimeout(() => window.clearInterval(id), 5_000)
    
    return () => {
      window.clearInterval(id)
      window.clearTimeout(maxWait)
    }
  }, [pathname, searchParams])

  return null
}

export default function GoogleAnalytics() {
  useEffect(() => {
    if (!GA_ID) return

    const updateConsent = (granted: boolean) => {
      if (typeof window.gtag === 'function') {
        window.gtag('consent', 'update', {
          analytics_storage: granted ? 'granted' : 'denied',
          ad_storage: granted ? 'granted' : 'denied',
          ad_user_data: granted ? 'granted' : 'denied',
          ad_personalization: granted ? 'granted' : 'denied',
        })
      } else {
        // Fallback si gtag no se ha inicializado
        window.dataLayer = window.dataLayer || []
        window.dataLayer.push('consent', 'update', {
          analytics_storage: granted ? 'granted' : 'denied',
          ad_storage: granted ? 'granted' : 'denied',
          ad_user_data: granted ? 'granted' : 'denied',
          ad_personalization: granted ? 'granted' : 'denied',
        })
      }
    }

    // Configurar el estado de consentimiento inicial en base a cookies
    const saved = readConsent()
    if (saved?.analytics) {
      updateConsent(true)
    }

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
      <Script id="ga-consent" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          
          gtag('consent', 'default', {
            'analytics_storage': 'denied',
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
          });
        `}
      </Script>
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
        <AnalyticsTracker />
      </Suspense>
    </>
  )
}