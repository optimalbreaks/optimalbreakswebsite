'use client'

import { useCallback, useEffect, useState } from 'react'

type Row = {
  id: string
  created_at: string
  gift_slug: string
  user_id: string
  status: 'pending' | 'approved' | 'rejected'
  note: string | null
  has_site: boolean
  has_artist: boolean
  account_name: string | null
  account_email: string | null
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const

const STATUS_LABEL: Record<Row['status'], string> = {
  pending: 'Pendiente',
  approved: 'Aprobada',
  rejected: 'Rechazada',
}

export default function RegalosAdminPage() {
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notes, setNotes] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch('/api/admin/gifts')
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || 'No se ha podido cargar')
      setRows([])
      return
    }
    const list = (json.data || []) as Row[]
    list.sort((a, b) => {
      if (a.status === 'pending' && b.status !== 'pending') return -1
      if (b.status === 'pending' && a.status !== 'pending') return 1
      return b.created_at.localeCompare(a.created_at)
    })
    setRows(list)
  }, [])

  useEffect(() => {
    // La cola se pide al abrir el panel.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function act(id: string, action: 'approve' | 'reject' | 'purge') {
    setBusy(id + action)
    setError(null)
    const res = await fetch('/api/admin/gifts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, action, note: notes[id] || '' }),
    })
    const json = await res.json().catch(() => ({}))
    setBusy(null)
    if (!res.ok) {
      setError(json.error || 'No se ha guardado')
      return
    }
    await load()
  }

  return (
    <div className="p-4 sm:p-6">
      <h1 className="mb-2 text-[28px] leading-none" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900 }}>
        REGALOS
      </h1>
      <p className="mb-6 max-w-[40rem] text-[14px]" style={MONO}>
        Gone Gone Gone, de Woter. Aprueba solo si en una captura se lee que sigue a @optimalbreaks y en la otra a @woter_dj. Luego puedes borrar las fotos: la descarga se queda.
      </p>
      {error && <p className="mb-4 text-[14px] text-[var(--red)]" style={MONO}>{error}</p>}
      {rows === null && <p style={MONO}>Cargando…</p>}
      {rows?.length === 0 && <p style={MONO}>Nadie lo ha pedido todavía.</p>}
      <div className="space-y-6">
        {rows?.map((row) => (
          <article key={row.id} className="border-4 border-[var(--ink)] bg-[var(--paper)] p-4">
            <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
              <p style={{ ...MONO, fontWeight: 700 }}>
                {row.account_name || row.account_email || row.user_id.slice(0, 8)}
                {row.account_email && row.account_name ? ` · ${row.account_email}` : ''}
              </p>
              <p className="text-[12px]" style={MONO}>
                {STATUS_LABEL[row.status]} · {new Date(row.created_at).toLocaleString('es-ES')}
              </p>
            </div>
            {row.note && <p className="mb-3 text-[14px]" style={MONO}>{row.note}</p>}
            <div className="mb-4 grid gap-3 sm:grid-cols-2">
              {row.has_site ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/admin/gifts/shot?id=${row.id}&which=site`} alt="Captura de @optimalbreaks" className="max-h-[420px] w-full border-4 border-[var(--ink)] object-contain bg-[var(--yellow)]" />
              ) : (
                <p style={MONO}>Sin captura de la web</p>
              )}
              {row.has_artist ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={`/api/admin/gifts/shot?id=${row.id}&which=artist`} alt="Captura de @woter_dj" className="max-h-[420px] w-full border-4 border-[var(--ink)] object-contain bg-[var(--yellow)]" />
              ) : (
                <p style={MONO}>Sin captura del artista</p>
              )}
            </div>
            {row.status === 'pending' && (
              <div className="flex flex-wrap items-end gap-3">
                <label className="min-w-[16rem] flex-1 text-[12px]" style={MONO}>
                  Si la rechazas, dile por qué
                  <input
                    value={notes[row.id] || ''}
                    onChange={(e) => setNotes((n) => ({ ...n, [row.id]: e.target.value }))}
                    className="mt-1 block w-full border-4 border-[var(--ink)] bg-white px-2 py-2 text-[14px]"
                  />
                </label>
                <button type="button" disabled={busy !== null} onClick={() => act(row.id, 'approve')} className="border-4 border-[var(--ink)] bg-[var(--yellow)] px-4 py-2" style={MONO}>
                  Aprobar
                </button>
                <button type="button" disabled={busy !== null} onClick={() => act(row.id, 'reject')} className="border-4 border-[var(--ink)] bg-[var(--red)] px-4 py-2 text-white" style={MONO}>
                  Rechazar
                </button>
              </div>
            )}
            {row.status !== 'pending' && (row.has_site || row.has_artist) && (
              <button type="button" disabled={busy !== null} onClick={() => act(row.id, 'purge')} className="border-4 border-[var(--ink)] px-4 py-2" style={MONO}>
                Borrar capturas
              </button>
            )}
          </article>
        ))}
      </div>
    </div>
  )
}
