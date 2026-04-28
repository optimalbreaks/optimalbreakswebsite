// ============================================
// OPTIMAL BREAKS — Top Mensual de la Comunidad
// ----------------------------------------------
// Renderiza el ranking del mes con las canciones más añadidas a "Mis Tracks"
// por la comunidad. Hace fetch a `/api/public/charts/community-monthly` y
// permite cambiar de mes con un selector horizontal.
//
// Se monta dentro de `ChartView`, justo debajo de Retro Vinyl Picks.
// ============================================

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useState } from 'react'
import type { Locale } from '@/lib/i18n-config'
import { usePreviewAudio, type PreviewTrack } from '@/components/DeckAudioProvider'
import SaveTrackButton from '@/components/SaveTrackButton'
import TrackShareButton from '@/components/TrackShareButton'
import { formatTrackReleaseDisplay } from '@/lib/share-track'

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
}

interface ApiResponse {
  month: string
  range: { from: string; to: string }
  totals: { saves: number; unique_tracks: number; unique_users: number }
  top_tracks: CommunityTopTrack[]
  available_months: { month: string; saves: number }[]
}

interface Props {
  lang: Locale
  dict: any
}

function formatMonth(monthStr: string, lang: Locale): string {
  // monthStr = 'YYYY-MM'
  const [y, m] = monthStr.split('-').map(Number)
  const d = new Date(Date.UTC(y, (m || 1) - 1, 1))
  return d.toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  })
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

