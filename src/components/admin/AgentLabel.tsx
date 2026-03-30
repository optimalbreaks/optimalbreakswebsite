'use client'

import { useState, useEffect, useCallback } from 'react'
import { adminCreate } from '@/lib/admin-api'

type PendingQueue = {
  count: number
  labels: { slug: string; name: string }[]
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function AgentLabel({ lang }: { lang: string }) {
  const [labelName, setLabelName] = useState('')
  const [slug, setSlug] = useState('')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const [persistMessage, setPersistMessage] = useState<string | null>(null)
  const [pendingQueue, setPendingQueue] = useState<PendingQueue | null>(null)
  const [queueError, setQueueError] = useState<string | null>(null)
  const [queueLoading, setQueueLoading] = useState(true)
  const [queueSelect, setQueueSelect] = useState('')

  const loadPendingQueue = useCallback(async () => {
    setQueueLoading(true)
    setQueueError(null)
    try {
      const res = await fetch('/api/admin/agent/label?queue=pending')
      const data = (await res.json()) as PendingQueue & { error?: string }
      if (!res.ok) throw new Error(data.error || res.statusText)
      setQueueSelect('')
      setPendingQueue({
        count: data.count,
        labels: data.labels || [],
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

  function applySlugFromName() {
    setSlug(toSlug(labelName))
  }

  function onPickFromQueue(value: string) {
    setQueueSelect(value)
    if (!value) return
    const row = pendingQueue?.labels.find((l) => l.slug === value)
    if (!row) return
    setLabelName(row.name)
    setSlug(row.slug)
    setResult(null)
    setSaved(false)
    setPersistMessage(null)
    setError(null)
  }

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!labelName.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)
    setSaved(false)
    setPersistMessage(null)

    try {
      const res = await fetch('/api/admin/agent/label', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, labelName, notes, search }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || res.statusText)
      }

      const json = (await res.json()) as {
        label?: Record<string, unknown>
        saved?: boolean
        row?: { id?: string }
        dbError?: string
      }
      const label = json.label
      if (!label || typeof label !== 'object') {
        throw new Error('Respuesta del servidor sin objeto label')
      }
      setResult(label)
      if (json.saved) {
        setSaved(true)
        setPersistMessage(
          json.row?.id
            ? `Guardado en Supabase (id: ${json.row.id}).`
            : 'Guardado en Supabase.',
        )
        void loadPendingQueue()
      } else if (json.dbError) {
        setPersistMessage(
          `No se pudo escribir en la base automáticamente: ${json.dbError} Puedes usar «Guardar en BD» abajo o revisar credenciales en el servidor.`,
        )
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!result) return
    setError(null)

    try {
      await adminCreate('labels', result)
      setSaved(true)
      setPersistMessage('Sello guardado correctamente en la base de datos.')
      void loadPendingQueue()
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  function handleDownload() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="space-y-6">
      <div className="admin-panel relative border-[3px] border-[var(--ink)] bg-[var(--uv)]/15 shadow-[8px_8px_0_var(--ink)] space-y-3">
        <h2
          className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] border-b-[3px] border-[var(--ink)] pb-2"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          Cola: sellos sin descripción
        </h2>
        <p className="text-sm leading-relaxed text-[var(--ink)]" style={{ fontFamily: "'Special Elite', monospace" }}>
          Sellos cuya descripción ES tiene menos de 100 caracteres.{' '}
          <strong>Genera fichas con IA</strong> hasta completar la cola.
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
              <label htmlFor="labelQueuePick" className="admin-label shrink-0 !mb-0 self-center">
                Elegir de la cola
              </label>
              <select
                id="labelQueuePick"
                value={queueSelect}
                onChange={(e) => onPickFromQueue(e.target.value)}
                className="admin-input flex-1 min-w-0"
              >
                <option value="">— Selecciona un sello pendiente —</option>
                {pendingQueue.labels.map((l) => (
                  <option key={l.slug} value={l.slug}>
                    {l.name} ({l.slug})
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
                href={`/${lang}/labels/${queueSelect}`}
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
        <form onSubmit={handleGenerate} className="space-y-5">
          <div>
            <label htmlFor="labelName" className="admin-label">
              Nombre del sello
            </label>
            <input
              id="labelName"
              type="text"
              required
              value={labelName}
              onChange={(e) => setLabelName(e.target.value)}
              placeholder="Ej: Lot49"
              className="admin-input"
            />
          </div>

          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label htmlFor="labelSlug" className="admin-label !mb-0">
                Slug
              </label>
              <button
                type="button"
                onClick={applySlugFromName}
                className="text-[10px] font-bold uppercase tracking-wider text-[var(--red)] underline underline-offset-2 hover:text-[var(--uv)]"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                Generar desde el nombre
              </button>
            </div>
            <input
              id="labelSlug"
              type="text"
              value={slug}
              onChange={(e) => setSlug(e.target.value)}
              className="admin-input"
            />
          </div>

          <div>
            <label htmlFor="labelNotes" className="admin-label">
              Notas editoriales (opcional)
            </label>
            <textarea
              id="labelNotes"
              rows={3}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Indicaciones adicionales para el agente..."
              className="admin-input resize-y"
            />
          </div>

          <div className="admin-check-row">
            <input
              id="labelSearch"
              type="checkbox"
              checked={search}
              onChange={(e) => setSearch(e.target.checked)}
              className="admin-checkbox"
            />
            <label htmlFor="labelSearch" className="cursor-pointer">
              Buscar en la web (SerpAPI)
            </label>
          </div>

          <button
            type="submit"
            disabled={loading || !labelName.trim()}
            className="admin-btn admin-btn--yellow"
          >
            Generar
          </button>
        </form>
      </div>

      {loading && (
        <div className="admin-panel text-center border-[3px] border-[var(--ink)] bg-[var(--paper)]">
          <p
            className="text-[var(--uv)] animate-pulse text-lg font-black uppercase"
            style={{ fontFamily: "'Unbounded', sans-serif" }}
          >
            Generando ficha de sello…
          </p>
        </div>
      )}

      {error && (
        <div className="admin-panel border-[3px] border-[var(--red)] bg-[var(--red)]/10">
          <p className="text-sm font-bold text-[var(--red)]">{error}</p>
        </div>
      )}

      {persistMessage && (
        <div
          className={`admin-panel border-[3px] text-sm ${
            saved
              ? 'border-[var(--acid)] bg-[var(--acid)]/25'
              : 'border-[var(--orange)] bg-[var(--orange)]/15'
          }`}
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {persistMessage}
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
            <button
              type="button"
              onClick={handleSave}
              disabled={saved}
              className="admin-btn"
            >
              {saved ? 'Ya en BD' : 'Guardar en BD'}
            </button>
            <button type="button" onClick={handleDownload} className="admin-btn admin-btn--ghost">
              Descargar JSON
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
