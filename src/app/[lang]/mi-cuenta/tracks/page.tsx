// ============================================
// OPTIMAL BREAKS — My account → My Tracks
// Tracks guardados desde los charts (40 Breaks, New Releases, Vinyl Picks).
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import { getDictionary } from '@/lib/dictionaries'
import { SITE_URL, ogAlternateLocales } from '@/lib/seo'
import UserSectionShell from '@/components/user/UserSectionShell'
import TracksSection from '@/components/user/TracksSection'

const TRACKS_OG_IMAGE = {
  url: `${SITE_URL}/images/opengraph_home_OB.jpg`,
  width: 1024,
  height: 571,
  type: 'image/jpeg',
} as const

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const seo = dict.seo as { site_name: string; default_keywords: string }
  const siteName = seo.site_name
  const defaultKw = seo.default_keywords.split(',').map((k) => k.trim())
  const es = lang === 'es'
  const path = '/mi-cuenta/tracks'
  const url = `${SITE_URL}/${lang}${path}`
  const title = es ? 'Mis tracks' : 'My tracks'
  const description = es
    ? 'Tus temas guardados desde los charts. Escucha, organiza y comparte tu lista.'
    : 'Your saved tracks from the charts. Listen, organize, and share your list.'
  const imageAlt = es
    ? 'Optimal Breaks — cabina DJ con dos platos y mezcladora'
    : 'Optimal Breaks — two-deck DJ mixer artwork'

  return {
    title,
    description,
    keywords: defaultKw,
    alternates: {
      canonical: url,
      languages: {
        es: `${SITE_URL}/es${path}`,
        en: `${SITE_URL}/en${path}`,
        'x-default': `${SITE_URL}/en${path}`,
      },
    },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName,
      locale: lang === 'es' ? 'es_ES' : 'en_US',
      alternateLocale: ogAlternateLocales(lang),
      images: [{ ...TRACKS_OG_IMAGE, alt: imageAlt }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [TRACKS_OG_IMAGE.url],
    },
    robots: { index: false, follow: true },
  }
}

export default async function Page({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="tracks">
      <TracksSection lang={lang} />
    </UserSectionShell>
  )
}
