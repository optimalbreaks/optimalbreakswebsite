// ============================================
// OPTIMAL BREAKS — Charts page (Client Component)
// Three sections: New Releases + Vinyl Picks + 40 Breaks Vitales
// ============================================

'use client'

import Image from 'next/image'
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react'
import type { Locale } from '@/lib/i18n-config'
import {
  claimAudio,
  OB_CHART_PLAYALL_BAR_EVENT,
  type AudioClaimSource,
} from '@/components/DeckAudioProvider'
import type {
  ChartEdition,
  ChartFeaturedArtist,
  ChartFeaturedTrack,
  ChartTrack,
  ChartTrackArtist,
  ChartVinylArtist,
  ChartVinylTrack,
} from '@/types/database'
import { extractYouTubeId, LazyYouTubeEmbed } from '@/components/YouTubeEmbed'

type ChartWeekBundle = {
  edition: ChartEdition
  tracks: ChartTrack[]
  featured: ChartFeaturedTrack[]
  vinyl: ChartVinylTrack[]
}

interface ChartViewProps {
  lang: Locale
  dict: any
  weeks: ChartWeekBundle[]
  defaultExpandedWeekDate: string
}

// ---------------------------------------------------------------------------
// Shared helpers
// ---------------------------------------------------------------------------

function formatWeekDate(dateStr: string, lang: Locale): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  })
}

/** Primer artista (como en Beatport) para orden alfabético en «New releases» — no implica ranking. */
function featuredPrimaryArtistName(pick: ChartFeaturedTrack): string {
  const a = pick.artists
  if (Array.isArray(a) && a.length > 0 && (a[0] as ChartFeaturedArtist)?.name) {
    return String((a[0] as ChartFeaturedArtist).name).trim()
  }
  return (pick.title || '').trim()
}

