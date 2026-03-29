// ============================================
// OPTIMAL BREAKS — Google Analytics 4
// Implements Consent Mode V2 via @next/third-parties/google
// ============================================

'use client'

import Script from 'next/script'
import { useEffect } from 'react'
import { readConsent, type CookieConsent } from './CookieBanner'
import { GoogleAnalytics as NextGoogleAnalytics } from '@next/third-parties/google'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

// No ampliar Window.dataLayer aquí: @next/third-parties/google ya declara `dataLayer?: Object[]`;
// duplicarla con otro modificador rompe el build de TypeScript.

// Helper para asegurar que gtag existe en el entorno cliente
const ensureGtag = () => {
  if (typeof window === 'undefined') return
  window.dataLayer = window.dataLayer || []
  if (typeof window.gtag !== 'function') {
    window.gtag = function () {
      window.dataLayer ??= []
      // eslint-disable-next-line prefer-rest-params
      window.dataLayer.push(arguments as unknown as object)
    }
  }
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

    // Escuchar cambios interactivos del banner
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
          
          // Consent Mode v2 por defecto
          gtag('consent', 'default', {
            'analytics_storage': 'denied',
            'ad_storage': 'denied',
            'ad_user_data': 'denied',
            'ad_personalization': 'denied',
          });
        `}
      </Script>
      {/* Componente oficial de Next.js. Gestiona gtag.js y el tracking automático de page_views en App Router */}
      <NextGoogleAnalytics gaId={GA_ID} />
    </>
  )
}
