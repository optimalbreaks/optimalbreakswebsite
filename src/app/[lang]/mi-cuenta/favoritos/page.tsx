// ============================================
// OPTIMAL BREAKS — My account → Favorites
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import UserSectionShell from '@/components/user/UserSectionShell'
import FavoritesSection from '@/components/user/FavoritesSection'

export const metadata: Metadata = {
  title: 'My Breaks — Favorites',
  robots: { index: false, follow: true },
}

export default async function Page({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="favorites">
      <FavoritesSection lang={lang} />
    </UserSectionShell>
  )
}
