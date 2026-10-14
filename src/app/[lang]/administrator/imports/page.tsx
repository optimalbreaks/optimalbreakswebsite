'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
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
  breaks_listing_url?: string
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

const BEATPORT_ORIGIN = /^https:\/\/([a-z0-9-]+\.)?beatport\.com$/i

type JobLine = { at: string; line: string }
type JobResult = {
  ok: boolean
  skipped?: string
  error?: string
  seen?: number
  queued?: number
  auto_approved?: number
  skipped_known?: number
}
type Job = {
  title: string
  kind: 'run' | 'ingest'
  lines: JobLine[]
  running: boolean
  stopping: boolean
  result: JobResult | null
}

function jobSummary(r: JobResult): string {
  if (r.skipped === 'before-start') return 'El pase empieza el 8 de octubre de 2026. Hasta hoy el catálogo está al día.'
  if (r.skipped === 'already-running') return 'Ya hay un pase en marcha. Puedes pararlo aquí y volver a lanzar.'
  const counts = `Vistos ${r.seen ?? 0} · por aprobar ${r.queued ?? 0} · publicados del Top 100 ${r.auto_approved ?? 0} · ya estaban ${r.skipped_known ?? 0}`
  return r.error ? `${r.error} ${counts}` : counts
}

function clock(at: string) {
  const d = new Date(at)
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleTimeString('es-ES', { hour12: false })
}

/**
 * Botón de favoritos. Corre en la pestaña de Beatport del editor (que ya pasó
 * la verificación de Cloudflare), coge la lista de temas que la página trae
 * cargada y la manda a esta pantalla: por mensaje a la pestaña que abre y,
 * por si el navegador corta ese hilo, también al portapapeles.
 */
function beatportBookmarklet(origin: string, lang: string): string {
  const body = `(function(){var O=${JSON.stringify(origin)},L=${JSON.stringify(lang)};var el=document.getElementById('__NEXT_DATA__');if(!el||location.hostname.indexOf('beatport.com')<0){alert('Abre el listado de Breaks en Beatport y vuelve a pulsar.');return}var nd;try{nd=JSON.parse(el.textContent)}catch(e){alert('No se ha podido leer la página.');return}var qs=(((nd.props||{}).pageProps||{}).dehydratedState||{}).queries||[];var q=qs.filter(function(x){return x&&x.queryKey&&x.queryKey[0]==='tracks'});if(!q.length){alert('En esta página no hay lista de temas.');return}var data=JSON.stringify({v:1,url:location.href,nextData:{props:{pageProps:{dehydratedState:{queries:q}}}}});var go=function(){var w=window.open(O+'/'+L+'/administrator/imports?beatport=1','ob-imports');if(!w){alert('Copiado. Abre Por aprobar en Optimal Breaks y pégalo en el recuadro.');return}window.addEventListener('message',function h(e){if(e.origin!==O||!e.data||e.data.type!=='ob-beatport-ready')return;e.source.postMessage({type:'ob-beatport-data',payload:data},O);window.removeEventListener('message',h)})};try{navigator.clipboard.writeText(data).then(go,go)}catch(e){go()}})()`
  return `javascript:${encodeURIComponent(body)}`
}

