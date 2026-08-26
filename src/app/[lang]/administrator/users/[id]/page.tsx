'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams, useRouter } from 'next/navigation'
import {
  adminGetUserDetail,
  adminMarkEditorialArtist,
  adminMarkEditorialLabel,
  adminUpdateUserRole,
  type AdminArtistLevel,
  type AdminClaimedArtist,
  type AdminEditorialLabelMark,
  type AdminEditorialMark,
} from '@/lib/admin-api'

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
  const [lastActivity, setLastActivity] = useState<string | null>(null)
  const [createdAt, setCreatedAt] = useState('')
  const [displayName, setDisplayName] = useState<string | null>(null)
  const [username, setUsername] = useState<string | null>(null)
  const [role, setRole] = useState<'user' | 'admin'>('user')
  const [artistLevel, setArtistLevel] = useState<AdminArtistLevel>('user')
  const [editorialMarks, setEditorialMarks] = useState<AdminEditorialMark[]>([])
  const [labelMarks, setLabelMarks] = useState<AdminEditorialLabelMark[]>([])
  const [claimedArtists, setClaimedArtists] = useState<AdminClaimedArtist[]>([])
  const [markName, setMarkName] = useState('')
  const [labelMarkName, setLabelMarkName] = useState('')
  const [marking, setMarking] = useState(false)

  useEffect(() => {
    if (!id) return
    setLoading(true)
    setError(null)
    adminGetUserDetail(id)
      .then((d) => {
        setEmail(d.email)
        setLastSignIn(d.last_sign_in_at)
        setLastActivity(d.last_activity_at ?? null)
        setCreatedAt(d.created_at)
        const p = d.profile as Record<string, string | null> | null
        setDisplayName(p?.display_name ?? null)
        setUsername(p?.username ?? null)
        const r = p?.role
        setRole(r === 'admin' ? 'admin' : 'user')
        setArtistLevel(d.artist_level ?? 'user')
        setEditorialMarks(d.editorial_marks ?? [])
        setLabelMarks(d.editorial_label_marks ?? [])
        setClaimedArtists(d.claimed_artists ?? [])
      })
      .catch((e) => setError(e instanceof Error ? e.message : 'Error al cargar'))
      .finally(() => setLoading(false))
  }, [id])

  const applyLevel = (d: {
    artist_level: AdminArtistLevel
    editorial_marks: AdminEditorialMark[]
    editorial_label_marks: AdminEditorialLabelMark[]
    claimed_artists: AdminClaimedArtist[]
  }) => {
    setArtistLevel(d.artist_level)
    setEditorialMarks(d.editorial_marks)
    setLabelMarks(d.editorial_label_marks ?? [])
    setClaimedArtists(d.claimed_artists)
  }

  const handleMark = async () => {
    if (!id || !markName.trim()) return
    setMarking(true)
    setError(null)
    try {
      const d = await adminMarkEditorialArtist(id, { editorial_artist_name: markName.trim() })
      applyLevel(d)
      setMarkName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar')
    } finally {
      setMarking(false)
    }
  }

  const handleUnmark = async (key: string) => {
    if (!id) return
    setMarking(true)
    setError(null)
    try {
      const d = await adminMarkEditorialArtist(id, { remove_editorial_artist_key: key })
      applyLevel(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el marcaje')
    } finally {
      setMarking(false)
    }
  }

  const handleMarkLabel = async () => {
    if (!id || !labelMarkName.trim()) return
    setMarking(true)
    setError(null)
    try {
      const d = await adminMarkEditorialLabel(id, { editorial_label_name: labelMarkName.trim() })
      applyLevel(d)
      setLabelMarkName('')
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo marcar el sello')
    } finally {
      setMarking(false)
    }
  }

  const handleUnmarkLabel = async (key: string) => {
    if (!id) return
    setMarking(true)
    setError(null)
    try {
      const d = await adminMarkEditorialLabel(id, { remove_editorial_label_key: key })
      applyLevel(d)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'No se pudo quitar el sello')
    } finally {
      setMarking(false)
    }
  }

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
            <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)] mb-1">Última actividad</div>
            <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}>{fmtDate(lastActivity)}</div>
          </div>
        </div>
        <div>
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)] mb-1">Último inicio de sesión</div>
          <div
            className="text-[var(--dim)]"
            style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}
          >
            {fmtDate(lastSignIn)}
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

        <div className="border-t-[3px] border-[var(--ink)] pt-5 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
            Nivel de artista
          </div>
          <p className="admin-muted text-xs !mb-0">
            {artistLevel === 'claimed'
              ? 'Fase 3 — reclamó su ficha. Sus «+» en temas donde sale él no suman a su nombre en el Top de artistas; sí cuentan en el Top 100 de canciones y en Mis Tracks. Puede abrir bookings.'
              : artistLevel === 'marked'
                ? 'Fase 2 — fichaje editorial. Sus «+» en temas donde sale él no suman a su nombre en el Top de artistas; sí cuentan en el Top 100 de canciones y en Mis Tracks. Bookings solo si él reclama.'
                : 'Fase 1 — usuario normal. Sus saves cuentan en el Top de artistas y en el Top 100 de canciones.'}
          </p>
          {claimedArtists.length > 0 ? (
            <ul className="m-0 pl-4 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {claimedArtists.map((a) => (
                <li key={a.id}>
                  {a.name} ({a.slug})
                  {a.accepts_bookings ? ' · bookings abiertos' : ' · bookings cerrados'}
                </li>
              ))}
            </ul>
          ) : null}
          {editorialMarks.length > 0 ? (
            <ul className="m-0 p-0 list-none space-y-2">
              {editorialMarks.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <span style={{ fontFamily: "'Courier Prime', monospace" }}>{m.artist_name}</span>
                  <button
                    type="button"
                    onClick={() => handleUnmark(m.artist_key)}
                    disabled={marking}
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={markName}
              onChange={(e) => setMarkName(e.target.value)}
              placeholder="Nombre del crédito (p. ej. Gruv42)"
              className="admin-input max-w-xs"
            />
            <button
              type="button"
              onClick={handleMark}
              disabled={marking || !markName.trim()}
              className="admin-btn admin-btn--ghost"
            >
              {marking ? 'Guardando…' : 'Marcar artista (fase 2)'}
            </button>
          </div>
        </div>

        <div className="border-t-[3px] border-[var(--ink)] pt-5 space-y-3">
          <div className="text-[10px] font-bold uppercase tracking-wider text-[var(--dim)]">
            Sello (Top de artistas)
          </div>
          <p className="admin-muted text-xs !mb-0">
            Marca una conducta con un catálogo — dueño, artista del roster o dumping errático.
            Los «+» de esta cuenta en temas de ese sello no suman a nadie en el Top de artistas.
            Sí siguen en Mis Tracks y en el Top 100 de canciones. El nombre del sello debe
            coincidir con el crédito de la pista (p. ej. DIRTY KITCHEN RAVE).
          </p>
          {labelMarks.length > 0 ? (
            <ul className="m-0 p-0 list-none space-y-2">
              {labelMarks.map((m) => (
                <li key={m.id} className="flex items-center gap-2 text-sm">
                  <span style={{ fontFamily: "'Courier Prime', monospace" }}>{m.label_name}</span>
                  <button
                    type="button"
                    onClick={() => handleUnmarkLabel(m.label_key)}
                    disabled={marking}
                    className="admin-btn admin-btn--ghost admin-btn--sm"
                  >
                    Quitar
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap gap-2 items-center">
            <input
              type="text"
              value={labelMarkName}
              onChange={(e) => setLabelMarkName(e.target.value)}
              placeholder="Nombre del sello (p. ej. DIRTY KITCHEN RAVE)"
              className="admin-input max-w-xs"
            />
            <button
              type="button"
              onClick={handleMarkLabel}
              disabled={marking || !labelMarkName.trim()}
              className="admin-btn admin-btn--ghost"
            >
              {marking ? 'Guardando…' : 'Marcar sello'}
            </button>
          </div>
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
