'use client'

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import Image from 'next/image'
import {
  claimAudio,
  OB_CHART_PLAYALL_BAR_EVENT,
  type AudioClaimSource,
} from '@/components/DeckAudioProvider'
import type { BeatportTopTrack } from '@/types/database'

interface Props {
  tracks: BeatportTopTrack[]
  beatportUrl?: string | null
  lang: 'en' | 'es'
  entityName: string
}

function proxyUrl(sampleUrl: string): string {
  try {
    const host = new URL(sampleUrl).hostname.toLowerCase()
    if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') {
      return `/api/audio-proxy?url=${encodeURIComponent(sampleUrl)}`
    }
  } catch { /* use raw */ }
  return sampleUrl
}

function formatTime(s: number): string {
  if (!Number.isFinite(s) || s <= 0) return '0:00'
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function PositionBadge({ position }: { position: number }) {
  const isTop3 = position <= 3
  const isTop10 = position <= 10
  return (
    <span
      className={`inline-flex items-center justify-center shrink-0 font-black
        ${isTop3 ? 'w-12 h-12 text-xl bg-[var(--red)] text-white' : ''}
        ${!isTop3 && isTop10 ? 'w-11 h-11 text-lg bg-[var(--ink)] text-[var(--paper)]' : ''}
        ${!isTop10 ? 'w-10 h-10 text-base bg-[var(--paper-dark)] text-[var(--ink)]' : ''}
        border-[3px] border-[var(--ink)]`}
      style={{ fontFamily: "'Unbounded', sans-serif" }}
    >
      {position}
    </span>
  )
}

type TrackMeta = { title: string; artist: string; rowId: string }

type PlayState = {
  queue: string[]
  meta: TrackMeta[]
  index: number
} | null

export default function BeatportTopTracks({ tracks, beatportUrl, lang, entityName }: Props) {
  const [expanded, setExpanded] = useState(false)
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playAll, setPlayAll] = useState<PlayState>(null)
  const [paPaused, setPaPaused] = useState(false)
  const [paProgress, setPaProgress] = useState(0)
  const [paCurrentTime, setPaCurrentTime] = useState(0)
  const [paDuration, setPaDuration] = useState(0)
  const paBarRef = useRef<HTMLDivElement | null>(null)
  const paRafRef = useRef(0)

  const stopPlayAll = useCallback(() => {
    const a = audioRef.current
    if (a) { a.pause(); a.removeAttribute('src'); a.load() }
    setPlayAll(null)
    setPaPaused(false)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
    }
  }, [])

  useEffect(() => {
    window.dispatchEvent(
      new CustomEvent(OB_CHART_PLAYALL_BAR_EVENT, { detail: { visible: !!playAll } }),
    )
  }, [playAll])

  useEffect(() => {
    return () => {
      window.dispatchEvent(
        new CustomEvent(OB_CHART_PLAYALL_BAR_EVENT, { detail: { visible: false } }),
      )
    }
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const src = (e as CustomEvent).detail?.source as AudioClaimSource | undefined
      if (src === 'beatport-top') return
      stopPlayAll()
    }
    window.addEventListener('ob-audio-claim', handler)
    return () => window.removeEventListener('ob-audio-claim', handler)
  }, [stopPlayAll])

  const advancePlayAll = useCallback(() => {
    setPlayAll((prev) => {
      if (!prev) return null
      const next = prev.index + 1
      if (next >= prev.queue.length) {
        const a = audioRef.current
        if (a) { a.pause(); a.removeAttribute('src'); a.load() }
        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = null
          navigator.mediaSession.setActionHandler('play', null)
          navigator.mediaSession.setActionHandler('pause', null)
          navigator.mediaSession.setActionHandler('previoustrack', null)
          navigator.mediaSession.setActionHandler('nexttrack', null)
        }
        return null
      }
      return { ...prev, index: next }
    })
  }, [])

  const goToPlayAll = useCallback((delta: number) => {
    setPlayAll((prev) => {
      if (!prev) return null
      const next = Math.max(0, Math.min(prev.queue.length - 1, prev.index + delta))
      if (next === prev.index) return prev
      return { ...prev, index: next }
    })
  }, [])

  const togglePaPlayback = useCallback(() => {
    const a = audioRef.current
    if (!a) return
    if (a.paused) {
      a.play().then(() => setPaPaused(false)).catch(() => {})
    } else {
      a.pause()
      setPaPaused(true)
    }
  }, [])

  useEffect(() => {
    if (!playAll) return
    const a = audioRef.current
    if (!a) return
    const src = playAll.queue[playAll.index]
    if (!src) { stopPlayAll(); return }

    a.src = src
    a.load()
    setPaPaused(false)
    a.play().then(() => {
      if ('mediaSession' in navigator) {
        const m = playAll.meta[playAll.index]
        navigator.mediaSession.metadata = new MediaMetadata({
          title: m?.title ?? '',
          artist: m?.artist ?? entityName,
          artwork: [{ src: '/icon-512.png', sizes: '512x512', type: 'image/png' }],
        })
        navigator.mediaSession.setActionHandler('play', () => {
          a.play().then(() => setPaPaused(false)).catch(() => {})
        })
        navigator.mediaSession.setActionHandler('pause', () => {
          a.pause()
          setPaPaused(true)
        })
        navigator.mediaSession.setActionHandler('previoustrack', () => goToPlayAll(-1))
        navigator.mediaSession.setActionHandler('nexttrack', () => goToPlayAll(1))
      }
    }).catch(() => {
      advancePlayAll()
    })
  }, [playAll?.queue, playAll?.index, advancePlayAll, stopPlayAll, goToPlayAll, entityName]) // eslint-disable-line react-hooks/exhaustive-deps

  useLayoutEffect(() => {
    if (!playAll) { setPaProgress(0); setPaCurrentTime(0); setPaDuration(0); return }
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const a = audioRef.current
      if (a && a.duration && Number.isFinite(a.duration)) {
        setPaProgress(a.currentTime / a.duration)
        setPaCurrentTime(a.currentTime)
        setPaDuration(a.duration)
      }
      paRafRef.current = requestAnimationFrame(tick)
    }
    paRafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(paRafRef.current) }
  }, [playAll?.queue, playAll?.index, paPaused]) // eslint-disable-line react-hooks/exhaustive-deps

  const paSeekTo = useCallback((clientX: number) => {
    const a = audioRef.current
    const bar = paBarRef.current
    if (!a || !bar || !a.duration) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    a.currentTime = ratio * a.duration
    setPaProgress(ratio)
    setPaCurrentTime(a.currentTime)
  }, [])

  const paDragRef = useRef(false)
  const paPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => { paDragRef.current = true; e.currentTarget.setPointerCapture(e.pointerId); paSeekTo(e.clientX) }, [paSeekTo])
  const paPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => { if (paDragRef.current) paSeekTo(e.clientX) }, [paSeekTo])
  const paPointerUp = useCallback(() => { paDragRef.current = false }, [])

  const buildBundle = useCallback((): { srcs: string[]; meta: TrackMeta[] } => {
    const srcs: string[] = []
    const meta: TrackMeta[] = []
    for (const t of tracks) {
      if (!t.sample_url) continue
      srcs.push(proxyUrl(t.sample_url))
      const artists = t.artists.map(a => a.name).join(', ')
      meta.push({ title: t.title, artist: artists, rowId: `bp-row-${t.position}` })
    }
    return { srcs, meta }
  }, [tracks])

  const playFromIndex = useCallback((index: number) => {
    const bundle = buildBundle()
    if (bundle.srcs.length === 0) return
    const trackWithSample = tracks.filter(t => t.sample_url)
    const bundleIdx = trackWithSample.findIndex((_, i) => i === index)
    if (bundleIdx < 0) return

    if (playAll && playAll.index === bundleIdx) {
      togglePaPlayback()
      return
    }

    claimAudio('beatport-top')
    setExpanded(true)
    setPlayAll({ queue: bundle.srcs, meta: bundle.meta, index: bundleIdx })
  }, [buildBundle, tracks, playAll, togglePaPlayback])

  const handlePlayAllClick = useCallback(() => {
    if (playAll) {
      stopPlayAll()
    } else {
      const bundle = buildBundle()
      if (bundle.srcs.length === 0) return
      claimAudio('beatport-top')
      setExpanded(true)
      setPlayAll({ queue: bundle.srcs, meta: bundle.meta, index: 0 })
    }
  }, [playAll, stopPlayAll, buildBundle])

  const scrollToCurrentTrack = useCallback(() => {
    if (!playAll) return
    const meta = playAll.meta[playAll.index]
    if (!meta?.rowId) return
    const el = document.getElementById(meta.rowId)
    if (el) {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
      el.classList.add('!bg-[var(--yellow)]/25')
      setTimeout(() => el.classList.remove('!bg-[var(--yellow)]/25'), 1500)
    }
  }, [playAll])

  if (!tracks.length) return null

  const hasAnySample = tracks.some(t => t.sample_url)
  const title = 'TOP 10 BEATPORT'
  const countLabel = `${tracks.length} tracks`
  const tracksWithSample = tracks.filter(t => t.sample_url)

  const isPlayingTrackIdx = (idx: number): boolean => {
    if (!playAll) return false
    const sampleOnly = tracks.filter(t => t.sample_url)
    const bundleIdx = sampleOnly.indexOf(tracks[idx])
    return bundleIdx >= 0 && playAll.index === bundleIdx
  }

  const playAllBtnLabel = playAll
    ? `■ STOP ${playAll.index + 1}/${playAll.queue.length}`
    : `▶ PLAY ALL`

  return (
    <section className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden mt-4 md:mt-5">
      <audio ref={audioRef} preload="none" onEnded={advancePlayAll} className="hidden" />

      {/* Accordion trigger */}
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded(v => !v)}
          className="flex-1 flex flex-wrap items-center gap-2 sm:gap-3 text-left px-3 py-3 sm:px-4 sm:py-3.5 min-h-[52px] hover:bg-[var(--yellow)]/15 active:bg-[var(--yellow)]/25 transition-colors touch-manipulation"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          <span
            className="text-[11px] sm:text-sm font-black text-[var(--ink)] shrink-0"
            style={{ fontFamily: "'Unbounded', sans-serif" }}
            aria-hidden
          >
            {expanded ? '▼' : '▶'}
          </span>
          <span className="text-xs sm:text-sm font-bold tracking-wide text-[var(--ink)] flex-1 min-w-[8rem]">
            {title}
          </span>
          <span className="flex flex-wrap items-center gap-1.5 justify-end shrink-0">
            <span className="inline-block px-1.5 py-0.5 text-[9px] font-black tracking-widest bg-[var(--red)] text-white border-2 border-[var(--ink)]">
              BEATPORT
            </span>
            <span className="text-[10px] sm:text-xs text-[var(--ink)]/50 font-bold">{countLabel}</span>
          </span>
        </button>

        <div className="shrink-0 pr-3 sm:pr-4 flex items-center gap-1.5">
          {hasAnySample && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handlePlayAllClick() }}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-[10px] sm:text-[11px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation select-none whitespace-nowrap
                ${playAll ? 'bg-[var(--red)] text-white' : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)]'}`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={playAll ? 'Stop' : 'Play All'}
            >
              {playAllBtnLabel}
            </button>
          )}
        </div>
      </div>

      {/* Expanded panel */}
      {expanded && (
        <div role="region">
          <div className="border-t-4 border-[var(--ink)]">
            {tracks.map((t, i) => {
              const isActive = isPlayingTrackIdx(i)
              const sampleIdx = tracksWithSample.indexOf(t)
              const rowId = `bp-row-${t.position}`
              return (
                <div
                  key={`${t.beatport_url}-${i}`}
                  id={rowId}
                  className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] transition-colors ${isActive ? 'bg-[var(--red)]/15 border-[var(--red)]/30' : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <PositionBadge position={t.position} />

                      {t.artwork_url && (
                        <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
                          <Image src={t.artwork_url} alt="" fill className="object-cover" sizes="(max-width: 640px) 56px, 64px" unoptimized={false} />
                        </div>
                      )}

                      <div className="flex-1 min-w-0">
                        <h3
                          className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate"
                          style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
                        >
                          {t.title}
                          {t.mix_name && <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{t.mix_name}</span>}
                        </h3>
                        <p className="text-xs sm:text-sm mt-0.5 sm:truncate" style={{ fontFamily: "'Courier Prime', monospace" }}>
                          <span className="text-[var(--ink)]/70">
                            {t.artists.map((a, ai) => (
                              <span key={ai}>
                                {a.beatport_url ? (
                                  <a href={a.beatport_url} target="_blank" rel="noopener noreferrer" className="hover:text-[var(--red)] transition-colors underline decoration-dotted">{a.name}</a>
                                ) : a.name}
                                {ai < t.artists.length - 1 && ', '}
                              </span>
                            ))}
                          </span>
                          {t.label && <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{t.label}</span></>}
                          {t.release_year != null && t.release_year > 0 && <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums">{t.release_year}</span></>}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center sm:gap-2 touch-manipulation">
                      {t.sample_url && sampleIdx >= 0 && (
                        <button
                          type="button"
                          onClick={() => playFromIndex(sampleIdx)}
                          className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
                            ${isActive ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                          title={isActive && !paPaused ? 'Pause' : 'Preview'}
                        >
                          {isActive && !paPaused ? '❚❚' : '▶'}
                        </button>
                      )}
                      {t.bpm != null && t.bpm > 0 && (
                        <span
                          className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5"
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                        >
                          {t.bpm}
                        </span>
                      )}
                      {t.key && (
                        <span
                          className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5 whitespace-nowrap"
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                        >
                          {t.key}
                        </span>
                      )}
                      {t.beatport_url && (
                        <a
                          href={t.beatport_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                        >
                          BEATPORT
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}

      {/* Floating now-playing bar (same as chart) */}
      {playAll && (
        <div
          className="fixed bottom-0 inset-x-0 z-50 border-t-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[0_-4px_20px_rgba(0,0,0,.15)]"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          <div
            ref={paBarRef}
            onPointerDown={paPointerDown}
            onPointerMove={paPointerMove}
            onPointerUp={paPointerUp}
            onPointerCancel={paPointerUp}
            className="group relative w-full h-3 sm:h-2 cursor-pointer touch-manipulation select-none bg-[var(--ink)]/10"
            style={{ touchAction: 'none' }}
            role="progressbar"
            aria-valuenow={Math.round(paProgress * 100)}
            aria-valuemin={0}
            aria-valuemax={100}
          >
            <div className="absolute inset-y-0 left-0 bg-[var(--red)]" style={{ width: `${paProgress * 100}%` }} />
            <div
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 sm:w-3 sm:h-3 rounded-full bg-[var(--red)] border-2 border-white shadow-sm opacity-0 group-hover:opacity-100 transition-opacity"
              style={{ left: `${paProgress * 100}%` }}
            />
          </div>

          <div className="flex items-center gap-3 px-4 py-3 sm:px-4 sm:py-2.5 max-w-4xl mx-auto">
            <div className="flex items-center gap-1.5 sm:gap-1 shrink-0">
              <button
                type="button"
                onClick={() => goToPlayAll(-1)}
                disabled={playAll.index === 0}
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors touch-manipulation"
                title={lang === 'es' ? 'Anterior' : 'Previous'}
              >
                ⏮
              </button>
              <button
                type="button"
                onClick={togglePaPlayback}
                className={`w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm font-black border-2 border-[var(--ink)] transition-colors touch-manipulation
                  ${paPaused ? 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white' : 'bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'}`}
                title={paPaused ? 'Play' : 'Pause'}
              >
                {paPaused ? '▶' : '❚❚'}
              </button>
              <button
                type="button"
                onClick={stopPlayAll}
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm font-black border-2 border-[var(--ink)] bg-[var(--red)] text-white hover:bg-[var(--ink)] transition-colors touch-manipulation"
                title="Stop"
              >
                ■
              </button>
              <button
                type="button"
                onClick={() => goToPlayAll(1)}
                disabled={playAll.index >= playAll.queue.length - 1}
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors touch-manipulation"
                title={lang === 'es' ? 'Siguiente' : 'Next'}
              >
                ⏭
              </button>
            </div>

            <button
              type="button"
              onClick={scrollToCurrentTrack}
              className="flex-1 min-w-0 overflow-hidden text-left cursor-pointer hover:opacity-70 active:opacity-50 transition-opacity"
            >
              <p className="text-sm sm:text-sm font-black text-[var(--ink)] truncate leading-snug" style={{ fontFamily: "'Unbounded', sans-serif" }}>
                {playAll.meta[playAll.index]?.title ?? '—'}
              </p>
              <p className="text-xs sm:text-xs text-[var(--ink)]/60 truncate leading-snug mt-0.5">
                {playAll.meta[playAll.index]?.artist ?? ''}
              </p>
            </button>

            <div className="shrink-0 text-right">
              <span className="block text-xs sm:text-xs text-[var(--ink)]/50 font-bold tabular-nums whitespace-nowrap">
                {formatTime(paCurrentTime)} / {formatTime(paDuration)}
              </span>
              <span className="block text-[10px] sm:text-[9px] text-[var(--ink)]/35 font-bold tabular-nums">
                {playAll.index + 1} / {playAll.queue.length}
              </span>
            </div>
          </div>
        </div>
      )}
    </section>
  )
}
