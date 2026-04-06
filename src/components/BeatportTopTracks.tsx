'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import Image from 'next/image'
import { claimAudio } from '@/components/DeckAudioProvider'
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

export default function BeatportTopTracks({ tracks, beatportUrl, lang, entityName }: Props) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playingIdx, setPlayingIdx] = useState<number | null>(null)
  const [progress, setProgress] = useState(0)
  const [duration, setDuration] = useState(0)
  const [playAllMode, setPlayAllMode] = useState(false)

  const stop = useCallback(() => {
    const a = audioRef.current
    if (a) { a.pause(); a.removeAttribute('src'); a.load() }
    setPlayingIdx(null)
    setProgress(0)
    setDuration(0)
    setPlayAllMode(false)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const src = (e as CustomEvent).detail?.source
      if (src === 'beatport-top') return
      stop()
    }
    window.addEventListener('ob-audio-claim', handler)
    return () => window.removeEventListener('ob-audio-claim', handler)
  }, [stop])

  const playTrack = useCallback((idx: number) => {
    const t = tracks[idx]
    if (!t?.sample_url) return

    if (playingIdx === idx) {
      stop()
      return
    }

    claimAudio('beatport-top' as 'chart-preview')
    const a = audioRef.current
    if (!a) return

    a.src = proxyUrl(t.sample_url)
    a.load()
    setPlayingIdx(idx)
    setProgress(0)
    setDuration(0)

    a.play().catch(() => setPlayingIdx(null))
  }, [tracks, playingIdx, stop])

  const advanceOrStop = useCallback(() => {
    if (!playAllMode || playingIdx === null) { stop(); return }
    let next = playingIdx + 1
    while (next < tracks.length && !tracks[next].sample_url) next++
    if (next >= tracks.length) { stop(); return }
    playTrack(next)
  }, [playAllMode, playingIdx, tracks, playTrack, stop])

  useEffect(() => {
    const a = audioRef.current
    if (!a) return
    const onTime = () => setProgress(a.currentTime)
    const onMeta = () => setDuration(a.duration)
    const onEnded = () => advanceOrStop()
    a.addEventListener('timeupdate', onTime)
    a.addEventListener('loadedmetadata', onMeta)
    a.addEventListener('ended', onEnded)
    return () => {
      a.removeEventListener('timeupdate', onTime)
      a.removeEventListener('loadedmetadata', onMeta)
      a.removeEventListener('ended', onEnded)
    }
  }, [advanceOrStop])

  const startPlayAll = useCallback(() => {
    setPlayAllMode(true)
    let first = 0
    while (first < tracks.length && !tracks[first].sample_url) first++
    if (first < tracks.length) playTrack(first)
  }, [tracks, playTrack])

  if (!tracks.length) return null

  const hasAnySample = tracks.some(t => t.sample_url)
  const c = {
    title: lang === 'es' ? 'TOP 10 BEATPORT' : 'BEATPORT TOP 10',
    playAll: lang === 'es' ? '▶ PLAY ALL' : '▶ PLAY ALL',
    stopAll: '■ STOP',
    viewOn: lang === 'es' ? 'VER EN BEATPORT' : 'VIEW ON BEATPORT',
  }

  return (
    <div className="mt-8 border-4 border-[var(--ink)]">
      <audio ref={audioRef} preload="none" className="hidden" />

      <div className="flex items-center justify-between gap-3 px-4 py-3 sm:px-6 sm:py-4 bg-[var(--ink)] text-[var(--paper)]">
        <div className="flex items-center gap-3 min-w-0">
          <div
            style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)' }}
          >
            {c.title}
          </div>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {hasAnySample && (
            <button
              type="button"
              onClick={playAllMode ? stop : startPlayAll}
              className="px-3 py-1 text-[10px] font-black tracking-wider border-2 border-[var(--yellow)] transition-all cursor-pointer touch-manipulation bg-transparent text-[var(--yellow)] hover:bg-[var(--yellow)] hover:text-[var(--ink)]"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {playAllMode ? c.stopAll : c.playAll}
            </button>
          )}
          {beatportUrl && (
            <a
              href={beatportUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3 py-1 text-[10px] font-black tracking-wider border-2 border-[var(--cyan)] text-[var(--cyan)] hover:bg-[var(--cyan)] hover:text-[var(--ink)] transition-all"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              BEATPORT →
            </a>
          )}
        </div>
      </div>

      {playingIdx !== null && (
        <div className="px-4 py-2 sm:px-6 bg-[var(--ink)] border-t border-dashed border-white/10 flex items-center gap-3">
          <div className="flex-1 h-1 bg-white/10 rounded overflow-hidden">
            <div
              className="h-full bg-[var(--yellow)] transition-all duration-200"
              style={{ width: duration > 0 ? `${(progress / duration) * 100}%` : '0%' }}
            />
          </div>
          <span className="text-[10px] text-white/50 tabular-nums shrink-0" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {formatTime(progress)} / {formatTime(duration)}
          </span>
        </div>
      )}

      <div>
        {tracks.map((t, i) => {
          const isActive = playingIdx === i
          const artists = t.artists.map(a => a.name).join(', ')
          return (
            <div
              key={`${t.beatport_url}-${i}`}
              className={`flex items-center gap-3 px-4 py-2.5 sm:px-6 sm:py-3 border-t border-[var(--ink)]/15 transition-colors ${isActive ? 'bg-[var(--yellow)]/10' : 'hover:bg-[var(--ink)]/5'}`}
            >
              <span
                className="w-5 text-right shrink-0 tabular-nums"
                style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', fontWeight: 700, color: isActive ? 'var(--red)' : 'var(--dim)' }}
              >
                {t.position}
              </span>

              {t.artwork_url && (
                <div className="w-9 h-9 sm:w-10 sm:h-10 shrink-0 border-2 border-[var(--ink)] overflow-hidden">
                  <Image
                    src={t.artwork_url}
                    alt={t.title}
                    width={40}
                    height={40}
                    className="object-cover w-full h-full"
                    unoptimized
                  />
                </div>
              )}

              <div className="min-w-0 flex-1">
                <div
                  className="truncate"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', fontWeight: 700, color: isActive ? 'var(--red)' : 'var(--ink)' }}
                >
                  {t.title}{t.mix_name ? ` (${t.mix_name})` : ''}
                </div>
                <div
                  className="truncate"
                  style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}
                >
                  {artists}{t.label ? ` · ${t.label}` : ''}
                </div>
              </div>

              <div className="flex items-center gap-1.5 shrink-0">
                {t.bpm && (
                  <span
                    className="hidden sm:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)]"
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                  >
                    {t.bpm}
                  </span>
                )}
                {t.key && (
                  <span
                    className="hidden sm:inline-flex items-center justify-center px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)] whitespace-nowrap"
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                  >
                    {t.key}
                  </span>
                )}
                {t.sample_url && (
                  <button
                    type="button"
                    onClick={() => playTrack(i)}
                    className={`h-[32px] w-[32px] flex items-center justify-center text-[11px] font-black border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
                      ${isActive ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                    title={isActive ? 'Stop' : 'Preview'}
                  >
                    {isActive ? '■' : '▶'}
                  </button>
                )}
                {t.beatport_url && (
                  <a
                    href={t.beatport_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="hidden sm:inline-flex h-[32px] px-2 items-center justify-center text-[9px] font-black tracking-wider border-2 border-[var(--ink)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-all"
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                  >
                    BP
                  </a>
                )}
              </div>
            </div>
          )
        })}
      </div>
    </div>
  )
}
