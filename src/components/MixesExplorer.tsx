'use client'

import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import CardThumbnail from '@/components/CardThumbnail'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import type { Mix } from '@/types/database'
import FavoriteButton from '@/components/FavoriteButton'
import { useDeckAudio, type MixTrack } from '@/components/DeckAudioProvider'
import { buildSoundCloudVisualPlayerSrc, isSoundCloudTrackEmbedUrl } from '@/components/SoundCloudVisualEmbed'

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

/** Monta el iframe solo al acercarse al viewport (orden DOM = años recientes primero). Evita 40+ embeds a la vez. */
function LazyYouTubeEmbed({ videoId, title, className = '' }: { videoId: string; title: string; className?: string }) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [mountIframe, setMountIframe] = useState(false)

  useEffect(() => {
    const el = rootRef.current
    if (!el || mountIframe) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMountIframe(true)
          obs.disconnect()
        }
      },
      { root: null, rootMargin: '380px 0px', threshold: 0.01 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [mountIframe])

  return (
    <div ref={rootRef} className={`relative w-full aspect-video bg-black overflow-hidden ${className}`}>
      {mountIframe ? (
        <iframe
          src={`https://www.youtube.com/embed/${videoId}?rel=0`}
          title={title}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
          allowFullScreen
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <div className="absolute inset-0 bg-black" aria-hidden />
      )}
    </div>
  )
}

/** Misma estrategia que YouTube: iframe SoundCloud solo cuando entra en zona visible. */
function LazySoundCloudEmbed({
  trackUrl,
  title,
  height = 300,
  className = '',
}: {
  trackUrl: string
  title: string
  height?: number
  className?: string
}) {
  const rootRef = useRef<HTMLDivElement>(null)
  const [mountIframe, setMountIframe] = useState(false)
  const src = buildSoundCloudVisualPlayerSrc(trackUrl)

  useEffect(() => {
    const el = rootRef.current
    if (!el || mountIframe) return
    const obs = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          setMountIframe(true)
          obs.disconnect()
        }
      },
      { root: null, rootMargin: '380px 0px', threshold: 0.01 },
    )
    obs.observe(el)
    return () => obs.disconnect()
  }, [mountIframe])

  return (
    <div
      ref={rootRef}
      className={`relative w-full shrink-0 overflow-hidden bg-[var(--paper-dark)] ${className}`}
      style={{ height, minHeight: height }}
    >
      {mountIframe ? (
        <iframe
          title={title}
          src={src}
          allow="autoplay"
          loading="lazy"
          referrerPolicy="strict-origin-when-cross-origin"
          className="absolute inset-0 h-full w-full border-0"
        />
      ) : (
        <div className="absolute inset-0 bg-[var(--paper-dark)]" aria-hidden />
      )}
    </div>
  )
}

/** Fecha de publicación (YouTube) o año catalogado + duración opcional. */
function formatMixDateLine(m: Mix, lang: string): string {
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const published = m.published_at
  const datePart = published
    ? new Date(published).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : m.year != null
      ? String(m.year)
      : '—'
  const dur = m.duration_minutes != null ? ` · ${m.duration_minutes} min` : ''
  return `${datePart}${dur}`
}

function getMixTrack(m: Mix): MixTrack | null {
  const audioUrl = (m as any).audio_url as string | null | undefined
  if (audioUrl) {
    return { id: m.id, title: m.title, artist: m.artist_name, imageUrl: m.image_url, source: 'mp3', src: audioUrl }
  }
  if (m.embed_url?.includes('soundcloud.com')) {
    return { id: m.id, title: m.title, artist: m.artist_name, imageUrl: m.image_url, source: 'soundcloud', src: m.embed_url }
  }
  if (m.embed_url && /\.mp3(\?|$)/i.test(m.embed_url)) {
    return { id: m.id, title: m.title, artist: m.artist_name, imageUrl: m.image_url, source: 'mp3', src: m.embed_url }
  }
  return null
}

