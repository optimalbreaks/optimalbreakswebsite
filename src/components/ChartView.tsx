// ============================================
// OPTIMAL BREAKS — 40 Breaks Vitales (Client Component)
// ============================================

'use client'

import { useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import type { Locale } from '@/lib/i18n-config'
import type { ChartEdition, ChartTrack, ChartTrackArtist } from '@/types/database'

interface ChartViewProps {
  lang: Locale
  dict: any
  edition: ChartEdition | null
  tracks: ChartTrack[]
  allEditions: Pick<ChartEdition, 'week_date' | 'title'>[]
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

function PreviewButton({ sampleUrl, dict }: { sampleUrl: string | null; dict: any }) {
  const audioRef = useRef<HTMLAudioElement | null>(null)
  const [playing, setPlaying] = useState(false)

  if (!sampleUrl) return null

  const toggle = () => {
    if (!audioRef.current) {
      audioRef.current = new Audio(sampleUrl)
      audioRef.current.addEventListener('ended', () => setPlaying(false))
    }
    if (playing) {
      audioRef.current.pause()
      audioRef.current.currentTime = 0
      setPlaying(false)
    } else {
      audioRef.current.play().catch(() => {})
      setPlaying(true)
    }
  }

  return (
    <button
      type="button"
      onClick={toggle}
      className={`px-2 py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer
        ${playing ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)]'}`}
      style={{ fontFamily: "'Courier Prime', monospace" }}
      title={playing ? dict.charts.preview_stop : dict.charts.preview_play}
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
    <div className="flex items-start gap-3 sm:gap-4 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10 transition-colors">
      {/* Position */}
      <PositionBadge position={track.position} />

      {/* Artwork */}
      {track.artwork_url && (
        <div className="hidden sm:block shrink-0 w-14 h-14 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)]">
          <img
            src={track.artwork_url}
            alt=""
            className="w-full h-full object-cover"
            loading="lazy"
          />
        </div>
      )}

      {/* Info */}
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-0.5">
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
          className="text-sm sm:text-base font-black leading-tight truncate"
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
          className="text-xs sm:text-sm mt-0.5 truncate"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          <ArtistNames artists={artists} />
          {track.label && (
            <>
              <span className="mx-1.5 text-[var(--ink)]/30">|</span>
              <span className="text-[var(--ink)]/50">{track.label}</span>
            </>
          )}
        </p>
      </div>

      {/* Badges + actions */}
      <div className="hidden md:flex items-center gap-2 shrink-0">
        {track.bpm && (
          <span
            className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)]"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {track.bpm} {c.bpm_label}
          </span>
        )}
        {track.key && (
          <span
            className="px-1.5 py-0.5 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)]"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {track.key}
          </span>
        )}
        <PreviewButton sampleUrl={track.sample_url} dict={dict} />
        {track.beatport_url && (
          <a
            href={track.beatport_url}
            target="_blank"
            rel="noopener noreferrer"
            className="px-2 py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white transition-all no-underline"
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

export default function ChartView({ lang, dict, edition, tracks, allEditions }: ChartViewProps) {
  const router = useRouter()
  const c = dict.charts

  if (!edition) {
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

  const editionNumber = allEditions.findIndex((e) => e.week_date === edition.week_date) + 1
  const description = lang === 'es' ? edition.description_es : edition.description_en

  return (
    <div className="max-w-4xl mx-auto px-0 sm:px-4 py-6 sm:py-10">
      {/* Header */}
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
          className="text-sm sm:text-base text-[var(--ink)]/60 mb-4"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {c.subtitle}
        </p>

        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <span
            className="text-xs font-bold tracking-wider text-[var(--ink)]"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {c.week_label} {formatWeekDate(edition.week_date, lang)}
            {editionNumber > 0 && ` — #${editionNumber}`}
          </span>

          {edition.sources.length > 0 && (
            <span
              className="text-[10px] text-[var(--ink)]/40 tracking-wider"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {c.source_label}: {edition.sources.join(', ')}
            </span>
          )}

          {allEditions.length > 1 && (
            <select
              className="ml-auto text-[10px] font-bold tracking-wider bg-[var(--paper)] border-2 border-[var(--ink)] px-2 py-1 cursor-pointer"
              style={{ fontFamily: "'Courier Prime', monospace" }}
              value={edition.week_date}
              onChange={(e) => {
                router.push(`/${lang}/charts?week=${e.target.value}`)
              }}
            >
              {allEditions.map((ed) => (
                <option key={ed.week_date} value={ed.week_date}>
                  {formatWeekDate(ed.week_date, lang)}
                </option>
              ))}
            </select>
          )}
        </div>

        {description && (
          <p
            className="mt-3 text-sm text-[var(--ink)]/60"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {description}
          </p>
        )}
      </header>

      {/* Track list */}
      <div className="border-t-4 border-[var(--ink)]">
        {tracks.map((track) => (
          <ChartTrackRow key={track.id} track={track} dict={dict} />
        ))}
      </div>

      {/* Footer */}
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
