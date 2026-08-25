'use client'

// ============================================
// OPTIMAL BREAKS — Artist Showcase (home)
// Escenario oscuro con título sticky, portadas gigantes por artista
// (bandera, waveform, géneros, fans y botón de play) y luz ambiental.
// Todo el movimiento es CSS puro; un IntersectionObserver marca
// el artista activo para el índice sticky.
// ============================================

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import { useAudioEngineGate } from '@/components/LazyDeckAudioProvider'
import type { PreviewTrack } from '@/components/DeckAudioProvider'
import { displayImageUrl } from '@/lib/image-url'
import CountryBadge from '@/components/CountryBadge'
import {
  buildBeatportSharePath,
  extractBeatportTrackId,
  trackStoryMeta,
} from '@/lib/share-track'
import type { BeatportTopTrack, SavedChartTrackSnapshot } from '@/types/database'

export type ShowcaseArtist = {
  slug: string
  /** UUID en `artists` — origen del snapshot al guardar en Mis Tracks. */
  artistId: string | null
  name: string
  desc: string
  genres: string[]
  imageUrl: string | null
  /** Código o nombre de país en BD (RU, UK, Russia, AU/UK…). */
  country: string | null
  fans: number
  /** Si falta, la tarjeta no enlaza a ficha (artista del roster sin página). */
  href: string | null
  tracks: BeatportTopTrack[]
}

