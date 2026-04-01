'use client'

import { Suspense, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase'
import {
  isSafeAppPath,
  normalizeRelativeNext,
  parseOtpFromAuthCallbackParams,
  appPathOnly,
} from '@/lib/auth-callback'
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

    const code = searchParams.get('code')
    const otpFromUrl = parseOtpFromAuthCallbackParams((k) => searchParams.get(k))

    // Recovery / email sin ?code=: Supabase mete token_hash dentro de ?next=…; el cliente PKCE nunca recibe code → timeout.
    if (!code && otpFromUrl) {
      const u = new URL(`/${validLang}/auth/confirm`, window.location.origin)
      u.searchParams.set('token_hash', otpFromUrl.token_hash)
      u.searchParams.set('type', otpFromUrl.type)
      window.location.replace(u.toString())
      return
    }

    const rawNext = normalizeRelativeNext(searchParams.get('next'))
    const pathOnly = rawNext ? appPathOnly(rawNext) : null
    const nextParam =
      pathOnly && isSafeAppPath(pathOnly) ? pathOnly : `/${validLang}/login`

    setNote(validLang === 'es' ? 'Confirmando sesión…' : 'Confirming session…')

    const supabase = createBrowserSupabase()

    if (code) {
      void supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) {
          router.replace(`/${validLang}/login?auth_error=exchange`)
        }
      })
    }

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
