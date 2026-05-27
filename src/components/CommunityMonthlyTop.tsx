// ============================================
// OPTIMAL BREAKS — Top de la comunidad (all-time)
// ----------------------------------------------
// Renderiza el ranking acumulado con las canciones más añadidas a "Mis
// Tracks" por toda la comunidad de Optimal Breaks. Hace fetch a
// `/api/public/charts/community-monthly` (que ahora devuelve all-time;
// el slug se conserva por compatibilidad — ver cabecera del endpoint).
//
// Se monta dentro de `ChartView`, justo debajo de Retro Vinyl Picks.
// ============================================

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Locale } from '@/lib/i18n-config'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import type { PreviewTrack, PreviewShareData } from '@/components/DeckAudioProvider'
import SaveTrackButton from '@/components/SaveTrackButton'
import TrackShareButton from '@/components/TrackShareButton'
import {
  formatTrackReleaseDisplay,
  buildTrackSharePath,
  buildVinylSharePath,
  buildBeatportSharePath,
  extractBeatportTrackId,
} from '@/lib/share-track'
import type { SavedChartTrackSnapshot } from '@/types/database'

const COMMUNITY_TOP_LIMIT = 100

type ChartTrackSource = 'chart' | 'featured' | 'vinyl' | 'beatport_top'
type PlaybackKind = 'beatport' | 'bandcamp' | 'youtube'

interface CommunityTopTrack {
  rank: number
  canonical_key: string
  title: string
  mix_name: string | null
  artists: string
  label: string | null
  year: number | null
  release_date: string | null
  bpm: number | null
  music_key: string | null
  artwork_url: string | null
  external_url: string | null
  sample_url: string | null
  playback_kind: PlaybackKind
  save_count: number
  unique_users: number
  first_saved_at: string | null
  last_saved_at: string | null
  sources: ChartTrackSource[]
  primary: { source: ChartTrackSource; id: string; week_date: string | null }
  /** Origen OB agregado desde saves beatport_top con `snapshot.origin` (API community-monthly). */
  beatport_share_origin: { kind: 'artist' | 'label'; slug: string } | null
}

interface ApiResponse {
  scope: 'all_time'
  totals: { saves: number; unique_tracks: number; unique_users: number }
  top_tracks: CommunityTopTrack[]
}

interface Props {
  lang: Locale
  dict: any
}

function previewAudioSrc(sampleUrl: string, kind: PlaybackKind, externalUrl: string | null): string {
  if (kind === 'bandcamp' && externalUrl) {
    return `/api/bandcamp-preview?track=${encodeURIComponent(externalUrl)}`
  }
  try {
    const host = new URL(sampleUrl).hostname.toLowerCase()
    if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') {
      return `/api/audio-proxy?url=${encodeURIComponent(sampleUrl)}`
    }
  } catch { /* use raw url */ }
  return sampleUrl
}

function snapshotForBeatportTop(t: CommunityTopTrack): SavedChartTrackSnapshot {
  const snap: SavedChartTrackSnapshot = {
    title: t.title,
    mix_name: t.mix_name,
    artists: t.artists,
    label: t.label,
    year: t.year,
    release_date: t.release_date,
    bpm: t.bpm,
    music_key: t.music_key,
    artwork_url: t.artwork_url,
    beatport_url: t.external_url,
    sample_url: t.sample_url,
  }
  if (t.beatport_share_origin) {
    snap.origin = {
      kind: t.beatport_share_origin.kind,
      slug: t.beatport_share_origin.slug,
      id: '',
    }
  }
  return snap
}

function SaveCountBadge({ count, label }: { count: number; label: string }) {
  // Badge similar a `PositionBadge` del chart pero con el número de saves.
  const isHot = count >= 5
  return (
    <span
      className={`inline-flex flex-col items-center justify-center shrink-0 font-black border-[3px] border-[var(--ink)]
        ${isHot ? 'w-12 h-12 bg-[var(--red)] text-white' : 'w-11 h-11 bg-[var(--ink)] text-[var(--paper)]'}
      `}
      title={label}
      style={{ fontFamily: "'Unbounded', sans-serif" }}
    >
      <span className="text-base sm:text-lg leading-none">{count}</span>
      <span className="text-[7px] tracking-[1px] mt-0.5 opacity-80">SAVES</span>
    </span>
  )
}

