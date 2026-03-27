// ============================================
// OPTIMAL BREAKS — Lang Layout (Header + Footer + hreflang)
// ============================================

import '../globals.css'
import { i18n, type Locale } from '@/lib/i18n-config'
import { getDictionary } from '@/lib/dictionaries'
import Header from '@/components/Header'
import Footer from '@/components/Footer'

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
  const otherLang = lang === 'es' ? 'en' : 'es'

  return (
    <html lang={lang}>
      <head>
        {/* Hreflang for SEO — tells Google about both language versions */}
        <link rel="alternate" hrefLang="es" href="https://optimalbreaks.com/es" />
        <link rel="alternate" hrefLang="en" href="https://optimalbreaks.com/en" />
        <link rel="alternate" hrefLang="x-default" href="https://optimalbreaks.com/en" />
      </head>
      <body>
        <Header dict={dict} lang={lang} />
        <div className="danger-bar" />
        <main>{children}</main>
        <div className="danger-bar" />
        <Footer dict={dict} />
      </body>
    </html>
  )
}
