// ============================================
// OPTIMAL BREAKS — Lang Layout
// Header + Footer + Auth + CookieBanner + PWA
// ============================================

import type { Metadata, Viewport } from 'next'
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
import nextDynamic from 'next/dynamic'
import {
  absoluteOgImage,
  DEFAULT_OG_IMAGE_PATH,
  HOME_OG_IMAGE,
  homeOgImageAlt,
  ogAlternateLocales,
  SITE_URL,
  smartTruncate,
} from '@/lib/seo'

const ChartsPromoModal = nextDynamic(() => import('@/components/ChartsPromoModal'), { ssr: false })
const CookieBanner = nextDynamic(() => import('@/components/CookieBanner'), { ssr: false })
const DeferredFonts = nextDynamic(() => import('@/components/DeferredFonts'), { ssr: false })
const BackToTop = nextDynamic(() => import('@/components/BackToTop'), { ssr: false })
const GoogleAnalytics = nextDynamic(() => import('@/components/GoogleAnalytics'), { ssr: false })
const ServiceWorkerRegistration = nextDynamic(() => import('@/components/ServiceWorkerRegistration'), { ssr: false })

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
  params: Promise<{ lang: Locale }>
}): Promise<Metadata> {
  const { lang } = await params
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
          </LazyDeckAudioProvider>
          <CookieBanner lang={lang} />
          <ChartsPromoModal lang={lang} dict={dict.charts_promo} />
          <ServiceWorkerRegistration />
          <GoogleAnalytics />
        </AuthProvider>
      </body>
    </html>
  )
}