function buildSnapshot(
  t: BeatportTopTrack,
  origin?: { kind: 'artist'; id: string; slug?: string; name?: string },
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

interface Props {
  lang: string
  tag: string
  title1: string
  title2: string
  seeAll?: string
  seeAllHref?: string
  artists: ShowcaseArtist[]
  /** Prefijo de ids/grupos de audio. Default: home. */
  idPrefix?: string
  /**
   * `stage` (home): pila vertical en móvil, carrusel en desktop.
   * `rail`: carrusel horizontal en todos los anchos (fichas de sello).
   */
  layout?: 'stage' | 'rail'
  /** Ruta de vuelta del mini reproductor. Default: home del idioma. */
  originPath?: string
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

/** Alturas de waveform deterministas por slug (idénticas en SSR y cliente). */
function seededBars(slug: string, n = 28): number[] {
  let h = 2166136261
  for (let i = 0; i < slug.length; i++) {
    h ^= slug.charCodeAt(i)
    h = Math.imul(h, 16777619)
  }
  const out: number[] = []
  for (let i = 0; i < n; i++) {
    h = Math.imul(h ^ (h >>> 13), 1597334677)
    out.push(0.22 + ((h >>> 0) % 1000) / 1000 * 0.78)
  }
  return out
}

const pad2 = (n: number) => String(n).padStart(2, '0')

export default function ArtistShowcase({
  lang,
  tag,
  title1,
  title2,
  seeAll,
  seeAllHref = '/artists',
  artists,
  idPrefix = 'home-artist',
  layout = 'stage',
  originPath,
}: Props) {
  const es = lang === 'es'
  const alwaysRail = layout === 'rail'
  const sectionRef = useRef<HTMLElement>(null)
  const railRef = useRef<HTMLDivElement>(null)
  const [active, setActive] = useState(0)

  const gate = useAudioEngineGate()
  const {
    previewQueue, previewIndex, previewPlaying, previewGroupKey,
    playPreviewQueue, togglePreview,
  } = usePreviewAudioGated()

  // Precarga el motor de audio cuando la sección se acerca al viewport.
  // Sin esto, el primer play llega con el motor sin cargar: el play() real
  // se ejecuta fuera del gesto del usuario, el navegador lo bloquea y
  // aparece el overlay "Toca para escuchar" tapando la portada.
  useEffect(() => {
    const root = sectionRef.current
    if (!root) return
    const warm = new IntersectionObserver((entries) => {
      if (entries.some((e) => e.isIntersecting)) {
        void gate.requestLoad()
        warm.disconnect()
      }
    }, { rootMargin: '400px' })
    warm.observe(root)
    return () => warm.disconnect()
  }, [gate])

  const groupKeyOf = (slug: string) => `${idPrefix}:${slug}`
  const activeGroupSlug = previewGroupKey?.startsWith(`${idPrefix}:`)
    ? previewGroupKey.slice(idPrefix.length + 1)
    : null

  const playArtist = useCallback((a: ShowcaseArtist) => {
    const key = groupKeyOf(a.slug)
    if (previewGroupKey === key && previewQueue.length > 0) {
      togglePreview()
      return
    }
    const sharePathBase = a.href || `/${lang}/artists/${a.slug}`
    const origin = a.artistId
      ? { kind: 'artist' as const, id: a.artistId, slug: a.slug, name: a.name }
      : undefined
    const queue: PreviewTrack[] = a.tracks.map((t, i) => {
      const bpId = extractBeatportTrackId(t.beatport_url) ?? undefined
      const sharePath = bpId ? buildBeatportSharePath(sharePathBase, bpId) : null
      const storyMeta = trackStoryMeta({
        title: t.title,
        mix_name: t.mix_name,
        artists: t.artists.map((x) => x.name).filter(Boolean).join(', '),
        label: t.label,
        year: t.release_year,
        artwork_url: t.artwork_url,
      })
      return {
        rowKey: `${a.slug}-${i}`,
        src: proxyUrl(t.sample_url!),
        title: t.title,
        artist: t.artists.map((x) => x.name).join(', '),
        artworkUrl: t.artwork_url || null,
        domId: `${idPrefix}-${a.slug}`,
        // Vuelta al origen desde el mini reproductor: la tarjeta del artista
        // en la home (las pistas del showcase no tienen fila propia).
        originPath: originPath || `/${lang}`,
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
          ? { mode: 'path' as const, path: sharePath, storyMeta }
          : t.beatport_url
            ? { mode: 'url' as const, externalUrl: t.beatport_url, storyMeta }
            : undefined,
      }
    })
    if (queue.length > 0) playPreviewQueue(queue, 0, key)
  }, [idPrefix, lang, originPath, previewGroupKey, previewQueue.length, togglePreview, playPreviewQueue])

  // Índice sticky: móvil = scroll vertical; desktop = carrusel horizontal.
  useEffect(() => {
    const root = sectionRef.current
    const rail = railRef.current
    if (!root || !rail) return
    const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-obx-card]'))

    const mq = window.matchMedia('(min-width: 1024px)')
    let vTracker: IntersectionObserver | null = null
    let onScroll: (() => void) | null = null

    const setup = () => {
      vTracker?.disconnect()
      vTracker = null
      if (onScroll) { rail.removeEventListener('scroll', onScroll); onScroll = null }

      if (alwaysRail || mq.matches) {
        onScroll = () => {
          const startSnap = alwaysRail && !mq.matches
          const mark = startSnap ? rail.scrollLeft : rail.scrollLeft + rail.clientWidth / 2
          let best = 0
          let dist = Infinity
          cards.forEach((c, i) => {
            const pos = startSnap ? c.offsetLeft : c.offsetLeft + c.offsetWidth / 2
            const d = Math.abs(pos - mark)
            if (d < dist) { dist = d; best = i }
          })
          setActive(best)
        }
        rail.addEventListener('scroll', onScroll, { passive: true })
        onScroll()
      } else {
        vTracker = new IntersectionObserver((entries) => {
          for (const e of entries) {
            if (e.isIntersecting) {
              const idx = Number((e.target as HTMLElement).dataset.idx)
              if (!Number.isNaN(idx)) setActive(idx)
            }
          }
        }, { rootMargin: '-40% 0px -45% 0px' })
        cards.forEach((c) => vTracker!.observe(c))
      }
    }
    setup()
    mq.addEventListener('change', setup)
    return () => {
      vTracker?.disconnect()
      if (onScroll) rail.removeEventListener('scroll', onScroll)
      mq.removeEventListener('change', setup)
    }
  }, [artists.length, alwaysRail])

  const scrollToArtist = useCallback((i: number) => {
    const el = document.getElementById(`${idPrefix}-${artists[i]?.slug}`)
    if (!el) return
    if (alwaysRail && !window.matchMedia('(min-width: 1024px)').matches) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'start' })
    } else if (alwaysRail || window.matchMedia('(min-width: 1024px)').matches) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [alwaysRail, artists, idPrefix])

  const step = (dir: 1 | -1) => {
    scrollToArtist(Math.min(artists.length - 1, Math.max(0, active + dir)))
  }

  const seeAllBtn = seeAll && seeAllHref ? (
    <Link
      href={seeAllHref}
      className="inline-block no-underline border-[3px] border-[var(--paper)] px-4 py-2 text-[var(--paper)] hover:bg-[var(--red)] hover:border-[var(--red)] hover:text-white transition-colors"
      style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' }}
    >
      {seeAll} →
    </Link>
  ) : null

  return (
    <section ref={sectionRef} className="obx-stage relative overflow-hidden border-y-[4px] border-[var(--ink)] px-3 sm:px-6 py-10 sm:py-14">
      <div aria-hidden className="danger-bar -mx-3 sm:-mx-6 mb-8 sm:mb-10" />

      <div className="relative z-[1] mx-auto w-full max-w-[1800px] lg:grid lg:grid-cols-[minmax(220px,280px)_minmax(0,1fr)] xl:grid-cols-[minmax(240px,300px)_minmax(0,1fr)] lg:gap-8 xl:gap-10">

        {/* ===== Columna sticky (desktop) ===== */}
        <aside className="hidden lg:block lg:sticky lg:top-28 lg:self-start min-w-0">
          <div className="sec-tag" style={{ borderColor: 'var(--paper)', color: 'var(--paper)' }}>{tag}</div>
          <h2 className="obx-title">
            <span>{title1}</span>
            <span className="hl">{title2}</span>
          </h2>

          {/* Índice de artistas: resalta el que está en pantalla */}
          <ol className={`m-0 mt-2 mb-8 list-none space-y-1 ${alwaysRail ? 'max-h-[58vh] overflow-y-auto pr-1' : ''}`}>
            {artists.map((a, i) => {
              const isActive = i === active
              const isSounding = activeGroupSlug === a.slug && previewPlaying
              return (
                <li key={a.slug}>
                  <button
                    type="button"
                    onClick={() => scrollToArtist(i)}
                    className={`flex w-full items-baseline gap-3 border-0 border-l-[3px] bg-transparent py-1 pl-3 cursor-pointer text-left transition-colors ${isActive ? 'border-[var(--yellow)]' : 'border-transparent opacity-55 hover:opacity-90'}`}
                  >
                    <span style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '2px', color: isActive ? 'var(--yellow)' : 'var(--red)' }}>
                      {pad2(i + 1)}
                    </span>
                    <span
                      className="truncate"
                      style={{
                        fontFamily: "'Unbounded', sans-serif",
                        fontWeight: 800,
                        fontSize: '14px',
                        textTransform: 'uppercase',
                        letterSpacing: '-0.3px',
                        color: isActive ? 'var(--yellow)' : 'var(--paper)',
                      }}
                    >
                      {a.name}
                    </span>
                    {isSounding ? <span aria-hidden className="obx-eq shrink-0"><i /><i /><i /></span> : null}
                  </button>
                </li>
              )
            })}
          </ol>
          {seeAllBtn}
        </aside>

        <div className="min-w-0">
          {/* ===== Cabecera móvil ===== */}
          <header className="lg:hidden mb-4">
            <div className="sec-tag" style={{ borderColor: 'var(--paper)', color: 'var(--paper)' }}>{tag}</div>
            <h2 className="obx-title" style={{ fontSize: 'clamp(26px, 8vw, 40px)' }}>
              <span>{title1} <span className="hl" style={{ display: 'inline' }}>{title2}</span></span>
            </h2>
          </header>

          {/* Barra sticky móvil: título + contador mientras se desplazan las portadas.
              top = altura exacta del Header (52px móvil / 60px sm) para que el borde no quede tapado. */}
          <div className="lg:hidden sticky top-[52px] sm:top-[60px] z-30 -mx-3 sm:-mx-6 mb-5 flex items-center justify-between gap-3 border-y-[3px] border-[var(--paper)] bg-[var(--ink)] px-3 py-2">
            <span
              className="truncate text-[var(--paper)]"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}
            >
              {title1} <span className="text-[var(--yellow)]">{title2}</span>
            </span>
            {/* En el raíl el contador es botón: tap = siguiente artista (con vuelta al primero) */}
            {alwaysRail && artists.length > 1 ? (
              <button
                type="button"
                onClick={() => scrollToArtist((active + 1) % artists.length)}
                aria-label={es ? 'Siguiente artista' : 'Next artist'}
                className="shrink-0 max-w-[52%] cursor-pointer truncate border-[2px] border-[var(--ink)] bg-[var(--yellow)] px-2 py-1 text-[var(--ink)] active:translate-y-px"
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
              >
                {pad2(active + 1)}/{pad2(artists.length)} {artists[active]?.name} →
              </button>
            ) : (
              <span
                className="shrink-0 max-w-[48%] truncate border-[2px] border-[var(--ink)] bg-[var(--yellow)] px-2 py-1 text-[var(--ink)]"
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
              >
                {pad2(active + 1)}/{pad2(artists.length)} {artists[active]?.name}
              </span>
            )}
          </div>

          {/* Móvil: pila vertical (home) o raíl. Desktop: carrusel horizontal. */}
          <div className="relative min-w-0 w-full max-w-full">
            <div
              ref={railRef}
              className={
                alwaysRail
                  ? 'obx-rail flex w-full min-w-0 max-w-full gap-3 overflow-x-auto snap-x snap-mandatory sm:gap-6'
                  : 'obx-rail space-y-10 sm:space-y-16 lg:space-y-0 lg:flex lg:gap-6 lg:overflow-x-auto lg:snap-x lg:snap-mandatory'
              }
            >
              {artists.map((a, i) => {
                const isMine = activeGroupSlug === a.slug
                const isSounding = isMine && previewPlaying
                const nowTitle = isMine ? previewQueue[previewIndex]?.title ?? null : null
                return (
                  <ArtistCover
                    key={a.slug}
                    artist={a}
                    index={i}
                    idPrefix={idPrefix}
                    lang={lang}
                    es={es}
                    sounding={isSounding}
                    nowTitle={nowTitle}
                    inactive={i !== active}
                    alwaysRail={alwaysRail}
                    onPlay={() => playArtist(a)}
                  />
                )
              })}
            </div>

            <button
              type="button"
              onClick={() => step(-1)}
              disabled={active === 0}
              aria-label={es ? 'Artista anterior' : 'Previous artist'}
              className="absolute left-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center border-[3px] border-[var(--paper)] bg-[var(--ink)] text-[var(--paper)] transition-colors hover:border-[var(--red)] hover:bg-[var(--red)] hover:text-white disabled:cursor-default disabled:opacity-25 lg:grid"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '18px' }}
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={active >= artists.length - 1}
              aria-label={es ? 'Artista siguiente' : 'Next artist'}
              className="absolute right-3 top-1/2 z-20 hidden h-11 w-11 -translate-y-1/2 cursor-pointer place-items-center border-[3px] border-[var(--paper)] bg-[var(--ink)] text-[var(--paper)] transition-colors hover:border-[var(--red)] hover:bg-[var(--red)] hover:text-white disabled:cursor-default disabled:opacity-25 lg:grid"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '18px' }}
            >
              →
            </button>
          </div>

          {seeAll ? <div className="mt-10 text-center lg:hidden">{seeAllBtn}</div> : null}
        </div>
      </div>
    </section>
  )
}

