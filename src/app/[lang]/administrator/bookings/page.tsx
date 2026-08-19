'use client'

import { useCallback, useEffect, useState } from 'react'
import { budgetLabel, BOOKING_STATUS_LABELS } from '@/lib/bookings'
import type { BookingRequestRow, BookingRequestStatus } from '@/types/database'

type AdminBooking = BookingRequestRow & {
  artist_name: string | null
  artist_slug: string | null
  sender_email: string | null
  sender_banned: boolean
}

const FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todas' },
  { value: 'new', label: 'Nuevas' },
  { value: 'read', label: 'Leídas' },
  { value: 'replied', label: 'Respondidas' },
  { value: 'accepted', label: 'Aceptadas' },
  { value: 'declined', label: 'Rechazadas' },
  { value: 'closed', label: 'Cerradas' },
]

export default function AdminBookingsPage() {
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<AdminBooking[]>([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    const res = await fetch(`/api/admin/bookings${status ? `?status=${status}` : ''}`)
    const json = await res.json()
    setRows(json.data || [])
    setLoading(false)
  }, [status])

  useEffect(() => { load() }, [load])

  const moderate = async (id: string, action: 'hide' | 'unhide') => {
    setBusy(id)
    try {
      await fetch(`/api/booking-requests/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  const ban = async (userId: string, action: 'ban' | 'unban') => {
    setBusy(userId)
    try {
      const reason = action === 'ban' ? window.prompt('Motivo del bloqueo (opcional):') ?? '' : ''
      await fetch('/api/admin/bookings', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, action, reason }),
      })
      await load()
    } finally {
      setBusy(null)
    }
  }

  return (
    <div>
      <h1 className="admin-page-title">Solicitudes de booking</h1>
      <p className="admin-muted mb-4 max-w-2xl">
        Todas las solicitudes enviadas a artistas verificados (fiscalización). Puedes{' '}
        <strong>ocultar</strong> una solicitud abusiva (deja de verla el artista) y{' '}
        <strong>bloquear</strong> a un remitente para que no pueda enviar más.
      </p>

      <div className="flex flex-wrap gap-2 mb-6">
        {FILTERS.map((f) => (
          <button
            key={f.value || 'all'}
            onClick={() => setStatus(f.value)}
            className={`px-3 py-1.5 border-[3px] border-[var(--ink)] ${status === f.value ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)] text-[var(--ink)]'}`}
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="admin-muted">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="admin-muted">No hay solicitudes.</p>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {rows.map((b) => (
            <div key={b.id} className={`border-[3px] border-[var(--ink)] p-4 ${b.hidden_by_admin ? 'bg-[var(--ink)]/5 opacity-70' : 'bg-[var(--paper)]'}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '15px' }}>{b.artist_name}</span>
                <span className="px-2 py-0.5 border-2 border-[var(--ink)]" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', textTransform: 'uppercase' }}>
                  {BOOKING_STATUS_LABELS[b.status as BookingRequestStatus].es}
                </span>
              </div>
              <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', lineHeight: 1.7 }}>
                <div>
                  <strong>Remitente:</strong> {b.sender_email || '—'}{' '}
                  {b.sender_banned && <span className="text-[var(--red)]">· BLOQUEADO</span>}
                </div>
                {b.event_date && <div><strong>Fecha:</strong> {b.event_date}</div>}
                <div><strong>Ciudad:</strong> {b.city}{b.venue ? ` · ${b.venue}` : ''}</div>
                {b.event_type && <div><strong>Tipo:</strong> {b.event_type}</div>}
                {b.budget_range && <div><strong>Presupuesto:</strong> {budgetLabel(b.budget_range, true)}</div>}
                <div><strong>Contacto:</strong> {b.contact_email}{b.contact_phone ? ` · ${b.contact_phone}` : ''}</div>
              </div>
              <p className="mt-2" style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.6 }}>{b.message}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button onClick={() => moderate(b.id, b.hidden_by_admin ? 'unhide' : 'hide')} disabled={busy === b.id} className="cutout outline" style={{ cursor: 'pointer' }}>
                  {b.hidden_by_admin ? 'REACTIVAR' : 'OCULTAR'}
                </button>
                <button onClick={() => ban(b.sender_id, b.sender_banned ? 'unban' : 'ban')} disabled={busy === b.sender_id} className="cutout red" style={{ cursor: 'pointer' }}>
                  {b.sender_banned ? 'DESBLOQUEAR REMITENTE' : 'BLOQUEAR REMITENTE'}
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
