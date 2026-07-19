'use client'

import { useCallback, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import type { PreviewTrack } from '@/components/DeckAudioProvider'
import SaveTrackButton from '@/components/SaveTrackButton'
import TrackShareButton from '@/components/TrackShareButton'
import { ArtistNames } from '@/components/ArtistNames'
import { formatTrackReleaseDisplay } from '@/lib/share-track'
import type { ArtistFeaturedPick } from '@/lib/artist-related-content'
import type { ChartFeaturedTrack, SavedChartTrackSnapshot } from '@/types/database'

interface Props {
  picks: ArtistFeaturedPick[]
  lang: 'en' | 'es'
  entityName: string
  artistSlugMap?: Record<string, string>
  origin?: {
    kind: 'artist'
    id: string
    slug?: string
    name?: string
  }
}

function buildSnapshot(
  pick: ChartFeaturedTrack,
  origin?: Props['origin'],
): SavedChartTrackSnapshot {
  const artists = Array.isArray(pick.artists)
    ? pick.artists.map((a) => a.name).filter(Boolean).join(', ')
    : ''
  return {
    title: pick.title,
    mix_name: pick.mix_name || null,
    artists,
    label: pick.label || null,
    year: pick.release_year ?? null,
    release_date: pick.release_date ?? null,
    bpm: pick.bpm ?? null,
    music_key: pick.music_key || null,
    artwork_url: pick.artwork_url || null,
    sample_url: pick.sample_url || null,
    beatport_url: pick.link_url || null,
    origin,
  }
}

function previewAudioSrc(pick: ArtistFeaturedPick): string | null {
  if (pick.platform === 'bandcamp' && pick.link_url) {
    return `/api/bandcamp-preview?track=${encodeURIComponent(pick.link_url)}`
  }
  if (!pick.sample_url) return null
  try {
    const host = new URL(pick.sample_url).hostname.toLowerCase()
    if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') {
      return `/api/audio-proxy?url=${encodeURIComponent(pick.sample_url)}`
    }
  } catch { /* use raw */ }
  return pick.sample_url
}

function pickHasPreview(pick: ArtistFeaturedPick): boolean {
  return !!(pick.sample_url || (pick.platform === 'bandcamp' && pick.link_url))
}

function pickCtaLabel(lang: 'en' | 'es', pick: ArtistFeaturedPick): string {
  const custom = (pick.link_label || '').trim()
  if (custom) return custom
  const plat = (pick.platform || 'other').toLowerCase()
  if (plat === 'beatport') return 'BEATPORT'
  if (plat === 'bandcamp') return 'BANDCAMP'
  if (plat === 'soundcloud') return 'SOUNDCLOUD'
  return lang === 'es' ? 'ENLACE' : 'LINK'
}

