// ============================================
// OPTIMAL BREAKS — My account → Events (attendance)
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import UserSectionShell from '@/components/user/UserSectionShell'
import EventsSection from '@/components/user/EventsSection'

export const metadata: Metadata = {
  title: 'My Breaks — Events',
  robots: { index: false, follow: true },
}

export default async function Page({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  return (
    <UserSectionShell lang={lang} section="events">
      <EventsSection lang={lang} />
    </UserSectionShell>
  )
}
