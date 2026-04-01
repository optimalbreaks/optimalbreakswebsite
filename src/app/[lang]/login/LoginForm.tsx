// ============================================
// OPTIMAL BREAKS — Login Form (Client)
// ============================================

'use client'

import { useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function LoginForm({ lang }: { lang: string }) {
  const { signInWithEmail, signUpWithEmail, resetPasswordForEmail, user, loading } = useAuth()
  const router = useRouter()
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [name, setName] = useState('')
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const es = lang === 'es'

  // Redirect if already logged in
  if (!loading && user) {
    router.push(`/${lang}/dashboard`)
    return null
  }

  const handleSubmit = async () => {
    setError('')
    setSuccess('')
    setSubmitting(true)

    if (mode === 'forgot') {
      const { error: err } = await resetPasswordForEmail(email.trim())
      if (err) setError(err)
      else {
        setSuccess(
          es
            ? 'Si ese email está registrado, recibirás un enlace para restablecer la contraseña.'
            : 'If that email is registered, you will receive a link to reset your password.'
        )
      }
    } else if (mode === 'login') {
      const { error: err } = await signInWithEmail(email, password)
      if (err) setError(err)
      else router.push(`/${lang}/dashboard`)
    } else {
      if (password.length < 6) {
        setError(es ? 'La contraseña debe tener al menos 6 caracteres' : 'Password must be at least 6 characters')
        setSubmitting(false)
        return
      }
      const { error: err } = await signUpWithEmail(email, password, name)
      if (err) setError(err)
      else setSuccess(es ? 'Revisa tu email para confirmar tu cuenta' : 'Check your email to confirm your account')
    }
    setSubmitting(false)
  }

  return (
    <div className="lined min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-[420px]">
        {/* Title */}
        <div className="text-center mb-8">
          <div className="sec-tag">{es ? 'TU CUENTA' : 'YOUR ACCOUNT'}</div>
          <h1 className="mt-4" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(28px, 6vw, 44px)', textTransform: 'uppercase', lineHeight: 0.9 }}>
            {mode === 'forgot' ? (
              <><span className="hl">{es ? 'RECUPERAR CONTRASEÑA' : 'RESET PASSWORD'}</span></>
            ) : mode === 'login' ? (
              <><span className="hl">{es ? 'ENTRAR' : 'LOG IN'}</span></>
            ) : (
              <><span className="hl">{es ? 'CREAR CUENTA' : 'SIGN UP'}</span></>
            )}
          </h1>
        </div>

        {/* Google OAuth: oculto de momento; signInWithGoogle sigue en AuthProvider para reactivar */}

        {/* Email form */}
        <div className="space-y-3">
          {mode === 'signup' && (
            <input
              type="text"
              placeholder={es ? 'Nombre' : 'Name'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-4 py-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)] transition-colors"
              style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }}
            />
          )}
          <input
            type="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => mode !== 'signup' && e.key === 'Enter' && handleSubmit()}
            className="w-full px-4 py-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)] transition-colors"
            style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }}
          />
          {mode !== 'forgot' && (
            <input
              type="password"
              placeholder={es ? 'Contraseña' : 'Password'}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              className="w-full px-4 py-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)] transition-colors"
              style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }}
            />
          )}

          {error && (
            <div className="p-3 bg-[var(--red)] text-white" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}>
              {error}
            </div>
          )}
          {success && (
            <div className="p-3 bg-[var(--acid)] text-white" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}>
              {success}
            </div>
          )}

          <button
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-[var(--red)] text-white border-[3px] border-[var(--red)] hover:bg-[var(--ink)] hover:border-[var(--ink)] transition-all disabled:opacity-50"
            style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase' }}
          >
            {submitting
              ? '...'
              : mode === 'forgot'
                ? (es ? 'ENVIAR ENLACE' : 'SEND LINK')
                : mode === 'login'
                  ? (es ? 'ENTRAR' : 'LOG IN')
                  : (es ? 'CREAR CUENTA' : 'SIGN UP')
            }
          </button>
        </div>

        {mode === 'login' && (
          <div className="text-center mt-3">
            <button
              type="button"
              onClick={() => {
                setMode('forgot')
                setError('')
                setSuccess('')
              }}
              className="bg-transparent border-none cursor-pointer underline"
              style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'var(--dim)' }}
            >
              {es ? '¿Olvidaste tu contraseña?' : 'Forgot your password?'}
            </button>
          </div>
        )}

        {/* Toggle mode */}
        <div className="text-center mt-6">
          <button
            onClick={() => {
              if (mode === 'forgot') setMode('login')
              else setMode(mode === 'login' ? 'signup' : 'login')
              setError('')
              setSuccess('')
            }}
            className="bg-transparent border-none cursor-pointer underline"
            style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', color: 'var(--dim)' }}
          >
            {mode === 'forgot'
              ? (es ? 'Volver al inicio de sesión' : 'Back to log in')
              : mode === 'login'
                ? (es ? '¿No tienes cuenta? Crear una' : "Don't have an account? Create one")
                : (es ? '¿Ya tienes cuenta? Entrar' : 'Already have an account? Log in')
            }
          </button>
        </div>

        <div className="text-center mt-4">
          <Link href={`/${lang}`} className="cutout outline no-underline">
            ← {es ? 'VOLVER' : 'BACK'}
          </Link>
        </div>
      </div>
    </div>
  )
}
