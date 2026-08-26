// ============================================
// OPTIMAL BREAKS — Lang Layout
// Header + Footer + Auth + CookieBanner + PWA
// ============================================

import type { Metadata, Viewport } from 'next'
import { SpeedInsights } from '@vercel/speed-insights/next'
import '@fontsource/unbounded/latin-700.css'
import '@fontsource/unbounded/latin-900.css'
import unbounded900LatinWoff2 from '@fontsource/unbounded/files/unbounded-latin-900-normal.woff2'
import '../globals.css'
import { i18n, type Locale } from '@/lib/i18n-config'
import { getDictionary } from '@/lib/dictionaries'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import { AuthProvider } from '@/components/AuthProvider'
import LazyDeckAudioProvider from '@/components/LazyDeckAudioProvider'
import ChartsPromoModal from '@/components/ChartsPromoModal'
import CookieBanner from '@/components/CookieBanner'
import DeferredFonts from '@/components/DeferredFonts'
import BackToTop from '@/components/BackToTop'
import AdminCaptureFab from '@/components/AdminCaptureFab'
import GoogleAnalytics from '@/components/GoogleAnalytics'
import ServiceWorkerRegistration from '@/components/ServiceWorkerRegistration'
import {
  absoluteOgImage,
  DEFAULT_OG_IMAGE_PATH,
  HOME_OG_IMAGE,
  homeOgImageAlt,
  ogAlternateLocales,
  SITE_URL,
  smartTruncate,
} from '@/lib/seo'

const GA_MEASUREMENT_ID = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID

/**
 * Consent Mode v2 default in first HTML (must match CookieBanner `ob_consent`).
 * Reads the cookie so returning users are granted before any hit — otherwise
 * GA4 sends a cookieless ping and then a cookied session (two “visits”).
 */
const GA_CONSENT_DEFAULT_SCRIPT = `(function(){window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}window.gtag=gtag;var g='denied';try{var m=document.cookie.match(/(?:^|; )ob_consent=([^;]*)/);if(m){var c=JSON.parse(decodeURIComponent(m[1]));if(c&&c.analytics===true)g='granted'}}catch(e){}gtag('consent','default',{'analytics_storage':g,'ad_storage':'denied','ad_user_data':'denied','ad_personalization':'denied','wait_for_update':500});})();`

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#e8dcc8',
}

export async function generateStaticParams() {
  return i18n.locales.map((locale) => ({ lang: locale }))
}

type SeoRoot = {
  site_name: string
  default_keywords: string
  home: { title: string; description: string }
}

/** Metadatos base por idioma: evita que el layout raíz fije OG solo en inglés. */
export async function generateMetadata({
  params,
}: {
  params: Promise<{ lang: string }>
}): Promise<Metadata> {
  const { lang } = (await params) as { lang: Locale }
  const dict = await getDictionary(lang)
  const seo = dict.seo as SeoRoot
  const home = seo.home
  const url = `${SITE_URL}/${lang}`
  const desc = smartTruncate(home.description, 160)
  const titleFull = `${home.title} | ${seo.site_name}`
  const ogImage = absoluteOgImage(HOME_OG_IMAGE, lang)
  const ogAlt = homeOgImageAlt(lang)

  return {
    description: desc,
    keywords: seo.default_keywords.split(',').map((k) => k.trim()),
    openGraph: {
      type: 'website',
      url,
      title: titleFull,
      description: desc,
      siteName: seo.site_name,
      locale: lang === 'es' ? 'es_ES' : 'en_US',
      alternateLocale: ogAlternateLocales(lang),
      images: [{ url: ogImage, alt: ogAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title: titleFull,
      description: desc,
      images: [ogImage],
    },
  }
}

export default async function LangLayout({
  children,
  params,
}: {
  children: React.ReactNode
  params: Promise<{ lang: string }>
}) {
  const { lang } = (await params) as { lang: Locale }
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
        description:
          lang === 'es'
            ? 'Archivo y referencia del breakbeat: historia, artistas, escenas, sellos y eventos.'
            : 'Breakbeat archive and reference: history, artists, scenes, labels and events.',
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
        <link
          rel="preload"
          href={unbounded900LatinWoff2}
          as="font"
          type="font/woff2"
          crossOrigin="anonymous"
        />
        <link rel="icon" href="/images/favicon_punk_brutalism.png" type="image/png" />
        <link rel="manifest" href="/manifest.json" />
        <link rel="apple-touch-icon" href="/images/favicon_punk_brutalism.png" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        {GA_MEASUREMENT_ID ? (
          <script
            id="ga-consent-default"
            dangerouslySetInnerHTML={{ __html: GA_CONSENT_DEFAULT_SCRIPT }}
          />
        ) : null}
      </head>
      <body>
        <script
          type="application/ld+json"
          dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
        />
        <AuthProvider>
          <DeferredFonts />
          <Header dict={dict} lang={lang} />
          <LazyDeckAudioProvider lang={lang} dict={deckDict}>
            <div className="danger-bar" />
            <main className="relative z-[1] min-w-0 w-full max-w-full">{children}</main>
            <div className="danger-bar" />
            <Footer dict={dict} lang={lang} />
            <BackToTop ariaLabel={dict.a11y.backToTop} />
            <AdminCaptureFab />
          </LazyDeckAudioProvider>
          <CookieBanner lang={lang} />
          <ChartsPromoModal lang={lang} dict={dict.charts_promo} />
          <ServiceWorkerRegistration />
          <GoogleAnalytics />
          <SpeedInsights />
        </AuthProvider>
      </body>
    </html>
  )
}
