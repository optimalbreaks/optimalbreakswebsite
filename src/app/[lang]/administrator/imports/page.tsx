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
  breaks_listing_url?: string | null
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
const LISTING_PER_PAGE = 150
const ARTIST_MAX_PAGES = 3

function artistSlugFromUrl(url: string): string {
  const match = url.match(/\/artist\/([^/]+)\/\d+/i)
  return match?.[1] || 'artista'
}

function withListingPage(url: string, page: number): string {
  const next = new URL(url)
  next.searchParams.set('page', String(page))
  return next.toString()
}

function pageOfListing(url: string): number {
  try {
    return Math.max(1, Number(new URL(url).searchParams.get('page')) || 1)
  } catch {
    return 1
  }
}

type JobLine = { at: string; line: string }
type JobResult = {
  ok: boolean
  skipped?: string
  error?: string
  seen?: number
  queued?: number
  auto_approved?: number
  skipped_known?: number
  listing_total?: number
  empty?: boolean
}
type Job = {
  resumeUrl?: string
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
 * la verificación de Cloudflare). Primero manda el listado de Breaks. Luego,
 * cuando esta pantalla se lo pide, baja cada ficha de los 140 primeros con la misma sesión.
 * También copia la primera página al portapapeles por si el navegador corta el hilo.
 */
