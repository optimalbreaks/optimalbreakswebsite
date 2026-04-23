// ============================================
// OPTIMAL BREAKS — My account → My Tracks
// Tracks guardados desde los charts (40 Breaks, New Releases, Vinyl Picks).
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import { getDictionary } from '@/lib/dictionaries'
import { detailPageMetadata } from '@/lib/seo'
import UserSectionShell from '@/components/user/UserSectionShell'
import TracksSection from '@/components/user/TracksSection'

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const seo = dict.seo as { site_name: string; default_keywords: string }
  const siteName = seo.site_name
  const defaultKw = seo.default_keywords.split(',').map((k) => k.trim())
  const es = lang === 'es'
  const title = es ? 'Mis tracks' : 'My tracks'
  const description = es
    ? 'Tus temas guardados desde los charts. Escucha, organiza y comparte tu lista.'
    : 'Your saved tracks from the charts. Listen, organize, and share your list.'
  return {
    ...detailPageMetadata(lang, '/mi-cuenta/tracks', siteName, title, description, 'website', null, defaultKw),
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