export default function AdminImportsPage() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [err, setErr] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [busyId, setBusyId] = useState<string | null>(null)
  const [note, setNote] = useState<string | null>(null)
  const [undo, setUndo] = useState<{ row: PendingTrack; index: number } | null>(null)
  const [ingesting, setIngesting] = useState(false)
  const [job, setJob] = useState<Job | null>(null)
  const [jobOpen, setJobOpen] = useState(false)
  const bookmarkletRef = useRef<HTMLAnchorElement>(null)
  const logRef = useRef<HTMLDivElement>(null)
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

  // Ventana de «Traer ahora» y del favorito: el servidor manda una línea por paso.
  const streamJob = useCallback(async (title: string, kind: Job['kind'], body: Record<string, unknown>) => {
    setNote(null)
    setJob({ title, kind, lines: [], running: true, stopping: false, result: null })
    setJobOpen(true)
    const push = (line: JobLine) => setJob((j) => (j ? { ...j, lines: [...j.lines, line] } : j))
    let result: JobResult = { ok: false, error: 'El pase terminó sin resultado.' }
    try {
      const r = await fetch('/api/admin/imports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      })
      if (!r.ok || !r.body) {
        const j = (await r.json().catch(() => ({}))) as { error?: string }
        throw new Error(j.error || r.statusText)
      }
      const reader = r.body.getReader()
      const decoder = new TextDecoder()
      let buf = ''
      for (;;) {
        const { value, done } = await reader.read()
        if (value) buf += decoder.decode(value, { stream: true })
        let nl = buf.indexOf('\n')
        while (nl >= 0) {
          const raw = buf.slice(0, nl).trim()
          buf = buf.slice(nl + 1)
          nl = buf.indexOf('\n')
          if (!raw) continue
          try {
            const msg = JSON.parse(raw) as { type: 'log'; line: string; at: string } | { type: 'done'; result: JobResult }
            if (msg.type === 'log') push({ at: msg.at, line: msg.line })
            else result = msg.result
          } catch {
            /* línea rota */
          }
        }
        if (done) break
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      push({ at: new Date().toISOString(), line: `Error: ${message}` })
      result = { ok: false, error: message }
    }
    setJob((j) => (j ? { ...j, running: false, stopping: false, result } : j))
    load(true)
  }, [load])

  async function stopJob() {
    setJob((j) => (j ? { ...j, stopping: true, lines: [...j.lines, { at: new Date().toISOString(), line: 'Pidiendo que pare… acaba la página que está leyendo.' }] } : j))
    try {
      const r = await fetch('/api/admin/imports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      const j = (await r.json()) as { error?: string; stopped?: number }
      if (!r.ok) throw new Error(j.error || r.statusText)
      if (!j.stopped) {
        setJob((s) => (s ? { ...s, stopping: false, lines: [...s.lines, { at: new Date().toISOString(), line: 'No había ningún pase abierto.' }] } : s))
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setJob((s) => (s ? { ...s, stopping: false, lines: [...s.lines, { at: new Date().toISOString(), line: `No se pudo parar: ${message}` }] } : s))
    }
  }

  const ingest = useCallback(async (raw: string) => {
    let parsed: { url?: string; nextData?: unknown }
    try {
      parsed = JSON.parse(raw)
    } catch {
      setNote('Eso no es una página de Beatport. Pulsa el botón en la pestaña del listado y vuelve a pegar.')
      return
    }
    if (!parsed?.url || !parsed?.nextData) {
      setNote('Eso no es una página de Beatport. Pulsa el botón en la pestaña del listado y vuelve a pegar.')
      return
    }
    setIngesting(true)
    try {
      await streamJob('Desde tu Chrome', 'ingest', { action: 'ingest', url: parsed.url, nextData: parsed.nextData })
    } finally {
      setIngesting(false)
    }
  }, [streamJob])

  const jobLines = job?.lines.length ?? 0
  useEffect(() => {
    const box = logRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [jobLines])

  // React no deja pintar un href `javascript:`; se pone a mano tras montar.
  useEffect(() => {
    bookmarkletRef.current?.setAttribute('href', beatportBookmarklet(window.location.origin, lang))
  }, [lang])

  const ingestRef = useRef(ingest)
  useEffect(() => { ingestRef.current = ingest }, [ingest])

  // Pestaña abierta por el botón de favoritos: avisa a Beatport y recibe la lista.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('beatport') !== '1') return
    url.searchParams.delete('beatport')
    window.history.replaceState(null, '', url.pathname + url.search)
    const onMessage = (e: MessageEvent) => {
      if (!BEATPORT_ORIGIN.test(e.origin)) return
      const data = e.data as { type?: string; payload?: string } | null
      if (data?.type !== 'ob-beatport-data' || typeof data.payload !== 'string') return
      window.removeEventListener('message', onMessage)
      void ingestRef.current(data.payload)
    }
    window.addEventListener('message', onMessage)
    if (window.opener) {
      window.opener.postMessage({ type: 'ob-beatport-ready' }, '*')
    }
    const noOpener = window.opener
      ? null
      : window.setTimeout(
          () => setNote('Beatport no ha podido pasarlo solo. Ya está copiado: pégalo en el recuadro (Ctrl+V).'),
          0,
        )
    return () => {
      window.removeEventListener('message', onMessage)
      if (noOpener) window.clearTimeout(noOpener)
    }
  }, [])

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

  function runNow() {
    void streamJob('Traer ahora', 'run', { action: 'run' })
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
          onClick={job?.running ? () => setJobOpen(true) : runNow}
          className="h-10 px-5 border-[3px] border-[var(--ink)] bg-[var(--yellow)] font-black text-[10px] tracking-wider uppercase disabled:opacity-40"
          style={mono}
        >
          {job?.running ? 'Ver lo que pasa' : 'Traer ahora'}
        </button>
        <span className="text-xs text-[var(--ink)]/60" style={mono}>
          {payload ? `${payload.pending_count} pendientes` : ''}
        </span>
      </div>

      <div className="admin-panel !p-4 mb-6 max-w-2xl">
        <p className="font-black text-sm mb-2" style={{ fontFamily: "'Unbounded', sans-serif" }}>
          Desde tu Chrome
        </p>
        <p className="text-xs text-[var(--ink)]/70 mb-3" style={mono}>
          Si Beatport no deja pasar al pase automático, lo traes tú. Arrastra el botón negro a la barra de favoritos (una vez).
          Luego abre el listado de Breaks, pasa la verificación si sale y pulsa el favorito: los temas llegan aquí.
        </p>
        <div className="flex flex-wrap items-center gap-3 mb-3">
          <a
            ref={bookmarkletRef}
            href="#"
            onClick={(e) => {
              e.preventDefault()
              setNote('No se pulsa aquí: arrástralo a la barra de favoritos y úsalo en la pestaña de Beatport.')
            }}
            className="h-9 px-4 inline-flex items-center border-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] font-black text-[10px] tracking-wider uppercase cursor-grab"
            style={mono}
            title="Arrástralo a la barra de favoritos"
          >
            Mandar a Optimal Breaks
          </a>
          {payload?.breaks_listing_url && (
            <a
              href={payload.breaks_listing_url}
              target="_blank"
              rel="noopener"
              className="h-9 px-4 inline-flex items-center border-[3px] border-[var(--ink)] bg-[var(--paper)] font-black text-[10px] tracking-wider uppercase"
              style={mono}
            >
              Abrir listado de Breaks ↗
            </a>
          )}
        </div>
        <textarea
          rows={2}
          disabled={ingesting}
          placeholder="Si no llegan solos, pega aquí (Ctrl+V) lo que ha copiado el botón."
          onPaste={(e) => {
            const text = e.clipboardData.getData('text')
            if (!text) return
            e.preventDefault()
            void ingest(text)
          }}
          className="w-full border-[2px] border-[var(--ink)] p-2 text-xs bg-[var(--paper)] disabled:opacity-40"
          style={mono}
        />
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

      {job && jobOpen && createPortal(
        <div className="fixed inset-0 z-[210] flex items-center justify-center bg-black/50 p-3" role="dialog" aria-modal="true" aria-label={job.title}>
          <div className="w-full max-w-2xl border-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[6px_6px_0_var(--ink)]">
            <div className="flex items-center justify-between gap-3 border-b-[3px] border-[var(--ink)] px-4 py-3">
              <p className="font-black text-sm" style={{ fontFamily: "'Unbounded', sans-serif" }}>{job.title}</p>
              <span
                className={`text-[10px] font-black tracking-wider uppercase px-2 py-1 border-2 border-[var(--ink)] ${
                  job.running ? 'bg-[var(--yellow)]' : job.result?.ok ? 'bg-[var(--cyan)] text-white' : 'bg-[var(--red)] text-white'
                }`}
                style={mono}
              >
                {job.running ? (job.stopping ? 'Parando…' : 'En marcha') : job.result?.ok ? 'Terminado' : 'Con fallos'}
              </span>
            </div>
            <div ref={logRef} className="h-80 overflow-y-auto bg-[var(--ink)] text-[var(--paper)] p-3 text-[11px] leading-relaxed" style={mono}>
              {job.lines.length === 0 && job.running && <p className="opacity-60">Arrancando…</p>}
              {job.lines.map((l, i) => (
                <p key={i} className="whitespace-pre-wrap break-words">
                  <span className="opacity-50">{clock(l.at)} </span>{l.line}
                </p>
              ))}
            </div>
            {job.result && (
              <p className="px-4 pt-3 text-xs" style={mono}>{jobSummary(job.result)}</p>
            )}
            <div className="flex flex-wrap items-center justify-end gap-2 px-4 py-3">
              {(job.running || job.result?.skipped === 'already-running') && (
                <button
                  type="button"
                  onClick={stopJob}
                  disabled={job.stopping}
                  className="h-9 px-4 border-[3px] border-[var(--ink)] bg-[var(--red)] text-white font-black text-[10px] tracking-wider uppercase disabled:opacity-40"
                  style={mono}
                >
                  Parar
                </button>
              )}
              {!job.running && job.kind === 'run' && (
                <button
                  type="button"
                  onClick={runNow}
                  className="h-9 px-4 border-[3px] border-[var(--ink)] bg-[var(--paper)] font-black text-[10px] tracking-wider uppercase"
                  style={mono}
                  title="Sigue donde lo dejó: lo ya guardado se salta"
                >
                  Volver a lanzar
                </button>
              )}
              <button
                type="button"
                onClick={() => (job.running ? setJobOpen(false) : setJob(null))}
                className="h-9 px-4 border-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] font-black text-[10px] tracking-wider uppercase"
                style={mono}
                title={job.running ? 'El pase sigue aunque cierres la ventana' : undefined}
              >
                {job.running ? 'Ocultar' : 'Cerrar'}
              </button>
            </div>
          </div>
        </div>,
        document.body,
      )}
    </div>
  )
}
