// ============================================
// OPTIMAL BREAKS — Auth Context Provider
// ============================================

'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { usePathname } from 'next/navigation'
import { createBrowserSupabase } from '@/lib/supabase'
import type { User, Session } from '@supabase/supabase-js'
import { i18n } from '@/lib/i18n-config'

interface AuthContextType {
  user: User | null
  session: Session | null
  loading: boolean
  signInWithGoogle: () => Promise<void>
  signInWithEmail: (email: string, password: string) => Promise<{ error: string | null }>
  signUpWithEmail: (email: string, password: string, name: string) => Promise<{ error: string | null }>
  resetPasswordForEmail: (email: string) => Promise<{ error: string | null }>
  updatePassword: (newPassword: string) => Promise<{ error: string | null }>
  signOut: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  session: null,
  loading: true,
  signInWithGoogle: async () => {},
  signInWithEmail: async () => ({ error: null }),
  signUpWithEmail: async () => ({ error: null }),
  resetPasswordForEmail: async () => ({ error: null }),
  updatePassword: async () => ({ error: null }),
  signOut: async () => {},
})

function getLangFromPath(pathname: string) {
  const seg = pathname.split('/')[1]
  return i18n.locales.includes(seg as any) ? seg : i18n.defaultLocale
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null)
  const [session, setSession] = useState<Session | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createBrowserSupabase()
  const pathname = usePathname()
  const lang = getLangFromPath(pathname)

  useEffect(() => {
    // Get initial session
    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session)
      setUser(session?.user ?? null)
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [supabase.auth])

  const signInWithGoogle = useCallback(async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'google',
      options: {
        redirectTo: `${window.location.origin}/api/auth/callback?next=/${lang}/dashboard`,
      },
    })
  }, [supabase.auth, lang])

  const signInWithEmail = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    return { error: error?.message || null }
  }

  const signUpWithEmail = async (email: string, password: string, name: string) => {
    const nextPath = `/${lang}/login`
    const { error } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: { full_name: name },
        emailRedirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
      },
    })
    return { error: error?.message || null }
  }

  const resetPasswordForEmail = useCallback(
    async (email: string) => {
      const nextPath = `/${lang}/reset-password`
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/api/auth/callback?next=${encodeURIComponent(nextPath)}`,
      })
      return { error: error?.message || null }
    },
    [supabase.auth, lang]
  )

  const updatePassword = async (newPassword: string) => {
    const { error } = await supabase.auth.updateUser({ password: newPassword })
    return { error: error?.message || null }
  }

  const signOut = useCallback(async () => {
    await supabase.auth.signOut()
    window.location.href = `/${lang}`
  }, [supabase.auth, lang])

  return (
    <AuthContext.Provider
      value={{
        user,
        session,
        loading,
        signInWithGoogle,
        signInWithEmail,
        signUpWithEmail,
        resetPasswordForEmail,
        updatePassword,
        signOut,
      }}
    >
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
