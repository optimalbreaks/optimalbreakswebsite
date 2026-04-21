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
import SaveTrackButton from '@/components/SaveTrackButton'
import { claimAudio } from '@/components/DeckAudioProvider'
import { extractYouTubeId, LazyYouTubeEmbed } from '@/components/YouTubeEmbed'

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

export default function TracksSection({ lang }: { lang: string }) {
  const { saved, loading } = useSavedChartTracks()
  const [tracks, setTracks] = useState<UnifiedTrack[]>([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [sourceFilter, setSourceFilter] = useState<'all' | ChartTrackSource>('all')
  const es = lang === 'es'

  // Audio element for Beatport/Bandcamp samples (shared by all rows).
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [currentKey, setCurrentKey] = useState<string | null>(null)
  const [paused, setPaused] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)
  const rafRef = useRef(0)

  // Load real track data for every saved ref (grouped by source).
  useEffect(() => {
    if (loading) return
    if (saved.length === 0) { setTracks([]); return }

    let cancelled = false
    setTracksLoading(true)

    ;(async () => {
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

      const byKey = new Map<string, UnifiedTrack>()
      for (const c of (chartRes.data || [])) {
        byKey.set(`chart:${c.id}`, {
          key: `chart:${c.id}`, source: 'chart', id: c.id,
          title: c.title, mix_name: c.mix_name, artists: artistsToString(c.artists),
          label: c.label, year: c.release_year, bpm: c.bpm, music_key: c.music_key,
          artwork_url: c.artwork_url, external_url: c.beatport_url, external_label: 'BEATPORT',
          sample_url: c.sample_url,
        })
      }
      for (const f of (featRes.data || [])) {
        byKey.set(`featured:${f.id}`, {
          key: `featured:${f.id}`, source: 'featured', id: f.id,
          title: f.title, mix_name: f.mix_name, artists: artistsToString(f.artists),
          label: f.label, year: f.release_year, bpm: f.bpm, music_key: f.music_key,
          artwork_url: f.artwork_url, external_url: f.link_url,
          external_label: f.link_label || (f.platform ? f.platform.toUpperCase() : 'LINK'),
          sample_url: f.sample_url, platform: f.platform,
          note: lang === 'es' ? f.note_es : f.note_en,
        })
      }
      for (const v of (vinylRes.data || [])) {
        byKey.set(`vinyl:${v.id}`, {
          key: `vinyl:${v.id}`, source: 'vinyl', id: v.id,
          title: v.title, mix_name: v.mix_name, artists: artistsToString(v.artists),
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
      setTracks(ordered)
      setTracksLoading(false)
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, loading, lang])

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
    if (sourceFilter === 'all') return tracks
    return tracks.filter((t) => t.source === sourceFilter)
  }, [tracks, sourceFilter])

  // Queue of audio-only (chart + featured with sample). Vinyl is YouTube → separate player.
  const audioQueue = useMemo(() => filtered.filter((t) => {
    if (t.source === 'vinyl') return false
    if (t.source === 'featured' && t.platform === 'bandcamp') return !!t.external_url
    return !!t.sample_url
  }), [filtered])

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

  const advance = useCallback(() => {
    if (!currentKey) return
    const idx = audioQueue.findIndex((t) => t.key === currentKey)
    if (idx === -1) { setCurrentKey(null); return }
    const next = audioQueue[idx + 1]
    if (next) playTrack(next)
    else setCurrentKey(null)
  }, [audioQueue, currentKey, playTrack])

  const playAll = useCallback(() => {
    if (audioQueue.length === 0) return
    playTrack(audioQueue[0])
  }, [audioQueue, playTrack])

  const stopAll = useCallback(() => {
    const a = audioRef.current
    if (a) a.pause()
    setCurrentKey(null)
    setPaused(false)
  }, [])

  const counts = useMemo(() => ({
    all: tracks.length,
    chart: tracks.filter((t) => t.source === 'chart').length,
    featured: tracks.filter((t) => t.source === 'featured').length,
    vinyl: tracks.filter((t) => t.source === 'vinyl').length,
  }), [tracks])

  if (loading || tracksLoading) {
    return <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', color: 'var(--dim)' }}>{es ? 'Cargando tus tracks…' : 'Loading your tracks…'}</p>
  }

  return (
    <div>
      <audio ref={audioRef} preload="none" onEnded={advance} className="hidden" />

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
          {es ? 'MIS TRACKS' : 'MY TRACKS'} ({counts.all})
        </h2>
        {audioQueue.length > 0 && (
          <button
            type="button"
            onClick={currentKey ? stopAll : playAll}
            className={`inline-flex items-center gap-1.5 min-h-[36px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer whitespace-nowrap ${
              currentKey ? 'bg-[var(--red)] text-white' : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white'
            }`}
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {currentKey ? (es ? '■ PARAR' : '■ STOP') : (es ? '▶ PLAY ALL' : '▶ PLAY ALL')}
          </button>
        )}
      </div>

      {tracks.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {(['all', 'chart', 'featured', 'vinyl'] as const).map((k) => {
            const label = k === 'all'
              ? (es ? `TODO (${counts.all})` : `ALL (${counts.all})`)
              : k === 'chart'
                ? (es ? `40 BREAKS (${counts.chart})` : `40 BREAKS (${counts.chart})`)
                : k === 'featured'
                  ? (es ? `NOVEDADES (${counts.featured})` : `NEW RELEASES (${counts.featured})`)
                  : (es ? `VINILOS (${counts.vinyl})` : `VINYL (${counts.vinyl})`)
            const active = sourceFilter === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSourceFilter(k)}
                className={`h-[30px] px-3 border-2 border-[var(--ink)] transition-colors cursor-pointer ${
                  active ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'
                }`}
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
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
            {es ? 'Aún no has guardado ningún track' : 'No saved tracks yet'}
          </p>
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)', fontSize: '14px', lineHeight: 1.6 }}>
            {es
              ? 'Abre la página de charts y pulsa el botón «+» en los tracks que quieras guardar.'
              : 'Open the charts page and press the "+" button on any track you want to save.'}
          </p>
          <Link
            href={`/${lang}/charts`}
            className="inline-block mt-3 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors"
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '6px 14px' }}
          >
            {es ? '▶ IR A CHARTS' : '▶ GO TO CHARTS'}
          </Link>
        </div>
      ) : filtered.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'Nada guardado en esta categoría todavía.' : 'Nothing saved in this category yet.'}
        </p>
      ) : (
        <div className="border-4 border-[var(--ink)] bg-[var(--paper)]">
          {filtered.map((t) => {
            const isCurrent = currentKey === t.key
            const ytId = t.source === 'vinyl' ? extractYouTubeId(t.youtube_url || '') : null
            const hasAudio = t.source !== 'vinyl' && (
              t.sample_url || (t.source === 'featured' && t.platform === 'bandcamp' && t.external_url)
            )
            const sourceBadge = t.source === 'chart'
              ? { label: es ? '40 BREAKS' : '40 BREAKS', color: 'var(--red)', fg: 'white' }
              : t.source === 'featured'
                ? { label: es ? 'NOVEDAD' : 'NEW RELEASE', color: 'var(--cyan)', fg: 'white' }
                : { label: es ? 'VINILO' : 'VINYL', color: 'var(--uv)', fg: 'white' }

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
                      <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                        <span className="inline-block px-1.5 py-0.5 text-[9px] font-black tracking-wider border-2 border-[var(--ink)]"
                          style={{ background: sourceBadge.color, color: sourceBadge.fg, fontFamily: "'Courier Prime', monospace" }}>
                          {sourceBadge.label}
                        </span>
                      </div>
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
                        onClick={() => playTrack(t)}
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
                    <SaveTrackButton source={t.source} trackId={t.id} lang={lang} size="sm" />
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
        return (
          <div className="fixed bottom-0 inset-x-0 z-50 border-t-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[0_-4px_20px_rgba(0,0,0,.15)]"
            style={{ fontFamily: "'Courier Prime', monospace" }}>
            <div className="relative w-full h-2 bg-[var(--ink)]/10">
              <div className="absolute inset-y-0 left-0 bg-[var(--red)]" style={{ width: `${progress * 100}%` }} />
            </div>
            <div className="flex items-center gap-3 px-4 py-2.5 max-w-4xl mx-auto">
              <div className="flex items-center gap-1 shrink-0">
                <button type="button" onClick={() => {
                  const a = audioRef.current; if (!a) return
                  if (a.paused) { a.play().then(() => setPaused(false)).catch(() => {}) }
                  else { a.pause(); setPaused(true) }
                }} className={`w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-sm font-black border-2 border-[var(--ink)] transition-colors ${paused ? 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white' : 'bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'}`}>
                  {paused ? '▶' : '❚❚'}
                </button>
                <button type="button" onClick={stopAll} className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-sm font-black border-2 border-[var(--ink)] bg-[var(--red)] text-white hover:bg-[var(--ink)] transition-colors">■</button>
                <button type="button" onClick={advance} disabled={audioQueue.findIndex((t) => t.key === currentKey) >= audioQueue.length - 1}
                  className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-sm border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors">»</button>
              </div>
              <div className="flex-1 min-w-0 overflow-hidden">
                <p className="text-sm font-black text-[var(--ink)] truncate leading-snug" style={{ fontFamily: "'Unbounded', sans-serif" }}>{cur.title}</p>
                <p className="text-xs text-[var(--ink)]/60 truncate leading-snug mt-0.5">{cur.artists}</p>
              </div>
              <span className="shrink-0 text-xs text-[var(--ink)]/50 font-bold tabular-nums whitespace-nowrap">
                {formatTime(currentTime)} / {formatTime(duration)}
              </span>
            </div>
          </div>
        )
      })()}
    </div>
  )
}
