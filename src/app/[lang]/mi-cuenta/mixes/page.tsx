// ============================================
// OPTIMAL BREAKS — My account → Saved Mixes
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import UserSectionShell from '@/components/user/UserSectionShell'
import MixesSection from '@/components/user/MixesSection'

export const metadata: Metadata = {
  title: 'My Breaks — Saved Mixes',
  robots: { index: false, follow: true },
}

export default async function Page({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="mixes">
      <MixesSection lang={lang} />
    </UserSectionShell>
  )
}