function ArtistCover({
  artist: a,
  index,
  idPrefix,
  lang,
  es,
  sounding,
  nowTitle,
  inactive,
  alwaysRail,
  onPlay,
}: {
  artist: ShowcaseArtist
  index: number
  idPrefix: string
  lang: string
  es: boolean
  sounding: boolean
  nowTitle: string | null
  /** Slide del carrusel no centrado (atenúa, nunca oculta). */
  inactive: boolean
  alwaysRail: boolean
  onPlay: () => void
}) {
  const img = displayImageUrl(a.imageUrl)
  const bars = seededBars(a.slug)
  const playable = a.tracks.length > 0
  const playLabel = sounding
    ? (es ? `Pausar ${a.name}` : `Pause ${a.name}`)
    : (es ? `Escuchar a ${a.name}` : `Listen to ${a.name}`)

  return (
    <article
      id={`${idPrefix}-${a.slug}`}
      data-obx-card
      data-idx={index}
      className={`obx-card group relative flex flex-col justify-end overflow-hidden border-4 border-[var(--ink)] bg-[var(--ink)] ${alwaysRail ? 'box-border h-[400px] w-[calc(100%-32px)] min-w-[calc(100%-32px)] max-w-full shrink-0 snap-start snap-always transition-opacity duration-300 sm:h-[480px] lg:h-auto lg:min-h-[560px] lg:w-[92%] lg:min-w-[92%] lg:max-w-none lg:snap-center xl:w-[90%] xl:min-w-[90%]' : 'min-h-[440px] sm:min-h-[520px] lg:min-h-[560px] lg:min-w-[92%] xl:min-w-[90%] lg:snap-center lg:snap-always lg:transition-opacity lg:duration-300'} ${inactive ? (alwaysRail ? 'opacity-70' : 'lg:opacity-70') : ''} ${sounding ? 'obx-playing' : ''}`}
    >
      {/* Portada */}
      <div className="absolute inset-0 overflow-hidden">
        {img ? (
          // eslint-disable-next-line @next/next/no-img-element -- URLs dinámicas desde Supabase / CMS
          <img
            src={img}
            alt={a.name}
            loading={index === 0 ? 'eager' : 'lazy'}
            decoding="async"
            className={`obx-card-img absolute inset-0 h-full w-full object-cover ${alwaysRail ? 'object-top lg:object-center' : 'object-center'}`}
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/55 to-transparent lg:from-black/95 lg:via-black/40 lg:to-black/10" />
        <div className="absolute inset-0 hidden bg-gradient-to-r from-black/50 via-transparent to-transparent lg:block" />
      </div>

      {/* Número gigante flotante */}
      <div
        aria-hidden
        className="obx-ghost absolute -top-3 right-2 z-[4] select-none sm:right-6"
        style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(88px, 16vw, 190px)', lineHeight: 1 }}
      >
        {pad2(index + 1)}
      </div>

      {/* Toda la tarjeta enlaza a la ficha; los controles flotan encima */}
      {a.href ? (
        <Link href={a.href} className="absolute inset-0 z-[5]" aria-label={a.name}>
          <span className="sr-only">{a.name}</span>
        </Link>
      ) : null}

      {/* Meta superior: bandera + fans */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-[6] flex flex-wrap items-center gap-2 p-4 sm:p-6">
        {a.country ? (
          <CountryBadge country={a.country} lang={lang} variant="overlay" size="sm" />
        ) : null}
        {a.fans > 0 ? (
          <span className="inline-flex items-center gap-1.5 border-[2px] border-[var(--ink)] bg-[var(--ink)] px-2 py-1">
            <span className="text-[var(--yellow)]" style={{ fontSize: '12px', lineHeight: 1 }}>★</span>
            <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '11px', color: 'var(--paper)' }}>{a.fans}</span>
            <span style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '2px', color: 'var(--paper)' }}>
              {es ? 'FANS' : 'FANS'}
            </span>
          </span>
        ) : null}
        {sounding ? (
          <span className="ml-auto inline-flex items-center gap-1.5 border-[2px] border-[var(--ink)] bg-[var(--red)] px-2 py-1 text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '2px' }}>
            ● {es ? 'SONANDO' : 'ON AIR'}
          </span>
        ) : null}
      </div>

      {/* Contenido inferior */}
      <div className="pointer-events-none relative z-[6] p-3 pb-4 sm:p-8">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {a.genres.slice(0, alwaysRail ? 3 : 4).map((g, j) => (
            <span
              key={j}
              className="border-[2px] border-[var(--paper)] bg-[var(--ink)] text-[var(--paper)]"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '3px 8px' }}
            >
              {g}
            </span>
          ))}
        </div>

        <h3
          className={`m-0 break-words text-white ${alwaysRail ? 'line-clamp-2 lg:line-clamp-none' : ''}`}
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(26px, 6vw, 56px)',
            lineHeight: 0.95,
            textTransform: 'uppercase',
            letterSpacing: '-1px',
            textShadow: '3px 3px 0 #000',
          }}
        >
          {a.name}
        </h3>

        <p
          className={`mt-2 max-w-[560px] text-white/75 ${alwaysRail ? 'line-clamp-2 lg:line-clamp-none' : ''}`}
          style={{ fontFamily: "'Special Elite', monospace", fontSize: 'clamp(12px, 1.6vw, 14px)', lineHeight: 1.6 }}
        >
          {a.desc}
        </p>

        {/* Waveform + play */}
        <div className="mt-3 flex items-center gap-3 sm:mt-5 sm:gap-6">
          {playable ? (
            <button
              type="button"
              onClick={onPlay}
              aria-label={playLabel}
              title={playLabel}
              className="pointer-events-auto relative grid h-14 w-14 shrink-0 cursor-pointer place-items-center border-[3px] border-[var(--paper)] bg-[var(--red)] text-white shadow-[4px_4px_0_#000] transition-colors hover:bg-[var(--ink)] active:translate-x-px active:translate-y-px sm:h-16 sm:w-16"
            >
              {sounding ? <span className="obx-pulse-ring" aria-hidden /> : null}
              {sounding ? (
                <svg viewBox="0 0 24 24" className="h-7 w-7 sm:h-8 sm:w-8" fill="currentColor" aria-hidden>
                  <rect x="6" y="5" width="4" height="14" />
                  <rect x="14" y="5" width="4" height="14" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="ml-1 h-7 w-7 sm:h-8 sm:w-8" fill="currentColor" aria-hidden>
                  <path d="M7 4.5v15l13-7.5z" />
                </svg>
              )}
            </button>
          ) : (
            <span
              className="grid h-14 w-14 shrink-0 place-items-center border-[3px] border-[var(--paper)] text-[var(--paper)] sm:h-16 sm:w-16"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '18px' }}
              aria-hidden
            >
              →
            </span>
          )}

          <div className="min-w-0 flex-1">
            <div className={`flex h-10 items-end gap-[3px] sm:h-14 ${sounding ? 'opacity-100' : 'opacity-50 group-hover:opacity-80'} transition-opacity duration-300`} aria-hidden>
              {bars.map((h, j) => (
                <span
                  key={j}
                  className="obx-wave-bar min-w-[2px] max-w-[10px] flex-1 bg-gradient-to-t from-[var(--red)] to-[var(--yellow)]"
                  style={{ height: `${Math.round(h * 100)}%`, animationDelay: `${(j % 9) * 0.085}s` }}
                />
              ))}
            </div>
            <div className="mt-1.5 truncate" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: nowTitle ? 'var(--yellow)' : 'rgba(255,255,255,.45)' }}>
              {nowTitle
                ? `▶ ${nowTitle}`
                : playable
                  ? (es ? `TOP BEATPORT — ${a.tracks.length} TRACKS` : `BEATPORT TOP — ${a.tracks.length} TRACKS`)
                  : (es ? 'VER FICHA COMPLETA' : 'VIEW FULL PROFILE')}
            </div>
          </div>
        </div>
      </div>
    </article>
  )
}
