// ============================================
// OPTIMAL BREAKS — Restablecer contraseña
// ============================================

import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import { Suspense } from 'react'
import ResetPasswordForm from './ResetPasswordForm'

export const metadata: Metadata = {
  title: 'Restablecer contraseña',
  robots: { index: false, follow: true },
}

export default async function ResetPasswordPage({ params }: { params: Promise<{ lang: Locale }> }) {
  const { lang } = await params
  return (
    <Suspense
      fallback={
        <div className="lined min-h-screen flex items-center justify-center px-4 py-16">
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }}>…</p>
        </div>
      }
    >
      <ResetPasswordForm lang={lang} />
    </Suspense>
  )
}
