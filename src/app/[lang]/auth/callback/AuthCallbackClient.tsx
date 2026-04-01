'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase'
import { isSafeAppPath, normalizeRelativeNext } from '@/lib/auth-callback'
import { i18n, type Locale } from '@/lib/i18n-config'

function AuthCallbackInner({ lang }: { lang: string }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [note, setNote] = useState('')
  const handled = useRef(false)

  const validLang = i18n.locales.includes(lang as Locale) ? lang : i18n.defaultLocale

  useEffect(() => {
    if (handled.current) return
    handled.current = true

    const normalized = normalizeRelativeNext(searchParams.get('next'))
    const nextParam =
      normalized && isSafeAppPath(normalized) ? normalized : `/${validLang}/login`

    setNote(validLang === 'es' ? 'Confirmando sesión…' : 'Confirming session…')

    const supabase = createBrowserSupabase()

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' && session) {
        subscription.unsubscribe()
        router.replace(`/${validLang}/reset-password`)
        return
      }

      if ((event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED') && session) {
        subscription.unsubscribe()
        router.replace(nextParam)
        return
      }
    })

    const timeout = setTimeout(() => {
      subscription.unsubscribe()
      router.replace(`/${validLang}/login?auth_error=timeout`)
    }, 10000)

    return () => {
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
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
