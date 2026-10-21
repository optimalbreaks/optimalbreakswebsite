'use client'

import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'
import ParkineoPlayer, { type ParkineoPlayable } from '@/components/ParkineoPlayer'

type Row = ParkineoPlayable & {
  user_id: string
  city: string
  source_url: string
  duration_minutes: number
  slug: string
  status: 'pending' | 'published' | 'rejected'
  reject_reason: string | null
  created_at: string
  account_name: string | null
  account_email: string | null
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const

export default function ParkineoAdminPage() {
  const params = useParams<{ lang: string }>()
  const lang = params.lang || 'es'
  const [rows, setRows] = useState<Row[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reasons, setReasons] = useState<Record<string, string>>({})
  const [busy, setBusy] = useState<string | null>(null)

  const load = useCallback(async () => {
    setError(null)
    const res = await fetch('/api/admin/parkineo')
    const json = await res.json()
    if (!res.ok) {
      setError(json.error || 'No se ha podido cargar la cola')
      setRows([])
      return
    }
    setRows(json.data || [])
  }, [])

  useEffect(() => {
    void load()
  }, [load])

  const decide = async (id: string, action: 'publish' | 'reject') => {
    setBusy(id)
    setError(null)
    try {
      const res = await fetch('/api/admin/parkineo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, action, reason: reasons[id] || '' }),
      })
      const json = await res.json()
      if (!res.ok) {
        setError(json.error || 'No se ha guardado')
        return
      }
      await load()
    } finally {
      setBusy(null)
    }
  }

  const pending = (rows || []).filter((r) => r.status === 'pending').length

  return (
    <div>
      <h1 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '32px', textTransform: 'uppercase', marginTop: 0 }}>
        Parkineo
      </h1>
      <p style={{ ...MONO, fontSize: '13px', lineHeight: 1.6 }}>
        {pending} en cola. Publicar la saca en <Link href={`/${lang}/parkineo`}>/{lang}/parkineo</Link>. Descartar la quita de la lista.
        No crea ficha de artista ni entra en Mixes.
      </p>
      {error ? <p className="p-3 bg-[var(--red)] text-white" style={MONO}>{error}</p> : null}
      {rows === null ? <p style={MONO}>Cargando…</p> : null}
      <div className="grid gap-6">
        {(rows || []).map((row) => (
          <article key={row.id} className="border-4 border-[var(--ink)] bg-[var(--paper)] overflow-hidden">
            <div className="grid lg:grid-cols-[minmax(0,420px)_1fr]">
              <ParkineoPlayer session={row} />
              <div className="p-4">
                <p className="m-0" style={{ ...MONO, fontSize: '11px', letterSpacing: '1px' }}>
                  {row.status === 'pending' ? 'EN COLA' : row.status === 'published' ? 'PUBLICADA' : 'DESCARTADA'}
                  {' · '}
                  {row.platform.toUpperCase()}
                  {' · '}
                  {row.duration_minutes} min
                </p>
                <h2 className="mt-1 mb-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '20px', textTransform: 'uppercase' }}>
                  {row.title}
                </h2>
                <p className="m-0" style={{ ...MONO, fontSize: '13px', lineHeight: 1.5 }}>
                  {row.dj_name} · {row.city}
                  <br />
                  {row.account_name || 'Sin nombre'}{row.account_email ? ` · ${row.account_email}` : ''}
                  {' · '}
                  <Link href={`/${lang}/administrator/users/${row.user_id}`}>Cuenta</Link>
                  {' · '}
                  <a href={row.source_url} target="_blank" rel="noopener noreferrer">Enlace</a>
                  {row.status === 'published' ? (
                    <>
                      {' · '}
                      <Link href={`/${lang}/parkineo/${row.slug}`}>Ficha</Link>
                    </>
                  ) : null}
                </p>
                {row.reject_reason ? (
                  <p className="mt-2 mb-0" style={{ ...MONO, fontSize: '13px' }}>{row.reject_reason}</p>
                ) : null}
                <label className="block mt-3" style={{ ...MONO, fontSize: '11px' }}>
                  Nota al descartar (la ve en su cuenta)
                  <input
                    value={reasons[row.id] ?? row.reject_reason ?? ''}
                    onChange={(e) => setReasons((prev) => ({ ...prev, [row.id]: e.target.value }))}
                    maxLength={280}
                    className="mt-1 w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-2 py-2"
                    style={{ ...MONO, fontSize: '13px' }}
                  />
                </label>
                <div className="mt-3 flex flex-wrap gap-2">
                  {row.status !== 'published' ? (
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void decide(row.id, 'publish')}
                      className="border-[3px] border-[var(--ink)] bg-[var(--yellow)] px-3 py-2 cursor-pointer"
                      style={{ ...MONO, fontWeight: 700 }}
                    >
                      Publicar
                    </button>
                  ) : null}
                  {row.status !== 'rejected' ? (
                    <button
                      type="button"
                      disabled={busy === row.id}
                      onClick={() => void decide(row.id, 'reject')}
                      className="border-[3px] border-[var(--ink)] bg-[var(--red)] px-3 py-2 text-white cursor-pointer"
                      style={{ ...MONO, fontWeight: 700 }}
                    >
                      Descartar
                    </button>
                  ) : null}
                </div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </div>
  )
}
