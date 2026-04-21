// ============================================
// OPTIMAL BREAKS — Dashboard (Overview)
// Resumen + Breakbeat DNA. El resto de secciones vive en /mi-cuenta/*
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import UserSectionShell from '@/components/user/UserSectionShell'
import OverviewSection from '@/components/user/OverviewSection'
import DashboardLegacyRedirect from './DashboardLegacyRedirect'

export const metadata: Metadata = {
  title: 'My Breaks',
  robots: { index: false, follow: true },
}

function Fallback() {
  return (
    <div className="min-h-[60vh] flex items-center justify-center">
      <div
        className="w-16 h-16 rounded-full border-4 border-[var(--ink)] border-t-[var(--red)]"
        style={{ animation: 'spin 1s linear infinite' }}
      />
    </div>
  )
}

export default async function DashboardPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  return (
    <Suspense fallback={<Fallback />}>
      <DashboardLegacyRedirect lang={lang} />
      <UserSectionShell lang={lang} section="overview">
        <OverviewSection lang={lang} />
      </UserSectionShell>
    </Suspense>
  )
}
