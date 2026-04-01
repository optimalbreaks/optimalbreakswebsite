// ============================================
// OPTIMAL BREAKS — Auth callback (página cliente PKCE)
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import AuthCallbackClient from './AuthCallbackClient'

export const metadata: Metadata = {
  title: 'Auth',
  robots: { index: false, follow: false },
}

export default async function AuthCallbackPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params
  return <AuthCallbackClient lang={lang} />
}