function formatWeekLabel(weekDate: string, lang: 'en' | 'es'): string {
  const d = new Date(`${weekDate.slice(0, 10)}T12:00:00`)
  return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

export default function ArtistFeaturedTracks({
  picks,
  lang,
  entityName,
  artistSlugMap,
  origin,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const {
    previewQueue, previewIndex, previewGroupKey,
    playPreviewQueue, stopPreview,
  } = usePreviewAudioGated()

  const groupKey = useMemo(
    () => `ob-nr:${origin?.id ?? entityName}`,
    [origin?.id, entityName],
  )

  const myQueueActive = previewGroupKey === groupKey && previewQueue.length > 0
  const playablePicks = useMemo(() => picks.filter(pickHasPreview), [picks])

  const buildQueue = useCallback((): PreviewTrack[] => {
    return playablePicks.map((pick) => {
      const src = previewAudioSrc(pick)
      const artists = Array.isArray(pick.artists)
        ? pick.artists.map((a) => a.name).filter(Boolean).join(', ')
        : ''
      return {
        rowKey: `nr-${pick.id}`,
        src: src!,
        title: pick.title,
        artist: artists,
        artworkUrl: pick.artwork_url || null,
        domId: `nr-row-${pick.id}`,
        save: {
          mode: 'ref' as const,
          source: 'featured' as const,
          trackId: pick.id,
          canonicalUrl: pick.link_url || undefined,
          snapshot: buildSnapshot(pick, origin),
        },
        share: {
          mode: 'chart' as const,
          source: 'featured' as const,
          trackId: pick.id,
          weekDate: pick.weekDate,
        },
      }
    })
  }, [playablePicks, origin])

  const playFromPick = useCallback((pick: ArtistFeaturedPick) => {
    const queue = buildQueue()
    const idx = queue.findIndex((q) => q.rowKey === `nr-${pick.id}`)
    if (idx < 0) return
    setExpanded(true)
    playPreviewQueue(queue, idx, groupKey)
  }, [buildQueue, groupKey, playPreviewQueue])

  const handlePlayAllClick = useCallback(() => {
    if (myQueueActive) {
      stopPreview()
      return
    }
    const queue = buildQueue()
    if (queue.length === 0) return
    setExpanded(true)
    playPreviewQueue(queue, 0, groupKey)
  }, [myQueueActive, buildQueue, groupKey, playPreviewQueue, stopPreview])

  const isPlayingPick = useCallback((pick: ArtistFeaturedPick): boolean => {
    if (!myQueueActive) return false
    return previewQueue[previewIndex]?.rowKey === `nr-${pick.id}`
  }, [myQueueActive, previewQueue, previewIndex])

  if (!picks.length) return null

  const title = lang === 'es' ? 'NEW RELEASES EN OPTIMAL BREAKS' : 'NEW RELEASES ON OPTIMAL BREAKS'
  const countLabel = `${picks.length} ${lang === 'es' ? (picks.length === 1 ? 'tema' : 'temas') : (picks.length === 1 ? 'track' : 'tracks')}`
  const playAllBtnLabel = myQueueActive
    ? `■ STOP ${previewIndex + 1}/${previewQueue.length}`
    : '▶ PLAY ALL'

  return (
    <section className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden mt-4 md:mt-5">
      <div className="flex items-center">
        <button
          type="button"
          aria-expanded={expanded}
          onClick={() => setExpanded((v) => !v)}
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
              PICKS
            </span>
            <span className="text-[10px] sm:text-xs text-[var(--ink)]/50 font-bold">{countLabel}</span>
          </span>
        </button>

        <div className="shrink-0 pr-3 sm:pr-4 flex items-center gap-1.5">
          {playablePicks.length > 0 && (
            <button
              type="button"
              onClick={(e) => { e.stopPropagation(); handlePlayAllClick() }}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-[10px] sm:text-[11px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation select-none whitespace-nowrap
                ${myQueueActive ? 'bg-[var(--red)] text-white' : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)]'}`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={myQueueActive ? 'Stop' : 'Play All'}
            >
              {playAllBtnLabel}
            </button>
          )}
        </div>
      </div>

      {expanded && (
        <div role="region">
          <div className="border-t-4 border-[var(--ink)]">
            {picks.map((pick) => {
              const isActive = isPlayingPick(pick)
              const rowId = `nr-row-${pick.id}`
              const canPlay = pickHasPreview(pick)
              const releaseDisp = formatTrackReleaseDisplay(pick.release_date, pick.release_year)
              const note = lang === 'es' ? pick.note_es : pick.note_en
              const mixName = (pick.mix_name || '').trim()
              const artists = Array.isArray(pick.artists) ? pick.artists : []
              const chartHref = `/${lang}/charts?week=${pick.weekDate}#chart-row-${pick.id}`

              return (
                <div
                  key={pick.id}
                  id={rowId}
                  className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] transition-colors ${isActive ? 'bg-[var(--red)]/15 border-[var(--red)]/30' : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Link
                        href={chartHref}
                        className="inline-flex flex-col items-center justify-center shrink-0 w-12 h-12 sm:w-14 sm:h-14 border-[3px] border-[var(--ink)] bg-[var(--paper-dark)] hover:bg-[var(--yellow)]/30 transition-colors no-underline"
                        title={lang === 'es' ? 'Ver en Charts' : 'View in Charts'}
                      >
                        <span className="text-[8px] font-black tracking-wider text-[var(--ink)]/50 uppercase">NR</span>
                        <span className="text-[9px] sm:text-[10px] font-bold text-[var(--ink)] text-center leading-tight px-0.5">
                          {formatWeekLabel(pick.weekDate, lang)}
                        </span>
                      </Link>

                      {pick.artwork_url ? (
                        <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
                          <Image src={pick.artwork_url} alt="" fill className="object-cover" sizes="(max-width: 640px) 56px, 64px" unoptimized={false} />
                        </div>
                      ) : null}

                      <div className="flex-1 min-w-0">
                        <h3
                          className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate"
                          style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
                        >
                          {pick.title}
                          {mixName ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{mixName}</span> : null}
                        </h3>
                        <p className="text-xs sm:text-sm mt-0.5 break-words" style={{ fontFamily: "'Courier Prime', monospace" }}>
                          <ArtistNames artists={artists} slugMap={artistSlugMap} lang={lang} />
                          {pick.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{pick.label}</span></> : null}
                          {releaseDisp ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap">{releaseDisp}</span></> : null}
                        </p>
                        {note ? (
                          <p className="text-xs text-[var(--ink)]/55 mt-1 leading-relaxed" style={{ fontFamily: "'Courier Prime', monospace" }}>
                            {note}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center sm:gap-2 touch-manipulation">
                      {canPlay && (
                        <button
                          type="button"
                          onClick={() => playFromPick(pick)}
                          className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
                            ${isActive ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                          title={isActive ? (lang === 'es' ? 'Reproduciendo' : 'Playing') : (lang === 'es' ? 'Escuchar preview' : 'Play preview')}
                        >
                          {isActive ? '❚❚' : '▶'}
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
                      <SaveTrackButton
                        source="featured"
                        trackId={pick.id}
                        canonicalUrl={pick.link_url}
                        snapshot={buildSnapshot(pick, origin)}
                        lang={lang}
                        size="sm"
                      />
                      <TrackShareButton
                        source="featured"
                        trackId={pick.id}
                        weekDate={pick.weekDate}
                        lang={lang}
                        shareTitle={`${pick.title} — ${artists.map((a) => a.name).filter(Boolean).join(', ')}`}
                      />
                      {pick.link_url ? (
                        <a
                          href={pick.link_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                        >
                          {pickCtaLabel(lang, pick)}
                        </a>
                      ) : null}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
