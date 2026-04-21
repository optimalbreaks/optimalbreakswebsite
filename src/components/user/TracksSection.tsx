// ============================================
// OPTIMAL BREAKS — My Tracks section
// Tracks guardados desde charts (Beatport preview),
// featured (new releases, Beatport/Bandcamp) y vinyl (YouTube).
// Reproductor unificado: audio proxy para Beatport/Bandcamp y
// LazyYouTubeEmbed para vinilos.
// ============================================

'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createBrowserSupabase } from '@/lib/supabase'
import { useSavedChartTracks, type ChartTrackSource } from '@/hooks/useUserData'
import { useAuth } from '@/components/AuthProvider'
import SaveTrackButton from '@/components/SaveTrackButton'
import { claimAudio } from '@/components/DeckAudioProvider'
import { extractYouTubeId, LazyYouTubeEmbed } from '@/components/YouTubeEmbed'

/**
 * Payload público pre-cargado por la página compartida. Lo envía el endpoint
 * `/api/public/user-tracks` y evita que el componente tenga que usar el hook
 * `useSavedChartTracks` (que solo lee lo del usuario actual).
 */
export type PublicTracksPayload = {
  owner: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
    country: string | null
  }
  saved: Array<{ track_source: ChartTrackSource; track_id: string; created_at: string | null }>
  tracks: {
    chart: Array<{ id: string; title: string; mix_name: string | null; artists: string; label: string | null; year: number | null; bpm: number | null; music_key: string | null; artwork_url: string | null; beatport_url: string | null; sample_url: string | null }>
    featured: Array<{ id: string; title: string; mix_name: string | null; artists: string; label: string | null; year: number | null; bpm: number | null; music_key: string | null; artwork_url: string | null; link_url: string | null; link_label: string | null; platform: string | null; sample_url: string | null; note_en: string | null; note_es: string | null }>
    vinyl: Array<{ id: string; title: string; mix_name: string | null; artists: string; label: string | null; year: number | null; artwork_url: string | null; discogs_url: string | null; youtube_url: string | null; note_en: string | null; note_es: string | null }>
  }
}

type UnifiedTrack = {
  key: string
  source: ChartTrackSource
  id: string
  title: string
  mix_name?: string
  artists: string
  label?: string
  year?: number | null
  bpm?: number | null
  music_key?: string
  artwork_url?: string | null
  external_url?: string | null
  external_label?: string
  sample_url?: string | null
  youtube_url?: string | null
  platform?: string
  note?: string
  saved_at?: string | null
  /**
   * Refs `{source, id}` del track representativo + sus duplicados colapsados
   * (misma canción guardada desde distintas listas). Se usa para que el
   * botón de guardar actúe sobre TODAS las filas a la vez.
   */
  refs?: Array<{ source: ChartTrackSource; id: string }>
}

function previewAudioSrc(sampleUrl: string, platform?: string, linkUrl?: string | null): string {
  if (platform === 'bandcamp' && linkUrl) {
    return `/api/bandcamp-preview?track=${encodeURIComponent(linkUrl)}`
  }
  try {
    const host = new URL(sampleUrl).hostname.toLowerCase()
    if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') {
      return `/api/audio-proxy?url=${encodeURIComponent(sampleUrl)}`
    }
  } catch { /* raw url */ }
  return sampleUrl
}

function artistsToString(artists: any): string {
  if (!Array.isArray(artists)) return ''
  return artists.map((a: any) => (a && typeof a === 'object' ? a.name : a)).filter(Boolean).join(', ')
}