function MixPlayButton({ mix, size = 'lg' }: { mix: Mix; size?: 'lg' | 'sm' | 'xs' }) {
  const { playMix, currentMix, mixPlaying } = useDeckAudio()
  const track = getMixTrack(mix)
  if (!track) return null

  const isThisMix = currentMix?.id === mix.id
  const label = isThisMix && mixPlaying ? '■ STOP' : '▶ PLAY'

  const sizeClass = size === 'lg'
    ? 'absolute bottom-3 right-3'
    : size === 'sm'
      ? 'mt-2'
      : ''

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        playMix(track)
      }}
      className={`${sizeClass} bg-[var(--ink)] text-[var(--yellow)] hover:bg-[var(--red)] hover:text-white transition-colors cursor-pointer border-0 ${isThisMix && mixPlaying ? 'animate-pulse' : ''}`}
      style={{
        fontFamily: "'Courier Prime', monospace",
        fontWeight: 700,
        fontSize: size === 'lg' ? '11px' : size === 'sm' ? '9px' : '9px',
        letterSpacing: size === 'lg' ? '2px' : '1px',
        padding: size === 'lg' ? '4px 12px' : '2px 8px',
        transform: size === 'lg' ? 'rotate(2deg)' : undefined,
      }}
    >
      {label}
    </button>
  )
}

export { getMixTrack }

type YearGroupKey = number | 'undated'

/** Año calendario UTC de publicación en YouTube; si no hay `published_at`, el año catalogado (`mix.year`). */
function mixGroupYear(m: Mix): number | null {
  if (m.published_at) {
    const d = new Date(m.published_at)
    if (!Number.isNaN(d.getTime())) return d.getUTCFullYear()
  }
  if (m.year != null && Number.isFinite(Number(m.year))) return Number(m.year)
  return null
}

function mixSortTimestamp(m: Mix): number {
  if (m.published_at) {
    const t = new Date(m.published_at).getTime()
    if (!Number.isNaN(t)) return t
  }
  const c = new Date(m.created_at).getTime()
  return Number.isNaN(c) ? 0 : c
}

/** Años numéricos primero (más reciente arriba); «undated» al final. Dentro de cada año: más reciente primero. */
function groupMixesByPublicationYear(items: Mix[]): { key: YearGroupKey; items: Mix[] }[] {
  const map = new Map<YearGroupKey, Mix[]>()
  for (const m of items) {
    const y = mixGroupYear(m)
    const k: YearGroupKey = y == null ? 'undated' : y
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(m)
  }
  const numeric = Array.from(map.keys()).filter((k): k is number => k !== 'undated')
  numeric.sort((a, b) => b - a)
  const sortWithin = (row: Mix[]) => [...row].sort((a, b) => mixSortTimestamp(b) - mixSortTimestamp(a))
  const out: { key: YearGroupKey; items: Mix[] }[] = numeric.map((k) => ({
    key: k,
    items: sortWithin(map.get(k)!),
  }))
  const und = map.get('undated')
  if (und && und.length > 0) out.push({ key: 'undated', items: sortWithin(und) })
  return out
}

/** Filtro por año de publicación/catalogación; `undated` = sin año asignable. */
type YearFilterValue = 'all' | 'undated' | number

type MixFilterDict = {
  search_placeholder: string
  year_label: string
  all_years: string
  undated: string
  platform_label: string
  all_platforms: string
  platform_youtube: string
  platform_soundcloud: string
  platform_mixcloud: string
  platform_other: string
  showing: string
  no_results: string
  clear_filters: string
}

const PLATFORM_ORDER = ['youtube', 'soundcloud', 'mixcloud', 'other'] as const satisfies readonly Mix['platform'][]

function platformChipLabel(mf: MixFilterDict, p: Mix['platform']): string {
  const key = `platform_${p}` as keyof MixFilterDict
  const v = mf[key]
  return typeof v === 'string' ? v : p
}

