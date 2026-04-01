// ============================================
// OPTIMAL BREAKS — Restablecer contraseña
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import ResetPasswordForm from './ResetPasswordForm'

export const metadata: Metadata = {
  title: 'Restablecer contraseña',
  robots: { index: false, follow: true },
}

export default async function ResetPasswordPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  return <ResetPasswordForm lang={lang} />
}
