// ============================================
// OPTIMAL BREAKS — Dashboard (Server entry)
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import DashboardClient from './DashboardClient'

export const metadata: Metadata = {
  title: 'My Breaks',
  robots: { index: false, follow: true },
}

export default async function DashboardPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  return <DashboardClient lang={lang} />
}