export default function CommunityMonthlyTop({ lang, dict }: Props) {
  const c = dict.charts
  const cm = c.community_monthly || {}

  const [data, setData] = useState<ApiResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [shuffleMode, setShuffleMode] = useState(false)

  const fetchData = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/public/charts/community-monthly?limit=${COMMUNITY_TOP_LIMIT}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as ApiResponse
      setData(json)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // Calcula el share del mini reproductor con la MISMA lógica que la fila
  // visible (ver render: chart/featured → /charts?play=..; vinyl → vinyl;
  // beatport_top con origen → ficha; sin origen → URL externa). Sin esto
  // el "🔗" no aparece en el player cuando el usuario navega a otra ruta.
  const shareForCommunityTop = useCallback((t: CommunityTopTrack): PreviewShareData | undefined => {
    if (t.primary.source === 'chart' || t.primary.source === 'featured') {
      return {
        mode: 'chart',
        source: t.primary.source,
        trackId: t.primary.id,
        weekDate: t.primary.week_date ?? null,
      }
    }
    if (t.primary.source === 'vinyl') {
      return { mode: 'path', path: buildVinylSharePath(lang, t.primary.id) }
    }
    if (t.primary.source === 'beatport_top') {
      const bpId = extractBeatportTrackId(t.external_url)
      const o = t.beatport_share_origin
      if (o?.slug && bpId && (o.kind === 'artist' || o.kind === 'label')) {
        const folder = o.kind === 'artist' ? 'artists' : 'labels'
        return { mode: 'path', path: buildBeatportSharePath(`/${lang}/${folder}/${o.slug}`, bpId) }
      }
      if (t.external_url) return { mode: 'url', externalUrl: t.external_url }
    }
    return undefined
  }, [lang])

  // Construye la cola de previews con los samples disponibles del top.
  // Adjuntamos `save` con la misma lógica que la fila visible: modo URL
  // para los tracks cuya fuente primaria es `beatport_top` (no tienen fila
  // propia, viven solo como JSONB) y modo ref para el resto.
  const previewBundle = useMemo<PreviewTrack[]>(() => {
    const out: PreviewTrack[] = []
    if (!data) return out
    for (const t of data.top_tracks) {
      if (!t.sample_url) continue
      const src = previewAudioSrc(t.sample_url, t.playback_kind, t.external_url)
      if (!src) continue
      out.push({
        rowKey: `community-top-${t.canonical_key}`,
        src,
        title: t.title,
        artist: t.artists,
        artworkUrl: t.artwork_url || null,
        domId: `community-top-${t.canonical_key}`,
        save: t.primary.source === 'beatport_top' && t.external_url
          ? {
              mode: 'url',
              externalUrl: t.external_url,
              externalTrackId: t.primary.id,
              canonicalUrl: t.external_url,
              snapshot: snapshotForBeatportTop(t),
            }
          : {
              mode: 'ref',
              source: t.primary.source,
              trackId: t.primary.id,
              canonicalUrl: t.external_url || null,
            },
        share: shareForCommunityTop(t),
      })
    }
    return out
  }, [data, shareForCommunityTop])

  const groupKey = 'community-top-all-time'

  const {
    previewQueue, previewIndex, previewGroupKey,
    playPreviewQueue, stopPreview,
  } = usePreviewAudioGated()

  const isGroupActive = previewGroupKey === groupKey
  const playFromIndex = useCallback((bundleIdx: number) => {
    const rowKey = previewBundle[bundleIdx]?.rowKey
    if (!rowKey) return
    const baseQueue = shuffleMode && isGroupActive ? previewQueue : previewBundle
    const idx = baseQueue.findIndex((m) => m.rowKey === rowKey)
    if (idx < 0) {
      setShuffleMode(false)
      playPreviewQueue(previewBundle, bundleIdx, groupKey)
      return
    }
    if (!shuffleMode || !isGroupActive) setShuffleMode(false)
    playPreviewQueue(baseQueue, idx, groupKey)
  }, [previewBundle, previewQueue, shuffleMode, isGroupActive, playPreviewQueue, groupKey])

  const onStop = useCallback(() => {
    stopPreview()
    setShuffleMode(false)
  }, [stopPreview])

  const onPlayAll = useCallback(() => {
    if (previewBundle.length === 0) return
    setShuffleMode(false)
    playPreviewQueue(previewBundle, 0, groupKey)
  }, [previewBundle, playPreviewQueue, groupKey])

  const onPlayShuffle = useCallback(() => {
    if (previewBundle.length === 0) return
    const queue = [...previewBundle]
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[queue[i], queue[j]] = [queue[j], queue[i]]
    }
    setShuffleMode(true)
    playPreviewQueue(queue, 0, groupKey)
  }, [previewBundle, playPreviewQueue, groupKey])

  const activeRowKey = isGroupActive ? previewQueue[previewIndex]?.rowKey ?? null : null

  return (
    <section id="community-top" className="mb-12 sm:mb-16 scroll-mt-24">
      <header className="px-4 sm:px-0 mb-6 sm:mb-8">
        <span
          className="inline-block px-2 py-1 text-[10px] font-black tracking-[4px] bg-[var(--acid)] text-[var(--ink)] border-2 border-[var(--ink)] mb-3"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {cm.kicker || 'TOP 100 DE LA COMUNIDAD'}
        </span>
        <h2
          className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[0.95] mb-3"
          style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
        >
          {cm.title || 'Top 100 de la comunidad'}
        </h2>
        <p
          className="text-sm sm:text-base text-[var(--ink)]/60"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {cm.subtitle || 'Las canciones más añadidas a "Mis Tracks" por toda la comunidad Optimal Breaks. Ranking acumulado desde el día uno — sin votos, sin encuestas, solo saves reales.'}
        </p>
      </header>

      <div className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden mx-2 sm:mx-0">
        <div
          className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-3 sm:px-4 sm:py-3.5 border-b-4 border-[var(--ink)] bg-[var(--paper-dark)]"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          <span className="text-xs sm:text-sm font-bold tracking-wide text-[var(--ink)] flex-1 min-w-[10rem]">
            {cm.scope_label || 'Histórico'}: <span className="font-black uppercase">{cm.all_time || 'Todo el tiempo'}</span>
          </span>
          {data && data.totals.saves > 0 && (
            <span className="text-[10px] sm:text-xs text-[var(--ink)]/60 font-bold tabular-nums">
              {(cm.summary || '{tracks} temas · {users} fans · {saves} saves')
                .replace('{tracks}', String(data.totals.unique_tracks))
                .replace('{users}', String(data.totals.unique_users))
                .replace('{saves}', String(data.totals.saves))}
            </span>
          )}
          {previewBundle.length > 0 && (
            isGroupActive ? (
              <button
                type="button"
                onClick={onStop}
                className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-[10px] sm:text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--red)] text-white transition-all cursor-pointer touch-manipulation select-none whitespace-nowrap"
                style={{ fontFamily: "'Courier Prime', monospace" }}
                title={c.stop_all_title}
              >
                {c.stop_all}
                <span className="text-[9px] font-bold opacity-80 tabular-nums">
                  {c.play_all_counter
                    .replace('{current}', String(previewIndex + 1))
                    .replace('{total}', String(previewQueue.length))}
                </span>
              </button>
            ) : (
              <>
                <button
                  type="button"
                  onClick={onPlayAll}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-[10px] sm:text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white transition-all cursor-pointer touch-manipulation select-none whitespace-nowrap"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                  title={c.play_all_title}
                >
                  {c.play_all}
                </button>
                <button
                  type="button"
                  onClick={onPlayShuffle}
                  className="inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-[10px] sm:text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--uv)] text-white hover:bg-[var(--ink)] hover:text-[var(--yellow)] transition-all cursor-pointer touch-manipulation select-none whitespace-nowrap"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                  title={cm.play_shuffle_title || c.play_all_title}
                >
                  {cm.play_shuffle || '⇄ SHUFFLE'}
                </button>
              </>
            )
          )}
        </div>

        {loading && (
          <div className="p-8 text-center text-sm text-[var(--ink)]/50" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {cm.loading || 'Cargando ranking…'}
          </div>
        )}

        {!loading && error && (
          <div className="p-8 text-center text-sm text-[var(--red)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {(cm.error || 'No se pudo cargar el top') + ': ' + error}
          </div>
        )}

        {!loading && !error && data && data.top_tracks.length === 0 && (
          <div className="p-8 text-center text-sm text-[var(--ink)]/50" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {cm.empty || 'Aún no hay saves en la comunidad. Añade tus primeros temas a Mis Tracks y vuelve.'}
          </div>
        )}

        {!loading && !error && data && data.top_tracks.length > 0 && (
          <div>
            {data.top_tracks.map((t) => {
              const rowKey = `community-top-${t.canonical_key}`
              const isActive = activeRowKey === rowKey
              const idx = previewBundle.findIndex((m) => m.rowKey === rowKey)
              const hasSample = idx >= 0
              // Link a la fuente: si tenemos week_date + chart/featured,
              // enlazamos a /charts?week=...&play=<source>:<id>; si no, al
              // external_url.
              const internalHref = (() => {
                if (t.primary.source === 'chart') {
                  const p = `play=chart:${t.primary.id}`
                  return t.primary.week_date
                    ? `/${lang}/charts?week=${t.primary.week_date}&${p}`
                    : `/${lang}/charts?${p}`
                }
                if (t.primary.source === 'featured') {
                  const p = `play=featured:${t.primary.id}`
                  return t.primary.week_date
                    ? `/${lang}/charts?week=${t.primary.week_date}&${p}`
                    : `/${lang}/charts?${p}`
                }
                return null
              })()

              const ctaLabel = (() => {
                if (t.primary.source === 'vinyl') return c.vinyl_open_youtube || 'YOUTUBE'
                if (t.playback_kind === 'bandcamp') return c.picks_open_bandcamp || 'BANDCAMP'
                return 'BEATPORT'
              })()

              const releaseDisp = formatTrackReleaseDisplay(t.release_date, t.year)

              return (
                <div
                  key={t.canonical_key}
                  id={rowKey}
                  className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] transition-colors
                    ${isActive ? 'bg-[var(--red)]/15 border-[var(--red)]/30' : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'}`}
                >
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                    <div className="flex items-start gap-3 min-w-0 flex-1">
                      <SaveCountBadge count={t.unique_users} label={cm.saves_tooltip || 'Personas que han guardado este tema'} />

                      {t.artwork_url ? (
                        <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
                          <Image src={t.artwork_url} alt="" fill className="object-cover" sizes="(max-width: 640px) 56px, 64px" unoptimized={false} />
                        </div>
                      ) : null}

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-0.5 flex-wrap">
                          <span
                            className="inline-block px-1.5 py-0.5 text-[9px] font-black tracking-widest bg-[var(--ink)] text-[var(--paper)] border-2 border-[var(--ink)]"
                            style={{ fontFamily: "'Courier Prime', monospace" }}
                          >
                            #{t.rank}
                          </span>
                          {t.save_count > t.unique_users && (
                            <span className="text-[10px] text-[var(--ink)]/40 font-bold tracking-wider" style={{ fontFamily: "'Courier Prime', monospace" }}>
                              {(cm.repeats || '{n} saves').replace('{n}', String(t.save_count))}
                            </span>
                          )}
                        </div>
                        <h3 className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate" style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}>
                          {internalHref ? (
                            <Link href={internalHref} className="hover:text-[var(--red)] transition-colors no-underline">
                              {t.title}
                            </Link>
                          ) : t.title}
                          {t.mix_name ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{t.mix_name}</span> : null}
                        </h3>
                        <p className="text-xs sm:text-sm mt-0.5 break-words" style={{ fontFamily: "'Courier Prime', monospace" }}>
                          <span className="text-[var(--ink)]/70">{t.artists || '—'}</span>
                          {t.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{t.label}</span></> : null}
                          {releaseDisp ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap">{releaseDisp}</span></> : null}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center sm:gap-2 touch-manipulation">
                      {hasSample && (
                        <button
                          type="button"
                          onClick={() => playFromIndex(idx)}
                          className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
                            ${isActive ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                          title={isActive ? c.preview_pause : c.preview_play}
                          aria-label={isActive ? c.preview_pause : c.preview_play}
                        >
                          {isActive ? '❚❚' : '▶'}
                        </button>
                      )}
                      {t.bpm != null && t.bpm > 0 ? (
                        <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5" style={{ fontFamily: "'Courier Prime', monospace" }}>
                          {t.bpm}
                        </span>
                      ) : null}
                      {(t.music_key || '').trim() ? (
                        <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)] sm:h-auto sm:px-1.5 sm:py-0.5 whitespace-nowrap" style={{ fontFamily: "'Courier Prime', monospace" }}>
                          {(t.music_key || '').trim()}
                        </span>
                      ) : null}
                      {/* Save: si la fuente primaria es beatport_top, modo URL; si no, modo ref. */}
                      {t.primary.source === 'beatport_top' && t.external_url ? (
                        <SaveTrackButton
                          externalUrl={t.external_url}
                          externalTrackId={t.primary.id}
                          snapshot={snapshotForBeatportTop(t)}
                          canonicalUrl={t.external_url}
                          lang={lang}
                          size="sm"
                        />
                      ) : (
                        <SaveTrackButton
                          source={t.primary.source}
                          trackId={t.primary.id}
                          canonicalUrl={t.external_url || undefined}
                          lang={lang}
                          size="sm"
                        />
                      )}
                      {(t.primary.source === 'chart' || t.primary.source === 'featured') && (
                        <TrackShareButton
                          path={buildTrackSharePath(lang, t.primary.source, t.primary.id, t.primary.week_date ?? null)}
                          lang={lang}
                          shareTitle={`${t.title} — ${t.artists}`}
                        />
                      )}
                      {t.primary.source === 'vinyl' && (
                        <TrackShareButton
                          path={buildVinylSharePath(lang, t.primary.id)}
                          lang={lang}
                          shareTitle={`${t.title} — ${t.artists}`}
                        />
                      )}
                      {t.primary.source === 'beatport_top' && (() => {
                        const shareTitle = `${t.title} — ${t.artists}`
                        const bpId = extractBeatportTrackId(t.external_url)
                        const o = t.beatport_share_origin
                        if (
                          o?.slug &&
                          bpId &&
                          (o.kind === 'artist' || o.kind === 'label')
                        ) {
                          const folder = o.kind === 'artist' ? 'artists' : 'labels'
                          return (
                            <TrackShareButton
                              path={buildBeatportSharePath(`/${lang}/${folder}/${o.slug}`, bpId)}
                              lang={lang}
                              shareTitle={shareTitle}
                            />
                          )
                        }
                        if (t.external_url) {
                          return (
                            <TrackShareButton
                              externalUrl={t.external_url}
                              lang={lang}
                              shareTitle={shareTitle}
                            />
                          )
                        }
                        return null
                      })()}
                      {t.external_url && (
                        <a
                          href={t.external_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                        >
                          {ctaLabel}
                        </a>
                      )}
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </section>
  )
}
