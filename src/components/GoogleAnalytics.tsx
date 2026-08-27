'use client'

import { GoogleAnalytics as NextGoogleAnalytics } from '@next/third-parties/google'

const GA_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

/**
 * Consent Mode v2 lives in [lang]/layout.tsx (first HTML).
 * CookieBanner updates gtag on accept/reject.
 * App Router pageviews: GA4 Enhanced Measurement (history changes).
 */
export default function GoogleAnalytics() {
  if (!GA_ID) return null
  return <NextGoogleAnalytics gaId={GA_ID} />
}
