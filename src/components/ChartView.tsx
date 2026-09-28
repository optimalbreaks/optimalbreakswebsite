// ============================================
// OPTIMAL BREAKS — Charts page (Client Component)
// Three sections: New Releases → 40 Breaks Vitales → Archive Picks (al final)
// ============================================

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Locale } from '@/lib/i18n-config'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import type { PreviewTrack } from '@/components/DeckAudioProvider'
import type {
  ChartFeaturedArtist,
  ChartFeaturedTrack,
  ChartVinylArtist,
  ChartVinylTrack,
} from '@/types/database'
import { extractYouTubeId, LazyYouTubeEmbed } from '@/components/YouTubeEmbed'
import TapToPlayOverlay from '@/components/TapToPlayOverlay'
import SaveTrackButton from '@/components/SaveTrackButton'
import TrackShareButton, { BeatportLinkButton, SpotifyLinkButton, TidalLinkButton } from '@/components/TrackShareButton'
import { parsePlayParam, formatTrackReleaseDisplay, buildVinylSharePath, proxyCatalogArtworkForDisplay, vinylArtworkCandidates, vinylArtworkUseNativeImg } from '@/lib/share-track'
import { normalizeTrackCanonicalUrl, trackSaveIdentityKey } from '@/lib/track-canonical-key'
import { logTrackPlay } from '@/lib/track-play-log'
import { catalogLockScreenFields } from '@/lib/now-playing-session'
import {
  requestYouTubePlay,
  releaseYouTubePlay,
  subscribeYouTubePlay,
} from '@/lib/youtube-play-coordinator'
import type { ChartTrackSource } from '@/hooks/useUserData'
import { ArtistNames, LabelName } from '@/components/ArtistNames'
import { isArchiveFeaturedTrack } from '@/lib/charts-archive'
import type { ArchiveSectionRow, ArchiveYearSummary, ChartPickWeekSummary } from '@/lib/charts-sections'

/** Ref polimórfica a un track de cualquiera de las tres tablas de charts. */
type CanonRef = { source: ChartTrackSource; id: string }

function VinylArtwork({
  track,
  labelImageMap,
}: {
  track: ChartVinylTrack
  labelImageMap?: Record<string, string>
}) {
  const candidates = useMemo(
    () => vinylArtworkCandidates(track.artwork_url, track.youtube_url, track.label, labelImageMap),
    [track.artwork_url, track.youtube_url, track.label, labelImageMap],
  )
  const [idx, setIdx] = useState(0)

  useEffect(() => {
    setIdx(0)
  }, [track.id, track.artwork_url, track.youtube_url, track.label])

  const src = candidates[idx] ?? null
  const allFailed = !src

  return (
    <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
      {allFailed ? (
        <span className="absolute inset-0 flex items-center justify-center text-[var(--ink)]/30 text-2xl font-black select-none" aria-hidden>♪</span>
      ) : vinylArtworkUseNativeImg(src) ? (
        /* eslint-disable-next-line @next/next/no-img-element */
        <img
          key={`${track.id}-${idx}-${src}`}
          src={src}
          alt=""
          className="absolute inset-0 w-full h-full object-cover"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() => {
            setIdx((i) => (i + 1 < candidates.length ? i + 1 : candidates.length))
          }}
        />
      ) : (
        <Image
          key={`${track.id}-${idx}-${src}`}
          src={src}
          alt=""
          fill
          className="object-cover"
          sizes="(max-width: 640px) 56px, 64px"
          onError={() => {
            setIdx((i) => (i + 1 < candidates.length ? i + 1 : candidates.length))
          }}
        />
      )}
    </div>
  )
}

type PendingVinylPlay = { trackId: string; yearKey: string; track: ChartVinylTrack }

/**
 * Deep-link de 40 Breaks / New Releases (`?play=chart:<id>` / `featured:<id>`):
 * lo que hace falta para (re)lanzar la cola desde un gesto del usuario si el
 * autoplay no arranca. `bundle`/`index` son los mismos que usó el intento
 * automático; `rowKey` identifica la fila para saber cuándo ya está sonando.
 */
type PendingTapPlay = {
  rowKey: string
  sectionKey: string
  bundle: PreviewTrack[]
  index: number
  title: string
  artist: string
  artworkUrl: string | null
}

// Emergente «Toca para escuchar» (compartido con BeatportTopTracks):
// src/components/TapToPlayOverlay.tsx

type ArchiveRow = ArchiveSectionRow

interface ChartViewProps {
  lang: Locale
  dict: any
  /** Semanas de New Releases con el total, sin las filas. */
  pickWeeks: ChartPickWeekSummary[]
  /** Años del archivo con el total, sin las filas. */
  archiveYears: ArchiveYearSummary[]
  /**
   * Mapa `nombreNormalizado → slug` de artistas existentes en `public.artists`.
   * Permite que los nombres de artista en las filas del chart sean enlaces
   * internos a su ficha cuando el artista existe en la base de datos.
   */
  artistSlugMap?: Record<string, string>
  /**
   * Mapa `nombreNormalizado → slug` de sellos en `public.labels`.
   * Si el sello de la fila consta en BD, el nombre enlaza a `/[lang]/labels/<slug>`.
   */
  labelSlugMap?: Record<string, string>
  /** `nombreNormalizado → image_url` de sellos con logo en BD (fallback vinilo). */
  labelImageMap?: Record<string, string>
  /** La página ya pinta el h1 + subtítulo (streaming con cargador debajo). */
  hideHeader?: boolean
}

// Clave de agrupación para filas de archivo sin año conocido.
const UNKNOWN_YEAR_KEY = '__unknown_year__'

/** Semanas visibles al cargar New Releases / 40 Breaks; el resto tras «Cargar más». */
const INITIAL_WEEKS_VISIBLE = 10
/** Filas que se pintan de golpe al abrir un año del archivo; el resto entra por tramos. */
const ARCHIVE_PAGE = 60

function archiveRowId(row: ArchiveRow): string {
  return row.kind === 'vinyl' ? row.track.id : row.pick.id
}

/**
 * Pie de un año del archivo con «Ver más»: auto-revela el siguiente tramo al
 * entrar en pantalla y deja el botón como alternativa. Un año puede tener
 * ~2.000 filas; pintarlas todas de golpe bloquea el hilo (bug 28 sep 2026).
 */
function RevealMoreRows({ yearKey, remaining, onMore, lang }: {
  yearKey: string
  remaining: number
  onMore: (yearKey: string) => void
  lang: Locale
}) {
  const ref = useRef<HTMLButtonElement | null>(null)
  useEffect(() => {
    const el = ref.current
    if (!el || typeof IntersectionObserver === 'undefined') return
    const io = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) onMore(yearKey)
    }, { rootMargin: '400px 0px' })
    io.observe(el)
    return () => io.disconnect()
  }, [onMore, yearKey, remaining])
  const label = lang === 'es'
    ? `Ver más (${remaining} restantes)`
    : `Show more (${remaining} remaining)`
  return (
    <button
      ref={ref}
      type="button"
      onClick={() => onMore(yearKey)}
      className="w-full px-4 py-3 text-xs font-black tracking-wider text-[var(--ink)] border-t-[3px] border-[var(--ink)] hover:bg-[var(--yellow)]/25 active:bg-[var(--yellow)]/40 transition-colors"
      style={{ fontFamily: "'Courier Prime', monospace" }}
    >
      {label} ↓
    </button>
  )
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

function archiveRowArtistName(row: ArchiveRow): string {
  return row.kind === 'vinyl' ? vinylPrimaryArtistName(row.track) : featuredPrimaryArtistName(row.pick)
}

function archiveRowTitle(row: ArchiveRow): string {
  return row.kind === 'vinyl' ? row.track.title || '' : row.pick.title || ''
}

function archiveRowMix(row: ArchiveRow): string {
  return row.kind === 'vinyl' ? row.track.mix_name || '' : row.pick.mix_name || ''
}

function sortArchiveRows(rows: ArchiveRow[], lang: Locale): ArchiveRow[] {
  const loc = lang === 'es' ? 'es' : 'en'
  return [...rows].sort((A, B) => {
    const ka = archiveRowArtistName(A).toLocaleLowerCase(loc)
    const kb = archiveRowArtistName(B).toLocaleLowerCase(loc)
    let cmp = ka.localeCompare(kb, loc, { sensitivity: 'base' })
    if (cmp !== 0) return cmp
    cmp = archiveRowTitle(A).toLocaleLowerCase(loc).localeCompare(archiveRowTitle(B).toLocaleLowerCase(loc), loc, {
      sensitivity: 'base',
    })
    if (cmp !== 0) return cmp
    return archiveRowMix(A).localeCompare(archiveRowMix(B), loc, { sensitivity: 'base' })
  })
}

