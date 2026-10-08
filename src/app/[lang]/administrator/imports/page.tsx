'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams, usePathname } from 'next/navigation'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import type { PreviewTrack } from '@/components/DeckAudioProvider'
import { ArtistNames, LabelName } from '@/components/ArtistNames'
import { BeatportLinkButton } from '@/components/TrackShareButton'
import { formatAdvanceReleaseDay, formatTrackReleaseDisplay, isAdvanceRelease } from '@/lib/share-track'
import type { Locale } from '@/lib/i18n-config'

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
  release_year: number | null
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
  artist_slug_map?: Record<string, string>
  label_slug_map?: Record<string, string>
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
  const [undo, setUndo] = useState<{ row: PendingTrack; index: number } | null>(null)
  const pathname = usePathname()
  const params = useParams<{ lang?: string }>()
  const lang: Locale = params?.lang === 'en' ? 'en' : 'es'
  const {
    previewQueue, previewIndex, previewGroupKey, previewPlaying,
    playPreviewQueue, togglePreview, stopPreview, extendPreviewQueue,
  } = usePreviewAudioGated()

  // `silent`: refresca los datos sin tapar la lista con «Cargando la cola…».
  // `loading` nace en true, así que la primera carga no tiene que ponerlo.
  const load = useCallback((silent = false) => {
    fetch('/api/admin/imports', { credentials: 'same-origin' })
      .then(async (r) => {
        const j = (await r.json()) as Payload
        if (!r.ok) throw new Error(j.error || r.statusText)
        setPayload(j)
        setErr(null)
      })
      .catch((e: Error) => { if (!silent) setErr(e.message) })
      .finally(() => { if (!silent) setLoading(false) })
  }, [])

  useEffect(() => { load() }, [load])

  // La fila se quita (o se repone) en el acto; la red va detrás.
  function removeRow(id: string) {
    setPayload((p) => p ? {
      ...p,
      pending: p.pending.filter((t) => t.id !== id),
      pending_count: Math.max(0, p.pending_count - 1),
    } : p)
  }
  function insertRow(row: PendingTrack, index: number) {
    setPayload((p) => {
      if (!p) return p
      if (p.pending.some((t) => t.id === row.id)) return p
      const next = [...p.pending]
      next.splice(Math.min(index, next.length), 0, row)
      return { ...p, pending: next, pending_count: p.pending_count + 1 }
    })
  }

  async function act(id: string, action: 'approve' | 'discard' | 'restore') {
    setBusyId(id)
    setNote(null)
    const index = payload?.pending.findIndex((t) => t.id === id) ?? -1
    const row = index >= 0 ? payload?.pending[index] : undefined
    if (action === 'restore') {
      if (undo?.row.id === id) insertRow(undo.row, undo.index)
      setUndo(null)
    } else if (row) {
      removeRow(id)
      setUndo(action === 'discard' ? { row, index } : null)
    }
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
    } catch (e) {
      // Si la red falla, se deshace lo que ya se había pintado.
      if (action === 'restore') {
        removeRow(id)
        if (row) setUndo({ row, index })
      } else if (row) {
        insertRow(row, index)
        setUndo(null)
      }
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
      load(true)
    } catch (e) {
      setNote(e instanceof Error ? e.message : String(e))
    } finally {
      setRunning(false)
    }
  }

  const pending = payload?.pending ?? []
  const artistSlugMap = payload?.artist_slug_map
  const labelSlugMap = payload?.label_slug_map
  const activeRowKey = previewGroupKey === PREVIEW_GROUP
    ? previewQueue[previewIndex]?.rowKey ?? null
    : null

  // Al pasar al siguiente tema, la fila que suena entra en pantalla si no estaba.
  useEffect(() => {
    if (!activeRowKey) return
    document.getElementById(`import-row-${activeRowKey}`)?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
  }, [activeRowKey])

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
          Descartado «{undo.row.title}».{' '}
          <button type="button" className="underline font-black" onClick={() => act(undo.row.id, 'restore')}>
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
        // Mismo contenedor y misma fila que una semana de /charts
        // (`FeaturedPickRow`): solo faltan Spotify/TIDAL, que llegan con el match
        // al publicar, y el «+» / compartir, que no tienen sentido en la cola.
        <section className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden">
          {pending.map((t) => {
            const isActive = activeRowKey === t.id
            const isSounding = isActive && previewPlaying
            const mixName = (t.mix_name || '').trim()
            const releaseDisp = formatTrackReleaseDisplay(t.release_date, t.release_year)
            const isAdvance = isAdvanceRelease(t.release_date)
            const rowStateClasses = isAdvance
              ? `bg-[#f7e733]/30 ${isActive ? 'border-[#d62828]/40' : 'border-[var(--ink)]/10'}`
              : isActive
                ? 'bg-[var(--red)]/15 border-[var(--red)]/30'
                : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'
            return (
              <div
                id={`import-row-${t.id}`}
                key={t.id}
                className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] last:border-b-0 transition-colors ${rowStateClasses}`}
              >
                {isAdvance ? (
                  <div
                    className="-mx-3 sm:-mx-5 -mt-3 sm:-mt-4 flex items-center gap-2.5 bg-[var(--yellow)] text-[var(--ink)] px-3 sm:px-5 py-1.5 text-[10px] sm:text-[11px] font-bold tracking-[0.12em] whitespace-nowrap overflow-hidden"
                    style={mono}
                  >
                    <span className="animate-pulse shrink-0">●</span>
                    <span className="truncate">ADELANTO — SALE EL {formatAdvanceReleaseDay(t.release_date || '', lang)}</span>
                    <span className="ml-auto hidden md:inline font-normal opacity-75 text-[10px] tracking-[0.05em] shrink-0">PREVIEW</span>
                  </div>
                ) : null}
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)]">
                      {t.artwork_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={t.artwork_url} alt="" className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full bg-[var(--yellow)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate" style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}>
                        {isSounding ? <span className="text-[var(--red)] animate-pulse text-xs mr-1.5 align-middle">●</span> : null}
                        {t.title}
                        {mixName ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{mixName}</span> : null}
                      </h3>
                      <p className="text-xs sm:text-sm mt-0.5 break-words" style={mono}>
                        <ArtistNames artists={t.artists} mixName={mixName} slugMap={artistSlugMap} lang={lang} />
                        {t.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><LabelName name={t.label} slugMap={labelSlugMap} lang={lang} /></> : null}
                        {releaseDisp ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap">{releaseDisp}</span></> : null}
                      </p>
                    </div>
                  </div>

                  <div className="track-action-bar">
                    {t.sample_url ? (
                      <button
                        type="button"
                        onClick={() => togglePlay(t)}
                        className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation whitespace-nowrap
                          ${isActive ? 'bg-[var(--red)] text-white hover:bg-[var(--ink)] active:bg-[var(--ink)]' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
                        style={mono}
                        title={isSounding ? 'Pausa' : 'Oír'}
                        aria-label={isSounding ? 'Pausa' : 'Oír'}
                      >
                        {isSounding ? '❚❚' : '▶'}
                      </button>
                    ) : null}
                    {t.bpm != null && t.bpm > 0 ? (
                      <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5" style={mono}>
                        {t.bpm}
                      </span>
                    ) : null}
                    {(t.music_key || '').trim() ? (
                      <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5 whitespace-nowrap" style={mono}>
                        {(t.music_key || '').trim()}
                      </span>
                    ) : null}
                    <BeatportLinkButton url={t.link_url} lang={lang} />
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => act(t.id, 'approve')}
                      className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--red)] text-white hover:bg-[var(--ink)] active:bg-[var(--ink)] transition-all touch-manipulation whitespace-nowrap uppercase disabled:opacity-40"
                      style={mono}
                    >
                      Incluir
                    </button>
                    <button
                      type="button"
                      disabled={busyId === t.id}
                      onClick={() => act(t.id, 'discard')}
                      className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)] transition-all touch-manipulation whitespace-nowrap uppercase disabled:opacity-40"
                      style={mono}
                    >
                      Descartar
                    </button>
                  </div>
                </div>
              </div>
            )
          })}
        </section>
      )}
    </div>
  )
}
