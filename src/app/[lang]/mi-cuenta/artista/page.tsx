// ============================================
// OPTIMAL BREAKS — My account → Artist
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import UserSectionShell from '@/components/user/UserSectionShell'
import ArtistSection from '@/components/user/ArtistSection'

export const metadata: Metadata = {
  title: 'My Breaks — Artist',
  robots: { index: false, follow: true },
}

export default async function Page({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="artist">
      <ArtistSection lang={lang} />
    </UserSectionShell>
  )
}