// ---------------------------------------------------------------------------
// Preview audio player
// ---------------------------------------------------------------------------
// El `<audio>`, la cola, el avance, la barra flotante inferior y MediaSession
// viven ahora en `DeckAudioProvider` (modo `preview`) para que la música
// siga sonando mientras el usuario navega por la web. Aquí solo construimos
// la cola con `PreviewTrack[]` y delegamos en `playPreviewQueue` /
// `stopPreview`. Ver `src/components/DeckAudioProvider.tsx`.

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

// Construye el snapshot inmutable que viaja con cada save (capa 3 de
// protección). Mantiene visibles título/artista/artwork/URL aunque la fila
// viva se borre completamente de la BD.
function snapshotFromArtists(arr: Array<{ name?: string }> | unknown): string {
  if (!Array.isArray(arr)) return ''
  return arr.map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x)).filter(Boolean).join(', ')
}
function buildFeaturedSnapshot(p: ChartFeaturedTrack) {
  return {
    title: p.title, mix_name: p.mix_name || null, artists: snapshotFromArtists(p.artists),
    label: p.label || null, year: p.release_year || null, release_date: p.release_date ?? null, bpm: p.bpm || null, music_key: p.music_key || null,
    artwork_url: p.artwork_url || null, sample_url: p.sample_url || null,
    full_audio_url: p.full_audio_url ?? null,
    beatport_url: p.platform !== 'hosted' ? (p.link_url || null) : null,
  }
}
function buildVinylSnapshot(v: ChartVinylTrack) {
  return {
    title: v.title, mix_name: v.mix_name || null, artists: snapshotFromArtists(v.artists),
    label: v.label || null, year: v.year || null, bpm: null, music_key: null,
    artwork_url: v.artwork_url || null, sample_url: null,
    beatport_url: v.discogs_url || null,
  }
}