function formatTime(s: number): string {
  if (!Number.isFinite(s)) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

type SortBy = 'added' | 'artist' | 'title' | 'release'
type PlaybackKind = 'beatport' | 'bandcamp' | 'youtube'
const ALL_PLAYBACK_KINDS: PlaybackKind[] = ['beatport', 'bandcamp', 'youtube']

// Clasifica la fuente de reproducción real basándose en lo que realmente se
// puede reproducir en la fila (no en el chart del que se guardó). Damos
// prioridad al audio preview (Beatport/Bandcamp) porque es el que suena en
// segundo plano; si no hay audio pero sí vídeo, es YouTube.
function playbackOf(t: UnifiedTrack): PlaybackKind {
  if (t.sample_url) return 'beatport'
  if (t.platform === 'bandcamp' && t.external_url) return 'bandcamp'
  if (t.youtube_url) return 'youtube'
  if (t.source === 'vinyl') return 'youtube'
  if (t.source === 'featured' && t.platform === 'bandcamp') return 'bandcamp'
  return 'beatport'
}

interface TracksSectionProps {
  lang: string
  /** Si se pasa, el componente entra en modo "lista compartida": usa ese payload
   *  pre-cargado del servidor en vez del hook del usuario, y oculta el botón
   *  de compartir (que solo tiene sentido en la lista propia). */
  publicPayload?: PublicTracksPayload
}

export default function TracksSection({ lang, publicPayload }: TracksSectionProps) {
  const isShared = !!publicPayload
  const { user } = useAuth()
  const ownHook = useSavedChartTracks()
  // En modo compartido, saved/loading vienen del payload; si no, del hook.
  const saved = isShared ? publicPayload!.saved : ownHook.saved
  const loading = isShared ? false : ownHook.loading
  const [tracks, setTracks] = useState<UnifiedTrack[]>([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  // Filtro multiselección. Por defecto las tres fuentes están activas
  // (equivalente a TODO). Útil para, p.ej., elegir solo Beatport+Bandcamp
  // cuando quieres reproducir en segundo plano sin YouTube.
  const [activeKinds, setActiveKinds] = useState<Set<PlaybackKind>>(
    () => new Set(ALL_PLAYBACK_KINDS),
  )
  const [sortBy, setSortBy] = useState<SortBy>('added')
  // Cola de reproducción efectiva (puede estar barajada). Si está vacía se usa
  // el orden visible al iniciar. Se fija al pulsar Play All / Shuffle / play
  // individual, y no se re-sortea al cambiar el orden de visualización.
  const [playbackList, setPlaybackList] = useState<UnifiedTrack[]>([])
  const [shuffleMode, setShuffleMode] = useState(false)
  const es = lang === 'es'

  // Audio element for Beatport/Bandcamp samples (shared by all rows).
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const rafRef = useRef(0)
  const barRef = useRef<HTMLDivElement | null>(null)
  const dragRef = useRef(false)

  const seekTo = useCallback((clientX: number) => {
    const a = audioRef.current
    const bar = barRef.current
    if (!a || !bar || !a.duration) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    a.currentTime = ratio * a.duration
    setProgress(ratio)
    setCurrentTime(a.currentTime)
  }, [])
  const onBarPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    dragRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekTo(e.clientX)
  }, [seekTo])
  const onBarPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (dragRef.current) seekTo(e.clientX)
  }, [seekTo])
  const onBarPointerUp = useCallback(() => { dragRef.current = false }, [])

  // Load real track data for every saved ref (grouped by source).
  useEffect(() => {
    if (loading) return
    if (saved.length === 0) { setTracks([]); return }

    let cancelled = false
    setTracksLoading(true)

    ;(async () => {
      // En modo compartido, los registros ya vienen en el payload; en modo
      // propio se consultan las tablas de charts desde el cliente.
      let chartData: any[] = []
      let featData: any[] = []
      let vinylData: any[] = []
      if (isShared) {
        const p = publicPayload!
        chartData = p.tracks.chart.map((c) => ({ ...c, release_year: c.year, artists: c.artists }))
        featData = p.tracks.featured.map((f) => ({ ...f, release_year: f.year, artists: f.artists }))
        vinylData = p.tracks.vinyl.map((v) => ({ ...v, artists: v.artists }))
      } else {
        const supabase = createBrowserSupabase()
        const chartIds = saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)
        const featuredIds = saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)
        const vinylIds = saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)

        const [chartRes, featRes, vinylRes] = await Promise.all([
          chartIds.length
            ? supabase.from('chart_tracks').select('id, title, mix_name, artists, label, release_year, bpm, music_key, artwork_url, beatport_url, sample_url').in('id', chartIds)
            : Promise.resolve({ data: [] as any[] }),
          featuredIds.length
            ? supabase.from('chart_featured_tracks').select('id, title, mix_name, artists, label, release_year, bpm, music_key, artwork_url, link_url, link_label, platform, sample_url, note_en, note_es').in('id', featuredIds)
            : Promise.resolve({ data: [] as any[] }),
          vinylIds.length
            ? supabase.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year, format, catalog_number, artwork_url, discogs_url, youtube_url, note_en, note_es').in('id', vinylIds)
            : Promise.resolve({ data: [] as any[] }),
        ])
        chartData = chartRes.data || []
        featData = featRes.data || []
        vinylData = vinylRes.data || []
      }

      const byKey = new Map<string, UnifiedTrack>()
      for (const c of chartData) {
        byKey.set(`chart:${c.id}`, {
          key: `chart:${c.id}`, source: 'chart', id: c.id,
          title: c.title, mix_name: c.mix_name, artists: typeof c.artists === 'string' ? c.artists : artistsToString(c.artists),
          label: c.label, year: c.release_year, bpm: c.bpm, music_key: c.music_key,
          artwork_url: c.artwork_url, external_url: c.beatport_url, external_label: 'BEATPORT',
          sample_url: c.sample_url,
        })
      }
      for (const f of featData) {
        byKey.set(`featured:${f.id}`, {
          key: `featured:${f.id}`, source: 'featured', id: f.id,
          title: f.title, mix_name: f.mix_name, artists: typeof f.artists === 'string' ? f.artists : artistsToString(f.artists),
          label: f.label, year: f.release_year, bpm: f.bpm, music_key: f.music_key,
          artwork_url: f.artwork_url, external_url: f.link_url,
          external_label: f.link_label || (f.platform ? String(f.platform).toUpperCase() : 'LINK'),
          sample_url: f.sample_url, platform: f.platform,
          note: lang === 'es' ? f.note_es : f.note_en,
        })
      }
      for (const v of vinylData) {
        byKey.set(`vinyl:${v.id}`, {
          key: `vinyl:${v.id}`, source: 'vinyl', id: v.id,
          title: v.title, mix_name: v.mix_name, artists: typeof v.artists === 'string' ? v.artists : artistsToString(v.artists),
          label: v.label, year: v.year,
          artwork_url: v.artwork_url, external_url: v.discogs_url, external_label: 'DISCOGS',
          youtube_url: v.youtube_url,
          note: lang === 'es' ? v.note_es : v.note_en,
        })
      }

      if (cancelled) return
      const ordered = saved
        .map((s) => {
          const t = byKey.get(`${s.track_source}:${s.track_id}`)
          if (!t) return null
          return { ...t, saved_at: s.created_at ?? null }
        })
        .filter(Boolean) as UnifiedTrack[]

      // Dedupe: una canción sólo puede aparecer una vez aunque esté guardada
      // desde varias fuentes (p.ej. 40 Breaks + Novedades). Clave canónica:
      // URL externa normalizada; fallback a título+mix+artistas.
      const canonicalKey = (t: UnifiedTrack) => {
        const u = (t.external_url || '').trim().toLowerCase()
        if (u) {
          try {
            const url = new URL(u)
            return `${url.host}${url.pathname.replace(/\/$/, '')}`
          } catch {
            return u.replace(/[?#].*$/, '').replace(/\/$/, '')
          }
        }
        return `nm:${(t.title || '').toLowerCase()}|${(t.mix_name || '').toLowerCase()}|${(t.artists || '').toLowerCase()}`
      }
      const byCanon = new Map<string, UnifiedTrack>()
      for (const t of ordered) {
        const k = canonicalKey(t)
        const existing = byCanon.get(k)
        if (!existing) {
          byCanon.set(k, { ...t, refs: [{ source: t.source, id: t.id }] })
          continue
        }
        existing.refs!.push({ source: t.source, id: t.id })
        // Enriquecemos el representativo con campos que puedan faltarle
        // (p.ej. el vinilo aporta youtube_url; chart/featured aportan sample).
        if (!existing.sample_url && t.sample_url) existing.sample_url = t.sample_url
        if (!existing.youtube_url && t.youtube_url) existing.youtube_url = t.youtube_url
        if (!existing.artwork_url && t.artwork_url) existing.artwork_url = t.artwork_url
        if (!existing.bpm && t.bpm) existing.bpm = t.bpm
        if (!existing.music_key && t.music_key) existing.music_key = t.music_key
        if (!existing.note && t.note) existing.note = t.note
      }
      const deduped = Array.from(byCanon.values())
      setTracks(deduped)
      setTracksLoading(false)
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, loading, lang, isShared])

  // Listen for external audio claims → stop my-tracks playback
  useEffect(() => {
    const handler = (e: Event) => {
      const src = (e as CustomEvent).detail?.source
      if (src === 'my-tracks') return
      const a = audioRef.current
      if (a) { a.pause() }
      setCurrentKey(null)
      setPaused(false)
    }
    window.addEventListener('ob-audio-claim', handler as EventListener)
    return () => window.removeEventListener('ob-audio-claim', handler as EventListener)
  }, [])

  // Drive progress
  useEffect(() => {
    if (!currentKey) { setProgress(0); setCurrentTime(0); setDuration(0); return }
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const a = audioRef.current
      if (a && a.duration && Number.isFinite(a.duration)) {
        setProgress(a.currentTime / a.duration)
        setCurrentTime(a.currentTime)
        setDuration(a.duration)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(rafRef.current) }
  }, [currentKey, paused])

  const filtered = useMemo(() => {
    if (activeKinds.size === ALL_PLAYBACK_KINDS.length) return tracks
    return tracks.filter((t) => activeKinds.has(playbackOf(t)))
  }, [tracks, activeKinds])

  const toggleKind = (k: PlaybackKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      // Si el usuario deja el set vacío, recuperamos las tres fuentes.
      if (next.size === 0) return new Set(ALL_PLAYBACK_KINDS)
      return next
    })
  }
  const selectAllKinds = () => setActiveKinds(new Set(ALL_PLAYBACK_KINDS))

  const sorted = useMemo(() => {
    const loc = es ? 'es' : 'en'
    const arr = [...filtered]
    switch (sortBy) {
      case 'artist':
        arr.sort((A, B) => (A.artists || '').localeCompare(B.artists || '', loc, { sensitivity: 'base' })
          || (A.title || '').localeCompare(B.title || '', loc, { sensitivity: 'base' }))
        break
      case 'title':
        arr.sort((A, B) => (A.title || '').localeCompare(B.title || '', loc, { sensitivity: 'base' })
          || (A.artists || '').localeCompare(B.artists || '', loc, { sensitivity: 'base' }))
        break
      case 'release':
        arr.sort((A, B) => (B.year || 0) - (A.year || 0)
          || (A.artists || '').localeCompare(B.artists || '', loc, { sensitivity: 'base' }))
        break
      case 'added':
      default:
        arr.sort((A, B) => {
          const a = A.saved_at || ''
          const b = B.saved_at || ''
          if (a === b) return 0
          return a < b ? 1 : -1
        })
    }
    return arr
  }, [filtered, sortBy, es])

  // Queue of audio-only (Beatport / Bandcamp). YouTube se reproduce con embed
  // aparte. Se basa en los campos efectivos del track (tras dedupe), no en
  // la fuente original.
  const isAudioPlayable = (t: UnifiedTrack) => {
    if (t.sample_url) return true
    if (t.platform === 'bandcamp' && t.external_url) return true
    return false
  }
  const orderedAudioQueue = useMemo(() => sorted.filter(isAudioPlayable), [sorted])
  // Si aún no se ha pulsado Play/Shuffle, la cola de reproducción sigue al orden visible.
  const audioQueue = playbackList.length > 0 ? playbackList : orderedAudioQueue

  const playTrack = useCallback((t: UnifiedTrack) => {
    const a = audioRef.current
    if (!a) return
    if (currentKey === t.key) {
      if (a.paused) { a.play().then(() => setPaused(false)).catch(() => {}) }
      else { a.pause(); setPaused(true) }
      return
    }
    claimAudio('my-tracks')
    const src = t.source === 'featured' && t.platform === 'bandcamp'
      ? previewAudioSrc('', 'bandcamp', t.external_url)
      : t.sample_url ? previewAudioSrc(t.sample_url, t.platform || undefined) : ''
    if (!src) return
    a.src = src
    a.load()
    a.play().then(() => {
      setCurrentKey(t.key)
      setPaused(false)
    }).catch(() => {})
  }, [currentKey])

  // Play individual: si venimos de shuffle, mantener la cola barajada; si no,
  // usar la cola ordenada visible. Esto asegura que el next/advance siga
  // teniendo sentido incluso al pulsar play sobre un track concreto.
  const playTrackInOrdered = useCallback((t: UnifiedTrack) => {
    if (!shuffleMode) setPlaybackList(orderedAudioQueue)
    playTrack(t)
  }, [shuffleMode, orderedAudioQueue, playTrack])

  const advance = useCallback(() => {
    if (!currentKey) return
    const queue = playbackList.length > 0 ? playbackList : orderedAudioQueue
    const idx = queue.findIndex((t) => t.key === currentKey)
    if (idx === -1) { setCurrentKey(null); return }
    const next = queue[idx + 1]
    if (next) playTrack(next)
    else setCurrentKey(null)
  }, [currentKey, playbackList, orderedAudioQueue, playTrack])

  const retreat = useCallback(() => {
    if (!currentKey) return
    const queue = playbackList.length > 0 ? playbackList : orderedAudioQueue
    const idx = queue.findIndex((t) => t.key === currentKey)
    if (idx <= 0) return
    const prev = queue[idx - 1]
    if (prev) playTrack(prev)
  }, [currentKey, playbackList, orderedAudioQueue, playTrack])

  const playAll = useCallback(() => {
    if (orderedAudioQueue.length === 0) return
    setShuffleMode(false)
    setPlaybackList(orderedAudioQueue)
    playTrack(orderedAudioQueue[0])
  }, [orderedAudioQueue, playTrack])

  const playShuffle = useCallback(() => {
    if (orderedAudioQueue.length === 0) return
    const arr = [...orderedAudioQueue]
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[arr[i], arr[j]] = [arr[j], arr[i]]
    }
    setShuffleMode(true)
    setPlaybackList(arr)
    playTrack(arr[0])
  }, [orderedAudioQueue, playTrack])

  const stopAll = useCallback(() => {
    const a = audioRef.current
    if (a) a.pause()
    setCurrentKey(null)
    setPaused(false)
    setShuffleMode(false)
    setPlaybackList([])
  }, [])

  const counts = useMemo(() => {
    const c = { all: tracks.length, beatport: 0, bandcamp: 0, youtube: 0 }
    for (const t of tracks) c[playbackOf(t)]++
    return c
  }, [tracks])

  // URL pública compartible de mi lista (solo en modo propio).
  // IMPORTANTE: este `useMemo` y el `useCallback` siguiente deben quedarse
  // por encima del early-return de abajo; si no, React cambia la cantidad de
  // hooks entre renders y lanza el error #310.
  const shareUrl = useMemo(() => {
    if (isShared || !user) return ''
    if (typeof window === 'undefined') return ''
    const origin = window.location.origin
    const handle = user.id // UUID como handle; el endpoint también acepta username
    return `${origin}/${lang}/u/${handle}/tracks`
  }, [isShared, user, lang])

  const onCopyShareUrl = useCallback(async () => {
    if (!shareUrl) return
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl)
      } else {
        const ta = document.createElement('textarea')
        ta.value = shareUrl
        ta.style.position = 'fixed'
        ta.style.opacity = '0'
        document.body.appendChild(ta)
        ta.select()
        document.execCommand('copy')
        document.body.removeChild(ta)
      }
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 1800)
    } catch { /* ignora */ }
  }, [shareUrl])

  if (loading || tracksLoading) {
    return <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', color: 'var(--dim)' }}>
      {isShared
        ? (es ? 'Cargando tracks…' : 'Loading tracks…')
        : (es ? 'Cargando tus tracks…' : 'Loading your tracks…')}
    </p>
  }

  return (
    <div>
      <audio ref={audioRef} preload="none" onEnded={advance} className="hidden" />

      {isShared && publicPayload ? (
        <div className="mb-4 p-3 border-[3px] border-[var(--ink)] bg-[var(--yellow)]/30 flex items-center gap-3">
          <div className="shrink-0 w-11 h-11 rounded-full border-2 border-[var(--ink)] bg-[var(--paper-dark)] overflow-hidden relative">
            {publicPayload.owner.avatar_url ? (
              <Image src={publicPayload.owner.avatar_url} alt="" fill className="object-cover" sizes="44px" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-black text-[var(--ink)]" style={{ fontFamily: "'Unbounded', sans-serif" }}>
                {(publicPayload.owner.display_name || publicPayload.owner.username || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] tracking-[2px] text-[var(--ink)]/60 font-bold" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {es ? 'LISTA COMPARTIDA' : 'SHARED LIST'}
            </p>
            <p className="font-black text-[var(--ink)] truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '15px' }}>
              {publicPayload.owner.display_name || publicPayload.owner.username || (es ? 'Breaker anónimo' : 'Anonymous breaker')}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
          {isShared
            ? (es ? `TRACKS DE ${(publicPayload!.owner.display_name || publicPayload!.owner.username || 'BREAKER').toString().toUpperCase()}` : `${(publicPayload!.owner.display_name || publicPayload!.owner.username || 'BREAKER').toString().toUpperCase()}'S TRACKS`)
            : (es ? 'MIS TRACKS' : 'MY TRACKS')}
          {' '}({counts.all})
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {!isShared && user ? (
            <button
              type="button"
              onClick={onCopyShareUrl}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--yellow)] transition-all cursor-pointer whitespace-nowrap"
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={es ? 'Copiar URL pública de mi lista' : 'Copy public URL of my list'}
              aria-label={es ? 'Copiar URL pública de mis tracks' : 'Copy public URL of my tracks'}
            >
              {copiedUrl
                ? (es ? '✓ COPIADO' : '✓ COPIED')
                : (es ? '🔗 COMPARTIR' : '🔗 SHARE')}
            </button>
          ) : null}
          {orderedAudioQueue.length > 0 && (
            currentKey ? (
              <button
                type="button"
                onClick={stopAll}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--red)] text-white transition-all cursor-pointer whitespace-nowrap"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                {es ? '■ PARAR' : '■ STOP'}
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={playAll}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white transition-all cursor-pointer whitespace-nowrap"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                  title={es ? 'Reproducir en orden' : 'Play in order'}
                >
                  {es ? '▶ PLAY ALL' : '▶ PLAY ALL'}
                </button>
                <button
                  type="button"
                  onClick={playShuffle}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--uv)] text-white hover:bg-[var(--ink)] hover:text-[var(--yellow)] transition-all cursor-pointer whitespace-nowrap"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                  title={es ? 'Reproducir aleatorio' : 'Play shuffled'}
                >
                  {es ? '⇄ ALEATORIO' : '⇄ SHUFFLE'}
                </button>
              </>
            )
          )}
        </div>
      </div>

      {tracks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[10px] font-bold tracking-[2px] text-[var(--ink)]/60 mr-1" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {es ? 'ORDENAR:' : 'SORT:'}
          </span>
          {(['added', 'artist', 'title', 'release'] as const).map((k) => {
            const label = k === 'added'
              ? (es ? 'AÑADIDO' : 'ADDED')
              : k === 'artist'
                ? (es ? 'ARTISTA' : 'ARTIST')
                : k === 'title'
                  ? (es ? 'TÍTULO' : 'TITLE')
                  : (es ? 'RELEASE' : 'RELEASE')
            const active = sortBy === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSortBy(k)}
                className={`h-[28px] px-2.5 border-2 border-[var(--ink)] transition-colors cursor-pointer ${
                  active ? 'bg-[var(--ink)] text-[var(--yellow)]' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'
                }`}
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {tracks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[10px] font-bold tracking-[2px] text-[var(--ink)]/60 mr-1" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {es ? 'FUENTE:' : 'SOURCE:'}
          </span>
          {(() => {
            const allActive = activeKinds.size === ALL_PLAYBACK_KINDS.length
            return (
              <button
                type="button"
                onClick={selectAllKinds}
                className={`h-[30px] px-3 border-2 border-[var(--ink)] transition-colors cursor-pointer ${
                  allActive ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'
                }`}
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
                title={es ? 'Mostrar todas las fuentes' : 'Show all sources'}
              >
                {es ? `TODO (${counts.all})` : `ALL (${counts.all})`}
              </button>
            )
          })()}
          {ALL_PLAYBACK_KINDS.map((k) => {
            const label = k === 'beatport'
              ? `BEATPORT (${counts.beatport})`
              : k === 'bandcamp'
                ? `BANDCAMP (${counts.bandcamp})`
                : `YOUTUBE (${counts.youtube})`
            const active = activeKinds.has(k)
            const disabled = counts[k] === 0
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                disabled={disabled}
                className={`h-[30px] px-3 border-2 border-[var(--ink)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  active ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'
                }`}
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
                aria-pressed={active}
                title={active
                  ? (es ? 'Click para quitar de la selección' : 'Click to remove from selection')
                  : (es ? 'Click para añadir a la selección' : 'Click to add to selection')}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {tracks.length === 0 ? (
        <div className="p-5 border-4 border-[var(--ink)] bg-[var(--paper-dark)]">
          <p className="mb-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase' }}>
            {isShared
              ? (es ? 'Lista vacía' : 'Empty list')
              : (es ? 'Aún no has guardado ningún track' : 'No saved tracks yet')}
          </p>
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)', fontSize: '14px', lineHeight: 1.6 }}>
            {isShared
              ? (es ? 'Este usuario todavía no ha guardado ningún track.' : 'This user has not saved any tracks yet.')
              : (es
                ? 'Abre la página de charts y pulsa el botón «+» en los tracks que quieras guardar.'
                : 'Open the charts page and press the "+" button on any track you want to save.')}
          </p>
          {!isShared ? (
            <Link
              href={`/${lang}/charts`}
              className="inline-block mt-3 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '6px 14px' }}
            >
              {es ? '▶ IR A CHARTS' : '▶ GO TO CHARTS'}
            </Link>
          ) : null}
        </div>
      ) : sorted.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'Nada guardado en esta categoría todavía.' : 'Nothing saved in this category yet.'}
        </p>
      ) : (
        <div className="border-4 border-[var(--ink)] bg-[var(--paper)]">
          {sorted.map((t) => {
            const isCurrent = currentKey === t.key
            const ytId = (t.source === 'vinyl' || t.youtube_url) ? extractYouTubeId(t.youtube_url || '') : null
            const hasAudio = !!(t.sample_url || (t.platform === 'bandcamp' && t.external_url))

            return (
              <div key={t.key} className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] transition-colors ${isCurrent ? 'bg-[var(--red)]/15 border-[var(--red)]/30' : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {t.artwork_url ? (
                      <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
                        <Image src={t.artwork_url} alt="" fill className="object-cover" sizes="(max-width: 640px) 56px, 64px" unoptimized={false} />
                      </div>
                    ) : null}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate" style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}>
                        {t.title}
                        {t.mix_name ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{t.mix_name}</span> : null}
                      </h3>
                      <p className="text-xs sm:text-sm mt-0.5 sm:truncate" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        <span className="text-[var(--ink)]/70">{t.artists || '—'}</span>
                        {t.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{t.label}</span></> : null}
                        {t.year ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums">{t.year}</span></> : null}
                      </p>
                      {t.note ? (
                        <p className="text-xs text-[var(--ink)]/55 mt-1 leading-relaxed" style={{ fontFamily: "'Courier Prime', monospace" }}>{t.note}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center sm:gap-2">
                    {hasAudio ? (
                      <button
                        type="button"
                        onClick={() => playTrackInOrdered(t)}
                        className={`h-[36px] px-2.5 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer
                          ${isCurrent ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)]'}`}
                        style={{ fontFamily: "'Courier Prime', monospace" }}
                        title={isCurrent && !paused ? (es ? 'Pausar' : 'Pause') : (es ? 'Reproducir' : 'Play')}
                      >
                        {isCurrent && !paused ? '❚❚' : '▶'}
                      </button>
                    ) : null}
                    {t.bpm ? (
                      <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        {t.bpm}
                      </span>
                    ) : null}
                    {t.music_key ? (
                      <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        {t.music_key}
                      </span>
                    ) : null}
                    <SaveTrackButton
                      source={t.source}
                      trackId={t.id}
                      /* En la lista compartida, los refs pertenecen al dueño de
                         la lista, no al espectador: pasamos solo el ref primario
                         para que el botón opere sobre la lista del visitante. */
                      relatedRefs={!isShared && t.refs && t.refs.length > 1 ? t.refs : undefined}
                      lang={lang}
                      size="sm"
                    />
                    {t.external_url ? (
                      <a
                        href={t.external_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-[36px] px-2.5 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white transition-all no-underline whitespace-nowrap"
                        style={{ fontFamily: "'Courier Prime', monospace" }}
                      >
                        {t.external_label || (es ? 'ABRIR' : 'OPEN')}
                      </a>
                    ) : null}
                  </div>
                </div>

                {/* YouTube embed for vinyls */}
                {ytId ? (
                  <div className="w-full max-w-sm">
                    <LazyYouTubeEmbed
                      videoId={ytId}
                      title={`${t.title} — ${t.artists}`}
                      className="border-[3px] border-[var(--ink)]"
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
        </div>
      )}

      {/* Now-playing bar (only audio queue) */}
      {currentKey && (() => {
        const cur = tracks.find((t) => t.key === currentKey)
        if (!cur) return null
        const idx = audioQueue.findIndex((t) => t.key === currentKey)
        const total = audioQueue.length
        return (
          <div className="fixed bottom-0 inset-x-0 z-50 border-t-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[0_-4px_20px_rgba(0,0,0,.15)]"
            style={{ fontFamily: "'Courier Prime', monospace" }}>
            <div
              ref={barRef}
              onPointerDown={onBarPointerDown}
              onPointerMove={onBarPointerMove}
              onPointerUp={onBarPointerUp}
              onPointerCancel={onBarPointerUp}
              className="group relative w-full h-3 sm:h-2 cursor-pointer touch-manipulation select-none bg-[var(--ink)]/10"
              style={{ touchAction: 'none' }}
              role="progressbar"
              aria-valuenow={Math.round(progress * 100)}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <div className="absolute inset-y-0 left-0 bg-[var(--red)]" style={{ width: `${progress * 100}%` }} />
              <div
                className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 sm:w-3 sm:h-3 rounded-full bg-[var(--red)] border-2 border-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
                style={{ left: `${progress * 100}%` }}
              />
            </div>
            <div className="flex items-center gap-3 px-4 py-3 sm:px-4 sm:py-2.5 max-w-4xl mx-auto">
              <div className="flex items-center gap-1.5 sm:gap-1 shrink-0">
                <button
                  type="button"
                  onClick={retreat}
                  disabled={idx <= 0}
                  className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors touch-manipulation"
                  title={es ? 'Anterior' : 'Previous'}
                  aria-label={es ? 'Anterior' : 'Previous'}
                >
                  «
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const a = audioRef.current; if (!a) return
                    if (a.paused) { a.play().then(() => setPaused(false)).catch(() => {}) }
                    else { a.pause(); setPaused(true) }
                  }}
                  className={`w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm font-black border-2 border-[var(--ink)] transition-colors touch-manipulation
                    ${paused ? 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white' : 'bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'}`}
                  title={paused ? (es ? 'Reproducir' : 'Play') : (es ? 'Pausar' : 'Pause')}
                  aria-label={paused ? (es ? 'Reproducir' : 'Play') : (es ? 'Pausar' : 'Pause')}
                >
                  {paused ? '▶' : '❚❚'}
                </button>
                <button
                  type="button"
                  onClick={stopAll}
                  className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm font-black border-2 border-[var(--ink)] bg-[var(--red)] text-white hover:bg-[var(--ink)] transition-colors touch-manipulation"
                  title={es ? 'Parar' : 'Stop'}
                  aria-label={es ? 'Parar' : 'Stop'}
                >
                  ■
                </button>
                <button
                  type="button"
                  onClick={advance}
                  disabled={idx < 0 || idx >= total - 1}
                  className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors touch-manipulation"
                  title={es ? 'Siguiente' : 'Next'}
                  aria-label={es ? 'Siguiente' : 'Next'}
                >
                  »
                </button>
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-sm font-black text-[var(--ink)] truncate leading-snug" style={{ fontFamily: "'Unbounded', sans-serif" }}>
                  {shuffleMode ? <span className="text-[var(--uv)] mr-1" title={es ? 'Aleatorio' : 'Shuffle'}>⇄</span> : null}
                  {cur.title}
                </p>
                <p className="text-xs text-[var(--ink)]/60 truncate leading-snug mt-0.5">{cur.artists}</p>
              </div>
              <div className="shrink-0 text-right">
                <span className="block text-xs text-[var(--ink)]/50 font-bold tabular-nums whitespace-nowrap">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                {total > 0 ? (
                  <span className="block text-[10px] sm:text-[9px] text-[var(--ink)]/35 font-bold tabular-nums">
                    {Math.max(idx, 0) + 1} / {total}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
