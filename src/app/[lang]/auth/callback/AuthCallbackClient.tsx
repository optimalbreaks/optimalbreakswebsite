// ============================================
// OPTIMAL BREAKS — PKCE en el cliente
// exchangeCodeForSession en el navegador usa el mismo almacén de cookies
// que resetPasswordForEmail / signUp; el Route Handler a veces fallaba en prod.
// ============================================

'use client'

import { Suspense, useEffect, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase'
import { isSafeAppPath, normalizeRelativeNext } from '@/lib/auth-callback'
import { i18n, type Locale } from '@/lib/i18n-config'

function AuthCallbackInner({ lang }: { lang: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [note, setNote] = useState('')

  const validLang = i18n.locales.includes(lang as Locale) ? lang : i18n.defaultLocale

  useEffect(() => {
    const run = async () => {
      const code = searchParams.get('code')
      const normalized = normalizeRelativeNext(searchParams.get('next'))
      const next =
        normalized && isSafeAppPath(normalized) ? normalized : `/${validLang}/login`

      if (!code) {
        router.replace(`/${validLang}/login?auth_error=true`)
        return
      }

      setNote(validLang === 'es' ? 'Confirmando sesión…' : 'Confirming session…')

      const supabase = createBrowserSupabase()
      const { error } = await supabase.auth.exchangeCodeForSession(code)

      if (error) {
        console.error('[OB auth/callback]', error.message)
        router.replace(`/${validLang}/login?auth_error=true`)
        return
      }

      router.replace(next)
    }

    void run()
  }, [router, searchParams, validLang])

  return (
    <div className="lined min-h-screen flex items-center justify-center px-4 py-16">
      <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', color: 'var(--text-muted)' }}>
        {note || (validLang === 'es' ? 'Cargando…' : 'Loading…')}
      </p>
    </div>
  )
}

export default function AuthCallbackClient({ lang }: { lang: string }) {
  return (
    <Suspense
      fallback={
        <div className="lined min-h-screen flex items-center justify-center px-4 py-16">
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }}>…</p>
        </div>
      }
    >
      <AuthCallbackInner lang={lang} />
    </Suspense>
  )
}
