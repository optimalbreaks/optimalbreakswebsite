// ============================================
// OPTIMAL BREAKS — 40 Breaks Vitales (Client Component)
// ============================================

'use client'

import Image from 'next/image'
import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import type { Locale } from '@/lib/i18n-config'
import type {
  ChartEdition,
  ChartFeaturedArtist,
  ChartFeaturedTrack,
  ChartTrack,
  ChartTrackArtist,
} from '@/types/database'

type ChartWeekBundle = {
  edition: ChartEdition
  tracks: ChartTrack[]
  featured: ChartFeaturedTrack[]
}

interface ChartViewProps {
  lang: Locale
  dict: any
  weeks: ChartWeekBundle[]
  defaultExpandedWeekDate: string
}

function formatWeekDate(dateStr: string, lang: Locale): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
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

function MovementIndicator({
  position,
  previousPosition,
  weeksInChart,
  dict,
}: {
  position: number
  previousPosition: number | null
  weeksInChart: number
  dict: any
}) {
  const c = dict.charts
  if (previousPosition === null) {
    return (
      <span className="inline-block px-1.5 py-0.5 text-[10px] font-black tracking-widest bg-[var(--acid)] text-[var(--ink)] border-2 border-[var(--ink)]">
        {c.new_entry}
      </span>
    )
  }
  const diff = previousPosition - position
  if (diff > 0) {
    return (
      <span className="text-green-600 font-bold text-xs" title={c.position_up}>
        ▲ {diff}
      </span>
    )
  }
  if (diff < 0) {
    return (
      <span className="text-red-600 font-bold text-xs" title={c.position_down}>
        ▼ {Math.abs(diff)}
      </span>
    )
  }
  return (
    <span className="text-[var(--ink)]/50 font-bold text-xs" title={c.position_same}>
      ═
    </span>
  )
}

function ArtistNames({ artists }: { artists: ChartTrackArtist[] }) {
  return (
    <span className="text-[var(--ink)]/70">
      {artists.map((a, i) => (
        <span key={i}>
          {a.beatport_url ? (
            <a
              href={a.beatport_url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--red)] transition-colors underline decoration-dotted"
            >
              {a.name}
            </a>
          ) : (
            a.name
          )}
          {i < artists.length - 1 && ', '}
        </span>
      ))}
    </span>
  )
}

function FeaturedArtistNames({ artists }: { artists: ChartFeaturedArtist[] }) {
  return (
    <span className="text-[var(--ink)]/70">
      {artists.map((a, i) => (
        <span key={i}>
          {a.url ? (
            <a
              href={a.url}
              target="_blank"
              rel="noopener noreferrer"
              className="hover:text-[var(--red)] transition-colors underline decoration-dotted"
            >
              {a.name}
            </a>
          ) : (
            a.name
          )}
          {i < artists.length - 1 && ', '}
        </span>
      ))}
    </span>
  )
}

function pickCtaLabel(c: Record<string, string>, track: ChartFeaturedTrack): string {
  const custom = (track.link_label || '').trim()
  if (custom) return custom
  const plat = (track.platform || 'other').toLowerCase()
  if (plat === 'beatport') return c.picks_open_beatport
  if (plat === 'bandcamp') return c.picks_open_bandcamp
  if (plat === 'soundcloud') return c.picks_open_soundcloud
  return c.picks_open_link
}

let currentPlayingAudio: HTMLAudioElement | null = null
let currentPlayingPauser: (() => void) | null = null

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function defaultPreviewLayout(
  controls: React.ReactNode,
  progressBar: React.ReactNode,
) {
  return (
    <div className="flex flex-col gap-1 min-w-[8rem] sm:min-w-0 sm:max-w-[280px] w-full">
      {controls}
      {progressBar}
    </div>
  )
}

/** Beatport: proxy por CORS. Otros hosts: src directo (puede funcionar según CDN/CORS). */
function previewAudioSrc(sampleUrl: string): string {
  try {
    const host = new URL(sampleUrl).hostname.toLowerCase()
    if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') {
      return `/api/audio-proxy?url=${encodeURIComponent(sampleUrl)}`
    }
  } catch {
    /* URL inválida: se intenta tal cual */
  }
  return sampleUrl
}

