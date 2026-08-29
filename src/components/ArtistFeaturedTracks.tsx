'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Image from 'next/image'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import type { PreviewTrack } from '@/components/DeckAudioProvider'
import SaveTrackButton from '@/components/SaveTrackButton'
import TrackShareButton, { BeatportLinkButton, SpotifyLinkButton, TidalLinkButton } from '@/components/TrackShareButton'
import { ArtistNames, LabelName } from '@/components/ArtistNames'
import { formatTrackReleaseDisplay, buildVinylSharePath, vinylArtworkCandidates, vinylArtworkUseNativeImg } from '@/lib/share-track'
import { isArchiveFeaturedTrack } from '@/lib/charts-archive'
import type { ArtistFeaturedPick } from '@/lib/artist-related-content'
import type { ChartFeaturedTrack, ChartTrackSource, SavedChartTrackSnapshot } from '@/types/database'
import { extractYouTubeId, LazyYouTubeEmbed } from '@/components/YouTubeEmbed'
import {
  requestYouTubePlay,
  releaseYouTubePlay,
  subscribeYouTubePlay,
} from '@/lib/youtube-play-coordinator'
import { logTrackPlay } from '@/lib/track-play-log'

interface Props {
  picks: ArtistFeaturedPick[]
  lang: 'en' | 'es'
  entityName: string
  artistSlugMap?: Record<string, string>
  labelSlugMap?: Record<string, string>
  heading?: string
  badge?: string
  origin?: {
    kind: 'artist' | 'label'
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

function pickYoutubeUrl(pick: ArtistFeaturedPick): string | null {
  const fromField = (pick.youtube_url || '').trim()
  if (fromField) return fromField
  const link = (pick.link_url || '').trim()
  return extractYouTubeId(link) ? link : null
}

function pickYoutubeId(pick: ArtistFeaturedPick): string | null {
  return extractYouTubeId(pickYoutubeUrl(pick))
}

function pickArtworkSrc(pick: ArtistFeaturedPick): string | null {
  const yt = pickYoutubeUrl(pick)
  if (pick.chartKind === 'vinyl' || yt) {
    const cands = vinylArtworkCandidates(pick.artwork_url, yt, pick.label)
    const first = cands[0]
    if (!first) return null
    if (/i\.ytimg\.com/i.test(first)) {
      return `/api/og/image-proxy?src=${encodeURIComponent(first)}`
    }
    return first
  }
  return pick.artwork_url
}

function pickCtaLabel(lang: 'en' | 'es', pick: ArtistFeaturedPick): string {
  const custom = (pick.link_label || '').trim()
  if (custom) return custom
  const plat = (pick.platform || 'other').toLowerCase()
  if (plat === 'beatport') return 'BEATPORT'
  if (plat === 'bandcamp') return 'BANDCAMP'
  if (plat === 'soundcloud') return 'SOUNDCLOUD'
  if (plat === 'youtube' || pickYoutubeId(pick)) return 'YOUTUBE'
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

function pickSource(pick: ArtistFeaturedPick): ChartTrackSource {
  if (pick.chartKind === 'chart') return 'chart'
  if (pick.chartKind === 'vinyl') return 'vinyl'
  return 'featured'
}

function pickChartHref(lang: 'en' | 'es', pick: ArtistFeaturedPick): string {
  if (pick.chartKind === 'vinyl') return buildVinylSharePath(lang, pick.id)
  return `/${lang}/charts?week=${pick.weekDate}#chart-row-${pick.id}`
}

function pickBadge(pick: ArtistFeaturedPick): '40' | 'ARCH' | 'NR' {
  if (pick.chartKind === 'chart') return '40'
  if (pick.chartKind === 'vinyl' || isArchiveFeaturedTrack(pick)) return 'ARCH'
  return 'NR'
}

function pickBadgeSub(pick: ArtistFeaturedPick, lang: 'en' | 'es'): string {
  if (pick.chartKind === 'chart' && pick.position != null) return `#${pick.position}`
  if (pick.chartKind === 'vinyl' && pick.release_year) return String(pick.release_year)
  return formatWeekLabel(pick.weekDate, lang)
}

export default function ArtistFeaturedTracks({
  picks,
  lang,
  entityName,
  artistSlugMap,
  labelSlugMap,
  heading,
  badge,
  origin,
}: Props) {
  const [expanded, setExpanded] = useState(false)
  const [openYoutubeKey, setOpenYoutubeKey] = useState<string | null>(null)
  const pathname = usePathname()
  const {
    previewQueue, previewIndex, previewGroupKey, previewPlaying,
    playPreviewQueue, stopPreview, togglePreview,
  } = usePreviewAudioGated()

  const toggleYoutubeEmbed = useCallback((key: string, playKey: string) => {
    setOpenYoutubeKey((prev) => {
      if (prev === key) {
        releaseYouTubePlay(key)
        return null
      }
      stopPreview()
      requestYouTubePlay(key)
      logTrackPlay(playKey)
      return key
    })
  }, [stopPreview])

  useEffect(() => {
    return subscribeYouTubePlay((activeId) => {
      setOpenYoutubeKey((prev) => (prev && activeId !== prev ? null : prev))
    })
  }, [])

  // Hash #nr-row-<id> (click en el título del mini reproductor → volver al
  // origen): expande el panel para que la fila exista en el DOM; el scroll
  // y el destello los hace el propio reproductor cuando la encuentra.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const applyHash = () => {
      if (window.location.hash.startsWith('#nr-row-')) setExpanded(true)
    }
    applyHash()
    window.addEventListener('hashchange', applyHash)
    return () => window.removeEventListener('hashchange', applyHash)
  }, [])

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
        // Vuelta al origen desde el mini reproductor: la ficha de artista/sello.
        originPath: pathname || undefined,
        save: {
          mode: 'ref' as const,
          source: pickSource(pick) === 'chart' ? 'chart' : 'featured',
          trackId: pick.id,
          canonicalUrl: pick.link_url || undefined,
          snapshot: buildSnapshot(pick, origin),
        },
        share: {
          mode: 'chart' as const,
          source: pickSource(pick) === 'chart' ? 'chart' : 'featured',
          trackId: pick.id,
          weekDate: pick.weekDate,
        },
      }
    })
  }, [playablePicks, origin, pathname])

  const playFromPick = useCallback((pick: ArtistFeaturedPick) => {
    if (openYoutubeKey) {
      releaseYouTubePlay(openYoutubeKey)
      setOpenYoutubeKey(null)
    }
    // Si esta fila ya es la que suena, toggle pausa/reanudar (el icono ❚❚
    // debe DETENER la reproducción, no reiniciar el tema desde el principio).
    if (myQueueActive && previewQueue[previewIndex]?.rowKey === `nr-${pick.id}`) {
      togglePreview()
      return
    }
    const queue = buildQueue()
    const idx = queue.findIndex((q) => q.rowKey === `nr-${pick.id}`)
    if (idx < 0) return
    setExpanded(true)
    playPreviewQueue(queue, idx, groupKey)
  }, [buildQueue, groupKey, playPreviewQueue, myQueueActive, previewQueue, previewIndex, togglePreview, openYoutubeKey])

  const handlePlayAllClick = useCallback(() => {
    if (openYoutubeKey) {
      releaseYouTubePlay(openYoutubeKey)
      setOpenYoutubeKey(null)
    }
    if (myQueueActive) {
      stopPreview()
      return
    }
    const queue = buildQueue()
    if (queue.length === 0) return
    setExpanded(true)
    playPreviewQueue(queue, 0, groupKey)
  }, [myQueueActive, buildQueue, groupKey, playPreviewQueue, stopPreview, openYoutubeKey])

  const isPlayingPick = useCallback((pick: ArtistFeaturedPick): boolean => {
    if (!myQueueActive) return false
    return previewQueue[previewIndex]?.rowKey === `nr-${pick.id}`
  }, [myQueueActive, previewQueue, previewIndex])

  if (!picks.length) return null

  const title = heading
    ?? (lang === 'es' ? 'EN OPTIMAL BREAKS' : 'ON OPTIMAL BREAKS')
  const badgeLabel = badge ?? 'OB'
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
              {badgeLabel}
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
              const isPausedHere = isActive && !previewPlaying
              const rowId = `nr-row-${pick.id}`
              const canPlay = pickHasPreview(pick)
              const ytId = pickYoutubeId(pick)
              const ytSlot = `ob-artist-yt-${pick.id}`
              const showYt = !!(ytId && openYoutubeKey === ytSlot)
              const releaseDisp = formatTrackReleaseDisplay(pick.release_date, pick.release_year)
              const note = lang === 'es' ? pick.note_es : pick.note_en
              const mixName = (pick.mix_name || '').trim()
              const artists = Array.isArray(pick.artists) ? pick.artists : []
              const kind = pickSource(pick)
              const chartHref = pickChartHref(lang, pick)
              const artworkSrc = pickArtworkSrc(pick)
              const discogsUrl = (pick.discogs_url || '').trim()
              const rowHighlighted = isActive || showYt

              return (
                <div
                  key={`${kind}-${pick.id}`}
                  id={rowId}
                  className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] transition-colors ${rowHighlighted ? 'bg-[var(--red)]/15 border-[var(--red)]/30' : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <Link
                        href={chartHref}
                        className="inline-flex flex-col items-center justify-center shrink-0 w-12 h-12 sm:w-14 sm:h-14 border-[3px] border-[var(--ink)] bg-[var(--paper-dark)] hover:bg-[var(--yellow)]/30 transition-colors no-underline"
                        title={lang === 'es' ? 'Ver en Charts' : 'View in Charts'}
                      >
                        <span className="text-[8px] font-black tracking-wider text-[var(--ink)]/50 uppercase">
                          {pickBadge(pick)}
                        </span>
                        <span className="text-[9px] sm:text-[10px] font-bold text-[var(--ink)] text-center leading-tight px-0.5">
                          {pickBadgeSub(pick, lang)}
                        </span>
                      </Link>

                      {artworkSrc ? (
                        <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
                          {vinylArtworkUseNativeImg(artworkSrc) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img src={artworkSrc} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" referrerPolicy="no-referrer" />
                          ) : (
                            <Image src={artworkSrc} alt="" fill className="object-cover" sizes="(max-width: 640px) 56px, 64px" unoptimized={false} />
                          )}
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
                          <ArtistNames artists={artists} mixName={mixName} slugMap={artistSlugMap} lang={lang} />
                          {pick.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><LabelName name={pick.label} slugMap={labelSlugMap} lang={lang} /></> : null}
                          {releaseDisp ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap">{releaseDisp}</span></> : null}
                        </p>
                        {note ? (
                          <p className="text-xs text-[var(--ink)]/55 mt-1 leading-relaxed" style={{ fontFamily: "'Courier Prime', monospace" }}>
                            {note}
                          </p>
                        ) : null}
                      </div>
                    </div>

                    <div className="track-action-bar">
                      {canPlay && (
                        <button
                          type="button"
                          onClick={() => playFromPick(pick)}
                          className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
                            ${isActive ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                          title={isActive && !isPausedHere ? (lang === 'es' ? 'Pausar' : 'Pause') : (lang === 'es' ? 'Escuchar preview' : 'Play preview')}
                        >
                          {isActive && !isPausedHere ? '❚❚' : '▶'}
                        </button>
                      )}
                      {ytId && !canPlay && (
                        <button
                          type="button"
                          onClick={() => toggleYoutubeEmbed(ytSlot, pickYoutubeUrl(pick) || `t:vinyl:${pick.id}`)}
                          className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
                            ${showYt ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                          title={showYt ? (lang === 'es' ? 'Pausar' : 'Pause') : (lang === 'es' ? 'Escuchar' : 'Play')}
                        >
                          {showYt ? '❚❚' : '▶'}
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
                        source={kind}
                        trackId={pick.id}
                        canonicalUrl={kind === 'vinyl' ? (pick.youtube_url || pick.discogs_url || pick.link_url) : pick.link_url}
                        snapshot={buildSnapshot(pick, origin)}
                        lang={lang}
                        size="sm"
                      />
                      {kind === 'vinyl' ? (
                        <TrackShareButton
                          path={buildVinylSharePath(lang, pick.id)}
                          lang={lang}
                          shareTitle={`${pick.title} — ${artists.map((a) => a.name).filter(Boolean).join(', ')}`}
                        />
                      ) : (
                        <TrackShareButton
                          source={kind === 'chart' ? 'chart' : 'featured'}
                          trackId={pick.id}
                          weekDate={pick.weekDate}
                          lang={lang}
                          shareTitle={`${pick.title} — ${artists.map((a) => a.name).filter(Boolean).join(', ')}`}
                        />
                      )}
                      {kind !== 'vinyl' ? (
                        <>
                          <SpotifyLinkButton url={pick.spotify_url} title={pick.title} artists={artists} lang={lang} />
                          <TidalLinkButton url={pick.tidal_url} lang={lang} />
                        </>
                      ) : null}
                      {kind === 'vinyl' ? (
                        <>
                          {pick.youtube_url ? (
                            <a
                              href={pick.youtube_url}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
                              style={{ fontFamily: "'Courier Prime', monospace" }}
                            >
                              YOUTUBE
                            </a>
                          ) : null}
                          {discogsUrl.includes('discogs.com') ? (
                            <a
                              href={discogsUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
                              style={{ fontFamily: "'Courier Prime', monospace" }}
                            >
                              DISCOGS
                            </a>
                          ) : null}
                        </>
                      ) : pick.link_url ? (
                        pick.platform === 'beatport' && !(pick.link_label || '').trim() ? (
                          <BeatportLinkButton url={pick.link_url} lang={lang} />
                        ) : (
                          <a
                            href={pick.link_url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
                            style={{ fontFamily: "'Courier Prime', monospace" }}
                          >
                            {pickCtaLabel(lang, pick)}
                          </a>
                        )
                      ) : null}
                    </div>
                  </div>
                  {ytId && showYt ? (
                    <div className="w-full max-w-sm">
                      <LazyYouTubeEmbed
                        videoId={ytId}
                        title={`${pick.title} — ${artists.map((a) => a.name).filter(Boolean).join(', ')}`}
                        className="border-[3px] border-[var(--ink)]"
                        autoplay
                        playSlotId={ytSlot}
                      />
                    </div>
                  ) : null}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </section>
  )
}
