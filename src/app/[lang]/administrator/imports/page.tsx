'use client'

import { useCallback, useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import type { PreviewTrack } from '@/components/DeckAudioProvider'

type Artist = { name: string }

type PendingTrack = {
  id: string
  title: string
  mix_name: string
  artists: Artist[]
  label: string
  artwork_url: string | null
  sample_url: string | null
  bpm: number | null
  music_key: string
  release_date: string | null
  link_url: string
}

type LastRun = {
  finished_at: string | null
  trigger: string
  ok: boolean
  seen: number
  queued: number
  auto_approved: number
  error: string | null
} | null

type Payload = {
  import_from: string
  pending_count: number
  pending: PendingTrack[]
  last_run: LastRun
  error?: string
}

const mono = { fontFamily: "'Courier Prime', monospace" } as const
const PREVIEW_GROUP = 'admin-imports'

function sampleSrc(url: string) {
  return `/api/audio-proxy?url=${encodeURIComponent(url)}`
}

function shortRunError(raw: string): string {
  if (raw.includes('libnss3')) return 'El navegador del servidor no ha arrancado. Beatport no se ha leído.'
  const line = raw.split('\n').map((s) => s.trim()).find(Boolean) || raw
  return line.length > 220 ? `${line.slice(0, 217)}…` : line
}

function names(artists: Artist[] | null | undefined) {
  return (artists || []).map((a) => a.name).filter(Boolean).join(', ') || '—'
}

export default function AdminImportsPage() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [running, setRunning] = useState(false)
  const [note, setNote] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ id: string; title: string } | null>(null)
  const pathname = usePathname()
  const {
    previewQueue, previewIndex, previewGroupKey, previewPlaying,
    playPreviewQueue, togglePreview, stopPreview, extendPreviewQueue,
  } = usePreviewAudioGated()

  const load = useCallback(() => {
    setLoading(true)
    fetch('/api/admin/imports', { credentials: 'same-origin' })
      .then(async (r) => {
        const j = (await r.json()) as Payload
        if (!r.ok) throw new Error(j.error || r.statusText)
        setPayload(j)
        setErr(null)
      })
      .catch((e: Error) => setErr(e.message))
      .finally(() => setLoading(false))
  }, [])

  useEffect(() => { load() }, [load])

  async function act(id: string, action: 'approve' | 'discard' | 'restore') {
    setBusyId(id)
    setNote(null)
    if (action === 'discard' && previewGroupKey === PREVIEW_GROUP) {
      const current = previewQueue[previewIndex]
      if (current?.rowKey === id) {
        stopPreview()
      } else if (previewQueue.some((row) => row.rowKey === id)) {
        const next = previewQueue.filter((row) => row.rowKey !== id)
        const idx = next.findIndex((row) => row.rowKey === current?.rowKey)
        if (next.length && idx >= 0) extendPreviewQueue(next, idx, PREVIEW_GROUP)
        else stopPreview()
      }
    }
    try {
      const r = await fetch('/api/admin/imports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, id }),
      })
      const j = (await r.json()) as { error?: string }
      if (!r.ok) throw new Error(j.error || r.statusText)
      if (action === 'discard') {
        const row = payload?.pending.find((t) => t.id === id)
        if (row) setUndo({ id, title: row.title })
      } else {
        setUndo(null)
      }
      load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setBusyId(null)
    }
  }

  async function runNow() {
    setRunning(true)
    setNote(null)
    try {
      const r = await fetch('/api/admin/imports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'run' }),
      })
      const j = (await r.json()) as {
        error?: string
        skipped?: string
        queued?: number
        auto_approved?: number
        seen?: number
      }
      if (!r.ok) throw new Error(j.error || r.statusText)
      if (j.skipped === 'before-start') {
        setNote('El pase empieza el 8 de octubre de 2026. Hasta hoy el catálogo está al día.')
      } else if (j.error) {
        setNote(j.error)
      } else {
        setNote(
          `Vistos ${j.seen ?? 0} · publicados del Top 100: ${j.auto_approved ?? 0} · pendientes de oír: ${j.queued ?? 0}`,
        )
      }
      load()
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const pending = payload?.pending ?? []
  const activeRowKey = previewGroupKey === PREVIEW_GROUP
    ? previewQueue[previewIndex]?.rowKey ?? null
    : null

  function togglePlay(track: PendingTrack) {
    if (!track.sample_url) return
    if (activeRowKey === track.id) {
      togglePreview()
      return
    }
    const playable = pending.filter((row) => row.sample_url)
    const index = playable.findIndex((row) => row.id === track.id)
    if (index < 0) return
    const queue: PreviewTrack[] = playable.map((row) => ({
      rowKey: row.id,
      src: sampleSrc(row.sample_url as string),
      title: row.title,
      artist: names(row.artists),
      artworkUrl: row.artwork_url,
      mixName: row.mix_name || null,
      album: row.label || null,
      domId: `import-row-${row.id}`,
      originPath: pathname || undefined,
    }))
    playPreviewQueue(queue, index, PREVIEW_GROUP)
  }

  return (
    <div>
      <h1 className="admin-page-title">Imports</h1>
      <p className="text-sm text-[var(--ink)]/60 -mt-4 mb-6 max-w-2xl" style={mono}>
        Cada día a las 12:05, desde el 8 de octubre de 2026: primero los temas nuevos de cada artista del Top 100, en cualquier género, que se publican directamente.
        Luego el listado de Breaks del día, descartando lo que ya entró por la primera vía. El resto de Breaks se queda aquí: incluir o descartar.
      </p>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="h-10 px-5 border-[3px] border-[var(--ink)] bg-[var(--yellow)] font-black text-[10px] tracking-wider uppercase disabled:opacity-40"
          style={mono}
        >
          {running ? 'Trayendo…' : 'Traer ahora'}
        </button>
        <span className="text-xs text-[var(--ink)]/60" style={mono}>
          {payload ? `${payload.pending_count} pendientes` : ''}
        </span>
      </div>

      {note && (
        <p className="text-xs font-bold mb-4" style={mono}>{note}</p>
      )}
      {undo && (
        <p className="text-xs mb-4" style={mono}>
          Descartado «{undo.title}».{' '}
          <button type="button" className="underline font-black" onClick={() => act(undo.id, 'restore')}>
            Deshacer
          </button>
        </p>
      )}
      {payload?.last_run && (
        <p className="text-[11px] text-[var(--ink)]/50 mb-4" style={mono}>
          Último pase ({payload.last_run.trigger === 'manual' ? 'manual' : 'automático'}
          {payload.last_run.finished_at ? ` · ${new Date(payload.last_run.finished_at).toLocaleString('es-ES')}` : ''})
          {payload.last_run.ok
            ? ` · Top 100 publicados ${payload.last_run.auto_approved} · a la cola ${payload.last_run.queued}`
            : ` · ${shortRunError(payload.last_run.error || 'falló')}`}
        </p>
      )}

      {loading && (
        <div className="admin-panel !p-8 text-center">
          <span style={mono}>Cargando la cola…</span>
        </div>
      )}
      {err && (
        <div className="admin-panel !p-5 !border-[var(--red)]">
          <span style={mono}>{err}</span>
        </div>
      )}

      {!loading && !err && pending.length === 0 && (
        <div className="admin-panel !p-8">
          <p className="font-black" style={{ fontFamily: "'Unbounded', sans-serif" }}>
            No hay nada por oír.
          </p>
          <p className="text-sm text-[var(--ink)]/60 mt-2" style={mono}>
            Lo del Top 100 ya está en la web. Cuando Beatport publique más, aparecerá aquí.
          </p>
        </div>
      )}

      {!loading && pending.length > 0 && (
        <ul className="flex flex-col gap-3">
          {pending.map((t) => (
            <li id={`import-row-${t.id}`} key={t.id} className="admin-panel !p-4 flex flex-col sm:flex-row gap-4">
              {t.artwork_url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={t.artwork_url} alt="" className="w-16 h-16 object-cover border-[3px] border-[var(--ink)] shrink-0" />
              ) : (
                <div className="w-16 h-16 border-[3px] border-[var(--ink)] bg-[var(--yellow)] shrink-0" />
              )}
              <div className="min-w-0 flex-1">
                <div className="font-black leading-tight" style={{ fontFamily: "'Unbounded', sans-serif" }}>
                  <a href={t.link_url} target="_blank" rel="noopener noreferrer" className="no-underline hover:underline text-[var(--ink)]">
                    {t.title}
                  </a>
                  {t.mix_name ? <span className="font-normal text-[11px] text-[var(--ink)]/50 ml-2">{t.mix_name}</span> : null}
                </div>
                <p className="text-xs mt-1 text-[var(--ink)]/75" style={mono}>
                  {names(t.artists)}
                  {t.label ? ` · ${t.label}` : ''}
                </p>
                <p className="text-[11px] mt-1 text-[var(--ink)]/50" style={mono}>
                  {t.release_date || '—'}
                  {t.bpm ? ` · ${t.bpm} BPM` : ''}
                  {t.music_key ? ` · ${t.music_key}` : ''}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <button
                  type="button"
                  disabled={!t.sample_url}
                  onClick={() => togglePlay(t)}
                  className="h-10 px-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] font-black text-[10px] tracking-wider uppercase disabled:opacity-30"
                  style={mono}
                >
                  {activeRowKey === t.id && previewPlaying ? 'Pausa' : 'Oír'}
                </button>
                <button
                  type="button"
                  disabled={busyId === t.id}
                  onClick={() => act(t.id, 'approve')}
                  className="h-10 px-3 border-[3px] border-[var(--ink)] bg-[var(--red)] text-white font-black text-[10px] tracking-wider uppercase disabled:opacity-40"
                  style={mono}
                >
                  Incluir
                </button>
                <button
                  type="button"
                  disabled={busyId === t.id}
                  onClick={() => act(t.id, 'discard')}
                  className="h-10 px-3 border-[3px] border-[var(--ink)] bg-[var(--paper)] font-black text-[10px] tracking-wider uppercase disabled:opacity-40"
                  style={mono}
                >
                  Descartar
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