function sortFeaturedByArtist(picks: ChartFeaturedTrack[], lang: Locale): ChartFeaturedTrack[] {
  const loc = lang === 'es' ? 'es' : 'en'
  return [...picks].sort((A, B) => {
    const ka = featuredPrimaryArtistName(A).toLocaleLowerCase(loc)
    const kb = featuredPrimaryArtistName(B).toLocaleLowerCase(loc)
    let cmp = ka.localeCompare(kb, loc, { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    const ta = (A.title || '').toLocaleLowerCase(loc)
    const tb = (B.title || '').toLocaleLowerCase(loc)
    cmp = ta.localeCompare(tb, loc, { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    return (A.mix_name || '').localeCompare(B.mix_name || '', loc, { sensitivity: 'base' })
  })
}

function vinylPrimaryArtistName(track: ChartVinylTrack): string {
  const a = track.artists
  if (Array.isArray(a) && a.length > 0 && (a[0] as ChartVinylArtist)?.name) {
    return String((a[0] as ChartVinylArtist).name).trim()
  }
  return (track.title || '').trim()
}

function sortVinylByArtist(tracks: ChartVinylTrack[], lang: Locale): ChartVinylTrack[] {
  const loc = lang === 'es' ? 'es' : 'en'
  return [...tracks].sort((A, B) => {
    const ka = vinylPrimaryArtistName(A).toLocaleLowerCase(loc)
    const kb = vinylPrimaryArtistName(B).toLocaleLowerCase(loc)
    let cmp = ka.localeCompare(kb, loc, { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    const ta = (A.title || '').toLocaleLowerCase(loc)
    const tb = (B.title || '').toLocaleLowerCase(loc)
    cmp = ta.localeCompare(tb, loc, { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    return (A.mix_name || '').localeCompare(B.mix_name || '', loc, { sensitivity: 'base' })
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

function ArtistNames({ artists }: { artists: (ChartTrackArtist | ChartFeaturedArtist)[] }) {
  return (
    <span className="text-[var(--ink)]/70">
      {artists.map((a, i) => {
        const href = ('beatport_url' in a && a.beatport_url) || ('url' in a && a.url) || ''
        return (
          <span key={i}>
            {href ? (
              <a
                href={href}
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
        )
      })}
    </span>
  )
}

// ---------------------------------------------------------------------------
// Preview audio player
// ---------------------------------------------------------------------------

let currentPlayingAudio: HTMLAudioElement | null = null
let currentPlayingPauser: (() => void) | null = null

function formatTime(s: number): string {
  const m = Math.floor(s / 60)
  const sec = Math.floor(s % 60)
  return `${m}:${sec.toString().padStart(2, '0')}`
}

function previewAudioSrc(sampleUrl: string, pick?: ChartFeaturedTrack): string {
  if (pick?.platform === 'bandcamp' && pick.link_url) {
    return `/api/bandcamp-preview?track=${encodeURIComponent(pick.link_url)}`
  }
  try {
    const host = new URL(sampleUrl).hostname.toLowerCase()
    if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') {
      return `/api/audio-proxy?url=${encodeURIComponent(sampleUrl)}`
    }
  } catch { /* use raw url */ }
  return sampleUrl
}

// ---------------------------------------------------------------------------
// Track rows — IDENTICAL layout for both sections
// ---------------------------------------------------------------------------

function pickCtaLabel(c: Record<string, string>, track: ChartFeaturedTrack): string {
  const custom = (track.link_label || '').trim()
  if (custom) return custom
  const plat = (track.platform || 'other').toLowerCase()
  if (plat === 'beatport') return c.picks_open_beatport
  if (plat === 'bandcamp') return c.picks_open_bandcamp
  if (plat === 'soundcloud') return c.picks_open_soundcloud
  return c.picks_open_link
}

function FeaturedPickRow({ pick, dict, lang, isPlaying, onPlay }: { pick: ChartFeaturedTrack; dict: any; lang: Locale; isPlaying?: boolean; onPlay?: () => void }) {
  const c = dict.charts
  const artists = Array.isArray(pick.artists) ? pick.artists : []
  const note = lang === 'es' ? pick.note_es : pick.note_en
  const cta = pickCtaLabel(c, pick)
  const mixName = (pick.mix_name || '').trim()
  const hasSample = !!(pick.sample_url || (pick.platform === 'bandcamp' && pick.link_url))

  return (
    <div id={`chart-row-${pick.id}`} className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] transition-colors ${isPlaying ? 'bg-[var(--red)]/15 border-[var(--red)]/30' : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {pick.artwork_url ? (
            <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
              <Image src={pick.artwork_url} alt="" fill className="object-cover" sizes="(max-width: 640px) 56px, 64px" unoptimized={false} />
            </div>
          ) : null}

          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate" style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}>
              {pick.title}
              {mixName ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{mixName}</span> : null}
            </h3>
            <p className="text-xs sm:text-sm mt-0.5 sm:truncate" style={{ fontFamily: "'Courier Prime', monospace" }}>
              <ArtistNames artists={artists} />
              {pick.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{pick.label}</span></> : null}
              {pick.release_year != null && pick.release_year > 0 ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums" title={c.release_year_title}>{pick.release_year}</span></> : null}
            </p>
            {note ? <p className="text-xs text-[var(--ink)]/55 mt-1 leading-relaxed" style={{ fontFamily: "'Courier Prime', monospace" }}>{note}</p> : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center sm:gap-2 touch-manipulation">
          {hasSample && onPlay && (
            <button
              type="button"
              onClick={onPlay}
              className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
                ${isPlaying ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={isPlaying ? c.preview_pause : c.preview_play}
              aria-label={isPlaying ? c.preview_pause : c.preview_play}
            >
              {isPlaying ? '❚❚' : '▶'}
            </button>
          )}
          {pick.bpm != null && pick.bpm > 0 ? (
            <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {pick.bpm}
            </span>
          ) : null}
          {(pick.music_key || '').trim() ? (
            <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5 whitespace-nowrap" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {(pick.music_key || '').trim()}
            </span>
          ) : null}
          <a
            href={pick.link_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {cta}
          </a>
        </div>
      </div>
    </div>
  )
}

function VinylTrackRow({ track, dict, lang }: { track: ChartVinylTrack; dict: any; lang: Locale }) {
  const c = dict.charts
  const artists = Array.isArray(track.artists) ? track.artists : []
  const note = lang === 'es' ? track.note_es : track.note_en
  const mixName = (track.mix_name || '').trim()
  const ytId = extractYouTubeId(track.youtube_url)

  return (
    <div className="flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10 transition-colors">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          {track.artwork_url ? (
            <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
              <Image src={track.artwork_url} alt="" fill className="object-cover" sizes="(max-width: 640px) 56px, 64px" unoptimized={false} />
            </div>
          ) : null}

          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate" style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}>
              {track.title}
              {mixName ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{mixName}</span> : null}
            </h3>
            <p className="text-xs sm:text-sm mt-0.5 sm:truncate" style={{ fontFamily: "'Courier Prime', monospace" }}>
              <ArtistNames artists={artists} />
              {track.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{track.label}</span></> : null}
              {track.year != null && track.year > 0 ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums">{track.year}</span></> : null}
            </p>
            {(track.catalog_number || track.format) && (
              <p className="text-[10px] text-[var(--ink)]/40 mt-0.5" style={{ fontFamily: "'Courier Prime', monospace" }}>
                {track.format ? <span>{track.format}</span> : null}
                {track.format && track.catalog_number ? <span className="mx-1"> · </span> : null}
                {track.catalog_number ? <span>{track.catalog_number}</span> : null}
              </p>
            )}
            {note ? <p className="text-xs text-[var(--ink)]/55 mt-1 leading-relaxed" style={{ fontFamily: "'Courier Prime', monospace" }}>{note}</p> : null}
          </div>
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center sm:gap-2 touch-manipulation">
          {track.youtube_url && (
            <a
              href={track.youtube_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {c.vinyl_open_youtube}
            </a>
          )}
          <a
            href={track.discogs_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {c.vinyl_open_discogs}
          </a>
        </div>
      </div>

      {ytId && (
        <div className="w-full max-w-sm">
          <LazyYouTubeEmbed
            videoId={ytId}
            title={`${track.title} — ${artists.map((a: ChartVinylArtist) => a.name).join(', ')}`}
            className="border-[3px] border-[var(--ink)]"
          />
        </div>
      )}
    </div>
  )
}

function ChartTrackRow({ track, dict, isPlaying, onPlay }: { track: ChartTrack; dict: any; isPlaying?: boolean; onPlay?: () => void }) {
  const c = dict.charts
  const artists = Array.isArray(track.artists) ? track.artists : []

  return (
    <div id={`chart-row-${track.id}`} className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] transition-colors ${isPlaying ? 'bg-[var(--red)]/15 border-[var(--red)]/30' : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <PositionBadge position={track.position} />

          {track.artwork_url ? (
            <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
              <Image src={track.artwork_url} alt="" fill className="object-cover" sizes="(max-width: 640px) 56px, 64px" unoptimized={false} />
            </div>
          ) : null}

          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-2 mb-0.5 flex-wrap">
              <MovementIndicator position={track.position} previousPosition={track.previous_position} weeksInChart={track.weeks_in_chart} dict={dict} />
              {track.weeks_in_chart > 1 && (
                <span className="text-[10px] text-[var(--ink)]/40 font-bold tracking-wider" style={{ fontFamily: "'Courier Prime', monospace" }}>
                  {c.weeks_in_chart.replace('{n}', String(track.weeks_in_chart))}
                </span>
              )}
            </div>
            <h3 className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate" style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}>
              {track.title}
              {track.mix_name && <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{track.mix_name}</span>}
            </h3>
            <p className="text-xs sm:text-sm mt-0.5 sm:truncate" style={{ fontFamily: "'Courier Prime', monospace" }}>
              <ArtistNames artists={artists} />
              {track.label && <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{track.label}</span></>}
              {track.release_year != null && track.release_year > 0 && <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums" title={c.release_year_title}>{track.release_year}</span></>}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center sm:gap-2 touch-manipulation">
          {track.sample_url && onPlay && (
            <button
              type="button"
              onClick={onPlay}
              className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
                ${isPlaying ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={isPlaying ? c.preview_pause : c.preview_play}
              aria-label={isPlaying ? c.preview_pause : c.preview_play}
            >
              {isPlaying ? '❚❚' : '▶'}
            </button>
          )}
          {track.bpm && (
            <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {track.bpm}
            </span>
          )}
          {track.music_key && (
            <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5 whitespace-nowrap" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {track.music_key}
            </span>
          )}
          {track.beatport_url && (
            <a
              href={track.beatport_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
              style={{ fontFamily: "'Courier Prime', monospace" }} title={c.open_beatport}
            >
              BEATPORT
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Shared accordion toggle
// ---------------------------------------------------------------------------

function useToggleSet(initial: Set<string>) {
  const [set, setSet] = useState(initial)
  const toggle = useCallback((key: string) => {
    setSet((prev) => {
      const n = new Set(prev)
      if (n.has(key)) n.delete(key)
      else n.add(key)
      return n
    })
  }, [])
  const ensureOpen = useCallback((key: string) => {
    setSet((prev) => {
      if (prev.has(key)) return prev
      const n = new Set(prev)
      n.add(key)
      return n
    })
  }, [])
  return [set, toggle, ensureOpen] as const
}

// ---------------------------------------------------------------------------
// Play-all queue (shared across both sections)
// ---------------------------------------------------------------------------

type PlayAllTrackMeta = { title: string; artist: string; rowId?: string }

type PlayAllState = {
  key: string
  queue: string[]
  meta: PlayAllTrackMeta[]
  index: number
} | null

let playAllAudio: HTMLAudioElement | null = null

// ---------------------------------------------------------------------------
// Week accordion (re-usable for both sections)
// ---------------------------------------------------------------------------

function WeekAccordion({
  weekDate,
  lang,
  isLatest,
  editionNumber,
  count,
  expanded,
  onToggle,
  label,
  dict,
  playAllSlot,
  children,
}: {
  weekDate: string
  lang: Locale
  isLatest: boolean
  editionNumber: number
  count: number
  expanded: boolean
  onToggle: () => void
  label: string
  dict: any
  playAllSlot?: React.ReactNode
  children: React.ReactNode
}) {
  const c = dict.charts
  const countLabel = c.week_tracks_count.replace('{n}', String(count))
  const badgeNum = c.week_number_badge.replace('{n}', String(editionNumber))
  const panelId = `${label}-panel-${weekDate}`
  const triggerId = `${label}-trigger-${weekDate}`

  return (
    <section className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden">
      <div className="flex items-center">
        <button
          type="button"
          id={triggerId}
          aria-expanded={expanded}
          aria-controls={panelId}
          onClick={onToggle}
          className="flex-1 flex flex-wrap items-center gap-2 sm:gap-3 text-left px-3 py-3 sm:px-4 sm:py-3.5 min-h-[52px] hover:bg-[var(--yellow)]/15 active:bg-[var(--yellow)]/25 transition-colors touch-manipulation"
          style={{ fontFamily: "'Courier Prime', monospace" }}
          title={expanded ? c.week_toggle_hide : c.week_toggle_show}
        >
          <span className="text-[11px] sm:text-sm font-black text-[var(--ink)] shrink-0" style={{ fontFamily: "'Unbounded', sans-serif" }} aria-hidden>
            {expanded ? '▼' : '▶'}
          </span>
          <span className="text-xs sm:text-sm font-bold tracking-wide text-[var(--ink)] flex-1 min-w-[12rem]">
            {c.week_label} {formatWeekDate(weekDate, lang)}
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
        {playAllSlot && (
          <div className="shrink-0 pr-3 sm:pr-4">
            {playAllSlot}
          </div>
        )}
      </div>

      {expanded && (
        <div id={panelId} role="region" aria-labelledby={triggerId}>
          {children}
        </div>
      )}
    </section>
  )
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function ChartView({
  lang,
  dict,
  weeks,
}: ChartViewProps) {
  const c = dict.charts

  const [openPicks, togglePicks, ensureOpenPicks] = useToggleSet(new Set<string>())
  const [openVinyl, toggleVinyl] = useToggleSet(new Set<string>())
  const [openForty, toggleForty, ensureOpenForty] = useToggleSet(new Set<string>())

  // ---- Play-all state ----
  const [playAll, setPlayAll] = useState<PlayAllState>(null)
  const playAllRef = useRef<HTMLAudioElement | null>(null)

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

  const stopPlayAll = useCallback(() => {
    if (currentPlayingAudio && currentPlayingPauser) currentPlayingPauser()
    const a = playAllRef.current
    if (a) { a.pause(); a.removeAttribute('src'); a.load() }
    playAllAudio = null
    setPlayAll(null)
    if ('mediaSession' in navigator) {
      navigator.mediaSession.metadata = null
      navigator.mediaSession.setActionHandler('play', null)
      navigator.mediaSession.setActionHandler('pause', null)
      navigator.mediaSession.setActionHandler('previoustrack', null)
      navigator.mediaSession.setActionHandler('nexttrack', null)
    }
  }, [])

  // Listen for external audio claims → stop charts playback
  useEffect(() => {
    const handler = (e: Event) => {
      const src = (e as CustomEvent).detail?.source as AudioClaimSource | undefined
      if (src === 'chart-playall') return
      // External player claimed audio → stop play-all and any individual preview
      if (currentPlayingAudio && currentPlayingPauser) currentPlayingPauser()
      const a = playAllRef.current
      if (a) { a.pause(); a.removeAttribute('src'); a.load() }
      playAllAudio = null
      setPlayAll(null)
      if ('mediaSession' in navigator) {
        navigator.mediaSession.metadata = null
        navigator.mediaSession.setActionHandler('play', null)
        navigator.mediaSession.setActionHandler('pause', null)
        navigator.mediaSession.setActionHandler('previoustrack', null)
        navigator.mediaSession.setActionHandler('nexttrack', null)
      }
    }
    window.addEventListener('ob-audio-claim', handler)
    return () => window.removeEventListener('ob-audio-claim', handler)
  }, [])

  const advancePlayAll = useCallback(() => {
    setPlayAll((prev) => {
      if (!prev) return null
      const next = prev.index + 1
      if (next >= prev.queue.length) {
        const a = playAllRef.current
        if (a) { a.pause(); a.removeAttribute('src'); a.load() }
        playAllAudio = null
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
      const next = prev.index + delta
      if (next < 0 || next >= prev.queue.length) return prev
      return { ...prev, index: next }
    })
  }, [])

  const startPlayAll = useCallback((key: string, queue: string[], meta: PlayAllTrackMeta[]) => {
    if (currentPlayingAudio && currentPlayingPauser) currentPlayingPauser()
    claimAudio('chart-playall')
    setPlayAll({ key, queue, meta, index: 0 })
  }, [])

  useEffect(() => {
    if (!playAll) return
    const a = playAllRef.current
    if (!a) return

    if (currentPlayingAudio && currentPlayingAudio !== a && currentPlayingPauser) {
      currentPlayingPauser()
    }

    const src = playAll.queue[playAll.index]
    if (!src) { stopPlayAll(); return }

    a.src = src
    a.load()
    setPaPaused(false)
    a.play().then(() => {
      currentPlayingAudio = a
      currentPlayingPauser = () => { a.pause(); setPlayAll(null) }
      playAllAudio = a
      if ('mediaSession' in navigator) {
        const m = playAll.meta[playAll.index]
        navigator.mediaSession.metadata = new MediaMetadata({
          title: m?.title ?? '',
          artist: m?.artist ?? 'Optimal Breaks Charts',
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
  }, [playAll?.key, playAll?.index, advancePlayAll, stopPlayAll, goToPlayAll]) // eslint-disable-line react-hooks/exhaustive-deps

  const scrollToCurrentTrack = useCallback(() => {
    if (!playAll) return
    const meta = playAll.meta[playAll.index]
    if (!meta?.rowId) return

    const key = playAll.key
    const weekDate = key.replace(/^(picks|forty)-/, '')
    if (key.startsWith('forty-')) ensureOpenForty(weekDate)
    else if (key.startsWith('picks-')) ensureOpenPicks(weekDate)

    requestAnimationFrame(() => {
      setTimeout(() => {
        const el = document.getElementById(meta.rowId!)
        if (el) {
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('!bg-[var(--yellow)]/25')
          setTimeout(() => el.classList.remove('!bg-[var(--yellow)]/25'), 1500)
        }
      }, 120)
    })
  }, [playAll, ensureOpenForty, ensureOpenPicks])

  // ---- Play-all pause/resume ----
  const [paPaused, setPaPaused] = useState(false)

  const togglePaPlayback = useCallback(() => {
    const a = playAllRef.current
    if (!a) return
    if (a.paused) {
      a.play().then(() => setPaPaused(false)).catch(() => {})
    } else {
      a.pause()
      setPaPaused(true)
    }
  }, [])

  const playFromIndex = useCallback((sectionKey: string, queue: string[], meta: PlayAllTrackMeta[], index: number) => {
    if (playAll?.key === sectionKey && playAll.index === index) {
      togglePaPlayback()
      return
    }
    if (currentPlayingAudio && currentPlayingPauser) currentPlayingPauser()
    claimAudio('chart-playall')
    setPlayAll({ key: sectionKey, queue, meta, index })
  }, [playAll?.key, playAll?.index, togglePaPlayback])

  const handlePlayAllClick = useCallback((sectionKey: string, audioSrcs: string[], meta: PlayAllTrackMeta[]) => {
    if (playAll?.key === sectionKey) {
      stopPlayAll()
    } else {
      startPlayAll(sectionKey, audioSrcs, meta)
    }
  }, [playAll?.key, stopPlayAll, startPlayAll])

  // ---- Play-all progress tracking ----
  const [paProgress, setPaProgress] = useState(0)
  const [paCurrentTime, setPaCurrentTime] = useState(0)
  const [paDuration, setPaDuration] = useState(0)
  const paBarRef = useRef<HTMLDivElement | null>(null)

  const paRafRef = useRef(0)
  useLayoutEffect(() => {
    if (!playAll) { setPaProgress(0); setPaCurrentTime(0); setPaDuration(0); return }
    let cancelled = false
    const tick = () => {
      if (cancelled) return
      const a = playAllRef.current
      if (a && a.duration && Number.isFinite(a.duration)) {
        setPaProgress(a.currentTime / a.duration)
        setPaCurrentTime(a.currentTime)
        setPaDuration(a.duration)
      }
      paRafRef.current = requestAnimationFrame(tick)
    }
    paRafRef.current = requestAnimationFrame(tick)
    return () => { cancelled = true; cancelAnimationFrame(paRafRef.current) }
  }, [playAll?.key, playAll?.index, paPaused]) // eslint-disable-line react-hooks/exhaustive-deps

  const paSeekTo = useCallback((clientX: number) => {
    const a = playAllRef.current
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

  type PlayAllBundle = { srcs: string[]; meta: PlayAllTrackMeta[] }

  function buildFeaturedBundle(featured: ChartFeaturedTrack[]): PlayAllBundle {
    const srcs: string[] = []
    const meta: PlayAllTrackMeta[] = []
    for (const p of featured) {
      let src = ''
      if (p.platform === 'bandcamp' && p.link_url) src = previewAudioSrc('', p)
      else if (p.sample_url) src = previewAudioSrc(p.sample_url)
      if (!src) continue
      srcs.push(src)
      const artists = Array.isArray(p.artists) ? p.artists.map((a: ChartFeaturedArtist) => a.name).join(', ') : ''
      meta.push({ title: p.title, artist: artists, rowId: `chart-row-${p.id}` })
    }
    return { srcs, meta }
  }

  function buildTrackBundle(tracks: ChartTrack[]): PlayAllBundle {
    const srcs: string[] = []
    const meta: PlayAllTrackMeta[] = []
    for (const t of tracks) {
      if (!t.sample_url) continue
      srcs.push(previewAudioSrc(t.sample_url))
      const artists = Array.isArray(t.artists) ? t.artists.map((a: ChartTrackArtist) => a.name).join(', ') : ''
      meta.push({ title: t.title, artist: artists, rowId: `chart-row-${t.id}` })
    }
    return { srcs, meta }
  }

  function renderPlayAllBtn(sectionKey: string, bundle: PlayAllBundle) {
    if (bundle.srcs.length === 0) return undefined
    const isActive = playAll?.key === sectionKey
    const current = isActive ? (playAll!.index + 1) : 0
    const total = isActive ? playAll!.queue.length : bundle.srcs.length

    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handlePlayAllClick(sectionKey, bundle.srcs, bundle.meta) }}
        className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-[10px] sm:text-[11px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation select-none whitespace-nowrap
          ${isActive ? 'bg-[var(--red)] text-white' : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)]'}`}
        style={{ fontFamily: "'Courier Prime', monospace" }}
        title={isActive ? c.stop_all_title : c.play_all_title}
        aria-label={isActive ? c.stop_all_title : c.play_all_title}
      >
        {isActive ? c.stop_all : c.play_all}
        {isActive && (
          <span className="text-[9px] font-bold opacity-80 tabular-nums">
            {c.play_all_counter.replace('{current}', String(current)).replace('{total}', String(total))}
          </span>
        )}
      </button>
    )
  }

  const weeksWithFeatured = weeks.filter((w) => w.featured.length > 0)
  const weeksWithVinyl = weeks.filter((w) => w.vinyl.length > 0)
  const latestWeekDate = weeks[0]?.edition.week_date ?? ''

  if (weeks.length === 0) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-20 text-center">
        <h1 className="text-3xl sm:text-5xl font-black mb-4" style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}>
          {c.radio_title}
        </h1>
        <p className="text-base text-[var(--ink)]/60" style={{ fontFamily: "'Courier Prime', monospace" }}>
          {c.no_chart_yet}
        </p>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto px-0 sm:px-4 py-6 sm:py-10">
      {/* hidden audio element for play-all queue */}
      <audio ref={playAllRef} preload="none" onEnded={advancePlayAll} className="hidden" />

      {/* ================================================================ */}
      {/* PAGE HEADER — "La radio de Optimal Breaks"                       */}
      {/* ================================================================ */}
      <header className="px-4 sm:px-0 mb-10 sm:mb-14 text-center">
        <h1
          className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[0.95] mb-3"
          style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
        >
          {c.radio_title}
        </h1>
        <p
          className="text-sm sm:text-base text-[var(--ink)]/60 max-w-2xl mx-auto"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {c.radio_subtitle}
        </p>
      </header>

      {/* ================================================================ */}
      {/* SECTION 1 — New releases (editorial picks)                       */}
      {/* ================================================================ */}
      {weeksWithFeatured.length > 0 && (
        <section className="mb-12 sm:mb-16">
          <header className="px-4 sm:px-0 mb-6 sm:mb-8">
            <span
              className="inline-block px-2 py-1 text-[10px] font-black tracking-[4px] bg-[var(--cyan)] text-white border-2 border-[var(--ink)] mb-3"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {c.picks_kicker}
            </span>
            <h2
              className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[0.95] mb-3"
              style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
            >
              {c.picks_title}
            </h2>
            <p
              className="text-sm sm:text-base text-[var(--ink)]/60"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {c.picks_subtitle}
            </p>
          </header>

          <div className="flex flex-col gap-2 px-2 sm:px-0">
            {weeksWithFeatured.map((bundle, index) => {
              const { edition, featured } = bundle
              const isLatest = edition.week_date === weeksWithFeatured[0].edition.week_date
              const featuredSorted = sortFeaturedByArtist(featured, lang)
              const picksBundle = buildFeaturedBundle(featuredSorted)
              const picksKey = `picks-${edition.week_date}`

              return (
                <WeekAccordion
                  key={`picks-${edition.id}`}
                  weekDate={edition.week_date}
                  lang={lang}
                  isLatest={isLatest}
                  editionNumber={index + 1}
                  count={featuredSorted.length}
                  expanded={openPicks.has(edition.week_date)}
                  onToggle={() => togglePicks(edition.week_date)}
                  label="picks"
                  dict={dict}
                  playAllSlot={renderPlayAllBtn(picksKey, picksBundle)}
                >
                  {featuredSorted.map((pick) => {
                    const rowId = `chart-row-${pick.id}`
                    const idx = picksBundle.meta.findIndex((m) => m.rowId === rowId)
                    const isActive = playAll?.key === picksKey && playAll.index === idx
                    return (
                      <FeaturedPickRow
                        key={pick.id}
                        pick={pick}
                        dict={dict}
                        lang={lang}
                        isPlaying={isActive}
                        onPlay={idx >= 0 ? () => playFromIndex(picksKey, picksBundle.srcs, picksBundle.meta, idx) : undefined}
                      />
                    )
                  })}
                </WeekAccordion>
              )
            })}
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* SECTION 2 — Vinyl Picks (Discogs + YouTube)                      */}
      {/* ================================================================ */}
      {weeksWithVinyl.length > 0 && (
        <section className="mb-12 sm:mb-16">
          <header className="px-4 sm:px-0 mb-6 sm:mb-8">
            <span
              className="inline-block px-2 py-1 text-[10px] font-black tracking-[4px] bg-[var(--uv)] text-white border-2 border-[var(--ink)] mb-3"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {c.vinyl_kicker}
            </span>
            <h2
              className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[0.95] mb-3"
              style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
            >
              {c.vinyl_title}
            </h2>
            <p
              className="text-sm sm:text-base text-[var(--ink)]/60"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {c.vinyl_subtitle}
            </p>
          </header>

          <div className="flex flex-col gap-2 px-2 sm:px-0">
            {weeksWithVinyl.map((bundle, index) => {
              const { edition, vinyl } = bundle
              const isLatest = edition.week_date === weeksWithVinyl[0].edition.week_date
              const vinylSorted = sortVinylByArtist(vinyl, lang)

              return (
                <WeekAccordion
                  key={`vinyl-${edition.id}`}
                  weekDate={edition.week_date}
                  lang={lang}
                  isLatest={isLatest}
                  editionNumber={index + 1}
                  count={vinylSorted.length}
                  expanded={openVinyl.has(edition.week_date)}
                  onToggle={() => toggleVinyl(edition.week_date)}
                  label="vinyl"
                  dict={dict}
                >
                  {vinylSorted.map((track) => (
                    <VinylTrackRow
                      key={track.id}
                      track={track}
                      dict={dict}
                      lang={lang}
                    />
                  ))}
                </WeekAccordion>
              )
            })}
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* SECTION 3 — 40 Breaks Vitales (Beatport chart)                   */}
      {/* ================================================================ */}
      <section>
        <header className="px-4 sm:px-0 mb-6 sm:mb-8">
          <span
            className="inline-block px-2 py-1 text-[10px] font-black tracking-[4px] bg-[var(--red)] text-white border-2 border-[var(--ink)] mb-3"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {c.forty_kicker}
          </span>
          <h2
            className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[0.95] mb-3"
            style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
          >
            {c.title}
          </h2>
          <p
            className="text-sm sm:text-base text-[var(--ink)]/60"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {c.subtitle}
          </p>
          {c.method_note && (
            <p className="mt-2 max-w-2xl text-xs sm:text-sm text-[var(--ink)]/45 leading-relaxed" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {c.method_note}
            </p>
          )}
        </header>

        <div className="flex flex-col gap-2 px-2 sm:px-0">
          {weeks.map((bundle, index) => {
            const { edition, tracks } = bundle
            const isLatest = edition.week_date === latestWeekDate
            const description = lang === 'es' ? edition.description_es : edition.description_en
            const fortyBundle = buildTrackBundle(tracks)
            const fortyKey = `forty-${edition.week_date}`

            return (
              <WeekAccordion
                key={`forty-${edition.id}`}
                weekDate={edition.week_date}
                lang={lang}
                isLatest={isLatest}
                editionNumber={index + 1}
                count={tracks.length}
                expanded={openForty.has(edition.week_date)}
                onToggle={() => toggleForty(edition.week_date)}
                label="forty"
                dict={dict}
                playAllSlot={renderPlayAllBtn(fortyKey, fortyBundle)}
              >
                {edition.sources.length > 0 && (
                  <p className="px-3 sm:px-4 pt-3 pb-2 text-[10px] text-[var(--ink)]/45 tracking-wider" style={{ fontFamily: "'Courier Prime', monospace" }}>
                    {c.source_label}: {edition.sources.join(', ')}
                  </p>
                )}
                {description && (
                  <p className="px-3 sm:px-4 pb-3 text-sm text-[var(--ink)]/65" style={{ fontFamily: "'Courier Prime', monospace" }}>
                    {description}
                  </p>
                )}
                <div className="border-t-4 border-[var(--ink)]">
                  {tracks.map((track) => {
                    const rowId = `chart-row-${track.id}`
                    const idx = fortyBundle.meta.findIndex((m) => m.rowId === rowId)
                    const isActive = playAll?.key === fortyKey && playAll.index === idx
                    return (
                      <ChartTrackRow
                        key={track.id}
                        track={track}
                        dict={dict}
                        isPlaying={isActive}
                        onPlay={idx >= 0 ? () => playFromIndex(fortyKey, fortyBundle.srcs, fortyBundle.meta, idx) : undefined}
                      />
                    )
                  })}
                </div>
              </WeekAccordion>
            )
          })}
        </div>
      </section>

      <footer className="px-4 sm:px-0 mt-8 text-center">
        <p className="text-[10px] text-[var(--ink)]/30 tracking-[3px] font-bold" style={{ fontFamily: "'Courier Prime', monospace" }}>
          OPTIMAL BREAKS — 40 BREAKS VITALES
        </p>
      </footer>

      {/* ================================================================ */}
      {/* FLOATING NOW-PLAYING BAR (visible only during play-all)          */}
      {/* ================================================================ */}
      {playAll && (
        <div
          className="fixed bottom-0 inset-x-0 z-50 border-t-[3px] border-[var(--ink)] bg-[var(--paper)] shadow-[0_-4px_20px_rgba(0,0,0,.15)]"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {/* progress bar (seekable) */}
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
            {/* transport: prev / play-pause / stop / next */}
            <div className="flex items-center gap-1.5 sm:gap-1 shrink-0">
              <button
                type="button"
                onClick={() => goToPlayAll(-1)}
                disabled={playAll.index === 0}
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors touch-manipulation"
                title={c.play_all_prev_title}
                aria-label={c.play_all_prev_title}
              >
                {c.play_all_prev}
              </button>
              <button
                type="button"
                onClick={togglePaPlayback}
                className={`w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm font-black border-2 border-[var(--ink)] transition-colors touch-manipulation
                  ${paPaused ? 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white' : 'bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)]'}`}
                title={paPaused ? c.preview_play : c.preview_pause}
                aria-label={paPaused ? c.preview_play : c.preview_pause}
              >
                {paPaused ? '▶' : '❚❚'}
              </button>
              <button
                type="button"
                onClick={stopPlayAll}
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm font-black border-2 border-[var(--ink)] bg-[var(--red)] text-white hover:bg-[var(--ink)] transition-colors touch-manipulation"
                title={c.stop_all_title}
                aria-label={c.stop_all_title}
              >
                ■
              </button>
              <button
                type="button"
                onClick={() => goToPlayAll(1)}
                disabled={playAll.index >= playAll.queue.length - 1}
                className="w-10 h-10 sm:w-8 sm:h-8 flex items-center justify-center text-base sm:text-sm border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] disabled:opacity-25 disabled:cursor-not-allowed transition-colors touch-manipulation"
                title={c.play_all_next_title}
                aria-label={c.play_all_next_title}
              >
                {c.play_all_next}
              </button>
            </div>

            {/* track info — tap to scroll to position in chart */}
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

            {/* time + counter */}
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
    </div>
  )
}
