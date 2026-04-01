// ============================================
// OPTIMAL BREAKS — Lang Layout
// Header + Footer + Auth + CookieBanner + PWA
// ============================================

import type { Metadata, Viewport } from 'next'
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
import GoogleAnalytics from '@/components/GoogleAnalytics'
import {
  absoluteOgImage,
  DEFAULT_OG_IMAGE_PATH,
  HOME_OG_IMAGE,
  homeOgImageAlt,
  ogAlternateLocales,
  SITE_URL,
  smartTruncate,
} from '@/lib/seo'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#e8dcc8',
}

/** Datos de Supabase y rutas con contenido vivo: cada petición renderiza de nuevo (no HTML del build). */
export const dynamic = 'force-dynamic'

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
          <Header dict={dict} lang={lang} />
          <DeckAudioProvider lang={lang} dict={deckDict}>
            <div className="danger-bar" />
            <main className="relative z-[1] min-w-0 w-full max-w-full">{children}</main>
            <div className="danger-bar" />
            <Footer dict={dict} lang={lang} />
            <BackToTop ariaLabel={dict.a11y.backToTop} />
          </DeckAudioProvider>
          <CookieBanner lang={lang} />
          <ServiceWorkerRegistration />
          <GoogleAnalytics />
        </AuthProvider>
      </body>
    </html>
  )
}
