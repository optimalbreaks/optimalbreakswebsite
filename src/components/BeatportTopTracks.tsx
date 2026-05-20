'use client'

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { usePreviewAudio, type PreviewTrack } from '@/components/DeckAudioProvider'
import SaveTrackButton from '@/components/SaveTrackButton'
import TrackShareButton from '@/components/TrackShareButton'
import {
  buildBeatportSharePath,
  parsePlayParam,
  formatTrackReleaseDisplay,
  extractBeatportTrackId,
} from '@/lib/share-track'
import type { BeatportTopTrack, SavedChartTrackSnapshot } from '@/types/database'

interface Props {
  tracks: BeatportTopTrack[]
  beatportUrl?: string | null
  lang: 'en' | 'es'
  entityName: string
  /** Contexto "de dónde viene" la canción (artista/sello). Se embebe en el
   *  snapshot del save para reconstruir la tarjeta en /mi-cuenta/tracks. */
  origin?: {
    kind: 'artist' | 'label'
    id: string
    slug?: string
    name?: string
  }
}

function buildSnapshot(
  t: BeatportTopTrack,
  origin?: Props['origin'],
): SavedChartTrackSnapshot {
  return {
    title: t.title,
    mix_name: t.mix_name || null,
    artists: t.artists.map((a) => a.name).join(', '),
    label: t.label || null,
    year: t.release_year ?? null,
    release_date: t.release_date ?? null,
    bpm: t.bpm ?? null,
    music_key: t.key || null,
    artwork_url: t.artwork_url || null,
    sample_url: t.sample_url || null,
    beatport_url: t.beatport_url || null,
    origin,
  }
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

export default function BeatportTopTracks({ tracks, beatportUrl, lang, entityName, origin }: Props) {
  const [expanded, setExpanded] = useState(false)
  const pathname = usePathname()
  const {
    previewQueue, previewIndex, previewGroupKey,
    playPreviewQueue, stopPreview,
  } = usePreviewAudio()

  // groupKey estable para identificar "mi" cola dentro del provider global.
  // Distingue artista de sello y así, si navegas entre fichas, cada Top 10
  // tiene su propio identificador. Si no hay origin, usamos entityName.
  const groupKey = useMemo(
    () => `bp-top:${origin?.kind ?? 'x'}:${origin?.id ?? entityName ?? beatportUrl ?? 'unknown'}`,
    [origin?.kind, origin?.id, entityName, beatportUrl],
  )

  const myQueueActive = previewGroupKey === groupKey && previewQueue.length > 0

  // Solo los tracks con preview audible van a la cola global.
  const playableTracks = useMemo(() => tracks.filter(t => t.sample_url), [tracks])

  // Cada track del Top 10 lleva su propio `save` para que el botón "+/✓"
  // del MiniPreviewBar opere sobre la misma URL canónica que el botón de
  // la fila visible. El Top 10 no tiene fila propia en `chart_*_tracks`,
  // así que usamos modo URL + snapshot, exactamente igual que en el
  // <SaveTrackButton> de la lista expandida.
  const buildQueue = useCallback((): PreviewTrack[] => {
    return playableTracks.map((t) => {
      const bpId = extractBeatportTrackId(t.beatport_url) ?? undefined
      const sharePath = bpId && pathname
        ? buildBeatportSharePath(pathname, bpId)
        : null
      return {
        rowKey: `bp-${t.position}`,
        src: proxyUrl(t.sample_url!),
        title: t.title,
        artist: t.artists.map(a => a.name).join(', '),
        artworkUrl: t.artwork_url || null,
        domId: `bp-row-${t.position}`,
        save: t.beatport_url
          ? {
              mode: 'url' as const,
              externalUrl: t.beatport_url,
              externalTrackId: bpId,
              canonicalUrl: t.beatport_url,
              snapshot: buildSnapshot(t, origin),
            }
          : undefined,
        share: sharePath
          ? { mode: 'path' as const, path: sharePath }
          : t.beatport_url
            ? { mode: 'url' as const, externalUrl: t.beatport_url }
            : undefined,
      }
    })
  }, [playableTracks, origin, pathname])

  const playFromTrack = useCallback((t: BeatportTopTrack) => {
    const queue = buildQueue()
    const idx = queue.findIndex(q => q.rowKey === `bp-${t.position}`)
    if (idx < 0) return
    setExpanded(true)
    playPreviewQueue(queue, idx, groupKey)
  }, [buildQueue, groupKey, playPreviewQueue])

  const handlePlayAllClick = useCallback(() => {
    if (myQueueActive) {
      stopPreview()
    } else {
      const queue = buildQueue()
      if (queue.length === 0) return
      setExpanded(true)
      playPreviewQueue(queue, 0, groupKey)
    }
  }, [myQueueActive, buildQueue, groupKey, playPreviewQueue, stopPreview])

  const isPlayingTrack = useCallback((t: BeatportTopTrack): boolean => {
    if (!myQueueActive) return false
    return previewQueue[previewIndex]?.rowKey === `bp-${t.position}`
  }, [myQueueActive, previewQueue, previewIndex])

  // Deep-link: ?play=beatport:<id>
  // Cuando alguien abre un link compartido de una canción de este Top 10,
  // expandimos el panel, hacemos scroll a la fila y arrancamos la cola global
  // desde esa canción. Solo se ejecuta una vez por montaje.
  const didAutoPlayRef = useRef(false)
  useEffect(() => {
    if (didAutoPlayRef.current) return
    if (typeof window === 'undefined') return
    if (!tracks.length) return
    const params = new URLSearchParams(window.location.search)
    const parsed = parsePlayParam(params.get('play'))
    if (!parsed || parsed.kind !== 'beatport') return
    const target = tracks.find((t) => extractBeatportTrackId(t.beatport_url) === parsed.id)
    if (!target) return
    const queue = playableTracks.map<PreviewTrack>((t) => {
      const bpId = extractBeatportTrackId(t.beatport_url) ?? undefined
      const sharePath = bpId && pathname
        ? buildBeatportSharePath(pathname, bpId)
        : null
      return {
        rowKey: `bp-${t.position}`,
        src: proxyUrl(t.sample_url!),
        title: t.title,
        artist: t.artists.map((a) => a.name).join(', '),
        artworkUrl: t.artwork_url || null,
        domId: `bp-row-${t.position}`,
        save: t.beatport_url
          ? {
              mode: 'url',
              externalUrl: t.beatport_url,
              externalTrackId: bpId,
              canonicalUrl: t.beatport_url,
              snapshot: buildSnapshot(t, origin),
            }
          : undefined,
        share: sharePath
          ? { mode: 'path', path: sharePath }
          : t.beatport_url
            ? { mode: 'url', externalUrl: t.beatport_url }
            : undefined,
      }
    })
    const idx = queue.findIndex((q) => q.rowKey === `bp-${target.position}`)
    didAutoPlayRef.current = true
    setExpanded(true)
    // Pequeño delay para esperar a que el panel expanda antes de hacer scroll.
    const t = window.setTimeout(() => {
      const el = document.getElementById(`bp-row-${target.position}`)
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' })
        el.classList.add('ring-4', 'ring-[var(--red)]')
        window.setTimeout(() => el.classList.remove('ring-4', 'ring-[var(--red)]'), 2200)
      }
      if (idx >= 0 && target.sample_url) {
        playPreviewQueue(queue, idx, groupKey)
      }
    }, 120)
    return () => window.clearTimeout(t)
  }, [tracks, playableTracks, groupKey, playPreviewQueue, pathname, origin])

  if (!tracks.length) return null

  const hasAnySample = playableTracks.length > 0
  const title = 'TOP 10 BEATPORT'
  const countLabel = `${tracks.length} tracks`

  const playAllBtnLabel = myQueueActive
    ? `■ STOP ${previewIndex + 1}/${previewQueue.length}`
    : `▶ PLAY ALL`

  return (
    <section className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden mt-4 md:mt-5">
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
                ${myQueueActive ? 'bg-[var(--red)] text-white' : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)]'}`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={myQueueActive ? 'Stop' : 'Play All'}
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
              const isActive = isPlayingTrack(t)
              const rowId = `bp-row-${t.position}`
              const canPlay = !!t.sample_url
              const releaseDisp = formatTrackReleaseDisplay(t.release_date, t.release_year)
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
                        <p className="text-xs sm:text-sm mt-0.5 break-words" style={{ fontFamily: "'Courier Prime', monospace" }}>
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
                          {releaseDisp ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap">{releaseDisp}</span></> : null}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center sm:gap-2 touch-manipulation">
                      {t.beatport_url && (
                        <SaveTrackButton
                          externalUrl={t.beatport_url}
                          externalTrackId={extractBeatportTrackId(t.beatport_url) ?? undefined}
                          canonicalUrl={t.beatport_url}
                          snapshot={buildSnapshot(t, origin)}
                          lang={lang}
                          size="sm"
                        />
                      )}
                      {canPlay && (
                        <button
                          type="button"
                          onClick={() => playFromTrack(t)}
                          className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
                            ${isActive ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                          title={isActive ? 'Playing' : 'Preview'}
                        >
                          {isActive ? '❚❚' : '▶'}
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
                      {(() => {
                        const bpId = extractBeatportTrackId(t.beatport_url)
                        if (!bpId || !pathname) return null
                        return (
                          <TrackShareButton
                            path={buildBeatportSharePath(pathname, bpId)}
                            lang={lang}
                            shareTitle={`${t.title}${t.mix_name ? ` (${t.mix_name})` : ''} — ${t.artists.map((a) => a.name).filter(Boolean).join(', ')}`}
                          />
                        )
                      })()}
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
    </section>
  )
}
