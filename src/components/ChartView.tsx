// ============================================
// OPTIMAL BREAKS — 40 Breaks Vitales (Client Component)
// ============================================

'use client'

import Image from 'next/image'
import { useRef, useState } from 'react'
import type { Locale } from '@/lib/i18n-config'
import type { ChartEdition, ChartTrack, ChartTrackArtist } from '@/types/database'

type ChartWeekBundle = {
  edition: ChartEdition
  tracks: ChartTrack[]
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

let currentPlayingAudio: HTMLAudioElement | null = null
let currentPlayingSetter: ((playing: boolean) => void) | null = null

function PreviewButton({ sampleUrl, dict }: { sampleUrl: string | null; dict: any }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  if (!sampleUrl) return null

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(sampleUrl)
      audioRef.current.addEventListener('ended', () => {
        setPlaying(false)
        if (currentPlayingAudio === audioRef.current) {
          currentPlayingAudio = null
          currentPlayingSetter = null
        }
      })
    }
    
    if (playing) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
      if (currentPlayingAudio === audioRef.current) {
        currentPlayingAudio = null
        currentPlayingSetter = null
      }
    } else {
      if (currentPlayingAudio && currentPlayingAudio !== audioRef.current) {
        currentPlayingAudio.pause()
        currentPlayingAudio.currentTime = 0
        if (currentPlayingSetter) currentPlayingSetter(false)
      }
      audioRef.current.play().catch(() => {})
      setPlaying(true)
      currentPlayingAudio = audioRef.current
      currentPlayingSetter = setPlaying
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`min-h-[44px] min-w-[44px] px-3 py-2 sm:min-h-0 sm:min-w-0 sm:px-2 sm:py-1 text-[11px] sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
        ${playing ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
      style={{ fontFamily: "'Courier Prime', monospace" }}
      title={playing ? dict.charts.preview_stop : dict.charts.preview_play}
      aria-label={playing ? dict.charts.preview_stop : dict.charts.preview_play}
    >
      {playing ? '■ STOP' : '▶ PLAY'}
    </button>
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
    <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10 transition-colors">
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
        <PreviewButton sampleUrl={track.sample_url} dict={dict} />
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
  )
}

export default function ChartView({
  lang,
  dict,
  weeks,
  defaultExpandedWeekDate,
}: ChartViewProps) {
  const c = dict.charts

  const [openWeeks, setOpenWeeks] = useState<Set<string>>(() => {
    const s = new Set<string>()
    if (defaultExpandedWeekDate) s.add(defaultExpandedWeekDate)
    return s
  })

  const toggleWeek = (weekDate: string) => {
    setOpenWeeks((prev) => {
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
          const { edition, tracks: weekTracks } = bundle
          const expanded = openWeeks.has(edition.week_date)
          const isLatest = edition.week_date === latestWeekDate
          const editionNumber = index + 1
          const panelId = `chart-week-panel-${edition.week_date}`
          const description = lang === 'es' ? edition.description_es : edition.description_en
          const countLabel = c.week_tracks_count.replace('{n}', String(weekTracks.length))
          const badgeNum = c.week_number_badge.replace('{n}', String(editionNumber))

          return (
            <section
              key={edition.id}
              className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden"
            >
              <button
                type="button"
                id={`chart-week-trigger-${edition.week_date}`}
                aria-expanded={expanded}
                aria-controls={panelId}
                onClick={() => toggleWeek(edition.week_date)}
                className="w-full flex flex-wrap items-center gap-2 sm:gap-3 text-left px-3 py-3 sm:px-4 sm:py-3.5 min-h-[52px] hover:bg-[var(--yellow)]/15 active:bg-[var(--yellow)]/25 transition-colors touch-manipulation"
                style={{ fontFamily: "'Courier Prime', monospace" }}
                title={expanded ? c.week_toggle_hide : c.week_toggle_show}
              >
                <span
                  className="text-[11px] sm:text-sm font-black text-[var(--ink)] shrink-0"
                  style={{ fontFamily: "'Unbounded', sans-serif" }}
                  aria-hidden
                >
                  {expanded ? '▼' : '▶'}
                </span>
                <span className="text-xs sm:text-sm font-bold tracking-wide text-[var(--ink)] flex-1 min-w-[12rem]">
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
                  <span className="text-[10px] sm:text-xs text-[var(--ink)]/50 font-bold">{countLabel}</span>
                </span>
              </button>

              {expanded && (
                <div id={panelId} role="region" aria-labelledby={`chart-week-trigger-${edition.week_date}`}>
                  {edition.sources.length > 0 && (
                    <p
                      className="px-3 sm:px-4 pb-2 text-[10px] text-[var(--ink)]/45 tracking-wider"
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