function FeaturedPickRow({ pick, dict, lang, weekDate, isPlaying, isPaused, onPlay, artistSlugMap, labelSlugMap, relatedRefs }: { pick: ChartFeaturedTrack; dict: any; lang: Locale; weekDate: string; isPlaying?: boolean; isPaused?: boolean; onPlay?: () => void; artistSlugMap?: Record<string, string>; labelSlugMap?: Record<string, string>; relatedRefs?: CanonRef[] }) {
  const c = dict.charts
  const artists = Array.isArray(pick.artists) ? pick.artists : []
  const note = lang === 'es' ? pick.note_es : pick.note_en
  const cta = pickCtaLabel(c, pick)
  const mixName = (pick.mix_name || '').trim()
  const hasFullAudio = !!(pick.full_audio_url ?? null)
  const hasSample = !!(hasFullAudio || pick.sample_url || (pick.platform === 'bandcamp' && pick.link_url))
  const releaseDisp = formatTrackReleaseDisplay(pick.release_date, pick.release_year)

  // Fila «exclusive full track» (mockups/full-audio-row.html, variante C+A):
  // fondo amarillo suave en toda la fila + banner rojo a todo el ancho arriba.
  // Tailwind 3: el modificador de opacidad no funciona sobre var(--…) → hex directo.
  const rowStateClasses = hasFullAudio
    ? `bg-[#f7e733]/30 ${isPlaying ? 'border-[#d62828]/40' : 'border-[var(--ink)]/10'}`
    : isPlaying
      ? 'bg-[var(--red)]/15 border-[var(--red)]/30'
      : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'

  return (
    <div id={`chart-row-${pick.id}`} className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] transition-colors ${rowStateClasses}`}>
      {hasFullAudio ? (
        <div
          className="-mx-3 sm:-mx-5 -mt-3 sm:-mt-4 flex items-center gap-2.5 bg-[var(--red)] text-white px-3 sm:px-5 py-1.5 text-[10px] sm:text-[11px] font-bold tracking-[0.12em] whitespace-nowrap overflow-hidden"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          <span className="animate-pulse shrink-0">●</span>
          <span className="truncate">{lang === 'es' ? 'EXCLUSIVE FULL TRACK — ESCÚCHALO ENTERO GRATIS' : 'EXCLUSIVE FULL TRACK — LISTEN IN FULL, FREE'}</span>
          <span className="ml-auto hidden md:inline font-normal opacity-75 text-[10px] tracking-[0.05em] shrink-0">FULL STREAMING · NO PREVIEW</span>
        </div>
      ) : null}
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
            <p className="text-xs sm:text-sm mt-0.5 break-words" style={{ fontFamily: "'Courier Prime', monospace" }}>
              <ArtistNames artists={artists} mixName={mixName} slugMap={artistSlugMap} lang={lang} />
              {pick.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><LabelName name={pick.label} slugMap={labelSlugMap} lang={lang} /></> : null}
              {releaseDisp ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap" title={c.release_year_title}>{releaseDisp}</span></> : null}
            </p>
            {note ? <p className="text-xs text-[var(--ink)]/55 mt-1 leading-relaxed" style={{ fontFamily: "'Courier Prime', monospace" }}>{note}</p> : null}
          </div>
        </div>

        <div className="track-action-bar">
          {hasSample && onPlay && (
            <button
              type="button"
              onClick={onPlay}
              className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation whitespace-nowrap
                ${isPlaying || hasFullAudio ? 'bg-[var(--red)] text-white hover:bg-[var(--ink)] active:bg-[var(--ink)]' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={isPlaying && !isPaused ? c.preview_pause : c.preview_play}
              aria-label={isPlaying && !isPaused ? c.preview_pause : c.preview_play}
            >
              {isPlaying && !isPaused ? '❚❚' : hasFullAudio ? '▶ PLAY FULL' : '▶'}
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
          <SaveTrackButton source="featured" trackId={pick.id} relatedRefs={relatedRefs} canonicalUrl={pick.link_url} snapshot={buildFeaturedSnapshot(pick)} lang={lang} size="sm" />
          <TrackShareButton
            source="featured"
            trackId={pick.id}
            weekDate={weekDate}
            lang={lang}
            shareTitle={`${pick.title} — ${artists.map((a) => a.name).filter(Boolean).join(', ')}`}
          />
          <SpotifyLinkButton url={pick.spotify_url} title={pick.title} artists={artists} dict={dict} lang={lang} />
          <TidalLinkButton url={pick.tidal_url} lang={lang} />
          {pick.platform === 'hosted' ? null : pick.platform === 'beatport' && !(pick.link_label || '').trim() ? (
            <BeatportLinkButton url={pick.link_url} dict={dict} lang={lang} />
          ) : (
            <a
              href={pick.link_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {cta}
            </a>
          )}
        </div>
      </div>
    </div>
  )
}

function VinylTrackRow({ track, dict, lang, autoplay = false, artistSlugMap, labelSlugMap, labelImageMap, relatedRefs }: { track: ChartVinylTrack; dict: any; lang: Locale; autoplay?: boolean; artistSlugMap?: Record<string, string>; labelSlugMap?: Record<string, string>; labelImageMap?: Record<string, string>; relatedRefs?: CanonRef[] }) {
  const c = dict.charts
  const artists = Array.isArray(track.artists) ? track.artists : []
  const note = lang === 'es' ? track.note_es : track.note_en
  const mixName = (track.mix_name || '').trim()
  const ytId = extractYouTubeId(track.youtube_url)
  const playSlotId = `chart-vinyl-row-${track.id}`
  const embedRef = useRef<HTMLDivElement>(null)
  const [showPlayer, setShowPlayer] = useState(autoplay)

  useEffect(() => {
    if (autoplay) {
      requestYouTubePlay(playSlotId)
      const playKey = normalizeTrackCanonicalUrl(track.youtube_url) || `t:vinyl:${track.id}`
      logTrackPlay(playKey)
      setShowPlayer(true)
    }
  }, [autoplay, playSlotId, track.youtube_url, track.id])

  useEffect(() => {
    return subscribeYouTubePlay((activeId) => {
      if (activeId !== playSlotId) setShowPlayer(false)
    })
  }, [playSlotId])

  const togglePlayer = useCallback(() => {
    setShowPlayer((prev) => {
      if (prev) {
        releaseYouTubePlay(playSlotId)
        return false
      }
      requestYouTubePlay(playSlotId)
      const playKey = normalizeTrackCanonicalUrl(track.youtube_url) || `t:vinyl:${track.id}`
      logTrackPlay(playKey)
      requestAnimationFrame(() => {
        embedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
      return true
    })
  }, [playSlotId, track.youtube_url, track.id])

  return (
    <div id={`chart-vinyl-row-${track.id}`} className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] transition-colors ${showPlayer ? 'bg-[var(--red)]/15 border-[var(--red)]/30' : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'}`}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <div className="flex items-start gap-3 min-w-0 flex-1">
          <VinylArtwork track={track} labelImageMap={labelImageMap} />

          <div className="flex-1 min-w-0">
            <h3 className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate" style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}>
              {track.title}
              {mixName ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{mixName}</span> : null}
            </h3>
            <p className="text-xs sm:text-sm mt-0.5 break-words" style={{ fontFamily: "'Courier Prime', monospace" }}>
              <ArtistNames artists={artists} mixName={mixName} slugMap={artistSlugMap} lang={lang} />
              {track.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><LabelName name={track.label} slugMap={labelSlugMap} lang={lang} /></> : null}
              {track.year != null && track.year > 0 ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap">{track.year}</span></> : null}
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

        <div className="track-action-bar">
          {ytId && (
            <button
              type="button"
              onClick={togglePlayer}
              className={`h-[36px] px-2.5 text-[10px] sm:h-auto sm:px-2 sm:py-1 sm:text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation
                ${showPlayer ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)] active:bg-[var(--yellow)]'}`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={showPlayer ? c.preview_pause : c.preview_play}
              aria-label={showPlayer ? c.preview_pause : c.preview_play}
            >
              {showPlayer ? '❚❚' : '▶'}
            </button>
          )}
          <SaveTrackButton source="vinyl" trackId={track.id} relatedRefs={relatedRefs} canonicalUrl={track.youtube_url || track.discogs_url} snapshot={buildVinylSnapshot(track)} lang={lang} size="sm" />
          <TrackShareButton
            path={buildVinylSharePath(lang, track.id)}
            lang={lang}
            shareTitle={`${track.title} — ${artists.map((a) => a.name).filter(Boolean).join(', ')}`}
          />
          {track.youtube_url && (
            <a
              href={track.youtube_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-transparent text-[var(--ink)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {c.vinyl_open_youtube}
            </a>
          )}
          {(track.discogs_url || '').trim().includes('discogs.com') && (
            <a
              href={track.discogs_url} target="_blank" rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {c.vinyl_open_discogs}
            </a>
          )}
        </div>
      </div>

      {ytId && showPlayer && (
        <div ref={embedRef} className="w-full max-w-sm">
          <LazyYouTubeEmbed
            videoId={ytId}
            title={`${track.title} — ${artists.map((a: ChartVinylArtist) => a.name).join(', ')}`}
            className="border-[3px] border-[var(--ink)]"
            autoplay
            playSlotId={playSlotId}
            nowPlaying={{
              title: track.title,
              artist: artists.map((a: ChartVinylArtist) => a.name).join(', '),
              mixName: track.mix_name,
              album: track.label,
              artworkUrl: track.artwork_url,
            }}
          />
        </div>
      )}
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
    <section
      className={
        isLatest
          ? 'border-[4px] border-[var(--red)] bg-[var(--paper)] overflow-hidden shadow-[4px_4px_0_0_rgba(214,40,40,0.25)]'
          : 'border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden'
      }
    >
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
  pickWeeks,
  archiveYears,
  artistSlugMap,
  labelSlugMap,
  labelImageMap,
  hideHeader = false,
}: ChartViewProps) {
  const c = dict.charts

  const [openPicks, togglePicks, ensureOpenPicks] = useToggleSet(new Set<string>())
  const [openVinyl, toggleVinyl, ensureOpenVinyl] = useToggleSet(new Set<string>())
  const [showAllPicksWeeks, setShowAllPicksWeeks] = useState(false)
  const [pickByWeek, setPickByWeek] = useState<Record<string, ChartFeaturedTrack[]>>({})
  const [pickPhase, setPickPhase] = useState<Record<string, 'loading' | 'error'>>({})
  const [archiveByYearLoaded, setArchiveByYearLoaded] = useState<Record<string, ArchiveRow[]>>({})
  const [archivePhase, setArchivePhase] = useState<Record<string, 'loading' | 'error'>>({})
  const pickRequested = useRef<Set<string>>(new Set())
  const archiveRequested = useRef<Set<string>>(new Set())
  const archiveRowsRef = useRef<Record<string, ArchiveRow[]>>({})
  /** Cuántas filas de cada año están pintadas (tramos de ARCHIVE_PAGE). */
  const [archiveVisible, setArchiveVisible] = useState<Record<string, number>>({})
  /** Deep-link a una fila del archivo: hay que revelar hasta ella cuando lleguen los datos. */
  const archiveRevealRef = useRef<Record<string, string>>({})
  const revealArchiveRow = useCallback((yearKey: string, trackId: string, rows: ArchiveRow[]) => {
    const idx = rows.findIndex((r) => archiveRowId(r) === trackId)
    if (idx < 0) return
    const needed = Math.ceil((idx + 1) / ARCHIVE_PAGE) * ARCHIVE_PAGE
    setArchiveVisible((s) => (s[yearKey] ?? ARCHIVE_PAGE) >= needed ? s : { ...s, [yearKey]: needed })
  }, [])
  const showMoreArchive = useCallback((yearKey: string) => {
    setArchiveVisible((s) => ({ ...s, [yearKey]: (s[yearKey] ?? ARCHIVE_PAGE) + ARCHIVE_PAGE }))
  }, [])
  /** Fila a la que hay que hacer scroll cuando exista en el DOM (deep-link). */
  const scrollTargetRef = useRef<string | null>(null)
  /** Vinilo pedido por deep-link cuyo año aún se está descargando. */
  const vinylIntentRef = useRef<{ trackId: string; yearKey: string } | null>(null)

  const loadPicks = useCallback((week: string) => {
    if (!week || pickRequested.current.has(week)) return
    pickRequested.current.add(week)
    setPickPhase((s) => ({ ...s, [week]: 'loading' }))
    fetch(`/api/public/charts/section?kind=picks&week=${encodeURIComponent(week)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<{ tracks?: ChartFeaturedTrack[] }>
      })
      .then((body) => {
        setPickByWeek((s) => ({ ...s, [week]: body.tracks ?? [] }))
        setPickPhase((s) => {
          const next = { ...s }
          delete next[week]
          return next
        })
      })
      .catch(() => {
        pickRequested.current.delete(week)
        setPickPhase((s) => ({ ...s, [week]: 'error' }))
      })
  }, [])

  const loadArchive = useCallback((yearKey: string) => {
    if (!yearKey || archiveRequested.current.has(yearKey)) return
    archiveRequested.current.add(yearKey)
    setArchivePhase((s) => ({ ...s, [yearKey]: 'loading' }))
    fetch(`/api/public/charts/section?kind=archive&year=${encodeURIComponent(yearKey)}`)
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status))
        return r.json() as Promise<{ rows?: ArchiveRow[] }>
      })
      .then((body) => {
        // Se guarda YA ordenado (A–Z por artista): reordenar ~2.000 filas en
        // cada render era parte del bloqueo al abrir un año grande.
        const rows = sortArchiveRows(body.rows ?? [], lang)
        archiveRowsRef.current[yearKey] = rows
        setArchiveByYearLoaded((s) => ({ ...s, [yearKey]: rows }))
        setArchivePhase((s) => {
          const next = { ...s }
          delete next[yearKey]
          return next
        })
        const reveal = archiveRevealRef.current[yearKey]
        if (reveal) {
          delete archiveRevealRef.current[yearKey]
          revealArchiveRow(yearKey, reveal, rows)
        }
        const intent = vinylIntentRef.current
        if (intent && intent.yearKey === yearKey) {
          vinylIntentRef.current = null
          resolveVinylIntent(intent, rows)
        }
      })
      .catch(() => {
        archiveRequested.current.delete(yearKey)
        setArchivePhase((s) => ({ ...s, [yearKey]: 'error' }))
      })
  }, [lang, revealArchiveRow])

  const [autoplayVinylId, setAutoplayVinylId] = useState<string | null>(null)

  // Overlay "Toca para escuchar" pendiente para vinyl deep-links.
  const [pendingVinylPlay, setPendingVinylPlay] = useState<PendingVinylPlay | null>(null)

  function resolveVinylIntent(intent: { trackId: string; yearKey: string }, rows: ArchiveRow[]) {
    const hit = rows.find(
      (r): r is Extract<ArchiveRow, { kind: 'vinyl' }> => r.kind === 'vinyl' && r.track.id === intent.trackId,
    )
    if (hit) setPendingVinylPlay({ trackId: intent.trackId, yearKey: intent.yearKey, track: hit.track })
    else setAutoplayVinylId(intent.trackId)
  }

  const [pendingPlay, setPendingPlay] = useState<
    // `autoplay`: solo el buscador global (⌘K, `?play=1`) intenta arrancar el
    // audio al vuelo. Los enlaces COMPARTIDOS (`?play=source:id`) llegan con
    // `autoplay: false` → mostramos SIEMPRE el modal «Toca para escuchar» y es
    // el tap del usuario quien reproduce (gesto real: funciona en PC y móvil).
    | { kind: 'picks'; weekDate: string; trackId: string; autoplay: boolean }
    | { kind: 'archive'; yearKey: string; trackId: string; autoplay: boolean }
    | null
  >(null)

  // Emergente «Toca para escuchar» para deep-links de chart/featured. Se arma
  // a la vez que el intento de autoplay y se retira solo cuando ese tema ya
  // está sonando; si el autoplay no arranca (política del navegador, motor
  // aún cargando, error silencioso…), el tap del usuario lo lanza de verdad.
  const [pendingTapPlay, setPendingTapPlay] = useState<PendingTapPlay | null>(null)

  // ---- Deep-link: abrir acordeón correcto, hacer scroll al track y (opcional)
  // iniciar reproducción -----------------------------------------------------
  //
  // Dos fuentes posibles:
  //
  //   a) Hash del buscador global (⌘K): /charts#chart-row-<id> (40 Breaks,
  //      New Releases o archivo digital) o /charts#chart-vinyl-row-<id>
  //      (vinilo del archivo). Si además lleva `?play=1`, arrancamos preview.
  //
  //   b) Link compartido de una canción: /charts?play=chart:<id>,
  //      `?play=featured:<id>` o `?play=vinyl:<id>` (sin hash). Viene de
  //      `TrackShareButton`. En este caso siempre iniciamos reproducción.
  //
  // Al montar resolvemos el target: expandimos semana/año que contiene el
  // track, hacemos scrollIntoView y destacamos la fila.
  useEffect(() => {
    if (typeof window === 'undefined') return
    let seq = 0
    const applyDeepLink = async () => {
      const my = ++seq
      const rawHash = window.location.hash.replace(/^#/, '')
      const parsed = parsePlayParam(new URLSearchParams(window.location.search).get('play'))

      // Enlaces compartidos de un tema (`?play=chart:id` / `featured:id` desde
      // `TrackShareButton`) NUNCA hacen autoplay: enseñan el modal «Toca para
      // escuchar» y el tap del usuario reproduce. Solo el deep-link del buscador
      // global (⌘K → `#chart-row-id` + `?play=1`, dentro de la sesión, con gesto
      // previo) intenta arrancar solo. Antes se intentaba autoplay siempre y el
      // modal dependía de que el navegador rechazara con NotAllowedError; en
      // móvil (WebKit) el rechazo llega como AbortError y el modal no aparecía.
      const autoplayOnLoad = parsed?.kind === 'legacy'

      let kind: 'chart' | 'vinyl' | null = null
      let trackId = ''
      let domId = ''
      let wantsPlay = false

      if (rawHash.startsWith('chart-vinyl-row-')) {
        kind = 'vinyl'
        trackId = rawHash.slice('chart-vinyl-row-'.length)
        domId = rawHash
        if (parsed?.kind === 'legacy') wantsPlay = true
      } else if (rawHash.startsWith('chart-row-')) {
        kind = 'chart'
        trackId = rawHash.slice('chart-row-'.length)
        domId = rawHash
        if (parsed?.kind === 'legacy') wantsPlay = true
      } else if (parsed?.kind === 'track') {
        kind = 'chart'
        trackId = parsed.id
        domId = `chart-row-${trackId}`
        wantsPlay = true
      } else if (parsed?.kind === 'vinyl') {
        kind = 'vinyl'
        trackId = parsed.id
        domId = `chart-vinyl-row-${trackId}`
        wantsPlay = true
      }

      if (!kind || !trackId) return

      if (parsed) {
        try {
          const u = new URL(window.location.href)
          u.searchParams.delete('play')
          if (parsed.kind === 'track') u.searchParams.delete('week')
          window.history.replaceState({}, '', u.toString())
        } catch {
          /* noop */
        }
      }

      let target: { kind: 'picks'; week: string } | { kind: 'archive'; year: string } | null = null
      try {
        const res = await fetch(`/api/public/charts/section?kind=locate&id=${encodeURIComponent(trackId)}`)
        if (!res.ok) return
        const body = await res.json() as {
          target?: { kind: 'picks'; week: string } | { kind: 'archive'; year: string } | null
        }
        target = body.target ?? null
      } catch {
        return
      }
      if (my !== seq || !target) return

      scrollTargetRef.current = domId
      if (target.kind === 'picks') {
        const idx = pickWeeks.findIndex((w) => w.weekDate === target.week)
        if (idx >= INITIAL_WEEKS_VISIBLE) setShowAllPicksWeeks(true)
        ensureOpenPicks(target.week)
        loadPicks(target.week)
        if (wantsPlay) {
          setPendingPlay({ kind: 'picks', weekDate: target.week, trackId, autoplay: autoplayOnLoad })
        }
      } else {
        ensureOpenVinyl(target.year)
        const loaded = archiveRowsRef.current[target.year]
        if (loaded) revealArchiveRow(target.year, trackId, loaded)
        else archiveRevealRef.current[target.year] = trackId
        if (kind === 'vinyl' && wantsPlay) {
          if (loaded) resolveVinylIntent({ trackId, yearKey: target.year }, loaded)
          else vinylIntentRef.current = { trackId, yearKey: target.year }
        } else if (wantsPlay) {
          setPendingPlay({ kind: 'archive', yearKey: target.year, trackId, autoplay: autoplayOnLoad })
        }
        loadArchive(target.year)
      }
    }

    applyDeepLink()
    window.addEventListener('hashchange', applyDeepLink)
    return () => {
      seq += 1
      window.removeEventListener('hashchange', applyDeepLink)
    }
  }, [pickWeeks, ensureOpenPicks, ensureOpenVinyl, loadPicks, loadArchive, revealArchiveRow])

  // Scroll + destello a la fila del deep-link en cuanto exista en el DOM
  // (la sección se abre y sus temas llegan por fetch).
  useEffect(() => {
    const id = scrollTargetRef.current
    if (!id) return
    const el = document.getElementById(id)
    if (!el) return
    scrollTargetRef.current = null
    el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    el.classList.add('!bg-[var(--yellow)]/25')
    const timer = window.setTimeout(() => el.classList.remove('!bg-[var(--yellow)]/25'), 1800)
    return () => window.clearTimeout(timer)
  }, [pickByWeek, archiveByYearLoaded, archiveVisible, showAllPicksWeeks, openPicks, openVinyl])

  // ---- Play-all state (delegado al provider global) ----
  const {
    previewQueue, previewIndex, previewGroupKey, previewPlaying, previewBlocked,
    playPreviewQueue, stopPreview, togglePreview,
  } = usePreviewAudioGated()

  type PlayAllBundle = PreviewTrack[]

  // ---- Grupos canónicos ----
  // Agrupación canónica CRUZADA entre las tres tablas (chart_tracks,
  // chart_featured_tracks, chart_vinyl_tracks). La misma canción puede estar
  // dada de alta como "New Release" (featured) y luego aparecer como #N en
  // los 40 Breaks Vitales (chart_tracks) de otra semana; son filas distintas
  // en distintas tablas, pero apuntan a la misma canción (misma URL de
  // Beatport / Bandcamp / Discogs). Agrupamos por URL canónica normalizada
  // (host + path, sin querystring ni trailing slash), y caemos a
  // título+mix+artistas cuando no hay URL. Producimos un mapa por source con
  // las refs polimórficas `{source, id}` del grupo completo, para pasárselo
  // a `SaveTrackButton` vía `relatedRefs`: así, si el usuario guarda una
  // instancia, las demás también se ven como guardadas; y al desmarcar se
  // borran todas a la vez de `saved_chart_tracks`.
  // (Definido aquí arriba — antes que los builders y el efecto de autoplay —
  // para poder pasar `groups` al `<SaveTrackButton>` que pinta la barra
  // global del reproductor sobre la pista actualmente sonando.)
  const canonicalGroups = useMemo(() => {
    const normUrl = (u: string | null | undefined) => {
      const s = (u || '').trim().toLowerCase()
      if (!s) return ''
      const yt = extractYouTubeId(s)
      if (yt) return `yt:${yt}`
      try {
        const url = new URL(s)
        return `${url.host}${url.pathname.replace(/\/$/, '')}`
      } catch {
        return s.replace(/[?#].*$/, '').replace(/\/$/, '')
      }
    }
    const artistsToCsv = (arr: unknown): string => {
      if (!Array.isArray(arr)) return ''
      return arr
        .map((a) => (a && typeof a === 'object' ? (a as { name?: string }).name : a))
        .filter(Boolean)
        .join(', ')
        .trim()
        .toLowerCase()
    }
    const fallbackKey = (title: string | null | undefined, mix: string | null | undefined, artistsCsv: string) =>
      `nm:${(title || '').trim().toLowerCase()}|${(mix || '').trim().toLowerCase()}|${artistsCsv}`

    const byKey = new Map<string, CanonRef[]>()
    const push = (k: string, ref: CanonRef) => {
      if (!k) return
      const arr = byKey.get(k)
      if (arr) arr.push(ref)
      else byKey.set(k, [ref])
    }

    for (const tracks of Object.values(pickByWeek)) {
      for (const f of tracks) {
        const k = normUrl(f.link_url) || fallbackKey(f.title, f.mix_name, artistsToCsv(f.artists))
        push(k, { source: 'featured', id: f.id })
        const idK = trackSaveIdentityKey(f.title, f.mix_name, f.artists)
        if (idK) push(idK, { source: 'featured', id: f.id })
      }
    }
    for (const rows of Object.values(archiveByYearLoaded)) {
      for (const row of rows) {
        if (row.kind === 'featured') {
          const p = row.pick
          const artists = Array.isArray(p.artists) ? p.artists : []
          const k = normUrl(p.link_url) || fallbackKey(p.title, p.mix_name, artistsToCsv(artists))
          push(k, { source: 'featured', id: p.id })
          const idK = trackSaveIdentityKey(p.title, p.mix_name, artists)
          if (idK) push(idK, { source: 'featured', id: p.id })
        } else {
          const v = row.track
          // `discogs_url` es el release entero, no la canción. Identidad = YouTube o título+mix+artistas.
          const k = normUrl(v.youtube_url) || fallbackKey(v.title, v.mix_name, artistsToCsv(v.artists))
          push(k, { source: 'vinyl', id: v.id })
        }
      }
    }

    const chartByTrack = new Map<string, CanonRef[]>()
    const featuredByTrack = new Map<string, CanonRef[]>()
    const vinylByTrack = new Map<string, CanonRef[]>()

    Array.from(byKey.values()).forEach((refs) => {
      if (refs.length < 2) return
      const seen = new Set<string>()
      const unique: CanonRef[] = []
      for (const r of refs) {
        const id = `${r.source}:${r.id}`
        if (seen.has(id)) continue
        seen.add(id)
        unique.push(r)
      }
      if (unique.length < 2) return
      const mergeInto = (map: Map<string, CanonRef[]>, trackId: string) => {
        const prev = map.get(trackId) || []
        const have = new Set(prev.map((x) => `${x.source}:${x.id}`))
        const next = [...prev]
        for (const r of unique) {
          const k = `${r.source}:${r.id}`
          if (have.has(k)) continue
          have.add(k)
          next.push(r)
        }
        if (next.length >= 2) map.set(trackId, next)
      }
      for (const r of unique) {
        if (r.source === 'chart') mergeInto(chartByTrack, r.id)
        else if (r.source === 'featured') mergeInto(featuredByTrack, r.id)
        else if (r.source === 'vinyl') mergeInto(vinylByTrack, r.id)
      }
    })

    return { chartByTrack, featuredByTrack, vinylByTrack }
  }, [pickByWeek, archiveByYearLoaded])

  /**
   * Cada `PreviewTrack` lleva su propio paquete `save` con `relatedRefs` y
   * `snapshot`, exactamente igual a lo que recibe el `<SaveTrackButton>` en
   * la fila visible. Así, el botón "+/✓" del MiniPreviewBar opera sobre la
   * misma agrupación canónica que la fila origen y se mantiene sincronizado
   * cuando el usuario marca/desmarca desde una u otra. Recibimos el mapa
   * canónico como argumento (en vez de cerrarlo en el `useCallback`) para
   * mantener estos builders puros y reutilizables desde el efecto de
   * autoplay y desde el render.
   */
  const buildFeaturedBundle = useCallback((
    featured: ChartFeaturedTrack[],
    groups?: Map<string, CanonRef[]>,
    weekDate?: string | null,
  ): PlayAllBundle => {
    const out: PreviewTrack[] = []
    for (const p of featured) {
      let src = ''
      if (p.platform === 'bandcamp' && p.link_url) src = previewAudioSrc('', p)
      else if (p.full_audio_url ?? null) src = p.full_audio_url!  // audio completo alojado: ruta directa sin proxy
      else if (p.sample_url) src = previewAudioSrc(p.sample_url)
      if (!src) continue
      const artists = Array.isArray(p.artists) ? p.artists.map((a: ChartFeaturedArtist) => a.name).join(', ') : ''
      out.push({
        rowKey: `chart-row-${p.id}`,
        src,
        title: p.title,
        artist: artists,
        artworkUrl: p.artwork_url || null,
        ...catalogLockScreenFields(p.mix_name, p.label),
        domId: `chart-row-${p.id}`,
        // Vuelta al origen desde el mini reproductor: /charts con la semana
        // de esta edición (el hash #chart-row-<id> expande el acordeón).
        originPath: weekDate ? `/${lang}/charts?week=${weekDate}` : `/${lang}/charts`,
        save: {
          mode: 'ref',
          source: 'featured',
          trackId: p.id,
          relatedRefs: groups?.get(p.id),
          canonicalUrl: p.link_url || null,
          snapshot: buildFeaturedSnapshot(p),
        },
        share: {
          mode: 'chart',
          source: 'featured',
          trackId: p.id,
          weekDate: weekDate ?? null,
        },
      })
    }
    return out
  }, [lang])

  /**
   * Retro Vinyl Picks: cada fila incrusta su propio iframe YouTube al pulsar ▶.
   * No van a la cola global de preview (solo audio Beatport/Bandcamp).
   */
  const playFromIndex = useCallback((sectionKey: string, bundle: PlayAllBundle, index: number) => {
    if (bundle.length === 0) return
    playPreviewQueue(bundle, index, sectionKey)
  }, [playPreviewQueue])

  // Click en el ▶/❚❚ de una fila: si ya es la que está sonando en este
  // grupo, hacemos toggle pausa/reanudar (antes SIEMPRE re-lanzaba la cola,
  // así que el icono de pausa reiniciaba el tema en vez de detenerlo — el
  // botón "no paraba" la reproducción). Si es otra fila, arranca desde ahí.
  const handleRowPlay = useCallback((sectionKey: string, bundle: PlayAllBundle, index: number, isActiveRow: boolean) => {
    if (isActiveRow) {
      togglePreview()
      return
    }
    playFromIndex(sectionKey, bundle, index)
  }, [togglePreview, playFromIndex])

  const handlePlayAllClick = useCallback((sectionKey: string, bundle: PlayAllBundle) => {
    if (previewGroupKey === sectionKey) {
      stopPreview()
    } else {
      playFromIndex(sectionKey, bundle, 0)
    }
  }, [previewGroupKey, stopPreview, playFromIndex])

  // Ejecuta el autoplay pendiente sobre chart/featured: busca el track por id
  // en la semana ya identificada, construye el bundle como haría el render, y
  // llama `playFromIndex` con el índice que le toque. Corre cuando cambia la
  // petición pendiente o cuando `weeks` se actualiza por cualquier motivo.
  useEffect(() => {
    if (!pendingPlay) return
    // Enlace COMPARTIDO (`autoplay === false`): NO intentamos reproducir; solo
    // armamos el modal «Toca para escuchar» con este bundle, y el tap del
    // usuario (gesto real) arranca el tema — en PC y en móvil por igual.
    // ⌘K (`autoplay === true`): intento de arranque + modal como respaldo si el
    // navegador lo bloquea.
    const autoplay = pendingPlay.autoplay
    const armDeepLinkPlay = (sectionKey: string, bundle: PlayAllBundle, idx: number) => {
      const m = bundle[idx]
      if (!m) return
      if (autoplay) playFromIndex(sectionKey, bundle, idx)
      setPendingTapPlay({
        rowKey: m.rowKey,
        sectionKey,
        bundle,
        index: idx,
        title: m.title,
        artist: m.artist,
        artworkUrl: m.artworkUrl ?? null,
      })
    }
    if (pendingPlay.kind === 'archive') {
      const { yearKey, trackId } = pendingPlay
      if (!(yearKey in archiveByYearLoaded)) return
      const rows = archiveByYearLoaded[yearKey]
      const featured = rows.filter((r): r is Extract<ArchiveRow, { kind: 'featured' }> => r.kind === 'featured').map((r) => r.pick)
      const weekDate = rows.find((r) => r.kind === 'featured' && r.pick.id === trackId)?.weekDate ?? ''
      const bundle = buildFeaturedBundle(featured, canonicalGroups.featuredByTrack, weekDate)
      const rowKey = `chart-row-${trackId}`
      const idx = bundle.findIndex((m) => m.rowKey === rowKey)
      if (idx >= 0) {
        armDeepLinkPlay(`archive-${yearKey}`, bundle, idx)
      }
      setPendingPlay(null)
      return
    }
    const { weekDate, trackId } = pendingPlay
    if (!(weekDate in pickByWeek)) return
    const sorted = sortFeaturedByArtist(
      pickByWeek[weekDate].filter((p) => !isArchiveFeaturedTrack(p)),
      lang,
    )
    const bundle = buildFeaturedBundle(sorted, canonicalGroups.featuredByTrack, weekDate)
    const rowKey = `chart-row-${trackId}`
    const idx = bundle.findIndex((m) => m.rowKey === rowKey)
    if (idx >= 0) {
      armDeepLinkPlay(`picks-${weekDate}`, bundle, idx)
    }
    setPendingPlay(null)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlay, pickByWeek, archiveByYearLoaded, lang, playFromIndex, buildFeaturedBundle])

  // El tema del deep-link ya suena → retirar el emergente. Comparamos por
  // fila activa dentro de su grupo, no solo por `previewPlaying`, para no
  // cerrarlo porque esté sonando otra cosa (p. ej. una cola anterior).
  const pendingTapRowActive =
    !!pendingTapPlay &&
    previewGroupKey === pendingTapPlay.sectionKey &&
    previewQueue[previewIndex]?.rowKey === pendingTapPlay.rowKey
  const pendingTapPlaying = pendingTapRowActive && previewPlaying
  useEffect(() => {
    if (pendingTapPlaying) setPendingTapPlay(null)
  }, [pendingTapPlaying])
  // El motor rechazó el autoplay (NotAllowedError) y levanta su propio
  // «Toca para escuchar» sobre esta misma cola: le cedemos el emergente para
  // no duplicarlo ni reaparecer si el usuario lo cierra tocando fuera.
  useEffect(() => {
    if (previewBlocked) setPendingTapPlay(null)
  }, [previewBlocked])

  // Tap del usuario en el emergente: gesto real, así que el `play()` no cae
  // en la política de autoplay. Si la cola ya está cargada en esa fila (el
  // intento automático la dejó en pausa), reanudamos; si no, la lanzamos.
  const handlePendingTapPlay = useCallback(() => {
    if (!pendingTapPlay) return
    if (pendingTapRowActive) {
      if (!previewPlaying) togglePreview()
      return
    }
    playFromIndex(pendingTapPlay.sectionKey, pendingTapPlay.bundle, pendingTapPlay.index)
  }, [pendingTapPlay, pendingTapRowActive, previewPlaying, togglePreview, playFromIndex])

  // Dado un sectionKey, ¿es la cola actualmente activa del provider?
  const isGroupActive = useCallback((sectionKey: string) => previewGroupKey === sectionKey, [previewGroupKey])
  // ¿Qué rowKey se está reproduciendo ahora mismo (si coincide con este grupo)?
  const activeRowKeyFor = useCallback((sectionKey: string): string | null => {
    if (previewGroupKey !== sectionKey) return null
    return previewQueue[previewIndex]?.rowKey ?? null
  }, [previewGroupKey, previewQueue, previewIndex])

  // «Reproducir todo» sobre una sección cuyos temas aún no se han descargado:
  // el botón sale sin expandir; al pulsarlo se pide la sección y, cuando llega,
  // arranca la cola (patrón ⌘K: intento de play + modal «Toca para escuchar»
  // de respaldo si el navegador lo bloquea al no estar ya dentro del gesto).
  const [pendingPlayAll, setPendingPlayAll] = useState<string | null>(null)

  /**
   * @param loadable Sección con temas (count > 0) todavía sin descargar: cómo
   *   pedirla. Si se pasa y el bundle está vacío, el botón sale igualmente y
   *   dispara carga + reproducción.
   */
  function renderPlayAllBtn(sectionKey: string, bundle: PlayAllBundle, loadable?: { load: () => void }) {
    const deferred = bundle.length === 0
    if (deferred && !loadable) return undefined
    const isActive = isGroupActive(sectionKey)
    const isPending = deferred && pendingPlayAll === sectionKey
    const current = isActive ? (previewIndex + 1) : 0
    const total = isActive ? previewQueue.length : bundle.length

    return (
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation()
          if (deferred) {
            if (isPending) return
            setPendingPlayAll(sectionKey)
            loadable!.load()
            return
          }
          handlePlayAllClick(sectionKey, bundle)
        }}
        className={`inline-flex items-center gap-1.5 min-h-[36px] px-2.5 py-1 text-[10px] sm:text-[11px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer touch-manipulation select-none whitespace-nowrap
          ${isActive ? 'bg-[var(--red)] text-white' : 'bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)]'}`}
        style={{ fontFamily: "'Courier Prime', monospace" }}
        title={isActive ? c.stop_all_title : c.play_all_title}
        aria-label={isActive ? c.stop_all_title : c.play_all_title}
        aria-busy={isPending || undefined}
      >
        {isActive ? c.stop_all : c.play_all}
        {isPending && <span className="text-[9px] font-bold opacity-80" aria-hidden>…</span>}
        {isActive && (
          <span className="text-[9px] font-bold opacity-80 tabular-nums">
            {c.play_all_counter.replace('{current}', String(current)).replace('{total}', String(total))}
          </span>
        )}
      </button>
    )
  }

  // Bundle de «reproducir todo» + índice por fila de cada año cargado, calculado
  // una vez por cambio de datos (no en cada render ni con findIndex por fila).
  const archiveBundles = useMemo(() => {
    const out: Record<string, { bundle: PlayAllBundle; idxByRowKey: Map<string, number> }> = {}
    for (const [yearKey, rows] of Object.entries(archiveByYearLoaded)) {
      const featured = rows
        .filter((r): r is Extract<ArchiveRow, { kind: 'featured' }> => r.kind === 'featured')
        .map((r) => r.pick)
      const bundle = buildFeaturedBundle(
        featured,
        canonicalGroups.featuredByTrack,
        rows.find((r) => r.kind === 'featured')?.weekDate ?? '',
      )
      const idxByRowKey = new Map<string, number>()
      bundle.forEach((m, i) => idxByRowKey.set(m.rowKey, i))
      out[yearKey] = { bundle, idxByRowKey }
    }
    return out
  }, [archiveByYearLoaded, canonicalGroups.featuredByTrack, buildFeaturedBundle])

  // «Reproducir todo» diferido: en cuanto la sección pedida tiene sus temas,
  // se abre, arranca la cola desde el primero y se arma el modal de respaldo.
  useEffect(() => {
    if (!pendingPlayAll) return
    let bundle: PlayAllBundle | null = null
    if (pendingPlayAll.startsWith('archive-')) {
      const yearKey = pendingPlayAll.slice('archive-'.length)
      if (!(yearKey in archiveByYearLoaded)) return
      bundle = archiveBundles[yearKey]?.bundle ?? []
      ensureOpenVinyl(yearKey)
    } else if (pendingPlayAll.startsWith('picks-')) {
      const weekDate = pendingPlayAll.slice('picks-'.length)
      if (!(weekDate in pickByWeek)) return
      const sorted = sortFeaturedByArtist(pickByWeek[weekDate].filter((p) => !isArchiveFeaturedTrack(p)), lang)
      bundle = buildFeaturedBundle(sorted, canonicalGroups.featuredByTrack, weekDate)
      ensureOpenPicks(weekDate)
    }
    setPendingPlayAll(null)
    const first = bundle?.[0]
    if (!bundle || !first) return
    playFromIndex(pendingPlayAll, bundle, 0)
    setPendingTapPlay({
      rowKey: first.rowKey,
      sectionKey: pendingPlayAll,
      bundle,
      index: 0,
      title: first.title,
      artist: first.artist,
      artworkUrl: first.artworkUrl ?? null,
    })
  }, [
    pendingPlayAll, archiveByYearLoaded, archiveBundles, pickByWeek, lang,
    buildFeaturedBundle, canonicalGroups.featuredByTrack, ensureOpenVinyl, ensureOpenPicks, playFromIndex,
  ])

  const visiblePicksWeeks = showAllPicksWeeks
    ? pickWeeks
    : pickWeeks.slice(0, INITIAL_WEEKS_VISIBLE)
  const hiddenPicksWeeks = Math.max(0, pickWeeks.length - INITIAL_WEEKS_VISIBLE)

  if (pickWeeks.length === 0 && archiveYears.length === 0) {
    return (
      <div className={`max-w-4xl mx-auto px-4 text-center ${hideHeader ? 'pb-20' : 'py-20'}`}>
        {!hideHeader && (
          <h1 className="text-3xl sm:text-5xl font-black mb-4" style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}>
            {c.radio_title}
          </h1>
        )}
        <p className="text-base text-[var(--ink)]/60" style={{ fontFamily: "'Courier Prime', monospace" }}>
          {c.no_chart_yet}
        </p>
      </div>
    )
  }

  return (
    <div className={`max-w-4xl mx-auto px-0 sm:px-4 ${hideHeader ? 'pb-6 sm:pb-10' : 'py-6 sm:py-10'}`}>
      {/* ================================================================ */}
      {/* PAGE HEADER — "La radio de Optimal Breaks"                       */}
      {/* (con `hideHeader` lo pinta la página en el server, antes del     */}
      {/* streaming del esquema; ver charts/page.tsx)                      */}
      {/* ================================================================ */}
      {!hideHeader && (
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
      )}

      {/* ================================================================ */}
      {/* SECTION 1 — New releases (editorial picks)                       */}
      {/* ================================================================ */}
      {pickWeeks.length > 0 && (
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
            {visiblePicksWeeks.map((week, index) => {
              const featuredSorted = sortFeaturedByArtist(
                (pickByWeek[week.weekDate] ?? []).filter((p) => !isArchiveFeaturedTrack(p)),
                lang,
              )
              const picksBundle = buildFeaturedBundle(featuredSorted, canonicalGroups.featuredByTrack, week.weekDate)
              const picksKey = `picks-${week.weekDate}`
              const expanded = openPicks.has(week.weekDate)
              const phase = pickPhase[week.weekDate]
              const loadingLabel = lang === 'es' ? 'Cargando temas…' : 'Loading tracks…'

              return (
                <WeekAccordion
                  key={`picks-${week.id}`}
                  weekDate={week.weekDate}
                  lang={lang}
                  isLatest={week.isLatest}
                  editionNumber={week.editionNumber > 0 ? week.editionNumber : index + 1}
                  count={week.count}
                  expanded={expanded}
                  onToggle={() => {
                    const opening = !openPicks.has(week.weekDate)
                    togglePicks(week.weekDate)
                    if (opening) loadPicks(week.weekDate)
                  }}
                  label="picks"
                  dict={dict}
                  playAllSlot={renderPlayAllBtn(
                    picksKey,
                    picksBundle,
                    !(week.weekDate in pickByWeek) && week.count > 0 ? { load: () => loadPicks(week.weekDate) } : undefined,
                  )}
                >
                  {expanded && phase === 'loading' ? (
                    <p className="px-4 py-4 text-xs font-bold tracking-wider text-[var(--ink)]/55" style={{ fontFamily: "'Courier Prime', monospace" }}>
                      {loadingLabel}
                    </p>
                  ) : null}
                  {expanded && phase === 'error' ? (
                    <button
                      type="button"
                      onClick={() => loadPicks(week.weekDate)}
                      className="w-full px-4 py-4 text-left text-xs font-bold tracking-wider text-[var(--ink)] hover:bg-[var(--yellow)]/20"
                      style={{ fontFamily: "'Courier Prime', monospace" }}
                    >
                      {lang === 'es' ? 'No se han podido cargar. Reintentar.' : 'Could not load. Retry.'}
                    </button>
                  ) : null}
                  {featuredSorted.map((pick) => {
                    const rowKey = `chart-row-${pick.id}`
                    const idx = picksBundle.findIndex((m) => m.rowKey === rowKey)
                    const isActive = activeRowKeyFor(picksKey) === rowKey
                    return (
                      <FeaturedPickRow
                        key={pick.id}
                        pick={pick}
                        dict={dict}
                        lang={lang}
                        weekDate={week.weekDate}
                        isPlaying={isActive}
                        isPaused={isActive && !previewPlaying}
                        onPlay={idx >= 0 ? () => handleRowPlay(picksKey, picksBundle, idx, isActive) : undefined}
                        artistSlugMap={artistSlugMap}
                        labelSlugMap={labelSlugMap}
                        relatedRefs={canonicalGroups.featuredByTrack.get(pick.id)}
                      />
                    )
                  })}
                </WeekAccordion>
              )
            })}
            {!showAllPicksWeeks && hiddenPicksWeeks > 0 && (
              <button
                type="button"
                onClick={() => setShowAllPicksWeeks(true)}
                className="mt-1 min-h-[44px] w-full border-2 border-[var(--ink)] bg-[var(--paper)] px-3 py-2 text-[11px] sm:text-xs font-black tracking-wider text-[var(--ink)] hover:bg-[var(--cyan)] hover:text-white transition-colors touch-manipulation"
                style={{ fontFamily: "'Courier Prime', monospace" }}
                title={c.weeks_show_more_title}
              >
                {c.weeks_show_more.replace('{n}', String(hiddenPicksWeeks))}
              </button>
            )}
          </div>
        </section>
      )}

      {/* 40 Breaks Vitales siguen en BD (saves y ?play=chart:). No se listan en la web. */}

      {/* ================================================================ */}
      {/* SECTION 3 — Archive Picks (vinilo + Beatport/Bandcamp < 2026)    */}
      {/* Agrupado por año de lanzamiento, no por semana                   */}
      {/* ================================================================ */}
      {archiveYears.length > 0 && (
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
            {archiveYears.map(({ yearKey, count }) => {
              const rows = archiveByYearLoaded[yearKey] ?? []
              const archiveKey = `archive-${yearKey}`
              const archiveBundle = archiveBundles[yearKey]?.bundle ?? []
              const archiveIdx = archiveBundles[yearKey]?.idxByRowKey
              const visibleCount = archiveVisible[yearKey] ?? ARCHIVE_PAGE
              const visibleRows = rows.length > visibleCount ? rows.slice(0, visibleCount) : rows
              const remaining = rows.length - visibleRows.length
              const expanded = openVinyl.has(yearKey)
              const phase = archivePhase[yearKey]
              const yearLabel = yearKey === UNKNOWN_YEAR_KEY ? c.vinyl_year_unknown : yearKey
              const panelId = `vinyl-year-panel-${yearKey}`
              const triggerId = `vinyl-year-trigger-${yearKey}`
              const loadingLabel = lang === 'es' ? 'Cargando temas…' : 'Loading tracks…'

              return (
                <section
                  key={`vinyl-year-${yearKey}`}
                  className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden"
                >
                  <div className="flex items-center">
                    <button
                      type="button"
                      id={triggerId}
                      aria-expanded={expanded}
                      aria-controls={panelId}
                      onClick={() => {
                        const opening = !openVinyl.has(yearKey)
                        toggleVinyl(yearKey)
                        if (opening) loadArchive(yearKey)
                      }}
                      className="flex-1 min-w-0 flex items-center gap-2 sm:gap-3 text-left px-3 py-3 sm:px-4 sm:py-3.5 min-h-[52px] hover:bg-[var(--yellow)]/15 active:bg-[var(--yellow)]/25 transition-colors touch-manipulation"
                      style={{ fontFamily: "'Courier Prime', monospace" }}
                      title={expanded ? c.vinyl_toggle_hide : c.vinyl_toggle_show}
                    >
                      <span
                        className="text-[11px] sm:text-sm font-black text-[var(--ink)] shrink-0"
                        style={{ fontFamily: "'Unbounded', sans-serif" }}
                        aria-hidden
                      >
                        {expanded ? '▼' : '▶'}
                      </span>
                      <span
                        className="text-base sm:text-lg font-black tracking-wide text-[var(--ink)] flex-1 tabular-nums"
                        style={{ fontFamily: "'Unbounded', sans-serif" }}
                      >
                        {yearLabel}
                      </span>
                      <span className="text-[10px] sm:text-xs text-[var(--ink)]/50 font-bold shrink-0">
                        {c.vinyl_count.replace('{n}', String(count))}
                      </span>
                    </button>
                    {(() => {
                      const btn = renderPlayAllBtn(
                        archiveKey,
                        archiveBundle,
                        !(yearKey in archiveByYearLoaded) && count > 0 ? { load: () => loadArchive(yearKey) } : undefined,
                      )
                      return btn ? <div className="pr-2 sm:pr-3 shrink-0">{btn}</div> : null
                    })()}
                  </div>

                  {expanded && (
                    <div id={panelId} role="region" aria-labelledby={triggerId}>
                      {phase === 'loading' ? (
                        <p className="px-4 py-4 text-xs font-bold tracking-wider text-[var(--ink)]/55" style={{ fontFamily: "'Courier Prime', monospace" }}>
                          {loadingLabel}
                        </p>
                      ) : null}
                      {phase === 'error' ? (
                        <button
                          type="button"
                          onClick={() => loadArchive(yearKey)}
                          className="w-full px-4 py-4 text-left text-xs font-bold tracking-wider text-[var(--ink)] hover:bg-[var(--yellow)]/20"
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                        >
                          {lang === 'es' ? 'No se han podido cargar. Reintentar.' : 'Could not load. Retry.'}
                        </button>
                      ) : null}
                      {visibleRows.map((row) => {
                        if (row.kind === 'vinyl') {
                          return (
                            <VinylTrackRow
                              key={`v-${row.track.id}`}
                              track={row.track}
                              dict={dict}
                              lang={lang}
                              autoplay={autoplayVinylId === row.track.id}
                              artistSlugMap={artistSlugMap}
                              labelSlugMap={labelSlugMap}
                              labelImageMap={labelImageMap}
                              relatedRefs={canonicalGroups.vinylByTrack.get(row.track.id)}
                            />
                          )
                        }
                        const rowKey = `chart-row-${row.pick.id}`
                        const idx = archiveIdx?.get(rowKey) ?? -1
                        const isActive = activeRowKeyFor(archiveKey) === rowKey
                        return (
                          <FeaturedPickRow
                            key={`f-${row.pick.id}`}
                            pick={row.pick}
                            dict={dict}
                            lang={lang}
                            weekDate={row.weekDate}
                            isPlaying={isActive}
                            isPaused={isActive && !previewPlaying}
                            onPlay={idx >= 0 ? () => handleRowPlay(archiveKey, archiveBundle, idx, isActive) : undefined}
                            artistSlugMap={artistSlugMap}
                            labelSlugMap={labelSlugMap}
                            relatedRefs={canonicalGroups.featuredByTrack.get(row.pick.id)}
                          />
                        )
                      })}
                      {remaining > 0 ? (
                        <RevealMoreRows
                          yearKey={yearKey}
                          remaining={remaining}
                          lang={lang}
                          onMore={showMoreArchive}
                        />
                      ) : null}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* SECTION 4 — CTA al Top 100 de la Comunidad                       */}
      {/* El ranking «all-time» se sacó de /charts a su propia ruta         */}
      {/* `/[lang]/top100` para darle entidad/SEO. Aquí queda la tarjeta de */}
      {/* descubrimiento que enlaza a la página completa.                   */}
      {/* ================================================================ */}
      {(() => {
        const es = lang === 'es'
        const kicker = es ? 'TOP 100 DE LA COMUNIDAD' : 'COMMUNITY TOP 100'
        const title = es ? 'Top 100 de la comunidad' : 'Community Top 100'
        const subtitle = es
          ? 'Las canciones más añadidas a "Mis Tracks" por toda la comunidad Optimal Breaks. Ranking acumulado desde el día uno — sin votos, sin encuestas, solo saves reales.'
          : 'The most-saved tracks across the whole Optimal Breaks community. All-time ranking — no polls, no votes, just real saves.'
        const cta = es ? 'VER TOP 100 →' : 'OPEN TOP 100 →'
        return (
          <section id="community-top" className="mb-12 sm:mb-16 scroll-mt-24 px-2 sm:px-0">
            <Link
              href={`/${lang}/top100`}
              className="block group border-[3px] border-[var(--ink)] bg-[var(--paper)] hover:bg-[var(--yellow)]/15 transition-colors no-underline"
            >
              <div className="px-4 sm:px-6 py-5 sm:py-7">
                <span
                  className="inline-block px-2 py-1 text-[10px] font-black tracking-[4px] bg-[var(--acid)] text-[var(--ink)] border-2 border-[var(--ink)] mb-3"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  {kicker}
                </span>
                <h2
                  className="text-2xl sm:text-4xl lg:text-5xl font-black leading-[0.95] mb-3 text-[var(--ink)] group-hover:text-[var(--red)] transition-colors"
                  style={{ fontFamily: "'Unbounded', sans-serif" }}
                >
                  {title}
                </h2>
                <p
                  className="text-sm sm:text-base text-[var(--ink)]/60 mb-5 max-w-2xl"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  {subtitle}
                </p>
                <span
                  className="inline-flex items-center gap-1.5 min-h-[40px] px-3 text-[11px] sm:text-[12px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white transition-all"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  {cta}
                </span>
              </div>
            </Link>
          </section>
        )
      })()}

      <footer className="px-4 sm:px-0 mt-8 text-center">
        <p className="text-[10px] text-[var(--ink)]/30 tracking-[3px] font-bold" style={{ fontFamily: "'Courier Prime', monospace" }}>
          OPTIMAL BREAKS — 40 BREAKS VITALES
        </p>
      </footer>
      {/* La barra flotante de now-playing la monta `DeckAudioProvider`
          (modo `preview`) para que siga sonando al cambiar de ruta. */}

      {pendingVinylPlay && (
        <TapToPlayOverlay
          title={pendingVinylPlay.track.title}
          mixName={pendingVinylPlay.track.mix_name}
          artistText={(Array.isArray(pendingVinylPlay.track.artists) ? pendingVinylPlay.track.artists : [])
            .map((a) => a.name).filter(Boolean).join(', ')}
          artworkCandidates={vinylArtworkCandidates(
            pendingVinylPlay.track.artwork_url,
            pendingVinylPlay.track.youtube_url,
            pendingVinylPlay.track.label,
          )}
          resetKey={pendingVinylPlay.track.id}
          ariaLabel={lang === 'es' ? 'Toca para escuchar el vinilo' : 'Tap to play the vinyl'}
          lang={lang}
          onPlay={() => {
            const { trackId, yearKey } = pendingVinylPlay
            ensureOpenVinyl(yearKey)
            setPendingVinylPlay(null)
            setAutoplayVinylId(trackId)
          }}
          onDismiss={() => setPendingVinylPlay(null)}
        />
      )}
      {/* Deep-link de chart/featured: emergente propio mientras el tema no
          suene. Si el motor ya levantó su «Toca para escuchar» (autoplay
          rechazado con NotAllowedError), no lo duplicamos: ese tap también
          arranca este mismo tema. */}
      {pendingTapPlay && !pendingTapPlaying && !previewBlocked && !pendingVinylPlay && (
        <TapToPlayOverlay
          title={pendingTapPlay.title}
          artistText={pendingTapPlay.artist}
          artworkCandidates={[
            proxyCatalogArtworkForDisplay(pendingTapPlay.artworkUrl),
            pendingTapPlay.artworkUrl,
          ].filter((u, i, arr): u is string => !!u && arr.indexOf(u) === i)}
          resetKey={pendingTapPlay.rowKey}
          ariaLabel={lang === 'es' ? 'Toca para escuchar el track' : 'Tap to play the track'}
          lang={lang}
          onPlay={handlePendingTapPlay}
          onDismiss={() => setPendingTapPlay(null)}
        />
      )}
    </div>
  )
}