function snapshotForBeatportTop(t: CommunityTopTrack) {
  // Usado solo cuando primary.source === 'beatport_top' para el toggle por URL.
  return {
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
  const [month, setMonth] = useState<string>('')

  const fetchData = useCallback(async (target?: string) => {
    setLoading(true)
    setError(null)
    try {
      const qs = target ? `?month=${encodeURIComponent(target)}` : ''
      const res = await fetch(`/api/public/charts/community-monthly${qs}`, { cache: 'no-store' })
      if (!res.ok) {
        const j = await res.json().catch(() => ({}))
        throw new Error(j.error || `HTTP ${res.status}`)
      }
      const json = (await res.json()) as ApiResponse
      setData(json)
      setMonth(json.month)
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    fetchData()
  }, [fetchData])

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
        rowKey: `community-monthly-${t.canonical_key}`,
        src,
        title: t.title,
        artist: t.artists,
        artworkUrl: t.artwork_url || null,
        domId: `community-monthly-${t.canonical_key}`,
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
      })
    }
    return out
  }, [data])

  const groupKey = `community-monthly-${month}`

  const {
    previewQueue, previewIndex, previewGroupKey,
    playPreviewQueue, stopPreview,
  } = usePreviewAudio()

  const isGroupActive = previewGroupKey === groupKey
  const playFromIndex = useCallback((idx: number) => {
    if (previewBundle.length === 0) return
    playPreviewQueue(previewBundle, idx, groupKey)
  }, [previewBundle, playPreviewQueue, groupKey])

  const onPlayAll = useCallback(() => {
    if (isGroupActive) stopPreview()
    else playFromIndex(0)
  }, [isGroupActive, stopPreview, playFromIndex])

  const activeRowKey = isGroupActive ? previewQueue[previewIndex]?.rowKey ?? null : null

  // Selector de mes: solo mostramos meses con saves reales. Si el mes
  // actualmente seleccionado no tuviera saves (caso típico: primer fetch del
  // mes en curso aún vacío) lo añadimos manualmente para que el chip activo
  // siempre sea visible. La lista se ordena de más reciente a más antiguo.
  const monthOptions = useMemo(() => {
    const have = new Map((data?.available_months || []).map((m) => [m.month, m.saves]))
    if (month && !have.has(month)) have.set(month, 0)
    return Array.from(have.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([m, saves]) => ({ month: m, saves }))
  }, [data?.available_months, month])

  return (
    <section id="community-monthly-top" className="mb-12 sm:mb-16 scroll-mt-24">
      <header className="px-4 sm:px-0 mb-6 sm:mb-8">
        <span
          className="inline-block px-2 py-1 text-[10px] font-black tracking-[4px] bg-[var(--acid)] text-[var(--ink)] border-2 border-[var(--ink)] mb-3"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {cm.kicker || 'TOP DE LA COMUNIDAD'}
        </span>
        <h2
          className="text-3xl sm:text-5xl lg:text-6xl font-black leading-[0.95] mb-3"
          style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
        >
          {cm.title || 'Top mensual de la comunidad'}
        </h2>
        <p
          className="text-sm sm:text-base text-[var(--ink)]/60"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {cm.subtitle || 'Las canciones más añadidas a "Mis Tracks" por toda la comunidad este mes. Calculado a partir de los saves reales — sin votos ni encuestas.'}
        </p>
      </header>

      {/* Selector de mes — flex-wrap (no overflow-x) para que el tap en PWA
          móvil no se confunda con un pan horizontal y se cancele el click. */}
      <div className="px-2 sm:px-0 mb-4">
        <div
          className="flex flex-wrap gap-1.5"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {monthOptions.length === 0 && !loading && (
            <span className="text-[11px] text-[var(--ink)]/50" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {cm.empty || 'Aún no hay saves este mes.'}
            </span>
          )}
          {monthOptions.map((opt) => {
            const isActive = opt.month === month
            const empty = opt.saves === 0
            return (
              <button
                key={opt.month}
                type="button"
                onClick={() => fetchData(opt.month)}
                title={empty ? (cm.month_empty || 'Sin saves este mes') : `${opt.saves} saves`}
                className={`min-h-[40px] px-3 py-2 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] transition-all touch-manipulation cursor-pointer select-none whitespace-nowrap
                  ${isActive
                    ? 'bg-[var(--red)] text-white'
                    : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}
                `}
                style={{ touchAction: 'manipulation', WebkitTapHighlightColor: 'transparent' }}
              >
                {formatMonth(opt.month, lang)}
                {!empty && (
                  <span className="ml-1.5 text-[9px] opacity-70 tabular-nums">{opt.saves}</span>
                )}
              </button>
            )
          })}
        </div>
      </div>

      <div className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden mx-2 sm:mx-0">
        <div
          className="flex flex-wrap items-center gap-2 sm:gap-3 px-3 py-3 sm:px-4 sm:py-3.5 border-b-4 border-[var(--ink)] bg-[var(--paper-dark)]"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          <span className="text-xs sm:text-sm font-bold tracking-wide text-[var(--ink)] flex-1 min-w-[10rem]">
            {cm.month_label || 'Mes'}: <span className="font-black uppercase">{month ? formatMonth(month, lang) : '—'}</span>
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
            <button
              type="button"
              onClick={onPlayAll}
              className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-[10px] sm:text-[11px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation select-none whitespace-nowrap
                ${isGroupActive ? 'bg-[var(--red)] text-white' : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white'}`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={isGroupActive ? c.stop_all_title : c.play_all_title}
            >
              {isGroupActive ? c.stop_all : c.play_all}
              {isGroupActive && (
                <span className="text-[9px] font-bold opacity-80 tabular-nums">
                  {c.play_all_counter
                    .replace('{current}', String(previewIndex + 1))
                    .replace('{total}', String(previewQueue.length))}
                </span>
              )}
            </button>
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
            {cm.empty || 'Aún no hay saves este mes. Añade tus primeros temas a Mis Tracks y vuelve.'}
          </div>
        )}

        {!loading && !error && data && data.top_tracks.length > 0 && (
          <div>
            {data.top_tracks.map((t) => {
              const rowKey = `community-monthly-${t.canonical_key}`
              const isActive = activeRowKey === rowKey
              const idx = previewBundle.findIndex((m) => m.rowKey === rowKey)
              const hasSample = idx >= 0
              // Link a la fuente: si tenemos week_date + chart/featured,
              // enlazamos a /charts?week=...&play=<source>:<id>; si no, al
              // external_url.
              const internalHref = (() => {
                if (t.primary.source === 'chart' && t.primary.week_date) {
                  return `/${lang}/charts?week=${t.primary.week_date}&play=chart:${t.primary.id}`
                }
                if (t.primary.source === 'featured' && t.primary.week_date) {
                  return `/${lang}/charts?week=${t.primary.week_date}&play=featured:${t.primary.id}`
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
                        <p className="text-xs sm:text-sm mt-0.5 sm:truncate" style={{ fontFamily: "'Courier Prime', monospace" }}>
                          <span className="text-[var(--ink)]/70">{t.artists || '—'}</span>
                          {t.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{t.label}</span></> : null}
                          {releaseDisp ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums">{releaseDisp}</span></> : null}
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
                      {(t.primary.source === 'chart' || t.primary.source === 'featured') && t.primary.week_date && (
                        <TrackShareButton
                          source={t.primary.source}
                          trackId={t.primary.id}
                          weekDate={t.primary.week_date}
                          lang={lang}
                          shareTitle={`${t.title} — ${t.artists}`}
                        />
                      )}
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
