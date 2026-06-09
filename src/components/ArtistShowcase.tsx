'use client'

// ============================================
// OPTIMAL BREAKS — Artist Showcase (home)
// Escenario oscuro con título sticky, portadas gigantes por artista
// (bandera, waveform, géneros, fans y botón de play) y luz ambiental.
// Todo el movimiento es CSS puro; un único IntersectionObserver
// gestiona el reveal cinematográfico y el artista activo.
// ============================================

import Link from 'next/link'
import { useCallback, useEffect, useRef, useState } from 'react'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import { useAudioEngineGate } from '@/components/LazyDeckAudioProvider'
import type { PreviewTrack } from '@/components/DeckAudioProvider'
import { displayImageUrl } from '@/lib/image-url'
import CountryBadge from '@/components/CountryBadge'

export type ShowcaseTrack = {
  title: string
  artist: string
  sampleUrl: string
  artworkUrl: string | null
}

export type ShowcaseArtist = {
  slug: string
  name: string
  desc: string
  genres: string[]
  imageUrl: string | null
  /** Código o nombre de país en BD (RU, UK, Russia, AU/UK…). */
  country: string | null
  fans: number
  href: string
  tracks: ShowcaseTrack[]
}

interface Props {
  lang: string
  tag: string
  title1: string
  title2: string
  seeAll?: string
  seeAllHref: string
  artists: ShowcaseArtist[]
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

export default function ArtistShowcase({ lang, tag, title1, title2, seeAll, seeAllHref, artists }: Props) {
  const es = lang === 'es'
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

  const groupKeyOf = (slug: string) => `home-artist:${slug}`
  const activeGroupSlug = previewGroupKey?.startsWith('home-artist:')
    ? previewGroupKey.slice('home-artist:'.length)
    : null

  const playArtist = useCallback((a: ShowcaseArtist) => {
    const key = groupKeyOf(a.slug)
    if (previewGroupKey === key && previewQueue.length > 0) {
      togglePreview()
      return
    }
    const queue: PreviewTrack[] = a.tracks.map((t, i) => ({
      rowKey: `${a.slug}-${i}`,
      src: proxyUrl(t.sampleUrl),
      title: t.title,
      artist: t.artist,
      artworkUrl: t.artworkUrl,
      domId: `home-artist-${a.slug}`,
    }))
    if (queue.length > 0) playPreviewQueue(queue, 0, key)
  }, [previewGroupKey, previewQueue.length, togglePreview, playPreviewQueue])

  // Reveal cinematográfico (solo móvil vía CSS) + artista activo:
  // desktop = posición del carrusel horizontal; móvil = observer vertical.
  useEffect(() => {
    const root = sectionRef.current
    const rail = railRef.current
    if (!root || !rail) return
    const cards = Array.from(root.querySelectorAll<HTMLElement>('[data-obx-card]'))

    const reveal = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          e.target.classList.add('obx-in')
          reveal.unobserve(e.target)
        }
      }
    }, { threshold: 0.12 })
    cards.forEach((c) => reveal.observe(c))

    const mq = window.matchMedia('(min-width: 1024px)')
    let vTracker: IntersectionObserver | null = null
    let onScroll: (() => void) | null = null

    const setup = () => {
      vTracker?.disconnect()
      vTracker = null
      if (onScroll) { rail.removeEventListener('scroll', onScroll); onScroll = null }

      if (mq.matches) {
        onScroll = () => {
          const center = rail.scrollLeft + rail.clientWidth / 2
          let best = 0
          let dist = Infinity
          cards.forEach((c, i) => {
            const d = Math.abs(c.offsetLeft + c.offsetWidth / 2 - center)
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
      reveal.disconnect()
      vTracker?.disconnect()
      if (onScroll) rail.removeEventListener('scroll', onScroll)
      mq.removeEventListener('change', setup)
    }
  }, [artists.length])

  const scrollToArtist = useCallback((i: number) => {
    const el = document.getElementById(`home-artist-${artists[i]?.slug}`)
    if (!el) return
    if (window.matchMedia('(min-width: 1024px)').matches) {
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'center' })
    } else {
      el.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }, [artists])

  const step = (dir: 1 | -1) => {
    scrollToArtist(Math.min(artists.length - 1, Math.max(0, active + dir)))
  }

  const seeAllBtn = seeAll ? (
    <Link
      href={seeAllHref}
      className="inline-block no-underline border-[3px] border-white/80 px-4 py-2 text-white hover:bg-[var(--red)] hover:border-[var(--red)] transition-colors"
      style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' }}
    >
      {seeAll} →
    </Link>
  ) : null

  return (
    <section ref={sectionRef} className="obx-stage relative overflow-hidden border-b-[5px] border-[var(--ink)] px-3 sm:px-6 py-12 sm:py-20">
      {/* Luz ambiental animada */}
      <div aria-hidden className="absolute inset-0 pointer-events-none">
        <div className="obx-blob obx-blob-red" />
        <div className="obx-blob obx-blob-uv" />
        <div className="obx-blob obx-blob-pink" />
      </div>

      <div className="relative z-[1] mx-auto max-w-[1400px] lg:grid lg:grid-cols-[minmax(280px,360px)_minmax(0,1fr)] lg:gap-12 xl:gap-16">

        {/* ===== Columna sticky (desktop) ===== */}
        <aside className="hidden lg:block lg:sticky lg:top-28 lg:self-start">
          <div className="sec-tag" style={{ borderColor: 'rgba(255,255,255,.85)', color: '#fff' }}>{tag}</div>
          <h2 className="sec-title text-white">
            {title1}
            <br />
            <span className="hl">{title2}</span>
          </h2>

          {/* Índice de artistas: resalta el que está en pantalla */}
          <ol className="m-0 mt-2 mb-8 list-none space-y-2">
            {artists.map((a, i) => {
              const isActive = i === active
              const isSounding = activeGroupSlug === a.slug && previewPlaying
              return (
                <li key={a.slug}>
                  <button
                    type="button"
                    onClick={() => scrollToArtist(i)}
                    className={`flex w-full items-baseline gap-3 bg-transparent border-0 cursor-pointer text-left transition-all duration-300 ${isActive ? 'translate-x-2' : 'opacity-40 hover:opacity-75'}`}
                  >
                    <span style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '2px', color: 'var(--red)' }}>
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
                        color: isActive ? 'var(--yellow)' : '#fff',
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
            <div className="sec-tag" style={{ borderColor: 'rgba(255,255,255,.85)', color: '#fff' }}>{tag}</div>
            <h2 className="sec-title text-white">
              {title1} <span className="hl">{title2}</span>
            </h2>
          </header>

          {/* Barra sticky móvil: título + contador mientras se desplazan las portadas */}
          <div className="lg:hidden sticky top-[48px] z-30 -mx-3 sm:-mx-6 mb-8 flex items-center justify-between gap-3 border-y-[3px] border-[var(--ink)] bg-[#101013]/90 px-4 py-2 backdrop-blur-sm">
            <span
              className="truncate text-white"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '0.5px' }}
            >
              {title1} <span className="text-[var(--yellow)]">{title2}</span>
            </span>
            <span
              className="shrink-0 truncate max-w-[45%] text-right"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '2px', color: 'var(--yellow)' }}
            >
              {pad2(active + 1)}/{pad2(artists.length)} — {artists[active]?.name}
            </span>
          </div>

          {/* ===== Portadas: pila vertical en móvil, carrusel snap en desktop ===== */}
          <div className="relative">
            <div
              ref={railRef}
              className="obx-rail space-y-10 sm:space-y-16 lg:space-y-0 lg:flex lg:gap-6 lg:overflow-x-auto lg:snap-x lg:snap-mandatory"
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
                    lang={lang}
                    es={es}
                    sounding={isSounding}
                    nowTitle={nowTitle}
                    inactive={i !== active}
                    onPlay={() => playArtist(a)}
                  />
                )
              })}
            </div>

            {/* Flechas del carrusel — solo desktop */}
            <button
              type="button"
              onClick={() => step(-1)}
              disabled={active === 0}
              aria-label={es ? 'Artista anterior' : 'Previous artist'}
              className="absolute left-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 cursor-pointer place-items-center border-[3px] border-white/80 bg-black/60 text-white backdrop-blur-sm transition-colors hover:border-[var(--red)] hover:bg-[var(--red)] disabled:cursor-default disabled:opacity-25 lg:grid"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '18px' }}
            >
              ←
            </button>
            <button
              type="button"
              onClick={() => step(1)}
              disabled={active >= artists.length - 1}
              aria-label={es ? 'Artista siguiente' : 'Next artist'}
              className="absolute right-3 top-1/2 z-20 hidden h-12 w-12 -translate-y-1/2 cursor-pointer place-items-center border-[3px] border-white/80 bg-black/60 text-white backdrop-blur-sm transition-colors hover:border-[var(--red)] hover:bg-[var(--red)] disabled:cursor-default disabled:opacity-25 lg:grid"
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
  lang,
  es,
  sounding,
  nowTitle,
  inactive,
  onPlay,
}: {
  artist: ShowcaseArtist
  index: number
  lang: string
  es: boolean
  sounding: boolean
  nowTitle: string | null
  /** En desktop, slide del carrusel que no está centrado (se atenúa). */
  inactive: boolean
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
      id={`home-artist-${a.slug}`}
      data-obx-card
      data-idx={index}
      className={`obx-card obx-reveal group relative flex min-h-[440px] flex-col justify-end overflow-hidden border-4 border-[var(--ink)] bg-[#17171a] sm:min-h-[560px] lg:min-w-[86%] xl:min-w-[82%] lg:snap-center lg:transition-opacity lg:duration-500 ${inactive ? 'lg:opacity-40' : ''} ${sounding ? 'obx-playing' : ''}`}
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
            className="obx-card-img absolute inset-0 h-full w-full object-cover object-center transition-transform duration-[1400ms] ease-out group-hover:scale-[1.07]"
          />
        ) : null}
        <div className="absolute inset-0 bg-gradient-to-t from-black/95 via-black/40 to-black/10" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/50 via-transparent to-transparent" />
      </div>

      {/* Número gigante flotante */}
      <div
        aria-hidden
        className="obx-ghost obx-float absolute -top-3 right-2 z-[4] select-none sm:right-6"
        style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(88px, 16vw, 190px)', lineHeight: 1 }}
      >
        {pad2(index + 1)}
      </div>

      {/* Toda la tarjeta enlaza a la ficha; los controles flotan encima */}
      <Link href={a.href} className="absolute inset-0 z-[5]" aria-label={a.name}>
        <span className="sr-only">{a.name}</span>
      </Link>

      {/* Meta superior: bandera + fans */}
      <div className="pointer-events-none absolute left-0 right-0 top-0 z-[6] flex flex-wrap items-center gap-2 p-4 sm:p-6">
        {a.country ? (
          <CountryBadge country={a.country} lang={lang} variant="overlay" size="sm" />
        ) : null}
        {a.fans > 0 ? (
          <span className="inline-flex items-center gap-1.5 border-2 border-white/30 bg-black/55 px-2.5 py-1.5 backdrop-blur-sm">
            <span className="text-[var(--yellow)]" style={{ fontSize: '12px', lineHeight: 1 }}>★</span>
            <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '11px', color: '#fff' }}>{a.fans}</span>
            <span style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '2px', color: 'rgba(255,255,255,.65)' }}>
              {es ? 'FANS' : 'FANS'}
            </span>
          </span>
        ) : null}
        {sounding ? (
          <span className="animate-flicker ml-auto inline-flex items-center gap-1.5 bg-[var(--red)] px-2.5 py-1.5 text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '2px' }}>
            ● {es ? 'SONANDO' : 'ON AIR'}
          </span>
        ) : null}
      </div>

      {/* Contenido inferior */}
      <div className="pointer-events-none relative z-[6] p-4 pb-5 sm:p-8">
        <div className="mb-2 flex flex-wrap gap-1.5">
          {a.genres.slice(0, 4).map((g, j) => (
            <span
              key={j}
              className="bg-[var(--ink)]/85 text-[var(--paper)] backdrop-blur-sm"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1.5px', textTransform: 'uppercase', padding: '3px 8px' }}
            >
              {g}
            </span>
          ))}
        </div>

        <h3
          className="m-0 break-words text-white"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(26px, 6vw, 56px)',
            lineHeight: 0.95,
            textTransform: 'uppercase',
            letterSpacing: '-1px',
            textShadow: '3px 3px 0 rgba(0,0,0,.6), 0 0 60px rgba(214,40,40,.35)',
          }}
        >
          {a.name}
        </h3>

        <p
          className="mt-2 max-w-[560px] text-white/75"
          style={{ fontFamily: "'Special Elite', monospace", fontSize: 'clamp(12px, 1.6vw, 14px)', lineHeight: 1.6 }}
        >
          {a.desc}
        </p>

        {/* Waveform + play */}
        <div className="mt-4 flex items-center gap-4 sm:mt-5 sm:gap-6">
          {playable ? (
            <button
              type="button"
              onClick={onPlay}
              aria-label={playLabel}
              title={playLabel}
              className="pointer-events-auto relative grid h-16 w-16 shrink-0 cursor-pointer place-items-center rounded-full border-4 border-white/90 bg-[var(--red)] text-white shadow-[0_0_45px_rgba(214,40,40,.6)] transition-transform duration-200 hover:scale-110 active:scale-95 sm:h-20 sm:w-20"
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
              className="grid h-16 w-16 shrink-0 place-items-center rounded-full border-4 border-white/40 text-white/70 sm:h-20 sm:w-20"
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
