'use client'

import { useState, useEffect, useCallback } from 'react'

type PendingQueue = {
  count: number
  events: { slug: string; name: string }[]
}

export default function AgentEvent({ lang }: { lang: string }) {
  const [slug, setSlug] = useState('')
  const [force, setForce] = useState(false)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [fieldsUpdated, setFieldsUpdated] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [message, setMessage] = useState<string | null>(null)
  const [pendingQueue, setPendingQueue] = useState<PendingQueue | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueSelect, setQueueSelect] = useState('')

  const loadPendingQueue = useCallback(async () => {
    setQueueLoading(true)
    setQueueError(null)
    try {
      const res = await fetch('/api/admin/agent/event?queue=pending')
      const data = (await res.json()) as PendingQueue & { error?: string }
      if (!res.ok) throw new Error(data.error || res.statusText)
      setQueueSelect('')
      setPendingQueue({
        count: data.count,
        events: data.events || [],
      })
    } catch (e) {
      setPendingQueue(null)
      setQueueError(e instanceof Error ? e.message : 'No se pudo cargar la cola')
    } finally {
      setQueueLoading(false)
    }
  }, [])

  useEffect(() => {
    loadPendingQueue()
  }, [loadPendingQueue])

  function onPickFromQueue(value: string) {
    setQueueSelect(value)
    if (!value) return
    setSlug(value)
    setResult(null)
    setSaved(false)
    setMessage(null)
    setError(null)
    setFieldsUpdated([])
  }

  async function handleEnrich(e: React.FormEvent) {
    e.preventDefault()
    if (!slug.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)
    setSaved(false)
    setMessage(null)
    setFieldsUpdated([])

    try {
      const res = await fetch('/api/admin/agent/event', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, force }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || res.statusText)
      }

      const json = (await res.json()) as {
        event?: Record<string, unknown>
        saved?: boolean
        message?: string
        dbError?: string
        fieldsUpdated?: string[]
      }

      if (json.event) setResult(json.event)
      if (json.fieldsUpdated) setFieldsUpdated(json.fieldsUpdated)

      if (json.saved) {
        setSaved(true)
        setMessage(
          `Evento actualizado. Campos: ${(json.fieldsUpdated || []).join(', ') || 'ninguno'}.`,
        )
        void loadPendingQueue()
      } else if (json.message) {
        setMessage(json.message)
      } else if (json.dbError) {
        setMessage(`Error al escribir en BD: ${json.dbError}`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  function handleDownload() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}-enriched.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="admin-panel relative border-[3px] border-[var(--ink)] bg-[var(--red)]/10 shadow-[8px_8px_0_var(--ink)] space-y-3">
        <h2
          className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] border-b-[3px] border-[var(--ink)] pb-2"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          Cola: eventos sin descripción
        </h2>
        <p className="text-sm leading-relaxed text-[var(--ink)]" style={{ fontFamily: "'Special Elite', monospace" }}>
          Eventos cuya descripción ES tiene menos de 100 caracteres.{' '}
          <strong>Enriquece con IA + búsqueda web</strong> hasta completar la cola.
        </p>
        {queueLoading && <p className="admin-muted text-xs">Cargando cola…</p>}
        {queueError && (
          <p className="text-xs font-bold uppercase tracking-wide text-[var(--red)]">{queueError}</p>
        )}
        {!queueLoading && pendingQueue && (
          <>
            <p className="text-sm font-bold" style={{ fontFamily: "'Courier Prime', monospace" }}>
              Pendientes: <span className="text-[var(--red)]">{pendingQueue.count}</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <label htmlFor="eventQueuePick" className="admin-label shrink-0 !mb-0 self-center">
                Elegir de la cola
              </label>
              <select
                id="eventQueuePick"
                value={queueSelect}
                onChange={(e) => onPickFromQueue(e.target.value)}
                className="admin-input flex-1 min-w-0"
              >
                <option value="">— Selecciona un evento pendiente —</option>
                {pendingQueue.events.map((ev) => (
                  <option key={ev.slug} value={ev.slug}>
                    {ev.name} ({ev.slug})
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => loadPendingQueue()}
                className="admin-btn admin-btn--ghost admin-btn--sm shrink-0"
              >
                Actualizar
              </button>
            </div>
            {queueSelect ? (
              <a
                href={`/${lang}/events/${queueSelect}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-block text-xs font-bold uppercase tracking-wide text-[var(--red)] underline underline-offset-2 hover:text-[var(--uv)]"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                Ver ficha pública →
              </a>
            ) : null}
          </>
        )}
      </div>

      <div className="admin-panel">
        <form onSubmit={handleEnrich} className="space-y-5">
          <div>
            <label htmlFor="eventSlug" className="admin-label">
              Slug del evento
            </label>
            <input
              id="eventSlug"
              type="text"
              required
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              placeholder="Ej: raveart-summer-festival-2026"
              className="admin-input"
            />
            <p className="admin-muted text-xs mt-1">
              El evento debe existir en la BD. Este agente lo enriquece con búsqueda web + IA.
            </p>
          </div>

          <div className="admin-check-row">
            <input
              id="eventForce"
              type="checkbox"
              checked={force}
              onChange={(e) => setForce(e.target.checked)}
              className="admin-checkbox"
            />
            <label htmlFor="eventForce" className="cursor-pointer">
              Forzar (sobrescribir campos existentes)
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !slug.trim()}
            className="admin-btn admin-btn--yellow"
          >
            Enriquecer
          </button>
        </form>
      </div>

      {loading && (
        <div className="admin-panel text-center border-[3px] border-[var(--ink)] bg-[var(--paper)]">
          <p
            className="text-[var(--uv)] animate-pulse text-lg font-black uppercase"
            style={{ fontFamily: "'Unbounded', sans-serif" }}
          >
            Enriqueciendo evento…
          </p>
        </div>
      )}

      {error && (
        <div className="admin-panel border-[3px] border-[var(--red)] bg-[var(--red)]/10">
          <p className="text-sm font-bold text-[var(--red)]">{error}</p>
        </div>
      )}

      {message && (
        <div
          className={`admin-panel border-[3px] text-sm ${
            saved
              ? 'border-[var(--acid)] bg-[var(--acid)]/25'
              : 'border-[var(--orange)] bg-[var(--orange)]/15'
          }`}
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {message}
        </div>
      )}

      {fieldsUpdated.length > 0 && saved && (
        <div className="admin-panel border-[3px] border-[var(--ink)] bg-[var(--paper)]">
          <h3
            className="text-[11px] font-bold uppercase tracking-wider mb-2"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            Campos actualizados
          </h3>
          <div className="flex flex-wrap gap-1.5">
            {fieldsUpdated.map((f) => (
              <span
                key={f}
                className="inline-block px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider border-2 border-[var(--ink)] bg-[var(--acid)]/30"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                {f}
              </span>
            ))}
          </div>
        </div>
      )}

      {result && (
        <div className="admin-panel space-y-4">
          <h2 className="text-base font-black uppercase border-b-[3px] border-[var(--ink)] pb-2" style={{ fontFamily: "'Unbounded', sans-serif" }}>
            Resultado
          </h2>

          <textarea
            readOnly
            value={JSON.stringify(result, null, 2)}
            rows={20}
            className="admin-input admin-input-mono resize-y bg-[var(--paper-dark)]"
          />

          <div className="flex flex-wrap gap-3">
            <button type="button" onClick={handleDownload} className="admin-btn admin-btn--ghost">
              Descargar JSON
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
