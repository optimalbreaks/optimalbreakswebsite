'use client'

import { useState, useEffect, useCallback } from 'react'

type PendingQueue = {
  count: number
  events: { slug: string; name: string }[]
}

export default function AgentEventPoster({ lang }: { lang: string }) {
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    chosen: string | null
    storageUrl?: string
    reason: string
    candidates: number
    saved?: boolean
    storageError?: string
    dbError?: string
  } | null>(null)
  const [pendingQueue, setPendingQueue] = useState<PendingQueue | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueSelect, setQueueSelect] = useState('')

  const loadPendingQueue = useCallback(async () => {
    setQueueLoading(true)
    setQueueError(null)
    try {
      const res = await fetch('/api/admin/agent/event-poster?queue=missing')
      const data = (await res.json()) as PendingQueue & { error?: string }
      if (!res.ok) throw new Error(data.error || res.statusText)
      setQueueSelect('')
      setPendingQueue({ count: data.count, events: data.events || [] })
    } catch (e) {
      setPendingQueue(null)
      setQueueError(e instanceof Error ? e.message : 'No se pudo cargar la cola')
    } finally {
      setQueueLoading(false)
    }
  }, [])

  useEffect(() => { loadPendingQueue() }, [loadPendingQueue])

  function onPickFromQueue(value: string) {
    setQueueSelect(value)
    if (!value) return
    setSlug(value)
    setResult(null)
    setError(null)
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!slug.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/admin/agent/event-poster', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || res.statusText)
      setResult(json)
      if (json.saved) void loadPendingQueue()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-6">
      <div className="admin-panel relative border-[3px] border-[var(--ink)] bg-[var(--red)]/10 shadow-[8px_8px_0_var(--ink)] space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] border-b-[3px] border-[var(--ink)] pb-2" style={{ fontFamily: "'Courier Prime', monospace" }}>
          Cola: eventos sin cartel
        </h2>
        <p className="text-sm leading-relaxed text-[var(--ink)]" style={{ fontFamily: "'Special Elite', monospace" }}>
          Eventos cuya <code>image_url</code> está vacía.{' '}
          <strong>Busca y asigna pósters/flyers con IA</strong> desde Google Imágenes.
        </p>
        {queueLoading && <p className="admin-muted text-xs">Cargando cola…</p>}
        {queueError && <p className="text-xs font-bold uppercase tracking-wide text-[var(--red)]">{queueError}</p>}
        {!queueLoading && pendingQueue && (
          <>
            <p className="text-sm font-bold" style={{ fontFamily: "'Courier Prime', monospace" }}>
              Sin cartel: <span className="text-[var(--red)]">{pendingQueue.count}</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <label htmlFor="posterQueuePick" className="admin-label shrink-0 !mb-0 self-center">Elegir de la cola</label>
              <select id="posterQueuePick" value={queueSelect} onChange={(e) => onPickFromQueue(e.target.value)} className="admin-input flex-1 min-w-0">
                <option value="">— Selecciona un evento —</option>
                {pendingQueue.events.map((ev) => (
                  <option key={ev.slug} value={ev.slug}>{ev.name} ({ev.slug})</option>
                ))}
              </select>
              <button type="button" onClick={() => loadPendingQueue()} className="admin-btn admin-btn--ghost admin-btn--sm shrink-0">Actualizar</button>
            </div>
            {queueSelect && (
              <a href={`/${lang}/events/${queueSelect}`} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-bold uppercase tracking-wide text-[var(--red)] underline underline-offset-2 hover:text-[var(--uv)]" style={{ fontFamily: "'Courier Prime', monospace" }}>Ver ficha pública →</a>
            )}
          </>
        )}
      </div>

      <div className="admin-panel">
        <form onSubmit={handleSearch} className="space-y-5">
          <div>
            <label htmlFor="posterSlug" className="admin-label">Slug del evento</label>
            <input id="posterSlug" type="text" required value={slug} onChange={(e) => setSlug(e.target.value)} placeholder="Ej: raveart-summer-festival-2026" className="admin-input" />
            <p className="admin-muted text-xs mt-1">El evento debe existir en la BD.</p>
          </div>
          <button type="submit" disabled={loading || !slug.trim()} className="admin-btn admin-btn--yellow">
            Buscar cartel
          </button>
        </form>
      </div>

      {loading && (
        <div className="admin-panel text-center border-[3px] border-[var(--ink)] bg-[var(--paper)]">
          <p className="text-[var(--uv)] animate-pulse text-lg font-black uppercase" style={{ fontFamily: "'Unbounded', sans-serif" }}>Buscando cartel…</p>
        </div>
      )}

      {error && (
        <div className="admin-panel border-[3px] border-[var(--red)] bg-[var(--red)]/10">
          <p className="text-sm font-bold text-[var(--red)]">{error}</p>
        </div>
      )}

      {result && (
        <div className="admin-panel space-y-4">
          <h2 className="text-base font-black uppercase border-b-[3px] border-[var(--ink)] pb-2" style={{ fontFamily: "'Unbounded', sans-serif" }}>Resultado</h2>
          <div className="space-y-2 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
            <p><strong>Candidatos evaluados:</strong> {result.candidates}</p>
            <p><strong>Motivo:</strong> {result.reason}</p>
            {result.chosen && (
              <p><strong>Imagen elegida:</strong>{' '}
                <a href={result.chosen} target="_blank" rel="noopener noreferrer" className="text-[var(--red)] underline underline-offset-2 break-all">{result.chosen.slice(0, 80)}…</a>
              </p>
            )}
            {result.storageUrl && (
              <p><strong>URL Storage:</strong>{' '}
                <a href={result.storageUrl} target="_blank" rel="noopener noreferrer" className="text-[var(--uv)] underline underline-offset-2 break-all">{result.storageUrl}</a>
              </p>
            )}
          </div>
          {result.storageUrl && (
            <div className="border-[3px] border-[var(--ink)] p-2 bg-[var(--paper-dark)] inline-block">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={result.storageUrl} alt={`Cartel ${slug}`} className="max-w-[280px] max-h-[360px] object-contain" />
            </div>
          )}
          {result.saved && <div className="admin-panel border-[3px] border-[var(--acid)] bg-[var(--acid)]/25 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>Cartel guardado en Storage y actualizado en BD.</div>}
          {result.storageError && <div className="admin-panel border-[3px] border-[var(--red)] bg-[var(--red)]/10 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>Error Storage: {result.storageError}</div>}
          {result.dbError && <div className="admin-panel border-[3px] border-[var(--orange)] bg-[var(--orange)]/15 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>Error BD: {result.dbError}</div>}
          {!result.chosen && <div className="admin-panel border-[3px] border-[var(--orange)] bg-[var(--orange)]/15 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>No se encontró cartel adecuado. Prueba buscando el evento manualmente.</div>}
        </div>
      )}
    </div>
  )
}
