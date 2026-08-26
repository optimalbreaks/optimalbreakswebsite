// ============================================
// OPTIMAL BREAKS — My account → Soulmates ("Almas Gemelas")
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import UserSectionShell from '@/components/user/UserSectionShell'
import SoulmatesSection from '@/components/user/SoulmatesSection'

export const metadata: Metadata = {
  title: 'My Breaks — Soulmates',
  robots: { index: false, follow: true },
}

export default async function Page({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="soulmates">
      <SoulmatesSection lang={lang} />
    </UserSectionShell>
  )
}
