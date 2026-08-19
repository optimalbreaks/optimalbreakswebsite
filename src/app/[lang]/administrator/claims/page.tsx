'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { CLAIM_STATUS_LABELS } from '@/lib/bookings'
import type { ArtistClaimRow } from '@/types/database'

type AdminClaim = ArtistClaimRow & {
  artist_name: string | null
  artist_slug: string | null
  user_display_name: string | null
  user_username: string | null
  user_email: string | null
}

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'revoked'] as const

export default function AdminClaimsPage() {
  const { lang } = useParams<{ lang: string }>()
  const [status, setStatus] = useState<string>('pending')
  const [claims, setClaims] = useState<AdminClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [artistIds, setArtistIds] = useState<Record<string, string>>({})

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/claims?status=${status}`)
    const json = await res.json()
    setClaims(json.data || [])
    setLoading(false)
  }, [status])

  useEffect(() => { load() }, [load])

  const act = async (id: string, action: 'approve' | 'reject' | 'revoke', extra?: Record<string, unknown>) => {
    setBusy(id)
    try {
      const res = await fetch(`/api/artist-claims/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, admin_notes: notes[id] || '', ...extra }),
      })
      const json = await res.json()
      if (!res.ok) { alert(json.error || 'Error'); return }
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <h1 className="admin-page-title">Solicitudes de verificación</h1>
      <p className="admin-muted mb-4 max-w-2xl">
        Reclamaciones de ficha (artistas verificados). Aprobar una reclamación vincula la ficha
        a la cuenta para que reciba solicitudes de booking. Para <strong>altas nuevas</strong>{' '}
        (request_new), crea antes la ficha en <em>Artistas</em> y pega su ID al aprobar.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 border-[3px] border-[var(--ink)] ${status === s ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)] text-[var(--ink)]'}`}
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            {CLAIM_STATUS_LABELS[s].es}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="admin-muted">Cargando…</p>
      ) : claims.length === 0 ? (
        <p className="admin-muted">No hay solicitudes con este estado.</p>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {claims.map((c) => (
            <div key={c.id} className="border-[3px] border-[var(--ink)] p-4 bg-[var(--paper)]">
              <div className="flex items-center justify-between gap-2 mb-2">
                <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '15px' }}>
                  {c.kind === 'claim_existing' ? (c.artist_name || '¿ficha?') : c.proposed_name}
                </span>
                <span className="px-2 py-0.5 border-2 border-[var(--ink)]" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', textTransform: 'uppercase' }}>
                  {c.kind === 'claim_existing' ? 'Reclama ficha' : 'Alta nueva'}
                </span>
              </div>
              <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', lineHeight: 1.7 }}>
                <div><strong>Usuario:</strong> {c.user_display_name || c.user_username || '—'} · {c.user_email || '—'}</div>
                {c.contact_phone && (
                  <div><strong>Teléfono:</strong> <a href={`tel:${c.contact_phone}`} className="text-[var(--red)] underline">{c.contact_phone}</a></div>
                )}
                {c.contact_email && (
                  <div><strong>Email contacto:</strong> <a href={`mailto:${c.contact_email}`} className="text-[var(--red)] underline break-all">{c.contact_email}</a></div>
                )}
                <div><strong>Relación:</strong> {c.relationship}</div>
                {c.artist_slug && <div><strong>Ficha:</strong> /{lang}/artists/{c.artist_slug}</div>}
                {c.kind === 'request_new' && (
                  <div className="mt-1">
                    {[c.beatport_url, c.youtube_url, c.soundcloud_url, c.instagram_url].filter(Boolean).map((u) => (
                      <div key={u}><a href={u} target="_blank" rel="noreferrer" className="text-[var(--red)] underline break-all">{u}</a></div>
                    ))}
                  </div>
                )}
                {c.message && <div className="mt-1"><strong>Mensaje:</strong> {c.message}</div>}
                {c.admin_notes && <div className="mt-1"><strong>Notas:</strong> {c.admin_notes}</div>}
              </div>

              {c.status === 'pending' && (
                <div className="mt-3 space-y-2">
                  <input
                    value={notes[c.id] || ''}
                    onChange={(e) => setNotes({ ...notes, [c.id]: e.target.value })}
                    placeholder="Notas internas (opcional)"
                    className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)]"
                    style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}
                  />
                  {c.kind === 'request_new' && (
                    <input
                      value={artistIds[c.id] || ''}
                      onChange={(e) => setArtistIds({ ...artistIds, [c.id]: e.target.value })}
                      placeholder="ID de la ficha ya creada (para aprobar)"
                      className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)]"
                      style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}
                    />
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(c.id, 'approve', c.kind === 'request_new' ? { artist_id: artistIds[c.id] } : {})}
                      disabled={busy === c.id}
                      className="cutout red" style={{ cursor: 'pointer' }}
                    >
                      APROBAR
                    </button>
                    <button onClick={() => act(c.id, 'reject')} disabled={busy === c.id} className="cutout outline" style={{ cursor: 'pointer' }}>
                      RECHAZAR
                    </button>
                  </div>
                </div>
              )}

              {c.status === 'approved' && (
                <div className="mt-3">
                  <button onClick={() => act(c.id, 'revoke')} disabled={busy === c.id} className="cutout outline" style={{ cursor: 'pointer' }}>
                    REVOCAR VERIFICACIÓN
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
