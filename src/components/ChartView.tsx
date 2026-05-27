// ============================================
// OPTIMAL BREAKS — Charts page (Client Component)
// Three sections: New Releases → 40 Breaks Vitales → Retro Vinyl Picks (al final)
// ============================================

'use client'

import Image from 'next/image'
import Link from 'next/link'
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import type { Locale } from '@/lib/i18n-config'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import type { PreviewTrack } from '@/components/DeckAudioProvider'
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
import SaveTrackButton from '@/components/SaveTrackButton'
import TrackShareButton from '@/components/TrackShareButton'
import CommunityMonthlyTop from '@/components/CommunityMonthlyTop'
import { parsePlayParam, formatTrackReleaseDisplay, buildVinylSharePath, vinylArtworkCandidates, vinylArtworkUseNativeImg, vinylTrackDedupKey, vinylRowDisplayScore } from '@/lib/share-track'
import type { ChartTrackSource } from '@/hooks/useUserData'

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

function VinylAutoplayOverlay({
  pending,
  lang,
  onPlay,
  onDismiss,
}: {
  pending: PendingVinylPlay
  lang: Locale
  onPlay: () => void
  onDismiss: () => void
}) {
  const { track } = pending
  const artists = Array.isArray(track.artists) ? track.artists : []
  const artistText = artists.map((a) => a.name).filter(Boolean).join(', ')
  const es = lang === 'es'
  const candidates = useMemo(
    () => vinylArtworkCandidates(track.artwork_url, track.youtube_url, track.label),
    [track.artwork_url, track.youtube_url, track.label],
  )
  const [idx, setIdx] = useState(0)

  useEffect(() => { setIdx(0) }, [track.id, track.artwork_url, track.youtube_url, track.label])

  const src = candidates[idx] ?? null

  return (
    <div
      className="fixed inset-0 z-[95] flex items-center justify-center bg-[var(--ink)]/70 backdrop-blur-sm px-4"
      role="dialog"
      aria-modal="true"
      aria-label={es ? 'Toca para escuchar el vinilo' : 'Tap to play the vinyl'}
      onClick={onDismiss}
    >
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); onPlay() }}
        className="flex items-center gap-3 sm:gap-4 bg-[var(--paper)] border-[4px] border-[var(--ink)] px-3 sm:px-5 py-3 sm:py-4 max-w-[520px] w-full hover:bg-[var(--yellow)] active:bg-[var(--yellow)] transition-colors cursor-pointer touch-manipulation text-left"
        style={{ fontFamily: "'Courier Prime', monospace" }}
      >
        <div className="relative w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] bg-[var(--paper-dark)] shrink-0 overflow-hidden">
          {src ? (
            /* eslint-disable-next-line @next/next/no-img-element */
            <img
              key={`${track.id}-${idx}-${src}`}
              src={src}
              alt=""
              className="absolute inset-0 w-full h-full object-cover"
              referrerPolicy="no-referrer"
              onError={() => {
                setIdx((i) => (i + 1 < candidates.length ? i + 1 : candidates.length))
              }}
            />
          ) : (
            <span className="absolute inset-0 flex items-center justify-center text-[var(--ink)]/50 text-xl font-black" aria-hidden>♪</span>
          )}
        </div>
        <div className="flex-1 min-w-0">
          <div className="text-[10px] sm:text-xs font-black tracking-widest text-[var(--red)] mb-0.5 sm:mb-1">
            {es ? '▶ TOCA PARA ESCUCHAR' : '▶ TAP TO PLAY'}
          </div>
          <div className="text-sm sm:text-base font-black text-[var(--ink)] truncate leading-tight" style={{ fontFamily: "'Unbounded', sans-serif" }}>
            {track.title}
            {(track.mix_name || '').trim() ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{track.mix_name}</span> : null}
          </div>
          {artistText && <div className="text-[11px] sm:text-xs text-[var(--ink)]/70 truncate">{artistText}</div>}
        </div>
        <span className="shrink-0 inline-flex items-center justify-center w-11 h-11 sm:w-12 sm:h-12 border-[3px] border-[var(--ink)] bg-[var(--red)] text-white text-lg font-black" aria-hidden>▶</span>
      </button>
    </div>
  )
}

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
  /**
   * Mapa `nombreNormalizado → slug` de artistas existentes en `public.artists`.
   * Se construye en `src/app/[lang]/charts/page.tsx` recogiendo todos los nombres
   * de los tracks visibles y consultando Supabase una sola vez. Permite que los
   * nombres de artista en las filas del chart sean enlaces INTERNOS a su ficha
   * cuando el artista existe en la base de datos (en vez de ir siempre a Beatport).
   */
  artistSlugMap?: Record<string, string>
  /** `nombreNormalizado → image_url` de sellos con logo en BD (fallback vinilo). */
  labelImageMap?: Record<string, string>
}

