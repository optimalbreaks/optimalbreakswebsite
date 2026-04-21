// ============================================
// OPTIMAL BREAKS — My account → Profile
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import UserSectionShell from '@/components/user/UserSectionShell'
import ProfileSection from '@/components/user/ProfileSection'

export const metadata: Metadata = {
  title: 'My Breaks — Profile',
  robots: { index: false, follow: true },
}

export default async function Page({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="profile">
      <ProfileSection lang={lang} />
    </UserSectionShell>
  )
}
