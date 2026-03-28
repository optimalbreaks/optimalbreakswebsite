// ============================================
// OPTIMAL BREAKS — Lang Layout
// Header + Footer + Auth + CookieBanner + PWA
// ============================================

import type { Viewport } from 'next'
import '../globals.css'
import { i18n, type Locale } from '@/lib/i18n-config'
import { getDictionary } from '@/lib/dictionaries'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import CookieBanner from '@/components/CookieBanner'
import { AuthProvider } from '@/components/AuthProvider'
import { DeckAudioProvider } from '@/components/DeckAudioProvider'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import BackToTop from '@/components/BackToTop'
import { DEFAULT_OG_IMAGE_PATH, SITE_URL } from '@/lib/seo'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#e8dcc8',
}

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }))
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: { lang: Locale }
}) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const h = dict.home
  const deckDict = {
    play: h.play,
    stop: h.stop,
    deck_brand: h.deck_brand,
    deck_model: h.deck_model,
    mixer: h.mixer,
    bpm: h.bpm,
    crossfader: h.crossfader,
  }

  const siteName = dict.seo.site_name
  const jsonLd = {
    '@context': 'https://schema.org',
    '@graph': [
      {
        '@type': 'WebSite',
        '@id': `${SITE_URL}/#website`,
        url: SITE_URL,
        name: siteName,
        inLanguage: lang === 'es' ? 'es' : 'en',
        publisher: { '@id': `${SITE_URL}/#organization` },
      },
      {
        '@type': 'Organization',
        '@id': `${SITE_URL}/#organization`,
        name: siteName,
        url: SITE_URL,
        logo: `${SITE_URL}${DEFAULT_OG_IMAGE_PATH}`,
      },
    ],
  }

  return (
    <html lang={lang}>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/icon-192.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AuthProvider>
          <Header dict={dict} lang={lang} />
          <DeckAudioProvider lang={lang} dict={deckDict}>
            <div className="danger-bar" />
            <main className="relative z-[1]">{children}</main>
            <div className="danger-bar" />
            <Footer dict={dict} lang={lang} />
          </DeckAudioProvider>
          <CookieBanner lang={lang} />
          <BackToTop ariaLabel={dict.a11y.backToTop} />
          <ServiceWorkerRegistration />
        </AuthProvider>
      </body>
    </html>
  )
}