// Clave de agrupación para vinilos sin año conocido en Retro Vinyl Picks.
const UNKNOWN_YEAR_KEY = '__unknown_year__'

/**
 * Normalización compartida con `src/app/[lang]/charts/page.tsx` y `/api/search`:
 * minúsculas, quita acentos, colapsa separadores. El mapa `artistSlugMap` se
 * indexa con esta misma función, así que `findArtistSlug` puede mirar sin
 * preocuparse de mayúsculas/acentos/puntuación.
 */
function normalizeArtistKey(raw: string): string {
  return (raw || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

/**
 * Busca slug de artista tolerando prefijo "The" (muy habitual: "The Freestylers"
 * en el track, "freestylers" en BD). Si no hay match exacto, prueba con/sin "the".
 */
function findArtistSlug(
  name: string,
  slugMap: Record<string, string> | undefined,
): string | null {
  if (!slugMap || !name) return null
  const n = normalizeArtistKey(name)
  if (!n) return null
  if (slugMap[n]) return slugMap[n]
  const noThe = n.startsWith('the ') ? n.slice(4) : `the ${n}`
  return slugMap[noThe] || null
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

/**
 * Renderiza la lista de artistas de una fila del chart. Preferencia de enlace:
 *   1. Link INTERNO `/{lang}/artists/{slug}` si el artista existe en `public.artists`
 *      (detectado vía `slugMap`). Así descubres al DJ dentro del sitio.
 *   2. Enlace EXTERNO a su Beatport (`beatport_url`) o a su perfil genérico (`url`)
 *      si no hay ficha interna.
 *   3. Texto plano si no hay ninguna URL.
 * Acepta los tres tipos de artista de charts (`ChartTrackArtist`, `ChartFeaturedArtist`,
 * `ChartVinylArtist`) porque todos comparten `name` + URL opcional.
 */
function ArtistNames({
  artists,
  slugMap,
  lang,
}: {
  artists: (ChartTrackArtist | ChartFeaturedArtist | ChartVinylArtist)[]
  slugMap?: Record<string, string>
  lang?: Locale
}) {
  return (
    <span className="text-[var(--ink)]/70">
      {artists.map((a, i) => {
        const internalSlug = findArtistSlug(a.name, slugMap)
        const externalHref =
          ('beatport_url' in a && (a as ChartTrackArtist).beatport_url) ||
          ('url' in a && (a as ChartFeaturedArtist | ChartVinylArtist).url) ||
          ''
        return (
          <span key={i}>
            {internalSlug && lang ? (
              <Link
                href={`/${lang}/artists/${internalSlug}`}
                className="text-[var(--red)] font-bold hover:underline decoration-2 underline-offset-2 transition-colors"
                title={a.name}
              >
                {a.name}
              </Link>
            ) : externalHref ? (
              <a
                href={externalHref}
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
    beatport_url: p.link_url || null,
  }
}
function buildChartSnapshot(t: ChartTrack) {
  return {
    title: t.title, mix_name: t.mix_name || null, artists: snapshotFromArtists(t.artists),
    label: t.label || null, year: t.release_year || null, release_date: t.release_date ?? null, bpm: t.bpm || null, music_key: t.music_key || null,
    artwork_url: t.artwork_url || null, sample_url: t.sample_url || null,
    beatport_url: t.beatport_url || null,
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

function FeaturedPickRow({ pick, dict, lang, weekDate, isPlaying, onPlay, artistSlugMap, relatedRefs }: { pick: ChartFeaturedTrack; dict: any; lang: Locale; weekDate: string; isPlaying?: boolean; onPlay?: () => void; artistSlugMap?: Record<string, string>; relatedRefs?: CanonRef[] }) {
  const c = dict.charts
  const artists = Array.isArray(pick.artists) ? pick.artists : []
  const note = lang === 'es' ? pick.note_es : pick.note_en
  const cta = pickCtaLabel(c, pick)
  const mixName = (pick.mix_name || '').trim()
  const hasSample = !!(pick.sample_url || (pick.platform === 'bandcamp' && pick.link_url))
  const releaseDisp = formatTrackReleaseDisplay(pick.release_date, pick.release_year)

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
            <p className="text-xs sm:text-sm mt-0.5 break-words" style={{ fontFamily: "'Courier Prime', monospace" }}>
              <ArtistNames artists={artists} slugMap={artistSlugMap} lang={lang} />
              {pick.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{pick.label}</span></> : null}
              {releaseDisp ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap" title={c.release_year_title}>{releaseDisp}</span></> : null}
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
          <SaveTrackButton source="featured" trackId={pick.id} relatedRefs={relatedRefs} canonicalUrl={pick.link_url} snapshot={buildFeaturedSnapshot(pick)} lang={lang} size="sm" />
          <TrackShareButton
            source="featured"
            trackId={pick.id}
            weekDate={weekDate}
            lang={lang}
            shareTitle={`${pick.title} — ${artists.map((a) => a.name).filter(Boolean).join(', ')}`}
          />
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

function VinylTrackRow({ track, dict, lang, autoplay = false, artistSlugMap, labelImageMap, relatedRefs }: { track: ChartVinylTrack; dict: any; lang: Locale; autoplay?: boolean; artistSlugMap?: Record<string, string>; labelImageMap?: Record<string, string>; relatedRefs?: CanonRef[] }) {
  const c = dict.charts
  const artists = Array.isArray(track.artists) ? track.artists : []
  const note = lang === 'es' ? track.note_es : track.note_en
  const mixName = (track.mix_name || '').trim()
  const ytId = extractYouTubeId(track.youtube_url)
  const embedRef = useRef<HTMLDivElement>(null)
  const [showPlayer, setShowPlayer] = useState(autoplay)

  useEffect(() => {
    if (autoplay) setShowPlayer(true)
  }, [autoplay])

  const togglePlayer = useCallback(() => {
    setShowPlayer((prev) => {
      if (prev) return false
      requestAnimationFrame(() => {
        embedRef.current?.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      })
      return true
    })
  }, [])

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
              <ArtistNames artists={artists} slugMap={artistSlugMap} lang={lang} />
              {track.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{track.label}</span></> : null}
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

        <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center sm:gap-2 touch-manipulation">
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
          <a
            href={track.discogs_url} target="_blank" rel="noopener noreferrer"
            className="inline-flex items-center justify-center h-[36px] px-2.5 sm:h-auto sm:px-2 sm:py-1 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white active:bg-[var(--red)] transition-all no-underline touch-manipulation whitespace-nowrap"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {c.vinyl_open_discogs}
          </a>
        </div>
      </div>

      {ytId && showPlayer && (
        <div ref={embedRef} className="w-full max-w-sm">
          <LazyYouTubeEmbed
            videoId={ytId}
            title={`${track.title} — ${artists.map((a: ChartVinylArtist) => a.name).join(', ')}`}
            className="border-[3px] border-[var(--ink)]"
            autoplay
          />
        </div>
      )}
    </div>
  )
}

function ChartTrackRow({ track, dict, isPlaying, onPlay, artistSlugMap, lang, weekDate, relatedRefs }: { track: ChartTrack; dict: any; isPlaying?: boolean; onPlay?: () => void; artistSlugMap?: Record<string, string>; lang?: Locale; weekDate: string; relatedRefs?: CanonRef[] }) {
  const c = dict.charts
  const artists = Array.isArray(track.artists) ? track.artists : []
  const releaseDisp = formatTrackReleaseDisplay(track.release_date, track.release_year)

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
            <p className="text-xs sm:text-sm mt-0.5 break-words" style={{ fontFamily: "'Courier Prime', monospace" }}>
              <ArtistNames artists={artists} slugMap={artistSlugMap} lang={lang} />
              {track.label && <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{track.label}</span></>}
              {releaseDisp ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap" title={c.release_year_title}>{releaseDisp}</span></> : null}
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
          <SaveTrackButton source="chart" trackId={track.id} relatedRefs={relatedRefs} canonicalUrl={track.beatport_url} snapshot={buildChartSnapshot(track)} lang={lang} size="sm" />
          {lang && (
            <TrackShareButton
              source="chart"
              trackId={track.id}
              weekDate={weekDate}
              lang={lang}
              shareTitle={`${track.title} — ${artists.map((a) => a.name).filter(Boolean).join(', ')}`}
            />
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
  weeks,
  artistSlugMap,
  labelImageMap,
}: ChartViewProps) {
  const c = dict.charts

  const [openPicks, togglePicks, ensureOpenPicks] = useToggleSet(new Set<string>())
  const [openVinyl, toggleVinyl, ensureOpenVinyl] = useToggleSet(new Set<string>())
  const [openForty, toggleForty, ensureOpenForty] = useToggleSet(new Set<string>())

  const [autoplayVinylId, setAutoplayVinylId] = useState<string | null>(null)

  // Overlay "Toca para escuchar" pendiente para vinyl deep-links.
  const [pendingVinylPlay, setPendingVinylPlay] = useState<PendingVinylPlay | null>(null)

  const [pendingPlay, setPendingPlay] = useState<
    | { kind: 'forty' | 'picks'; weekDate: string; trackId: string }
    | null
  >(null)

  // ---- Deep-link: abrir acordeón correcto, hacer scroll al track y (opcional)
  // iniciar reproducción -----------------------------------------------------
  //
  // Dos fuentes posibles:
  //
  //   a) Hash del buscador global (⌘K): /charts#chart-row-<id> (40 Breaks o
  //      New Releases) o /charts#chart-vinyl-row-<id> (Retro Vinyl Picks).
  //      Si además lleva `?play=1`, arrancamos preview.
  //
  //   b) Link compartido de una canción: /charts?play=chart:<id>,
  //      `?play=featured:<id>` o `?play=vinyl:<id>` (sin hash). Viene de
  //      `TrackShareButton`. En este caso siempre iniciamos reproducción.
  //
  // Al montar resolvemos el target: expandimos semana/año que contiene el
  // track, hacemos scrollIntoView y destacamos la fila.
  useEffect(() => {
    if (typeof window === 'undefined') return
    const applyDeepLink = () => {
      const rawHash = window.location.hash.replace(/^#/, '')
      const search = new URLSearchParams(window.location.search)
      const playRaw = search.get('play')
      const parsed = parsePlayParam(playRaw)

      // Determina kind/id/domId y si tenemos que arrancar el player.
      let kind: 'chart' | 'vinyl' | null = null
      let trackId = ''
      let domId = ''
      // `wantsPlay` = URL pide que arranque audio, por hash+?play=1 (legacy)
      // o por ?play=<source>:<id> (link compartido).
      let wantsPlay = false
      // `forceFeatured`: si viene de ?play=featured:<id>, evita ambigüedad
      // cuando el id NO existe (caería a chart como default). Para chart
      // también podemos forzarlo así aunque el id no esté en `weeks`.
      let forceForty: 'chart' | 'featured' | null = null

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
        forceForty = parsed.source
      } else if (parsed?.kind === 'vinyl') {
        kind = 'vinyl'
        trackId = parsed.id
        domId = `chart-vinyl-row-${trackId}`
        wantsPlay = true
      }

      if (!kind || !trackId) return

      if (kind === 'vinyl') {
        let yearKey: string | null = null
        let hitTrack: ChartVinylTrack | undefined
        for (const w of weeks) {
          const hit = w.vinyl.find((v) => v.id === trackId)
          if (hit) {
            hitTrack = hit
            yearKey = typeof hit.year === 'number' && Number.isFinite(hit.year) ? String(hit.year) : UNKNOWN_YEAR_KEY
            break
          }
        }
        if (yearKey) ensureOpenVinyl(yearKey)
        if (wantsPlay && hitTrack && yearKey) {
          setPendingVinylPlay({ trackId, yearKey, track: hitTrack })
        } else if (wantsPlay) {
          setAutoplayVinylId(trackId)
        }
      } else {
        // Prefer la semana indicada en ?week= si coincide con el id; si no,
        // busca por id en todas las semanas cargadas.
        const preferredWeek = search.get('week') || ''
        let weekDate: string | null = null
        let inFeatured = forceForty === 'featured'

        if (preferredWeek) {
          const w = weeks.find((x) => x.edition.week_date === preferredWeek)
          if (w) {
            if (forceForty === 'featured' && w.featured.some((p) => p.id === trackId)) {
              weekDate = w.edition.week_date
            } else if (forceForty === 'chart' && w.tracks.some((t) => t.id === trackId)) {
              weekDate = w.edition.week_date
              inFeatured = false
            } else if (!forceForty) {
              if (w.featured.some((p) => p.id === trackId)) { weekDate = w.edition.week_date; inFeatured = true }
              else if (w.tracks.some((t) => t.id === trackId)) { weekDate = w.edition.week_date; inFeatured = false }
            }
          }
        }

        if (!weekDate) {
          for (const w of weeks) {
            if ((!forceForty || forceForty === 'featured') && w.featured.some((p) => p.id === trackId)) {
              weekDate = w.edition.week_date
              inFeatured = true
              break
            }
            if ((!forceForty || forceForty === 'chart') && w.tracks.some((t) => t.id === trackId)) {
              weekDate = w.edition.week_date
              inFeatured = false
              break
            }
          }
        }

        if (weekDate) {
          if (inFeatured) ensureOpenPicks(weekDate)
          else ensureOpenForty(weekDate)
          if (wantsPlay) {
            setPendingPlay({
              kind: inFeatured ? 'picks' : 'forty',
              weekDate,
              trackId,
            })
          }
        }
      }

      // Limpia `?play=...` (y `?week=` si lo consumimos vía share link) para
      // que un refresh no vuelva a disparar. Conservamos `?week=` cuando solo
      // se usó para navegación manual del chart.
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

      // Espera a que el acordeón renderice antes de hacer scroll+highlight.
      requestAnimationFrame(() => {
        setTimeout(() => {
          const el = document.getElementById(domId)
          if (!el) return
          el.scrollIntoView({ behavior: 'smooth', block: 'center' })
          el.classList.add('!bg-[var(--yellow)]/25')
          setTimeout(() => el.classList.remove('!bg-[var(--yellow)]/25'), 1800)
        }, 160)
      })
    }

    applyDeepLink()
    window.addEventListener('hashchange', applyDeepLink)
    return () => window.removeEventListener('hashchange', applyDeepLink)
  }, [weeks, ensureOpenVinyl, ensureOpenPicks, ensureOpenForty])

  // ---- Play-all state (delegado al provider global) ----
  const {
    previewQueue, previewIndex, previewGroupKey,
    playPreviewQueue, stopPreview,
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

    for (const w of weeks) {
      for (const t of w.tracks) {
        const k = normUrl(t.beatport_url) || fallbackKey(t.title, t.mix_name, artistsToCsv(t.artists))
        push(k, { source: 'chart', id: t.id })
      }
      for (const f of w.featured) {
        const k = normUrl(f.link_url) || fallbackKey(f.title, f.mix_name, artistsToCsv(f.artists))
        push(k, { source: 'featured', id: f.id })
      }
      for (const v of w.vinyl) {
        // OJO: `discogs_url` NO identifica una canción, sino el RELEASE completo
        // del vinilo (con varias pistas A1/A2/B1…). Si agrupásemos por ahí,
        // guardar "A1" marcaría "A2" como ya guardada y al añadir B1 el toggle
        // de grupo la consideraría "desmarcar todo" y borraría las anteriores
        // (bug reportado: "a partir de 3 YouTubes me borra la última").
        // Lo único realmente único por canción es el `youtube_url`; si no
        // existe, caemos a título+mix+artistas (que además incluye la cara/posición).
        const k = normUrl(v.youtube_url) || fallbackKey(v.title, v.mix_name, artistsToCsv(v.artists))
        push(k, { source: 'vinyl', id: v.id })
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
      for (const r of unique) {
        if (r.source === 'chart') chartByTrack.set(r.id, unique)
        else if (r.source === 'featured') featuredByTrack.set(r.id, unique)
        else if (r.source === 'vinyl') vinylByTrack.set(r.id, unique)
      }
    })

    return { chartByTrack, featuredByTrack, vinylByTrack }
  }, [weeks])

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
      else if (p.sample_url) src = previewAudioSrc(p.sample_url)
      if (!src) continue
      const artists = Array.isArray(p.artists) ? p.artists.map((a: ChartFeaturedArtist) => a.name).join(', ') : ''
      out.push({
        rowKey: `chart-row-${p.id}`,
        src,
        title: p.title,
        artist: artists,
        artworkUrl: p.artwork_url || null,
        domId: `chart-row-${p.id}`,
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
  }, [])

  const buildTrackBundle = useCallback((
    tracks: ChartTrack[],
    groups?: Map<string, CanonRef[]>,
    weekDate?: string | null,
  ): PlayAllBundle => {
    const out: PreviewTrack[] = []
    for (const t of tracks) {
      if (!t.sample_url) continue
      const artists = Array.isArray(t.artists) ? t.artists.map((a: ChartTrackArtist) => a.name).join(', ') : ''
      out.push({
        rowKey: `chart-row-${t.id}`,
        src: previewAudioSrc(t.sample_url),
        title: t.title,
        artist: artists,
        artworkUrl: t.artwork_url || null,
        domId: `chart-row-${t.id}`,
        save: {
          mode: 'ref',
          source: 'chart',
          trackId: t.id,
          relatedRefs: groups?.get(t.id),
          canonicalUrl: t.beatport_url || null,
          snapshot: buildChartSnapshot(t),
        },
        share: {
          mode: 'chart',
          source: 'chart',
          trackId: t.id,
          weekDate: weekDate ?? null,
        },
      })
    }
    return out
  }, [])

  const playFromIndex = useCallback((sectionKey: string, bundle: PlayAllBundle, index: number) => {
    if (bundle.length === 0) return
    playPreviewQueue(bundle, index, sectionKey)
  }, [playPreviewQueue])

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
    const { kind, weekDate, trackId } = pendingPlay
    const week = weeks.find((w) => w.edition.week_date === weekDate)
    if (!week) return

    if (kind === 'picks') {
      const sorted = sortFeaturedByArtist(week.featured, lang)
      const bundle = buildFeaturedBundle(sorted, canonicalGroups.featuredByTrack, weekDate)
      const rowKey = `chart-row-${trackId}`
      const idx = bundle.findIndex((m) => m.rowKey === rowKey)
      if (idx >= 0) {
        playFromIndex(`picks-${weekDate}`, bundle, idx)
      }
    } else {
      const bundle = buildTrackBundle(week.tracks, canonicalGroups.chartByTrack, weekDate)
      const rowKey = `chart-row-${trackId}`
      const idx = bundle.findIndex((m) => m.rowKey === rowKey)
      if (idx >= 0) {
        playFromIndex(`forty-${weekDate}`, bundle, idx)
      }
    }
    setPendingPlay(null)
    // canonicalGroups sale del propio render y depende de `weeks`; no hace
    // falta meterlo en deps porque `weeks` ya lo recalcula.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingPlay, weeks, lang, playFromIndex, buildFeaturedBundle, buildTrackBundle])

  // Dado un sectionKey, ¿es la cola actualmente activa del provider?
  const isGroupActive = useCallback((sectionKey: string) => previewGroupKey === sectionKey, [previewGroupKey])
  // ¿Qué rowKey se está reproduciendo ahora mismo (si coincide con este grupo)?
  const activeRowKeyFor = useCallback((sectionKey: string): string | null => {
    if (previewGroupKey !== sectionKey) return null
    return previewQueue[previewIndex]?.rowKey ?? null
  }, [previewGroupKey, previewQueue, previewIndex])

  function renderPlayAllBtn(sectionKey: string, bundle: PlayAllBundle) {
    if (bundle.length === 0) return undefined
    const isActive = isGroupActive(sectionKey)
    const current = isActive ? (previewIndex + 1) : 0
    const total = isActive ? previewQueue.length : bundle.length

    return (
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); handlePlayAllClick(sectionKey, bundle) }}
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
  // Las ediciones del chart se pueden crear vacías a principios de semana y
  // rellenarse a mitad de semana. Mientras estén a 0 temas NO se muestran en
  // «40 Breaks Vitales» para no confundir al visitante (ver conversación
  // usuario 2026-04-21: semana del 20/04 con 0 temas).
  const weeksWithTracks = weeks.filter((w) => w.tracks.length > 0)
  // `latestWeekDate` marca qué semana recibe la insignia «ACTUAL». Lo sacamos
  // de `weeksWithTracks` (no de `weeks`) para que, si la semana más reciente
  // está vacía y por tanto oculta, la insignia caiga en la última con datos.
  const latestWeekDate = weeksWithTracks[0]?.edition.week_date ?? ''

  // Retro Vinyl Picks: se agrupan por año de lanzamiento (archivo histórico),
  // no por semana. Al añadir un vinilo nuevo, se archiva en su año correspondiente.
  const vinylByYear = new Map<string, ChartVinylTrack[]>()
  for (const w of weeks) {
    for (const v of w.vinyl) {
      const yearKey = typeof v.year === 'number' && Number.isFinite(v.year) ? String(v.year) : UNKNOWN_YEAR_KEY
      const arr = vinylByYear.get(yearKey) ?? []
      const dedupKey = vinylTrackDedupKey(v.title, v.mix_name, v.artists)
      const existingIdx = arr.findIndex(
        (t) => vinylTrackDedupKey(t.title, t.mix_name, t.artists) === dedupKey,
      )
      if (existingIdx === -1) {
        arr.push(v)
      } else if (vinylRowDisplayScore(v) > vinylRowDisplayScore(arr[existingIdx])) {
        arr[existingIdx] = v
      }
      vinylByYear.set(yearKey, arr)
    }
  }
  // Orden descendente por año (más reciente primero); "sin año" al final.
  const sortedVinylYears = Array.from(vinylByYear.keys()).sort((a, b) => {
    if (a === UNKNOWN_YEAR_KEY) return 1
    if (b === UNKNOWN_YEAR_KEY) return -1
    return Number(b) - Number(a)
  })

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
              const picksBundle = buildFeaturedBundle(featuredSorted, canonicalGroups.featuredByTrack, edition.week_date)
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
                    const rowKey = `chart-row-${pick.id}`
                    const idx = picksBundle.findIndex((m) => m.rowKey === rowKey)
                    const isActive = activeRowKeyFor(picksKey) === rowKey
                    return (
                      <FeaturedPickRow
                        key={pick.id}
                        pick={pick}
                        dict={dict}
                        lang={lang}
                        weekDate={edition.week_date}
                        isPlaying={isActive}
                        onPlay={idx >= 0 ? () => playFromIndex(picksKey, picksBundle, idx) : undefined}
                        artistSlugMap={artistSlugMap}
                        relatedRefs={canonicalGroups.featuredByTrack.get(pick.id)}
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
      {/* SECTION 2 — 40 Breaks Vitales (Beatport chart)                   */}
      {/* ================================================================ */}
      <section className="mb-12 sm:mb-16">
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
          {weeksWithTracks.map((bundle, index) => {
            const { edition, tracks } = bundle
            const isLatest = edition.week_date === latestWeekDate
            const description = lang === 'es' ? edition.description_es : edition.description_en
            const fortyBundle = buildTrackBundle(tracks, canonicalGroups.chartByTrack, edition.week_date)
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
                    const rowKey = `chart-row-${track.id}`
                    const idx = fortyBundle.findIndex((m) => m.rowKey === rowKey)
                    const isActive = activeRowKeyFor(fortyKey) === rowKey
                    return (
                      <ChartTrackRow
                        key={track.id}
                        track={track}
                        dict={dict}
                        lang={lang}
                        weekDate={edition.week_date}
                        isPlaying={isActive}
                        onPlay={idx >= 0 ? () => playFromIndex(fortyKey, fortyBundle, idx) : undefined}
                        artistSlugMap={artistSlugMap}
                        relatedRefs={canonicalGroups.chartByTrack.get(track.id)}
                      />
                    )
                  })}
                </div>
              </WeekAccordion>
            )
          })}
        </div>
      </section>

      {/* ================================================================ */}
      {/* SECTION 3 — Retro Vinyl Picks (Discogs + YouTube)                */}
      {/* Agrupado por año de lanzamiento (archivo histórico), no por semana */}
      {/* ================================================================ */}
      {sortedVinylYears.length > 0 && (
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
            {sortedVinylYears.map((yearKey) => {
              const tracks = sortVinylByArtist(vinylByYear.get(yearKey) ?? [], lang)
              const expanded = openVinyl.has(yearKey)
              const yearLabel = yearKey === UNKNOWN_YEAR_KEY ? c.vinyl_year_unknown : yearKey
              const panelId = `vinyl-year-panel-${yearKey}`
              const triggerId = `vinyl-year-trigger-${yearKey}`

              return (
                <section
                  key={`vinyl-year-${yearKey}`}
                  className="border-[3px] border-[var(--ink)] bg-[var(--paper)] overflow-hidden"
                >
                  <button
                    type="button"
                    id={triggerId}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => toggleVinyl(yearKey)}
                    className="w-full flex items-center gap-2 sm:gap-3 text-left px-3 py-3 sm:px-4 sm:py-3.5 min-h-[52px] hover:bg-[var(--yellow)]/15 active:bg-[var(--yellow)]/25 transition-colors touch-manipulation"
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
                      {c.vinyl_count.replace('{n}', String(tracks.length))}
                    </span>
                  </button>

                  {expanded && (
                    <div id={panelId} role="region" aria-labelledby={triggerId}>
                      {tracks.map((track) => (
                        <VinylTrackRow
                          key={track.id}
                          track={track}
                          dict={dict}
                          lang={lang}
                          autoplay={autoplayVinylId === track.id}
                          artistSlugMap={artistSlugMap}
                          labelImageMap={labelImageMap}
                          relatedRefs={canonicalGroups.vinylByTrack.get(track.id)}
                        />
                      ))}
                    </div>
                  )}
                </section>
              )
            })}
          </div>
        </section>
      )}

      {/* ================================================================ */}
      {/* SECTION 4 — Top de la Comunidad (all-time)                       */}
      {/* Las canciones más añadidas a "Mis Tracks" por toda la comunidad.  */}
      {/* Hace fetch a /api/public/charts/community-monthly (slug histórico, */}
      {/* ahora devuelve all-time). Ver `CommunityMonthlyTop.tsx`.          */}
      {/* ================================================================ */}
      <CommunityMonthlyTop lang={lang} dict={dict} />

      <footer className="px-4 sm:px-0 mt-8 text-center">
        <p className="text-[10px] text-[var(--ink)]/30 tracking-[3px] font-bold" style={{ fontFamily: "'Courier Prime', monospace" }}>
          OPTIMAL BREAKS — 40 BREAKS VITALES
        </p>
      </footer>
      {/* La barra flotante de now-playing la monta `DeckAudioProvider`
          (modo `preview`) para que siga sonando al cambiar de ruta. */}

      {pendingVinylPlay && (
        <VinylAutoplayOverlay
          pending={pendingVinylPlay}
          lang={lang}
          onPlay={() => {
            const { trackId, yearKey } = pendingVinylPlay
            ensureOpenVinyl(yearKey)
            setAutoplayVinylId(trackId)
            setPendingVinylPlay(null)
          }}
          onDismiss={() => setPendingVinylPlay(null)}
        />
      )}
    </div>
  )
}
