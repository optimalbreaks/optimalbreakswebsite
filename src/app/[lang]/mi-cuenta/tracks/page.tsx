// ============================================
// OPTIMAL BREAKS — My account → My Tracks
// Tracks guardados desde los charts (40 Breaks, New Releases, Vinyl Picks).
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import UserSectionShell from '@/components/user/UserSectionShell'
import TracksSection from '@/components/user/TracksSection'

export const metadata: Metadata = {
  title: 'My Breaks — My Tracks',
  robots: { index: false, follow: true },
}

export default async function Page({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="tracks">
      <TracksSection lang={lang} />
    </UserSectionShell>
  )
}
