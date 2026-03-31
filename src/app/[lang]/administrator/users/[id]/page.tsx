'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import { adminGetUserDetail, adminUpdateUserRole } from '@/lib/admin-api'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

export default function AdminUserDetailPage() {
  const { lang, id } = useParams<{ lang: string; id: string }>()
  const router = useRouter()
  const base = `/${lang}/administrator`
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [lastSignIn, setLastSignIn] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState('')
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [role, setRole] = useState<'user' | 'admin'>('user')

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    adminGetUserDetail(id)
      .then((d) => {
        setEmail(d.email)
        setLastSignIn(d.last_sign_in_at)
        setCreatedAt(d.created_at)
        const p = d.profile as Record<string, string | null> | null
        setDisplayName(p?.display_name ?? null)
        setUsername(p?.username ?? null)
        const r = p?.role
        setRole(r === 'admin' ? 'admin' : 'user')
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [id])

  const handleSave = async () => {
    if (!id) return
    setSaving(true)
    setError(null)
    try {
      await adminUpdateUserRole(id, role)
      router.push(`${base}/users`)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo guardar')
    } finally {
      setSaving(false)
    }
  }

  if (loading) {
    return <p className="admin-muted">Cargando usuario…</p>
  }

  if (error && !email) {
    return (
      <div>
        <p className="text-[var(--red)] mb-4">{error}</p>
        <Link href={`${base}/users`} className="admin-btn admin-btn--ghost no-underline">
          ← Volver al listado
        </Link>
      </div>
    )
  }

  return (
    <div>
      <div className="mb-6">
        <Link
          href={`${base}/users`}
          className="admin-btn admin-btn--ghost admin-btn--sm no-underline inline-flex mb-4"
        >
          ← Usuarios
        </Link>
        <h1 className="admin-page-title !mb-2">Editar usuario</h1>
        <p className="admin-muted !mb-0">Identificador: {id}</p>
      </div>

      <div className="admin-panel max-w-xl space-y-5">
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)] mb-1">Email</div>
          <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '14px' }}>{email || '—'}</div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)] mb-1">Nombre en perfil</div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '14px' }}>{displayName || '—'}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)] mb-1">Usuario</div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '14px' }}>{username || '—'}</div>
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)] mb-1">Alta (Auth)</div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}>{fmtDate(createdAt)}</div>
          </div>
          <div>
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)] mb-1">Último acceso</div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}>{fmtDate(lastSignIn)}</div>
          </div>
        </div>

        <div>
          <label htmlFor="admin-user-role" className="block text-[10px] font-bold uppercase tracking-wider text-[var(--dim)] mb-2">
            Rol en el sitio
          </label>
          <select
            id="admin-user-role"
            value={role}
            onChange={(e) => setRole(e.target.value as 'user' | 'admin')}
            className="admin-input max-w-xs"
          >
            <option value="user">Usuario</option>
            <option value="admin">Administrador</option>
          </select>
          <p className="admin-muted text-xs mt-2 !mb-0">
            Los administradores acceden a este panel. El email y la contraseña solo los cambia el propio usuario en su
            cuenta o desde el panel de Supabase Auth.
          </p>
        </div>

        {error ? <p className="text-[var(--red)] text-sm m-0">{error}</p> : null}

        <div className="flex flex-wrap gap-3 pt-2">
          <button type="button" onClick={handleSave} disabled={saving} className="admin-btn admin-btn--yellow">
            {saving ? 'Guardando…' : 'Guardar rol'}
          </button>
          <Link href={`${base}/users`} className="admin-btn admin-btn--ghost no-underline">
            Cancelar
          </Link>
        </div>
      </div>
    </div>
  )
}
