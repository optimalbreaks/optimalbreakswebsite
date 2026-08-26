// ============================================
// OPTIMAL BREAKS — My account → Reviews
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import UserSectionShell from '@/components/user/UserSectionShell'
import ReviewsSection from '@/components/user/ReviewsSection'

export const metadata: Metadata = {
  title: 'My Breaks — Reviews',
  robots: { index: false, follow: true },
}

export default async function Page({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="reviews">
      <ReviewsSection lang={lang} />
    </UserSectionShell>
  )
}