function beatportBookmarklet(origin: string, lang: string): string {
  // Listado: páginas siguientes con 2 s. Fichas de los 140 primeros: la URL que manda
  // esta pantalla, con 4 s, hasta 3 páginas por artista.
  const body = String.raw`(function(){var O=${JSON.stringify(origin)},L=${JSON.stringify(lang)};var el=document.getElementById('__NEXT_DATA__');if(!el||location.hostname.indexOf('beatport.com')<0){alert('Abre el listado de Breaks en Beatport y vuelve a pulsar.');return}var slim=function(nd,url){var qs=(((nd.props||{}).pageProps||{}).dehydratedState||{}).queries||[];var q=qs.filter(function(x){return x&&x.queryKey&&typeof x.queryKey[0]==='string'&&x.queryKey[0].indexOf('tracks')>=0});return q.length?JSON.stringify({v:1,url:url,nextData:{props:{pageProps:{dehydratedState:{queries:q}}}}}):null};var data;try{data=slim(JSON.parse(el.textContent),location.href)}catch(e){alert('No se ha podido leer la página.');return}if(!data){alert('En esta página no hay lista de temas.');return}var page=Number(new URL(location.href).searchParams.get('page'))||1;var pageUrl=function(n){var u=new URL(location.href);u.searchParams.set('page',String(n));return u.toString()};var send=function(w,m){try{w.postMessage(m,O)}catch(e){}};if(window.__obListen)window.removeEventListener('message',window.__obListen);window.__obListen=function(e){if(e.origin!==O||!e.data)return;var t=e.data.type,w=e.source;if(t==='ob-beatport-ready'){send(w,{type:'ob-beatport-data',payload:data,page:page})}else if(t==='ob-beatport-next'){var n=Number(e.data.page)||0;if(!n)return;setTimeout(function(){var u=pageUrl(n);fetch(u,{credentials:'include'}).then(function(r){return r.text()}).then(function(h){var m=h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);var p=m?slim(JSON.parse(m[1]),u):null;if(!p)throw new Error('challenge');send(w,{type:'ob-beatport-data',payload:p,page:n})}).catch(function(){send(w,{type:'ob-beatport-blocked',page:n,url:u})})},2000)}else if(t==='ob-beatport-url'){var raw=String(e.data.url||'');var nu;try{nu=new URL(raw)}catch(err){return}if(nu.hostname.indexOf('beatport.com')<0)return;var pg=Number(e.data.page)||1;setTimeout(function(){fetch(nu.toString(),{credentials:'include'}).then(function(r){return r.text()}).then(function(h){var m=h.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);var p=m?slim(JSON.parse(m[1]),nu.toString()):null;if(!p)throw new Error('challenge');send(w,{type:'ob-beatport-data',payload:p,page:pg})}).catch(function(){send(w,{type:'ob-beatport-blocked',page:pg,url:nu.toString()})})},4000)}};window.addEventListener('message',window.__obListen);var go=function(){var w=window.open(O+'/'+L+'/administrator/imports?beatport=1','ob-imports');if(!w)alert('Copiado. Abre Por aprobar en Optimal Breaks y pégalo en el recuadro.')};try{navigator.clipboard.writeText(data).then(go,go)}catch(e){go()}})()`
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
  const stopRef = useRef(false)
  const nextTimerRef = useRef<number | null>(null)
  const pagesRef = useRef<JobResult | null>(null)
  const artistUrlsRef = useRef<string[]>([])
  const artistWalkRef = useRef<{ index: number; page: number } | null>(null)
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
  const pushLine = useCallback((line: string, at = new Date().toISOString()) => {
    setJob((j) => (j ? { ...j, lines: [...j.lines, { at, line }] } : j))
  }, [])

  const startJob = useCallback((title: string, kind: Job['kind']) => {
    setNote(null)
    stopRef.current = false
    setJob({ title, kind, lines: [], running: true, stopping: false, result: null })
    setJobOpen(true)
  }, [])

  const finishJob = useCallback((result: JobResult) => {
    artistWalkRef.current = null
    if (nextTimerRef.current) {
      window.clearTimeout(nextTimerRef.current)
      nextTimerRef.current = null
    }
    setJob((j) => (j ? { ...j, running: false, stopping: false, result } : j))
    load(true)
  }, [load])

  const runStream = useCallback(async (body: Record<string, unknown>): Promise<JobResult> => {
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
            if (msg.type === 'log') pushLine(msg.line, msg.at)
            else result = msg.result
          } catch {
            /* línea rota */
          }
        }
        if (done) break
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      pushLine(`Error: ${message}`)
      result = { ok: false, error: message }
    }
    return result
  }, [pushLine])

  async function stopJob() {
    stopRef.current = true
    if (nextTimerRef.current) {
      window.clearTimeout(nextTimerRef.current)
      nextTimerRef.current = null
    }
    setJob((j) => (j ? { ...j, stopping: true } : j))
    pushLine('Pidiendo que pare… acaba la página que está leyendo.')
    try {
      const r = await fetch('/api/admin/imports', {
        method: 'POST',
        credentials: 'same-origin',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'stop' }),
      })
      const j = (await r.json()) as { error?: string; stopped?: number }
      if (!r.ok) throw new Error(j.error || r.statusText)
      if (!j.stopped) setJob((s) => (s ? { ...s, stopping: false } : s))
      if (!j.stopped && pagesRef.current) {
        finishJob({ ...pagesRef.current, ok: false, error: 'Parado por el editor.' })
        pagesRef.current = null
      } else if (!j.stopped) {
        pushLine('No había ningún pase abierto.')
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      setJob((s) => (s ? { ...s, stopping: false } : s))
      pushLine(`No se pudo parar: ${message}`)
    }
  }

  /**
   * Una página que manda el favorito. Primero el listado de Breaks: si trae
   * algo nuevo se pide la siguiente (pausa de 2 s en la pestaña). Cuando una
   * página no trae nada nuevo, la misma pestaña recorre las fichas de los 140 primeros del tablero
   * (pausa de 4 s, hasta 3 páginas). Esos temas se publican enteros.
   */
  const ingestPage = useCallback(async (
    raw: string,
    page: number | null,
    source: { postMessage: (m: unknown, origin: string) => void; origin: string } | null,
  ) => {
    let parsed: { url?: string; nextData?: unknown }
    try {
      parsed = JSON.parse(raw)
    } catch {
      parsed = {}
    }
    if (!parsed?.url || !parsed?.nextData) {
      setNote('Eso no es una página de Beatport. Pulsa el botón en la pestaña del listado y vuelve a pegar.')
      return
    }
    if (page == null) page = pageOfListing(parsed.url)
    if (nextTimerRef.current) {
      window.clearTimeout(nextTimerRef.current)
      nextTimerRef.current = null
    }
    if (stopRef.current) return
    const walking = artistWalkRef.current
    if (!walking && (page === 1 || !pagesRef.current)) {
      startJob('Desde tu Chrome', 'ingest')
      pagesRef.current = { ok: true, seen: 0, queued: 0, auto_approved: 0, skipped_known: 0 }
    }
    setIngesting(true)
    if (!walking) pushLine(`Página ${page} del listado de Breaks…`)
    const r = await runStream({ action: 'ingest', url: parsed.url, nextData: parsed.nextData })
    setIngesting(false)
    const sum = pagesRef.current
    if (!sum) return
    sum.seen = (sum.seen ?? 0) + (r.seen ?? 0)
    sum.queued = (sum.queued ?? 0) + (r.queued ?? 0)
    sum.auto_approved = (sum.auto_approved ?? 0) + (r.auto_approved ?? 0)
    sum.skipped_known = (sum.skipped_known ?? 0) + (r.skipped_known ?? 0)
    const done = (res: JobResult) => {
      pagesRef.current = null
      finishJob(res)
    }
    const askArtist = (tab: NonNullable<typeof source>, url: string) => {
      const walk = artistWalkRef.current
      const totalArtists = artistUrlsRef.current.length
      if (!walk) return
      pushLine(`Ficha ${walk.index + 1}/${totalArtists} ${artistSlugFromUrl(url)}, página ${walk.page}…`)
      tab.postMessage({ type: 'ob-beatport-url', url, page: walk.page }, tab.origin)
      nextTimerRef.current = window.setTimeout(() => {
        nextTimerRef.current = null
        const soFar = pagesRef.current
        pagesRef.current = null
        setJob((j) => (j ? { ...j, resumeUrl: url } : j))
        pushLine(
          `Beatport no ha contestado. Si el favorito es de antes de esta noche, arrástralo otra vez a la barra. Si no, abre esta ficha, pasa la verificación y pulsa el favorito: ${url}`,
        )
        finishJob({ ...(soFar ?? {}), ok: false, error: 'Sin respuesta de Beatport.' })
      }, 60_000)
    }
    const advanceArtist = (tab: NonNullable<typeof source> | null, res: JobResult) => {
      const walk = artistWalkRef.current
      const urls = artistUrlsRef.current
      if (!walk || !tab) {
        pushLine(tab ? 'Fichas de los 140 primeros terminadas.' : 'Las fichas de los 140 primeros salen al pulsar el favorito en Beatport, no al pegar.')
        done(sum)
        return
      }
      const fresh = (res.queued ?? 0) + (res.auto_approved ?? 0)
      const total = res.listing_total ?? 0
      const base = urls[walk.index]
      const more = Boolean(base) && !res.empty && fresh > 0 && walk.page < ARTIST_MAX_PAGES && (!total || walk.page * LISTING_PER_PAGE < total)
      if (more && base) {
        walk.page += 1
        askArtist(tab, withListingPage(base, walk.page))
        return
      }
      walk.index += 1
      walk.page = 1
      if (walk.index >= urls.length) {
        pushLine('Fichas de los 140 primeros terminadas.')
        done(sum)
        return
      }
      askArtist(tab, urls[walk.index] || '')
    }
    const beginArtists = async (tab: NonNullable<typeof source> | null) => {
      if (!artistUrlsRef.current.length) {
        try {
          const res = await fetch('/api/admin/imports', {
            method: 'POST',
            credentials: 'same-origin',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ action: 'artist-urls' }),
          })
          const body = (await res.json()) as { artist_track_urls?: string[] }
          if (Array.isArray(body.artist_track_urls)) artistUrlsRef.current = body.artist_track_urls
        } catch {
          /* sin fichas se cierra el pase con lo ya leído */
        }
      }
      if (stopRef.current) {
        done({ ...sum, ok: false, error: 'Parado por el editor.' })
        return
      }
      const urls = artistUrlsRef.current
      if (!tab || !urls.length) {
        if (tab) pushLine('No hay fichas de Beatport en los 140 primeros.')
        else pushLine('Las fichas de los 140 primeros salen al pulsar el favorito en Beatport, no al pegar.')
        done(sum)
        return
      }
      artistWalkRef.current = { index: 0, page: 1 }
      pushLine(`Listado de Breaks listo. Sigo con ${urls.length} fichas de los 140 primeros.`)
      askArtist(tab, urls[0] || '')
    }
    const stopped = stopRef.current || r.error === 'Parado por el editor.'
    if (stopped) {
      done({ ...sum, ok: false, error: r.error || 'Parado por el editor.' })
      return
    }
    if (!r.ok) {
      if (walking && source) {
        pushLine(r.error || 'Esta ficha no se ha leído. Sigo con la siguiente.')
        advanceArtist(source, { ok: true, empty: true, queued: 0, auto_approved: 0 })
        return
      }
      if (source) {
        pushLine(r.error || 'El listado no se ha leído.')
        await beginArtists(source)
        return
      }
      done({ ...sum, ok: false, error: r.error })
      return
    }
    const fresh = (r.queued ?? 0) + (r.auto_approved ?? 0)
    if (walking) {
      pushLine(`${artistSlugFromUrl(parsed.url)}: ${fresh} nuevos, ${r.skipped_known ?? 0} ya estaban.`)
      advanceArtist(source, r)
      return
    }
    pushLine(`Página ${page}: ${fresh} nuevos, ${r.skipped_known ?? 0} ya estaban.`)
    const total = r.listing_total ?? 0
    if (!fresh || r.empty) {
      pushLine(r.empty
        ? 'Esta página no trae temas desde el 8 oct.'
        : 'Página sin nada nuevo: lo que viene detrás ya estaba visto.')
      await beginArtists(source)
      return
    }
    if (!total || page * LISTING_PER_PAGE >= total) {
      pushLine('Era la última página del listado.')
      await beginArtists(source)
      return
    }
    if (!source) {
      pushLine(`Para seguir, abre la página ${page + 1} en Beatport y pulsa el favorito ahí.`)
      done(sum)
      return
    }
    const next = page + 1
    pushLine(`Pido la página ${next} de ${Math.ceil(total / LISTING_PER_PAGE)} a tu pestaña de Beatport…`)
    source.postMessage({ type: 'ob-beatport-next', page: next }, source.origin)
    nextTimerRef.current = window.setTimeout(() => {
      nextTimerRef.current = null
      pushLine(
        `Beatport no ha contestado a la página ${next}. Si tu favorito es de antes de esta noche, arrástralo otra vez a la barra. Si no, abre la página ${next}, pasa la verificación y pulsa el favorito ahí.`,
      )
      done({ ...sum, ok: false, error: `Sin respuesta de Beatport en la página ${next}.` })
    }, 45_000)
  }, [finishJob, pushLine, runStream, startJob])

  function runNow() {
    startJob('Traer ahora', 'run')
    void runStream({ action: 'run' }).then(finishJob)
  }

  const jobLines = job?.lines.length ?? 0
  useEffect(() => {
    const box = logRef.current
    if (box) box.scrollTop = box.scrollHeight
  }, [jobLines])

  // React no deja pintar un href `javascript:`; se pone a mano tras montar.
  useEffect(() => {
    bookmarkletRef.current?.setAttribute('href', beatportBookmarklet(window.location.origin, lang))
  }, [lang])

  const ingestRef = useRef(ingestPage)
  useEffect(() => { ingestRef.current = ingestPage }, [ingestPage])

  // Pestaña abierta por el botón de favoritos: avisa a Beatport y recibe las páginas.
  useEffect(() => {
    const url = new URL(window.location.href)
    if (url.searchParams.get('beatport') !== '1') return
    url.searchParams.delete('beatport')
    window.history.replaceState(null, '', url.pathname + url.search)
    const onMessage = (e: MessageEvent) => {
      if (!BEATPORT_ORIGIN.test(e.origin)) return
      const data = e.data as { type?: string; payload?: string; page?: number; url?: string } | null
      const src = e.source as Window | null
      const source = src ? { postMessage: (m: unknown, o: string) => src.postMessage(m, o), origin: e.origin } : null
      if (data?.type === 'ob-beatport-blocked') {
        if (nextTimerRef.current) {
          window.clearTimeout(nextTimerRef.current)
          nextTimerRef.current = null
        }
        const sum = pagesRef.current
        pagesRef.current = null
        artistWalkRef.current = null
        const where = data.url?.includes('/artist/') ? data.url : `la página ${data.page}`
        setJob((j) => (j ? {
          ...j,
          lines: [...j.lines, {
            at: new Date().toISOString(),
            line: `Beatport ha pedido la verificación en ${where}. Ábrela, pásala y pulsa el favorito ahí.`,
          }],
          running: false,
          stopping: false,
          result: { ...(sum ?? { seen: 0 }), ok: false, error: `Verificación de Beatport en la página ${data.page}.` },
          resumeUrl: data.url,
        } : j))
        load(true)
        return
      }
      if (data?.type !== 'ob-beatport-data' || typeof data.payload !== 'string') return
      void ingestRef.current(data.payload, Number(data.page) || null, source)
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
  }, [load])

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
        Cada día a las 12:05, desde el 8 de octubre de 2026: primero los temas nuevos de los 140 primeros del tablero, en cualquier género, que se publican directamente.
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
          Hasta que Beatport nos dé la API, el catálogo entra por aquí. Arrastra el botón negro a la barra de favoritos.
          Abre el listado de Breaks, pasa la verificación si sale y pulsa el favorito en la página 1.
          Primero pasa el listado de Breaks. Después, en la misma pestaña, recorre las fichas de los 140 primeros del tablero y publica esos temas.
          Si el favorito es de antes de esta noche, arrástralo otra vez: el anterior solo lee el listado.
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
            void ingestPage(text, null, null)
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
            {!job.running && job.resumeUrl && (
              <p className="px-4 pt-2 text-xs" style={mono}>
                <a href={job.resumeUrl} target="_blank" rel="noopener" className="underline font-bold">
                  Abrir la página donde se quedó ↗
                </a>
              </p>
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
