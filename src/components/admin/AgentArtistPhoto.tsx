'use client'

import { useState, useEffect, useCallback } from 'react'

type PendingQueue = {
  count: number
  artists: { slug: string; name: string }[]
}

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function AgentArtistPhoto({ lang }: { lang: string }) {
  const [artistName, setArtistName] = useState('')
  const [slug, setSlug] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<{
    skipped?: boolean
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
      const res = await fetch('/api/admin/agent/artist-photo?queue=missing')
      const data = (await res.json()) as PendingQueue & { error?: string }
      if (!res.ok) throw new Error(data.error || res.statusText)
      setQueueSelect('')
      setPendingQueue({ count: data.count, artists: data.artists || [] })
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
    const row = pendingQueue?.artists.find((a) => a.slug === value)
    if (!row) return
    setArtistName(row.name)
    setSlug(row.slug)
    setResult(null)
    setError(null)
  }

  async function handleSearch(e: React.FormEvent) {
    e.preventDefault()
    if (!artistName.trim() || !slug.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)

    try {
      const res = await fetch('/api/admin/agent/artist-photo', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, artistName }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || res.statusText)
      if (json.skipped) {
        setResult({
          skipped: true,
          chosen: null,
          reason: typeof json.reason === 'string' ? json.reason : 'Omitido',
          candidates: 0,
        })
        return
      }
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
      <div className="admin-panel relative border-[3px] border-[var(--ink)] bg-[var(--yellow)]/35 shadow-[8px_8px_0_var(--ink)] space-y-3">
        <h2 className="text-[11px] font-bold uppercase tracking-wider text-[var(--ink)] border-b-[3px] border-[var(--ink)] pb-2" style={{ fontFamily: "'Courier Prime', monospace" }}>
          Cola: artistas sin foto
        </h2>
        <p className="text-sm leading-relaxed text-[var(--ink)]" style={{ fontFamily: "'Special Elite', monospace" }}>
          Artistas cuya <code>image_url</code> está vacía (sin retrato en <code>public/images/artists</code> según el mapa).{' '}
          <strong>Busca y asigna fotos con IA</strong> desde Google Imágenes.
        </p>
        {queueLoading && <p className="admin-muted text-xs">Cargando cola…</p>}
        {queueError && <p className="text-xs font-bold uppercase tracking-wide text-[var(--red)]">{queueError}</p>}
        {!queueLoading && pendingQueue && (
          <>
            <p className="text-sm font-bold" style={{ fontFamily: "'Courier Prime', monospace" }}>
              Sin foto: <span className="text-[var(--red)]">{pendingQueue.count}</span>
            </p>
            <div className="flex flex-col sm:flex-row gap-2 sm:items-center">
              <label htmlFor="photoQueuePick" className="admin-label shrink-0 !mb-0 self-center">Elegir de la cola</label>
              <select id="photoQueuePick" value={queueSelect} onChange={(e) => onPickFromQueue(e.target.value)} className="admin-input flex-1 min-w-0">
                <option value="">— Selecciona un artista —</option>
                {pendingQueue.artists.map((a) => (
                  <option key={a.slug} value={a.slug}>{a.name} ({a.slug})</option>
                ))}
              </select>
              <button type="button" onClick={() => loadPendingQueue()} className="admin-btn admin-btn--ghost admin-btn--sm shrink-0">Actualizar</button>
            </div>
            {queueSelect && (
              <a href={`/${lang}/artists/${queueSelect}`} target="_blank" rel="noopener noreferrer" className="inline-block text-xs font-bold uppercase tracking-wide text-[var(--red)] underline underline-offset-2 hover:text-[var(--uv)]" style={{ fontFamily: "'Courier Prime', monospace" }}>Ver ficha pública →</a>
            )}
          </>
        )}
      </div>

      <div className="admin-panel">
        <form onSubmit={handleSearch} className="space-y-5">
          <div>
            <label htmlFor="photoArtistName" className="admin-label">Nombre del artista</label>
            <input id="photoArtistName" type="text" required value={artistName} onChange={(e) => setArtistName(e.target.value)} placeholder="Ej: Krafty Kuts" className="admin-input" />
          </div>
          <div>
            <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
              <label htmlFor="photoSlug" className="admin-label !mb-0">Slug</label>
              <button type="button" onClick={() => setSlug(toSlug(artistName))} className="text-[10px] font-bold uppercase tracking-wider text-[var(--red)] underline underline-offset-2 hover:text-[var(--uv)]" style={{ fontFamily: "'Courier Prime', monospace" }}>Generar desde el nombre</button>
            </div>
            <input id="photoSlug" type="text" required value={slug} onChange={(e) => setSlug(e.target.value)} className="admin-input" />
          </div>
          <button type="submit" disabled={loading || !artistName.trim() || !slug.trim()} className="admin-btn admin-btn--yellow">
            Buscar foto
          </button>
        </form>
      </div>

      {loading && (
        <div className="admin-panel text-center border-[3px] border-[var(--ink)] bg-[var(--paper)]">
          <p className="text-[var(--uv)] animate-pulse text-lg font-black uppercase" style={{ fontFamily: "'Unbounded', sans-serif" }}>Buscando foto…</p>
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
          {result.skipped && (
            <div className="admin-panel border-[3px] border-[var(--ink)] bg-[var(--yellow)]/40 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
              No se ha buscado foto: {result.reason}
            </div>
          )}
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
              <img src={result.storageUrl} alt={`Foto de ${artistName}`} className="max-w-[280px] max-h-[280px] object-contain" />
            </div>
          )}
          {result.saved && <div className="admin-panel border-[3px] border-[var(--acid)] bg-[var(--acid)]/25 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>Foto guardada en Storage y actualizada en BD.</div>}
          {result.storageError && <div className="admin-panel border-[3px] border-[var(--red)] bg-[var(--red)]/10 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>Error Storage: {result.storageError}</div>}
          {result.dbError && <div className="admin-panel border-[3px] border-[var(--orange)] bg-[var(--orange)]/15 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>Error BD: {result.dbError}</div>}
          {!result.skipped && !result.chosen && (
            <div className="admin-panel border-[3px] border-[var(--orange)] bg-[var(--orange)]/15 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
              No se encontró foto adecuada. Prueba con otro nombre o sube manualmente.
            </div>
          )}
        </div>
      )}
    </div>
  )
}
