'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { useParams } from 'next/navigation'
import { adminList } from '@/lib/admin-api'
import { CLAIM_STATUS_LABELS } from '@/lib/bookings'
import type { ArtistClaimRow } from '@/types/database'

type AdminClaim = ArtistClaimRow & {
  artist_name: string | null
  artist_slug: string | null
  user_display_name: string | null
  user_username: string | null
  user_email: string | null
}

type ArtistHit = {
  id: string
  name: string
  slug: string
  claimed_by: string | null
}

const STATUSES = ['pending', 'approved', 'rejected', 'cancelled', 'revoked', 'superseded'] as const
const MONO = { fontFamily: "'Courier Prime', monospace" } as const

function ClaimArtistPicker({
  lang,
  selected,
  onSelect,
}: {
  lang: string
  selected: ArtistHit | null
  onSelect: (hit: ArtistHit | null) => void
}) {
  const [query, setQuery] = useState('')
  const [hits, setHits] = useState<ArtistHit[]>([])
  const [searching, setSearching] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  const runSearch = useCallback(async (term: string) => {
    const q = term.trim()
    if (q.length < 2) {
      setHits([])
      setSearching(false)
      setError(null)
      return
    }
    setSearching(true)
    setError(null)
    try {
      const res = await adminList<ArtistHit>('artists', {
        search: q,
        limit: 12,
        page: 1,
        order: 'name',
        dir: 'asc',
      })
      setHits(
        (res.data || []).map((a) => ({
          id: a.id,
          name: a.name,
          slug: a.slug,
          claimed_by: a.claimed_by,
        })),
      )
    } catch (e) {
      setHits([])
      setError(e instanceof Error ? e.message : 'No se pudo buscar')
    } finally {
      setSearching(false)
    }
  }, [])

  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current)
    }
  }, [])

  const handleQuery = (val: string) => {
    setQuery(val)
    if (timer.current) clearTimeout(timer.current)
    if (val.trim().length < 2) {
      timer.current = null
      setHits([])
      setSearching(false)
      setError(null)
      return
    }
    timer.current = setTimeout(() => {
      timer.current = null
      runSearch(val)
    }, 280)
  }

  return (
    <div className="space-y-2">
      <label className="block" style={{ ...MONO, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase' }}>
        Buscar ficha en el catálogo
      </label>
      <input
        value={query}
        onChange={(e) => handleQuery(e.target.value)}
        placeholder="Nombre o slug (p. ej. D-Fast Beats)"
        className="w-full px-3 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)]"
        style={{ ...MONO, fontSize: '12px' }}
        autoComplete="off"
      />
      {searching && (
        <p className="admin-muted" style={{ ...MONO, fontSize: '11px' }}>Buscando…</p>
      )}
      {error && (
        <p className="text-[var(--red)]" style={{ ...MONO, fontSize: '11px', fontWeight: 700 }}>{error}</p>
      )}
      {!searching && !error && query.trim().length >= 2 && hits.length === 0 && (
        <p className="admin-muted" style={{ ...MONO, fontSize: '11px' }}>
          Ninguna ficha. Si no existe, créala en Artistas y vuelve a buscar.
        </p>
      )}
      {hits.length > 0 && (
        <div className="border-[3px] border-[var(--ink)] max-h-56 overflow-y-auto">
          {hits.map((a) => {
            const active = selected?.id === a.id
            return (
              <button
                key={a.id}
                type="button"
                onClick={() => onSelect(a)}
                className="w-full flex items-center justify-between gap-3 text-left px-3 py-2 border-b-2 border-[var(--ink)] last:border-b-0"
                style={{
                  cursor: 'pointer',
                  background: active ? 'var(--red)' : 'var(--paper)',
                  color: active ? 'white' : 'var(--ink)',
                }}
              >
                <span>
                  <span className="block" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '13px' }}>{a.name}</span>
                  <span className="block" style={{ ...MONO, fontSize: '11px' }}>
                    {a.slug}
                    {a.claimed_by ? ' · ya reclamada' : ''}
                  </span>
                </span>
                <span className="cutout outline shrink-0" style={{ fontSize: '10px', pointerEvents: 'none' }}>
                  {active ? 'ELEGIDA' : 'ELEGIR'}
                </span>
              </button>
            )
          })}
        </div>
      )}
      {selected && (
        <div className="border-[3px] border-[var(--ink)] p-3">
          <div style={{ ...MONO, fontSize: '11px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
            Ficha asignada para aprobar
          </div>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px' }}>
            {selected.name}
          </div>
          <a
            href={`/${lang}/artists/${selected.slug}`}
            target="_blank"
            rel="noreferrer"
            className="text-[var(--red)] underline"
            style={{ ...MONO, fontSize: '12px' }}
          >
            /{lang}/artists/{selected.slug}
          </a>
          {selected.claimed_by && (
            <div className="mt-1 text-[var(--red)]" style={{ ...MONO, fontSize: '11px', fontWeight: 700 }}>
              Esta ficha ya está verificada por otra cuenta.
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default function AdminClaimsPage() {
  const { lang } = useParams<{ lang: string }>()
  const [status, setStatus] = useState<string>('pending')
  const [claims, setClaims] = useState<AdminClaim[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [picked, setPicked] = useState<Record<string, ArtistHit | null>>({})

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
      setPicked((prev) => {
        const next = { ...prev }
        delete next[id]
        return next
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <h1 className="admin-page-title">Solicitudes de verificación</h1>
      <p className="admin-muted mb-4 max-w-2xl">
        Reclamaciones de ficha (artistas verificados). Aprobar vincula la ficha
        a la cuenta para que reciba solicitudes de booking. En una <strong>alta nueva</strong>{' '}
        busca y selecciona la ficha del catálogo (o créala antes en <em>Artistas</em> si aún no existe).
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {STATUSES.map((s) => (
          <button
            key={s}
            onClick={() => setStatus(s)}
            className={`px-3 py-1.5 border-[3px] border-[var(--ink)] ${status === s ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)] text-[var(--ink)]'}`}
            style={{ ...MONO, fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}
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
                <span className="px-2 py-0.5 border-2 border-[var(--ink)]" style={{ ...MONO, fontSize: '10px', textTransform: 'uppercase' }}>
                  {c.kind === 'claim_existing' ? 'Reclama ficha' : 'Alta nueva'}
                </span>
              </div>
              <div style={{ ...MONO, fontSize: '12px', lineHeight: 1.7 }}>
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
                    style={{ ...MONO, fontSize: '12px' }}
                  />
                  {c.kind === 'request_new' && (
                    <ClaimArtistPicker
                      lang={lang}
                      selected={picked[c.id] ?? null}
                      onSelect={(hit) => setPicked({ ...picked, [c.id]: hit })}
                    />
                  )}
                  {c.kind === 'request_new' && !picked[c.id]?.id && (
                    <p className="admin-muted" style={{ ...MONO, fontSize: '11px' }}>
                      Elige una ficha del catálogo para poder aprobar.
                    </p>
                  )}
                  <div className="flex gap-2">
                    <button
                      onClick={() => act(c.id, 'approve', c.kind === 'request_new' ? { artist_id: picked[c.id]?.id } : {})}
                      disabled={busy === c.id || (c.kind === 'request_new' && !picked[c.id]?.id)}
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
