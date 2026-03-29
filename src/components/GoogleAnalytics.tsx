// ============================================
// OPTIMAL BREAKS — Google Analytics 4 (gtag.js)
// Implementación estricta: solo carga tras consentimiento.
// ============================================

'use client'

import Script from 'next/script'
import { useEffect, useState, Suspense } from 'react'
import { usePathname, useSearchParams } from 'next/navigation'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

function AnalyticsTracker({ enabled }: { enabled: boolean }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()

  useEffect(() => {
    if (enabled && typeof window !== 'undefined' && typeof (window as any).gtag === 'function') {
      const url = pathname + searchParams.toString()
      ;(window as any).gtag('config', GA_ID, {
        page_path: url,
      })
    }
  }, [pathname, searchParams, enabled])

  return null
}

export default function GoogleAnalytics() {
  const [enabled, setEnabled] = useState(false)

  useEffect(() => {
    // Verificar estado inicial
    if (typeof document !== 'undefined' && document.cookie.includes('ob_cookie_consent=accepted')) {
      setEnabled(true)
    }

    // Escuchar el evento de aceptación
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
      <Script id="google-analytics-init" strategy="afterInteractive">
        {`
          window.dataLayer = window.dataLayer || [];
          function gtag(){dataLayer.push(arguments);}
          // Definir gtag en window explícitamente por si acaso
          window.gtag = gtag;
          
          gtag('js', new Date());
          gtag('config', '${GA_ID}', {
            page_path: window.location.pathname,
          });
        `}
      </Script>
      <Suspense fallback={null}>
        <AnalyticsTracker enabled={enabled} />
      </Suspense>
    </>
  )
}
