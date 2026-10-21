// ============================================
// OPTIMAL BREAKS — Login Page
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import LoginForm from './LoginForm'

export const metadata: Metadata = {
  title: 'Login',
  robots: { index: false, follow: true },
}

export default async function LoginPage({
  params,
  searchParams,
}: {
  params: Promise<{ lang: Locale }>
  searchParams: Promise<{ next?: string | string[] }>
}) {
  const { lang } = await params
  const { next } = await searchParams
  const raw = Array.isArray(next) ? next[0] : next
  return <LoginForm lang={lang} nextPath={raw ?? null} />
}
