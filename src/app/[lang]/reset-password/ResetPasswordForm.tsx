// ============================================
// OPTIMAL BREAKS — Restablecer contraseña (cliente)
// Tras el enlace del correo, el callback deja sesión; aquí se guarda la nueva clave.
// ============================================

'use client'

import { useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import { useRouter } from 'next/navigation'
import Link from 'next/link'

export default function ResetPasswordForm({ lang }: { lang: string }) {
  const { user, loading, updatePassword } = useAuth()
  const router = useRouter()
  const [password, setPassword] = useState('')
  const [confirm, setConfirm] = useState('')
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const es = lang === 'es'

  const handleSubmit = async () => {
    setError('')
    if (password.length < 6) {
      setError(es ? 'La contraseña debe tener al menos 6 caracteres' : 'Password must be at least 6 characters')
      return
    }
    if (password !== confirm) {
      setError(es ? 'Las contraseñas no coinciden' : 'Passwords do not match')
      return
    }
    setSubmitting(true)
    const { error: err } = await updatePassword(password)
    setSubmitting(false)
    if (err) setError(err)
    else router.push(`/${lang}/dashboard`)
  }

  if (loading) {
    return (
      <div className="lined min-h-screen flex items-center justify-center px-4 py-16">
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }}>...</p>
      </div>
    )
  }

  if (!user) {
    return (
      <div className="lined min-h-screen flex items-center justify-center px-4 py-16">
        <div className="w-full max-w-[420px] text-center space-y-4">
          <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '14px' }}>
            {es
              ? 'Enlace inválido o caducado. Solicita un nuevo correo desde la página de inicio de sesión.'
              : 'Invalid or expired link. Request a new email from the log in page.'}
          </p>
          <Link href={`/${lang}/login`} className="cutout outline no-underline inline-block">
            {es ? 'Ir al login' : 'Go to log in'}
          </Link>
        </div>
      </div>
    )
  }

  return (
    <div className="lined min-h-screen flex items-center justify-center px-4 py-16">
      <div className="w-full max-w-[420px]">
        <div className="text-center mb-8">
          <div className="sec-tag">{es ? 'TU CUENTA' : 'YOUR ACCOUNT'}</div>
          <h1
            className="mt-4"
            style={{
              fontFamily: "'Unbounded', sans-serif",
              fontWeight: 900,
              fontSize: 'clamp(28px, 6vw, 44px)',
              textTransform: 'uppercase',
              lineHeight: 0.9,
            }}
          >
            <span className="hl">{es ? 'NUEVA CONTRASEÑA' : 'NEW PASSWORD'}</span>
          </h1>
        </div>

        <div className="space-y-3">
          <input
            type="password"
            placeholder={es ? 'Nueva contraseña' : 'New password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="w-full px-4 py-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)] transition-colors"
            style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }}
          />
          <input
            type="password"
            placeholder={es ? 'Repetir contraseña' : 'Confirm password'}
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
            className="w-full px-4 py-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none focus:border-[var(--red)] transition-colors"
            style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px' }}
          />

          {error && (
            <div className="p-3 bg-[var(--red)] text-white" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}>
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={handleSubmit}
            disabled={submitting}
            className="w-full py-3 bg-[var(--red)] text-white border-[3px] border-[var(--red)] hover:bg-[var(--ink)] hover:border-[var(--ink)] transition-all disabled:opacity-50"
            style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', letterSpacing: '2px', textTransform: 'uppercase' }}
          >
            {submitting ? '...' : es ? 'GUARDAR' : 'SAVE'}
          </button>
        </div>

        <div className="text-center mt-4">
          <Link href={`/${lang}/login`} className="cutout outline no-underline">
            ← {es ? 'VOLVER' : 'BACK'}
          </Link>
        </div>
      </div>
    </div>
  )
}
