// ============================================
// OPTIMAL BREAKS — Lang Layout
// Header + Footer + CookieBanner + hreflang
// ============================================

import type { Viewport } from 'next'
import '../globals.css'
import { i18n, type Locale } from '@/lib/i18n-config'

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: '#e8dcc8',
}
import { getDictionary } from '@/lib/dictionaries'
import Header from '@/components/Header'
import Footer from '@/components/Footer'
import CookieBanner from '@/components/CookieBanner'

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

  return (
    <html lang={lang}>
      <head>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
        <link rel="alternate" hrefLang="es" href="https://optimalbreaks.com/es" />
        <link rel="alternate" hrefLang="en" href="https://optimalbreaks.com/en" />
        <link rel="alternate" hrefLang="x-default" href="https://optimalbreaks.com/en" />
      </head>
      <body>
        <Header dict={dict} lang={lang} />
        <div className="danger-bar" />
        <main className="relative z-[1]">{children}</main>
        <div className="danger-bar" />
        <Footer dict={dict} lang={lang} />
        <CookieBanner lang={lang} />
      </body>
    </html>
  )
}
