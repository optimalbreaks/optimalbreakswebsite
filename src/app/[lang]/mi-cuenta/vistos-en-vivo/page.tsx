// ============================================
// OPTIMAL BREAKS — My account → Seen Live
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import UserSectionShell from '@/components/user/UserSectionShell'
import SightingsSection from '@/components/user/SightingsSection'

export const metadata: Metadata = {
  title: 'My Breaks — Seen Live',
  robots: { index: false, follow: true },
}

export default async function Page({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="sightings">
      <SightingsSection lang={lang} />
    </UserSectionShell>
  )
}
