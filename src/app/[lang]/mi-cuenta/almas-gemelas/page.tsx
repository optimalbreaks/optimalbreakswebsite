// ============================================
// OPTIMAL BREAKS — My account → Soulmates ("Almas Gemelas")
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import { SITE_URL, ogAlternateLocales } from '@/lib/seo'
import UserSectionShell from '@/components/user/UserSectionShell'
import SoulmatesSection from '@/components/user/SoulmatesSection'

// Open Graph propio: sin él, la página heredaba el OG de la home (título de la
// portada + og:url de la home), y al compartir el enlace la vista previa salía
// genérica. Sigue en noindex (página de cuenta), pero el share luce bien.
export async function generateMetadata({ params }: { params: Promise<{ lang: Locale }> }): Promise<Metadata> {
  const { lang } = await params
  const es = lang === 'es'
  const url = `${SITE_URL}/${lang}/mi-cuenta/almas-gemelas`
  const title = es ? 'Almas Gemelas — My Breaks' : 'Soulmates — My Breaks'
  const description = es
    ? 'Encuentra tus almas gemelas breakbeaters: usuarios que más coinciden con tu lista de tracks y las canciones que te estás perdiendo.'
    : 'Find your breakbeat soulmates: the users whose track lists overlap yours the most, plus the tracks you’re missing.'
  const image = `${SITE_URL}/images/opengraph_almas_gemelas.jpg`
  return {
    title,
    description,
    robots: { index: false, follow: true },
    openGraph: {
      type: 'website',
      url,
      title,
      description,
      siteName: 'Optimal Breaks',
      locale: es ? 'es_ES' : 'en_US',
      alternateLocale: ogAlternateLocales(lang),
      images: [{ url: image, width: 1200, height: 630, alt: es ? 'Encuentra tus almas gemelas — Optimal Breaks' : 'Find your soulmates — Optimal Breaks' }],
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description,
      images: [image],
    },
  }
}

export default async function Page({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="soulmates">
      <SoulmatesSection lang={lang} />
    </UserSectionShell>
  )
}
