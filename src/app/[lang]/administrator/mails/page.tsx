'use client'

import { useCallback, useEffect, useState } from 'react'
import type { MailDispatchKind, MailDispatchRow, MailDispatchStatus } from '@/types/database'

type AdminMail = MailDispatchRow & {
  artist_name: string | null
  artist_slug: string | null
}

const KIND_LABELS: Record<MailDispatchKind, string> = {
  claim_approved: 'Ficha verificada',
  booking_new: 'Booking nuevo',
}

const STATUS_LABELS: Record<MailDispatchStatus, string> = {
  sent: 'Enviado',
  failed: 'Falló',
  skipped: 'Saltado',
}

const KIND_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'claim_approved', label: 'Ficha verificada' },
  { value: 'booking_new', label: 'Booking' },
]

const STATUS_FILTERS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Todos' },
  { value: 'sent', label: 'Enviados' },
  { value: 'failed', label: 'Fallidos' },
  { value: 'skipped', label: 'Saltados' },
]

function formatWhen(iso: string) {
  try {
    return new Date(iso).toLocaleString('es-ES', {
      dateStyle: 'short',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

export default function AdminMailsPage() {
  const [kind, setKind] = useState('')
  const [status, setStatus] = useState('')
  const [rows, setRows] = useState<AdminMail[]>([])
  const [loading, setLoading] = useState(true)

  const load = useCallback(async () => {
    setLoading(true)
    const q = new URLSearchParams()
    if (kind) q.set('kind', kind)
    if (status) q.set('status', status)
    const res = await fetch(`/api/admin/mail-dispatches${q.toString() ? `?${q}` : ''}`)
    const json = await res.json()
    setRows(json.data || [])
    setLoading(false)
  }, [kind, status])

  useEffect(() => { load() }, [load])

  return (
    <div>
      <h1 className="admin-page-title">Registro de mails</h1>
      <p className="admin-muted mb-4 max-w-2xl">
        Cada intento transaccional deja fila: ficha verificada y aviso de booking.
        {' '}<strong>sent</strong> / <strong>failed</strong> / <strong>skipped</strong> (sin SMTP o
        email sin confirmar). Copia a contacto@ y Message-ID de OVH si el envío salió.
      </p>

      <div className="flex flex-wrap gap-2 mb-3">
        {KIND_FILTERS.map((f) => (
          <button
            key={`k-${f.value || 'all'}`}
            onClick={() => setKind(f.value)}
            className={`px-3 py-1.5 border-[3px] border-[var(--ink)] ${kind === f.value ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)] text-[var(--ink)]'}`}
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2 mb-6">
        {STATUS_FILTERS.map((f) => (
          <button
            key={`s-${f.value || 'all'}`}
            onClick={() => setStatus(f.value)}
            className={`px-3 py-1.5 border-[3px] border-[var(--ink)] ${status === f.value ? 'bg-[var(--yellow)]' : 'bg-[var(--paper)] text-[var(--ink)]'}`}
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', cursor: 'pointer' }}
          >
            {f.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="admin-muted">Cargando…</p>
      ) : rows.length === 0 ? (
        <p className="admin-muted">Aún no hay envíos registrados.</p>
      ) : (
        <div className="space-y-4 max-w-3xl">
          {rows.map((m) => (
            <div key={m.id} className={`border-[3px] border-[var(--ink)] p-4 ${m.status === 'failed' ? 'bg-[var(--red)]/10' : m.status === 'skipped' ? 'bg-[var(--ink)]/5' : 'bg-[var(--paper)]'}`}>
              <div className="flex items-center justify-between gap-2 mb-2">
                <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '15px' }}>
                  {KIND_LABELS[m.kind]}
                  {m.artist_name ? ` · ${m.artist_name}` : ''}
                </span>
                <span className="px-2 py-0.5 border-2 border-[var(--ink)]" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', textTransform: 'uppercase' }}>
                  {STATUS_LABELS[m.status]}
                </span>
              </div>
              <div style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', lineHeight: 1.7 }}>
                <div><strong>Cuándo:</strong> {formatWhen(m.sent_at)}</div>
                <div><strong>Para:</strong> {m.to_email}</div>
                {m.cc_email && <div><strong>Cc:</strong> {m.cc_email}</div>}
                <div><strong>Asunto:</strong> {m.subject}</div>
                {m.smtp_message_id && <div><strong>Message-ID:</strong> {m.smtp_message_id}</div>}
                {m.error_message && <div className="text-[var(--red)]"><strong>Error:</strong> {m.error_message}</div>}
                {typeof m.metadata?.source === 'string' && m.metadata.source && (
                  <div><strong>Origen:</strong> {m.metadata.source}</div>
                )}
                {typeof m.metadata?.note === 'string' && m.metadata.note && (
                  <div><strong>Nota:</strong> {m.metadata.note}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