interface Props {
  mixes: Mix[]
  dict: {
    view_large: string
    view_compact: string
    view_list: string
    year_undated?: string
    mix_filter?: MixFilterDict
  }
  lang: string
}

export default function MixesExplorer({ mixes, dict, lang }: Props) {
  const [view, setView] = useState<ViewMode>('compact')
  const [search, setSearch] = useState('')
  const [yearFilter, setYearFilter] = useState<YearFilterValue>('all')
  const [platform, setPlatform] = useState<'all' | Mix['platform']>('all')

  const mf = dict.mix_filter

  const distinctPlatforms = useMemo(() => {
    const s = new Set<Mix['platform']>()
    mixes.forEach((m) => {
      if (m.platform) s.add(m.platform)
    })
    return Array.from(s).sort(
      (a, b) => PLATFORM_ORDER.indexOf(a) - PLATFORM_ORDER.indexOf(b),
    )
  }, [mixes])

  const distinctYears = useMemo(() => {
    const s = new Set<number>()
    mixes.forEach((m) => {
      const y = mixGroupYear(m)
      if (y != null) s.add(y)
    })
    return Array.from(s).sort((a, b) => b - a)
  }, [mixes])

  const hasUndatedMixes = useMemo(
    () => mixes.some((m) => mixGroupYear(m) == null),
    [mixes],
  )

  const isMixVisible = useCallback(
    (m: Mix) => {
      const q = search.toLowerCase().trim()
      if (q) {
        const title = (m.title || '').toLowerCase()
        const artist = (m.artist_name || '').toLowerCase()
        if (!title.includes(q) && !artist.includes(q)) return false
      }
      const gy = mixGroupYear(m)
      if (yearFilter === 'undated') {
        if (gy != null) return false
      } else if (typeof yearFilter === 'number') {
        if (gy !== yearFilter) return false
      }
      if (platform !== 'all' && m.platform !== platform) return false
      return true
    },
    [search, yearFilter, platform],
  )

  const filtered = useMemo(() => mixes.filter(isMixVisible), [mixes, isMixVisible])

  /** Siempre el catálogo completo por años: las filas ocultas con `hidden` mantienen iframes ya cargados al quitar filtros. */
  const yearGroups = useMemo(() => groupMixesByPublicationYear(mixes), [mixes])

  const hasNonDefaultFilters =
    search.trim() !== '' || yearFilter !== 'all' || platform !== 'all'

  const chipBase =
    'cursor-pointer border-[3px] border-[var(--ink)] px-2.5 py-1 transition-colors text-[9px] sm:text-[10px] font-bold uppercase tracking-wider'
  const chipFont: CSSProperties = {
    fontFamily: "'Courier Prime', monospace",
  }

  function clearFilters() {
    setSearch('')
    setYearFilter('all')
    setPlatform('all')
  }

  return (
    <div>
      {mf ? (
        <div className="mb-6 space-y-4 border-b-[3px] border-[var(--ink)] pb-6">
          <div className="relative max-w-md">
            <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
              <circle cx="11" cy="11" r="8" />
              <path d="m21 21-4.3-4.3" strokeLinecap="round" />
            </svg>
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder={mf.search_placeholder}
              className="w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-4 pl-10 py-2 text-sm focus:outline-none focus:border-[var(--red)] transition-colors"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700 }}
            />
          </div>

          <div className="flex flex-wrap items-center gap-2 gap-y-3">
            <span
              className="shrink-0 text-[var(--dim)] mr-1"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase' }}
            >
              {mf.year_label}
            </span>
            <button
              type="button"
              style={chipFont}
              className={`${chipBase} ${yearFilter === 'all' ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-[var(--paper)] hover:bg-[var(--yellow)]'}`}
              onClick={() => setYearFilter('all')}
            >
              {mf.all_years}
            </button>
            {distinctYears.map((y) => (
              <button
                key={y}
                type="button"
                style={chipFont}
                className={`${chipBase} ${yearFilter === y ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-[var(--paper)] hover:bg-[var(--yellow)]'}`}
                onClick={() => setYearFilter(y)}
              >
                {y}
              </button>
            ))}
            {hasUndatedMixes ? (
              <button
                type="button"
                style={chipFont}
                className={`${chipBase} ${yearFilter === 'undated' ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-[var(--paper)] hover:bg-[var(--yellow)]'}`}
                onClick={() => setYearFilter('undated')}
              >
                {mf.undated}
              </button>
            ) : null}
          </div>

          {distinctPlatforms.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 gap-y-3">
              <span
                className="shrink-0 text-[var(--dim)] mr-1"
                style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase' }}
              >
                {mf.platform_label}
              </span>
              <button
                type="button"
                style={chipFont}
                className={`${chipBase} ${platform === 'all' ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-[var(--paper)] hover:bg-[var(--yellow)]'}`}
                onClick={() => setPlatform('all')}
              >
                {mf.all_platforms}
              </button>
              {distinctPlatforms.map((p) => (
                <button
                  key={p}
                  type="button"
                  style={chipFont}
                  className={`${chipBase} ${platform === p ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-[var(--paper)] hover:bg-[var(--yellow)]'}`}
                  onClick={() => setPlatform(p)}
                >
                  {platformChipLabel(mf, p)}
                </button>
              ))}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-3 gap-y-2">
            <p
              className="text-[var(--dim)] m-0"
              style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }}
            >
              {mf.showing.replace('{n}', String(filtered.length)).replace('{total}', String(mixes.length))}
            </p>
            {hasNonDefaultFilters ? (
              <button
                type="button"
                onClick={clearFilters}
                style={chipFont}
                className={`${chipBase} bg-[var(--paper)] hover:bg-[var(--yellow)]`}
              >
                ✕ {mf.clear_filters}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}

      <div className="flex justify-end mb-5">
        <ViewToggle view={view} setView={setView} labels={dict} />
      </div>

      {filtered.length === 0 ? (
        <p
          className="py-12 text-center text-[var(--dim)] border-4 border-[var(--ink)] border-dashed px-4"
          style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px' }}
        >
          {mf?.no_results ?? '—'}
        </p>
      ) : (
        <div className="space-y-10 sm:space-y-14">
          {yearGroups.map(({ key, items }, idx) => {
            const title = key === 'undated' ? (dict.year_undated ?? '—') : String(key)
            const sectionHasVisible = items.some(isMixVisible)
            return (
              <section key={String(key)} aria-labelledby={`mixes-year-${key}`} hidden={!sectionHasVisible}>
                <h2
                  id={`mixes-year-${key}`}
                  className={`mt-0 mb-4 sm:mb-5 pb-3 border-b-[4px] border-[var(--ink)] ${idx === 0 ? '' : 'pt-2'}`}
                  style={{
                    fontFamily: "'Unbounded', sans-serif",
                    fontWeight: 900,
                    fontSize: 'clamp(26px, 4.5vw, 40px)',
                    letterSpacing: '-0.04em',
                    lineHeight: 1.05,
                  }}
                >
                  {title}
                </h2>
                {view === 'large' ? (
                  <LargeGrid mixes={items} lang={lang} isMixVisible={isMixVisible} />
                ) : view === 'compact' ? (
                  <CompactGrid mixes={items} lang={lang} isMixVisible={isMixVisible} />
                ) : (
                  <ListView mixes={items} lang={lang} isMixVisible={isMixVisible} />
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function PlayLink({ mix }: { mix: Mix }) {
  const track = getMixTrack(mix)
  if (track) return <MixPlayButton mix={mix} size="lg" />
  if (mix.embed_url) {
    return (
      <a href={mix.embed_url} target="_blank" rel="noopener noreferrer" className="absolute bottom-3 right-3 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', padding: '4px 12px', transform: 'rotate(2deg)' }}>
        ▶ PLAY
      </a>
    )
  }
  return (
    <div className="absolute bottom-3 right-3 bg-[var(--ink)] text-[var(--yellow)]" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', padding: '4px 12px', transform: 'rotate(2deg)' }}>
      ▶ {mix.platform?.toUpperCase()}
    </div>
  )
}

function LargeGrid({
  mixes,
  lang,
  isMixVisible,
}: {
  mixes: Mix[]
  lang: string
  isMixVisible: (m: Mix) => boolean
}) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
      {mixes.map((m) => {
        const ytId = extractYouTubeId(m.video_url)
        const scTrackUrl = !ytId && isSoundCloudTrackEmbedUrl(m.embed_url) ? m.embed_url!.trim() : null
        const visible = isMixVisible(m)
        return (
          <div
            key={m.id}
            hidden={!visible}
            className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] overflow-hidden group"
          >
            <FavoriteButton type="mix" entityId={m.id} lang={lang} />
            {ytId ? (
              <LazyYouTubeEmbed videoId={ytId} title={m.title} />
            ) : scTrackUrl ? (
              <LazySoundCloudEmbed trackUrl={scTrackUrl} title={m.title} height={300} />
            ) : (
              <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-[16/10]" />
            )}
            <div className="p-5 sm:p-7 relative">
              <div className="absolute -top-[6px] left-[20px] w-[60px] h-[18px] z-[1]" style={{ background: 'var(--tape)', transform: 'rotate(-2deg)' }} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="cutout red" style={{ margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                  {formatMixDateLine(m, lang)}
                </span>
              </div>
              <div className="mt-3" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {m.title}
              </div>
              <div className="mt-2" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>
                {m.artist_name}
              </div>
              {ytId ? (
                <a
                  href={m.video_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors"
                  style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}
                >
                  YouTube ↗
                </a>
              ) : scTrackUrl ? (
                <a
                  href={scTrackUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors"
                  style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}
                >
                  SoundCloud ↗
                </a>
              ) : (
                <PlayLink mix={m} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CompactGrid({
  mixes,
  lang,
  isMixVisible,
}: {
  mixes: Mix[]
  lang: string
  isMixVisible: (m: Mix) => boolean
}) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
      {mixes.map((m) => {
        const ytId = extractYouTubeId(m.video_url)
        const scTrackUrl = !ytId && isSoundCloudTrackEmbedUrl(m.embed_url) ? m.embed_url!.trim() : null
        const visible = isMixVisible(m)
        return (
          <div
            key={m.id}
            hidden={!visible}
            className="border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group flex flex-col overflow-hidden relative"
          >
            <FavoriteButton type="mix" entityId={m.id} lang={lang} />
            {ytId ? (
              <LazyYouTubeEmbed videoId={ytId} title={m.title} className="border-b-[3px] border-[var(--ink)]" />
            ) : scTrackUrl ? (
              <LazySoundCloudEmbed
                trackUrl={scTrackUrl}
                title={m.title}
                height={220}
                className="border-b-[3px] border-[var(--ink)]"
              />
            ) : (
              <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" />
            )}
            <div className="p-3 flex flex-col flex-grow min-h-0">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '11px', color: 'var(--red)' }}>
                {m.artist_name}
              </div>
              <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                {m.title}
              </div>
              <div className="flex flex-wrap gap-1 mt-1 items-center">
                <span className="cutout red" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', color: 'var(--dim)' }}>
                  {formatMixDateLine(m, lang)}
                </span>
              </div>
              {ytId ? (
                <a href={m.video_url!} target="_blank" rel="noopener noreferrer" className="mt-2 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors text-center" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '2px 6px' }}>
                  YouTube ↗
                </a>
              ) : scTrackUrl ? (
                <a href={scTrackUrl} target="_blank" rel="noopener noreferrer" className="mt-2 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors text-center" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '2px 6px' }}>
                  SoundCloud ↗
                </a>
              ) : getMixTrack(m) ? (
                <MixPlayButton mix={m} size="sm" />
              ) : m.embed_url ? (
                <a href={m.embed_url} target="_blank" rel="noopener noreferrer" className="mt-2 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors text-center" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '2px 6px' }}>
                  ▶ PLAY
                </a>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListView({
  mixes,
  lang,
  isMixVisible,
}: {
  mixes: Mix[]
  lang: string
  isMixVisible: (m: Mix) => boolean
}) {
  return (
    <div className="border-4 border-[var(--ink)]">
      {mixes.map((m) => {
        const ytId = extractYouTubeId(m.video_url)
        const scTrackUrl = !ytId && isSoundCloudTrackEmbedUrl(m.embed_url) ? m.embed_url!.trim() : null
        const visible = isMixVisible(m)
        if (ytId) {
          return (
            <div
              key={m.id}
              hidden={!visible}
              className="border-b-[2px] border-[var(--ink)] px-4 sm:px-6 py-4 sm:py-5 transition-all duration-150 hover:bg-[var(--yellow)]/40 relative"
            >
              <FavoriteButton type="mix" entityId={m.id} lang={lang} />
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cutout red" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                    <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>
                      {m.published_at
                        ? new Date(m.published_at).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : m.year ?? '—'}
                    </span>
                  </div>
                  <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 2.5vw, 18px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.15 }}>
                    {m.title}
                  </div>
                  <div className="mt-1" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>
                    {m.artist_name}
                  </div>
                  <a
                    href={m.video_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors"
                    style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 10px' }}
                  >
                    YouTube ↗
                  </a>
                </div>
                <div className="w-full shrink-0 lg:max-w-md lg:w-[min(100%,420px)]">
                  <LazyYouTubeEmbed videoId={ytId} title={m.title} className="border-[3px] border-[var(--ink)]" />
                </div>
              </div>
            </div>
          )
        }
        if (scTrackUrl) {
          return (
            <div
              key={m.id}
              hidden={!visible}
              className="border-b-[2px] border-[var(--ink)] px-4 sm:px-6 py-4 sm:py-5 transition-all duration-150 hover:bg-[var(--yellow)]/40 relative"
            >
              <FavoriteButton type="mix" entityId={m.id} lang={lang} />
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cutout red" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                    <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>
                      {m.published_at
                        ? new Date(m.published_at).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : m.year ?? '—'}
                    </span>
                  </div>
                  <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 2.5vw, 18px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.15 }}>
                    {m.title}
                  </div>
                  <div className="mt-1" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>
                    {m.artist_name}
                  </div>
                  <a
                    href={scTrackUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors"
                    style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 10px' }}
                  >
                    SoundCloud ↗
                  </a>
                </div>
                <div className="w-full shrink-0 lg:max-w-md lg:w-[min(100%,420px)]">
                  <LazySoundCloudEmbed trackUrl={scTrackUrl} title={m.title} height={300} className="border-[3px] border-[var(--ink)]" />
                </div>
              </div>
            </div>
          )
        }
        return (
          <div
            key={m.id}
            hidden={!visible}
            className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 border-b-[2px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group relative"
          >
            <FavoriteButton type="mix" entityId={m.id} lang={lang} className="!top-1/2 !-translate-y-1/2 !right-3" />
            <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 overflow-hidden border-[2px] border-[var(--ink)] relative">
              <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" frameClass="" />
            </div>
            <div className="flex-grow min-w-0">
              <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
                {m.title}
              </div>
              <div className="mt-[2px]" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>
                {m.artist_name}
              </div>
            </div>
            <div className="hidden sm:flex gap-2 shrink-0 items-center">
              <span className="cutout red" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
              <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>
                {m.published_at
                  ? new Date(m.published_at).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : m.year ?? '—'}
              </span>
              {getMixTrack(m) ? (
                <MixPlayButton mix={m} size="xs" />
              ) : m.embed_url ? (
                <a href={m.embed_url} target="_blank" rel="noopener noreferrer" className="bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '2px 8px' }}>
                  ▶
                </a>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