function PreviewPlayer({
  sampleUrl,
  dict,
  children = defaultPreviewLayout,
}: {
  sampleUrl: string | null
  dict: any
  children?: (controls: React.ReactNode, progressBar: React.ReactNode) => React.ReactNode
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const barRef = useRef<HTMLDivElement | null>(null)
  const [playing, setPlaying] = useState(false)
  const [progress, setProgress] = useState(0)
  const [currentTime, setCurrentTime] = useState(0)
  const [duration, setDuration] = useState(0)

  if (!sampleUrl) {
    return null
  }

  const audioSrc = previewAudioSrc(sampleUrl)

  const pauseThis = useCallback(() => {
    audioRef.current?.pause()
    setPlaying(false)
  }, [])

  // Sincronía con el audio: onTimeUpdate es muy espaciado (~4/s); rAF lee currentTime cada frame.
  const rafRef = useRef(0)
  useLayoutEffect(() => {
    if (!playing) return

    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const a = audioRef.current
      if (!a || a.paused || a !== currentPlayingAudio) return
      if (a.duration && Number.isFinite(a.duration)) {
        const t = a.currentTime
        const d = a.duration
        setProgress(t / d)
        setCurrentTime(t)
        setDuration(d)
      }
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)
    return () => {
      cancelled = true
      cancelAnimationFrame(rafRef.current)
    }
  }, [playing])

  const toggle = () => {
    const audio = audioRef.current
    if (!audio) return

    if (playing) {
      pauseThis()
      if (currentPlayingAudio === audio) {
        currentPlayingAudio = null
        currentPlayingPauser = null
      }
    } else {
      if (currentPlayingAudio && currentPlayingAudio !== audio) {
        if (currentPlayingPauser) currentPlayingPauser()
      }
      audio.play().then(() => {
        setPlaying(true)
        currentPlayingAudio = audio
        currentPlayingPauser = pauseThis
      }).catch(() => {})
    }
  }

  const handleEnded = () => {
    setPlaying(false)
    setProgress(0)
    if (currentPlayingAudio === audioRef.current) {
      currentPlayingAudio = null
      currentPlayingPauser = null
    }
  }

  const handleTimeUpdate = () => {
    const a = audioRef.current
    if (a && a.duration) {
      setProgress(a.currentTime / a.duration)
      setCurrentTime(a.currentTime)
      setDuration(a.duration)
    }
  }

  const seekTo = useCallback((clientX: number) => {
    const audio = audioRef.current
    const bar = barRef.current
    if (!audio || !bar || !audio.duration) return
    const rect = bar.getBoundingClientRect()
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    audio.currentTime = ratio * audio.duration
    setProgress(ratio)
    setCurrentTime(audio.currentTime)
  }, [])

  const draggingRef = useRef(false)

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    draggingRef.current = true
    e.currentTarget.setPointerCapture(e.pointerId)
    seekTo(e.clientX)
  }, [seekTo])

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    if (!draggingRef.current) return
    seekTo(e.clientX)
  }, [seekTo])

  const onPointerUp = useCallback(() => {
    draggingRef.current = false
  }, [])

  const c = dict.charts

  // Solo barra y tiempo de la pista que está sonando ahora (evita barra congelada al cambiar de preview)
  const audioEl = audioRef.current
  const isThisOnePlaying =
    playing && audioEl != null && audioEl === currentPlayingAudio

  const controls = (
    <div className="flex items-center gap-2">
      <audio
        ref={audioRef}
        src={audioSrc}
        preload="none"
        onEnded={handleEnded}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleTimeUpdate}
      />
      <button
        type="button"
        onClick={toggle}
        className={`min-h-[44px] min-w-[44px] px-3 py-2 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1 text-[11px] sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
          ${playing ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
        style={{ fontFamily: "'Courier Prime', monospace" }}
        title={playing ? c.preview_pause : c.preview_play}
        aria-label={playing ? c.preview_pause : c.preview_play}
      >
        {playing ? '❚❚' : '▶ PLAY'}
      </button>
      {isThisOnePlaying && duration > 0 && (
        <span
          className="text-[9px] text-[var(--ink)]/50 font-bold tabular-nums whitespace-nowrap"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {formatTime(currentTime)} / {formatTime(duration)}
        </span>
      )}
    </div>
  )

  const pct = `${progress * 100}%`

  const progressBar =
    isThisOnePlaying ? (
      <div
        ref={barRef}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        className="group relative w-full h-6 cursor-pointer touch-manipulation select-none"
        style={{ touchAction: 'none' }}
        role="progressbar"
        aria-valuenow={Math.round(progress * 100)}
        aria-valuemin={0}
        aria-valuemax={100}
      >
        {/* Rail: surco central tipo crossfader */}
        <div className="absolute left-0 right-0 top-1/2 -translate-y-1/2 h-[6px] rounded-full bg-[var(--ink)]/15 shadow-[inset_0_1px_2px_rgba(0,0,0,.25)]" />
        {/* Relleno recorrido */}
        <div
          className="absolute top-1/2 -translate-y-1/2 left-0 h-[6px] rounded-full bg-[var(--red)]/70"
          style={{ width: pct }}
        />
        {/* Thumb: controlador rojo */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-[var(--red)] border-2 border-white shadow-[0_0_0_1px_rgba(0,0,0,.15),0_2px_4px_rgba(0,0,0,.3)] group-hover:scale-110 transition-transform"
          style={{ left: pct }}
        />
      </div>
    ) : null

  return <>{children(controls, progressBar)}</>
}

function FeaturedPickRow({ pick, dict, lang }: { pick: ChartFeaturedTrack; dict: any; lang: Locale }) {
  const c = dict.charts
  const artists = Array.isArray(pick.artists) ? pick.artists : []
  const note = lang === 'es' ? pick.note_es : pick.note_en
  const cta = pickCtaLabel(c, pick)
  const mixName = (pick.mix_name || '').trim()

  return (
    <div className="flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10 transition-colors">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <PositionBadge position={pick.sort_order} />

          {pick.artwork_url ? (
            <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
              <Image
                src={pick.artwork_url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 640px) 56px, 64px"
                unoptimized
              />
            </div>
          ) : null}

          <div className="flex-1 min-w-0">
            {/* Misma altura de línea que MovementIndicator en el Top 40 */}
            <div className="flex items-center gap-2 mb-0.5 flex-wrap min-h-[22px]" aria-hidden={true} />
            <h3
              className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate"
              style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
            >
              {pick.title}
              {mixName ? (
                <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{mixName}</span>
              ) : null}
            </h3>
            <p
              className="text-xs sm:text-sm mt-0.5 sm:truncate"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              <FeaturedArtistNames artists={artists} />
              {pick.label ? (
                <>
                  <span className="mx-1.5 text-[var(--ink)]/30">|</span>
                  <span className="text-[var(--ink)]/50">{pick.label}</span>
                </>
              ) : null}
              {pick.release_year != null && pick.release_year > 0 ? (
                <>
                  <span className="mx-1.5 text-[var(--ink)]/30">|</span>
                  <span
                    className="text-[var(--ink)]/45 font-bold tabular-nums"
                    title={c.release_year_title}
                  >
                    {pick.release_year}
                  </span>
                </>
              ) : null}
            </p>
            {note ? (
              <p
                className="text-xs text-[var(--ink)]/55 mt-1 leading-relaxed"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                {note}
              </p>
            ) : null}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center md:flex-nowrap touch-manipulation">
          {pick.bpm != null && pick.bpm > 0 ? (
            <span
              className="inline-flex items-center min-h-[36px] px-2 py-1 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)] sm:min-h-0 sm:px-1.5 sm:py-0.5"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {pick.bpm} {c.bpm_label}
            </span>
          ) : null}
          {(pick.music_key || '').trim() ? (
            <span
              className="inline-flex items-center min-h-[36px] px-2 py-1 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)] sm:min-h-0 sm:px-1.5 sm:py-0.5"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {(pick.music_key || '').trim()}
            </span>
          ) : null}
          <PreviewPlayer sampleUrl={pick.sample_url} dict={dict} />
          <a
            href={pick.link_url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center justify-center min-h-[44px] px-3 py-2 sm:min-h-0 sm:px-2 sm:py-1 text-[11px] sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation"
            style={{ fontFamily: "'Courier Prime', monospace" }}
            title={pick.link_url}
          >
            {cta}
          </a>
        </div>
      </div>
    </div>
  )
}

function ChartTrackRow({
  track,
  dict,
}: {
  track: ChartTrack
  dict: any
}) {
  const c = dict.charts
  const artists = Array.isArray(track.artists) ? track.artists : []

  return (
    <div className="flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10 transition-colors">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        {/* Fila superior: posición + carátula + texto (mismo contenido que desktop) */}
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <PositionBadge position={track.position} />

          {track.artwork_url ? (
            <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
              <Image
                src={track.artwork_url}
                alt=""
                fill
                className="object-cover"
                sizes="(max-width: 640px) 56px, 64px"
                unoptimized={false}
              />
            </div>
          ) : null}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <MovementIndicator
                position={track.position}
                previousPosition={track.previous_position}
                weeksInChart={track.weeks_in_chart}
                dict={dict}
              />
              {track.weeks_in_chart > 1 && (
                <span
                  className="text-[10px] text-[var(--ink)]/40 font-bold tracking-wider"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  {c.weeks_in_chart.replace('{n}', String(track.weeks_in_chart))}
                </span>
              )}
            </div>
            <h3
              className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate"
              style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
            >
              {track.title}
              {track.mix_name && (
                <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">
                  {track.mix_name}
                </span>
              )}
            </h3>
            <p
              className="text-xs sm:text-sm mt-0.5 sm:truncate"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              <ArtistNames artists={artists} />
              {track.label && (
                <>
                  <span className="mx-1.5 text-[var(--ink)]/30">|</span>
                  <span className="text-[var(--ink)]/50">{track.label}</span>
                </>
              )}
              {track.release_year != null && track.release_year > 0 && (
                <>
                  <span className="mx-1.5 text-[var(--ink)]/30">|</span>
                  <span
                    className="text-[var(--ink)]/45 font-bold tabular-nums"
                    title={c.release_year_title}
                  >
                    {track.release_year}
                  </span>
                </>
              )}
            </p>
          </div>
        </div>

        {/* BPM + key + preview + Beatport: siempre visibles (móvil y PC); en móvil fila táctil ancha */}
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center md:flex-nowrap touch-manipulation">
          {track.bpm && (
            <span
              className="inline-flex items-center min-h-[36px] px-2 py-1 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)] sm:min-h-0 sm:px-1.5 sm:py-0.5"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {track.bpm} {c.bpm_label}
            </span>
          )}
          {track.music_key && (
            <span
              className="inline-flex items-center min-h-[36px] px-2 py-1 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)] sm:min-h-0 sm:px-1.5 sm:py-0.5"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {track.music_key}
            </span>
          )}
          <PreviewPlayer sampleUrl={track.sample_url} dict={dict} />
          {track.beatport_url && (
            <a
              href={track.beatport_url}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center min-h-[44px] px-3 py-2 sm:min-h-0 sm:px-2 sm:py-1 text-[11px] sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation"
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={c.open_beatport}
            >
              BEATPORT
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

export default function ChartView({
  lang,
  dict,
  weeks,
  defaultExpandedWeekDate,
}: ChartViewProps) {
  const c = dict.charts

  const initOpen = () => {
    const s = new Set<string>()
    if (defaultExpandedWeekDate) s.add(defaultExpandedWeekDate)
    return s
  }

  const [openPicksByWeek, setOpenPicksByWeek] = useState<Set<string>>(initOpen)
  const [openFortyByWeek, setOpenFortyByWeek] = useState<Set<string>>(initOpen)

  const togglePicks = (weekDate: string) => {
    setOpenPicksByWeek((prev) => {
      const n = new Set(prev)
      if (n.has(weekDate)) n.delete(weekDate)
      else n.add(weekDate)
      return n
    })
  }

  const toggleForty = (weekDate: string) => {
    setOpenFortyByWeek((prev) => {
      const n = new Set(prev)
      if (n.has(weekDate)) n.delete(weekDate)
      else n.add(weekDate)
      return n
    })
  }

  if (weeks.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1
          className="text-3xl sm:text-5xl font-black mb-4"
          style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
        >
          {c.title}
        </h1>
        <p
          className="text-base text-[var(--ink)]/60"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {c.no_chart_yet}
        </p>
      </div>
    )
  }

  const latestWeekDate = weeks[0].edition.week_date

  return (
    <div className="max-w-4xl mx-auto px-0 sm:px-4 py-6 sm:py-10">
      <header className="px-4 sm:px-0 mb-6 sm:mb-8">
        <span
          className="inline-block px-2 py-1 text-[10px] font-black tracking-[4px] bg-[var(--red)] text-white border-2 border-[var(--ink)] mb-3"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          WEEKLY CHART
        </span>
        <h1
          className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[0.95] mb-3"
          style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
        >
          {c.title}
        </h1>
        <p
          className="text-sm sm:text-base text-[var(--ink)]/60"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {c.subtitle}
        </p>
        {c.method_note && (
          <p
            className="mt-2 max-w-2xl text-xs sm:text-sm text-[var(--ink)]/45 leading-relaxed"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {c.method_note}
          </p>
        )}
      </header>

      <div className="flex flex-col gap-2 px-2 sm:px-0">
        {weeks.map((bundle, index) => {
          const { edition, tracks: weekTracks, featured: weekFeatured } = bundle
          const picksOpen = openPicksByWeek.has(edition.week_date)
          const fortyOpen = openFortyByWeek.has(edition.week_date)
          const isLatest = edition.week_date === latestWeekDate
          const editionNumber = index + 1
          const picksPanelId = `chart-picks-panel-${edition.week_date}`
          const fortyPanelId = `chart-forty-panel-${edition.week_date}`
          const description = lang === 'es' ? edition.description_es : edition.description_en
          const countLabel = c.week_tracks_count.replace('{n}', String(weekTracks.length))
          const picksCountLabel = c.picks_count.replace('{n}', String(weekFeatured.length))
          const badgeNum = c.week_number_badge.replace('{n}', String(editionNumber))

          const accordionBtn =
            'w-full flex flex-wrap items-center gap-2 sm:gap-3 text-left px-3 py-3 sm:px-4 sm:py-3.5 min-h-[52px] hover:bg-[var(--yellow)]/15 active:bg-[var(--yellow)]/25 transition-colors touch-manipulation'

          return (
            <section
              key={edition.id}
              className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden"
            >
              <div
                className="w-full px-3 py-3 sm:px-4 sm:py-3.5 border-b-[3px] border-[var(--ink)]/12 bg-[var(--paper)]"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                <div className="flex flex-wrap items-center gap-2 sm:gap-3">
                  <span
                    className="text-xs sm:text-sm font-bold tracking-wide text-[var(--ink)] flex-1 min-w-[12rem]"
                    style={{ fontFamily: "'Unbounded', sans-serif" }}
                  >
                    {c.week_label} {formatWeekDate(edition.week_date, lang)}
                  </span>
                  <span className="flex flex-wrap items-center gap-1.5 justify-end shrink-0">
                    {isLatest && (
                      <span className="inline-block px-1.5 py-0.5 text-[9px] font-black tracking-widest bg-[var(--acid)] text-[var(--ink)] border-2 border-[var(--ink)]">
                        {c.week_current_badge}
                      </span>
                    )}
                    <span className="inline-block px-1.5 py-0.5 text-[9px] font-black tracking-wider bg-[var(--paper-dark)] text-[var(--ink)] border-2 border-[var(--ink)]">
                      {badgeNum}
                    </span>
                  </span>
                </div>
                <p className="text-[10px] sm:text-[11px] text-[var(--ink)]/45 mt-2 max-w-2xl leading-relaxed">
                  {c.week_block_intro}
                </p>
              </div>

              <button
                type="button"
                id={`chart-picks-trigger-${edition.week_date}`}
                aria-expanded={picksOpen}
                aria-controls={picksPanelId}
                onClick={() => togglePicks(edition.week_date)}
                className={`${accordionBtn} border-b-[3px] border-[var(--ink)]/10`}
                style={{ fontFamily: "'Courier Prime', monospace" }}
                title={picksOpen ? c.picks_toggle_hide : c.picks_toggle_show}
              >
                <span
                  className="text-[11px] sm:text-sm font-black text-[var(--ink)] shrink-0"
                  style={{ fontFamily: "'Unbounded', sans-serif" }}
                  aria-hidden
                >
                  {picksOpen ? '▼' : '▶'}
                </span>
                <span className="text-xs sm:text-sm font-bold tracking-wide text-[var(--ink)] flex-1 min-w-[10rem] flex flex-wrap items-center gap-2">
                  <span
                    className="inline-block px-1.5 py-0.5 text-[9px] font-black tracking-[2px] bg-[var(--cyan)] text-white border-2 border-[var(--ink)]"
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                  >
                    {c.picks_kicker}
                  </span>
                  <span style={{ fontFamily: "'Unbounded', sans-serif" }}>{c.picks_title}</span>
                </span>
                <span className="text-[10px] sm:text-xs text-[var(--ink)]/50 font-bold shrink-0">
                  {picksCountLabel}
                </span>
              </button>

              {picksOpen && (
                <div id={picksPanelId} role="region" aria-labelledby={`chart-picks-trigger-${edition.week_date}`}>
                  <div
                    className="px-3 sm:px-4 py-3 border-b-[3px] border-[var(--ink)]/10 bg-[var(--paper-dark)]/20"
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                  >
                    <p className="text-[11px] sm:text-xs text-[var(--ink)]/55 max-w-2xl leading-relaxed">
                      {c.picks_intro}
                    </p>
                  </div>
                  {weekFeatured.length > 0 ? (
                    <div className="border-b-[3px] border-[var(--ink)]/10">
                      {weekFeatured.map((pick) => (
                        <FeaturedPickRow key={pick.id} pick={pick} dict={dict} lang={lang} />
                      ))}
                    </div>
                  ) : (
                    <p
                      className="px-4 py-6 text-sm text-center text-[var(--ink)]/50 border-b-[3px] border-[var(--ink)]/10"
                      style={{ fontFamily: "'Courier Prime', monospace" }}
                    >
                      {c.picks_empty}
                    </p>
                  )}
                </div>
              )}

              <button
                type="button"
                id={`chart-forty-trigger-${edition.week_date}`}
                aria-expanded={fortyOpen}
                aria-controls={fortyPanelId}
                onClick={() => toggleForty(edition.week_date)}
                className={accordionBtn}
                style={{ fontFamily: "'Courier Prime', monospace" }}
                title={fortyOpen ? c.forty_toggle_hide : c.forty_toggle_show}
              >
                <span
                  className="text-[11px] sm:text-sm font-black text-[var(--ink)] shrink-0"
                  style={{ fontFamily: "'Unbounded', sans-serif" }}
                  aria-hidden
                >
                  {fortyOpen ? '▼' : '▶'}
                </span>
                <span className="text-xs sm:text-sm font-bold tracking-wide text-[var(--ink)] flex-1 min-w-[10rem] flex flex-wrap items-center gap-2">
                  <span
                    className="inline-block px-1.5 py-0.5 text-[9px] font-black tracking-[3px] bg-[var(--red)] text-white border-2 border-[var(--ink)]"
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                  >
                    {c.forty_kicker}
                  </span>
                  <span style={{ fontFamily: "'Unbounded', sans-serif" }}>{c.title}</span>
                </span>
                <span className="text-[10px] sm:text-xs text-[var(--ink)]/50 font-bold shrink-0">{countLabel}</span>
              </button>

              {fortyOpen && (
                <div id={fortyPanelId} role="region" aria-labelledby={`chart-forty-trigger-${edition.week_date}`}>
                  {edition.sources.length > 0 && (
                    <p
                      className="px-3 sm:px-4 pt-3 pb-2 text-[10px] text-[var(--ink)]/45 tracking-wider"
                      style={{ fontFamily: "'Courier Prime', monospace" }}
                    >
                      {c.source_label}: {edition.sources.join(', ')}
                    </p>
                  )}
                  {description && (
                    <p
                      className="px-3 sm:px-4 pb-3 text-sm text-[var(--ink)]/65"
                      style={{ fontFamily: "'Courier Prime', monospace" }}
                    >
                      {description}
                    </p>
                  )}
                  <div className="border-t-4 border-[var(--ink)]">
                    {weekTracks.map((track) => (
                      <ChartTrackRow key={track.id} track={track} dict={dict} />
                    ))}
                  </div>
                </div>
              )}
            </section>
          )
        })}
      </div>

      <footer className="px-4 sm:px-0 mt-8 text-center">
        <p
          className="text-[10px] text-[var(--ink)]/30 tracking-[3px] font-bold"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          OPTIMAL BREAKS — 40 BREAKS VITALES
        </p>
      </footer>
    </div>
  )
}
