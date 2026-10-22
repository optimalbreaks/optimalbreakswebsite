'use client'

// «¿Cómo funciona esta página?»: franja arriba de cada sección con el vídeo del personaje
// que la explica. Se reproduce ahí mismo: vertical en móvil en vertical, horizontal en el resto
// (igual que /comic). Si el vídeo de esa sección aún no está publicado, no sale nada.

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useEffect, useId, useRef, useState, useSyncExternalStore } from 'react'
import type { Locale } from '@/lib/i18n-config'
import { GUIDE_COPY, guideForPath, guidePosterUrl, guideVideoUrl, type SectionGuide } from '@/content/section-guides'
import { broadcastPlaybackClaim, stopAllYouTube, subscribeYouTubePlay } from '@/lib/youtube-play-coordinator'

const PORTRAIT_QUERY = '(orientation: portrait) and (max-width: 900px)'
function subscribePortrait(cb: () => void) {
  const mq = window.matchMedia(PORTRAIT_QUERY)
  mq.addEventListener('change', cb)
  return () => mq.removeEventListener('change', cb)
}
const getPortrait = () => window.matchMedia(PORTRAIT_QUERY).matches
const getPortraitServer = () => false

export function useGuideVertical() {
  return useSyncExternalStore(subscribePortrait, getPortrait, getPortraitServer)
}

/** ¿Está publicado? (existe su póster). */
export function useGuideReady(g: SectionGuide | null, lang: Locale) {
  const url = g ? guidePosterUrl(g, lang, false) : null
  const [seen, setSeen] = useState<{ url: string; ok: boolean } | null>(null)
  useEffect(() => {
    if (!url) return
    let alive = true
    const img = new Image()
    img.onload = () => { if (alive) setSeen({ url, ok: true }) }
    img.onerror = () => { if (alive) setSeen({ url, ok: false }) }
    img.src = url
    return () => { alive = false }
  }, [url])
  return url && seen?.url === url ? seen.ok : null
}

/** Vídeo de una sección. Al sonar, se calla todo lo demás de la web (como el cómic). */
export function GuideVideo({ guide, lang, autoPlay = false }: { guide: SectionGuide; lang: Locale; autoPlay?: boolean }) {
  const vertical = useGuideVertical()
  const src = guideVideoUrl(guide, lang, vertical)
  const ref = useRef<HTMLVideoElement>(null)
  const id = useId()
  const pos = useRef({ time: 0, playing: autoPlay })

  useEffect(() => {
    const pause = () => { ref.current?.pause() }
    const onClaim = (e: Event) => {
      const d = (e as CustomEvent<{ source?: string; id?: string }>).detail
      if (d?.source !== 'guide' || d?.id !== id) pause()
    }
    const unsub = subscribeYouTubePlay((yt) => { if (yt) pause() })
    window.addEventListener('ob-audio-claim', onClaim)
    window.addEventListener('ob-audio-foreign', pause)
    return () => {
      unsub()
      window.removeEventListener('ob-audio-claim', onClaim)
      window.removeEventListener('ob-audio-foreign', pause)
    }
  }, [id])

  // Al girar el móvil cambia el formato: seguir por el mismo segundo.
  useEffect(() => {
    const v = ref.current
    if (!v) return
    const { time, playing } = pos.current
    const onMeta = () => {
      if (time) v.currentTime = time
      if (playing) v.play().catch(() => {})
    }
    v.addEventListener('loadedmetadata', onMeta, { once: true })
    return () => v.removeEventListener('loadedmetadata', onMeta)
  }, [src])

  return (
    <div className={`flex justify-center bg-[var(--ink)]`}>
      <video
        ref={ref}
        key={src}
        src={src}
        poster={guidePosterUrl(guide, lang, vertical)}
        controls
        playsInline
        preload="metadata"
        className={vertical ? 'block h-[min(78vh,760px)] w-auto max-w-full aspect-[9/16] bg-black' : 'block w-full aspect-video max-h-[78vh] bg-black'}
        onTimeUpdate={(ev) => { pos.current.time = ev.currentTarget.currentTime }}
        onPlay={() => {
          pos.current.playing = true
          broadcastPlaybackClaim()
          stopAllYouTube()
          window.dispatchEvent(new CustomEvent('ob-audio-claim', { detail: { source: 'guide', id } }))
        }}
        onPause={() => { pos.current.playing = false }}
      />
    </div>
  )
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif" } as const

/** Franja de arriba (va en el layout): solo en las páginas que tienen vídeo publicado. */
export default function SectionGuideBar({ lang }: { lang: Locale }) {
  const pathname = usePathname() ?? ''
  const guide = guideForPath(pathname)
  const ready = useGuideReady(guide, lang)
  // Abierto solo en la página donde se abrió: al navegar se cierra solo.
  const [openAt, setOpenAt] = useState<string | null>(null)
  const open = openAt === pathname
  const setOpen = (f: (o: boolean) => boolean) => setOpenAt(f(open) ? pathname : null)
  if (!guide || !ready) return null
  const t = GUIDE_COPY[lang]

  return (
    <section aria-label={t.kicker} className="relative z-[1] border-b-[3px] border-[var(--ink)] bg-[var(--yellow)]">
      <div className="mx-auto max-w-[1100px] px-4 sm:px-6 py-3">
        <div className="flex items-center gap-3 sm:gap-4">
          <button
            type="button"
            onClick={() => setOpen((o) => !o)}
            aria-expanded={open}
            className="relative shrink-0 border-[3px] border-[var(--ink)] bg-[var(--ink)] p-0 cursor-pointer"
            title={t.watch}
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={guidePosterUrl(guide, lang, false)} alt="" width={112} height={63} className="block h-[54px] w-[96px] sm:h-[63px] sm:w-[112px] object-cover" />
            <span className="absolute inset-0 flex items-center justify-center text-[22px] text-[var(--yellow)] [text-shadow:0_0_6px_#000]">{open ? '■' : '▶'}</span>
          </button>
          <div className="min-w-0 flex-1">
            <p className="m-0 text-[13px] sm:text-[15px] font-black leading-tight text-[var(--ink)]" style={DISPLAY}>
              {t.kicker}
            </p>
            <p className="m-0 mt-1 text-[12px] sm:text-[13px] leading-snug text-[var(--ink)]" style={MONO}>
              <b>{guide.host[lang]}</b> {lang === 'es' ? 'te lo cuenta' : 'walks you through it'} · {guide.text[lang]}
            </p>
          </div>
          <div className="hidden sm:flex shrink-0 flex-col items-end gap-1">
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              className="border-[3px] border-[var(--ink)] bg-[var(--ink)] px-3 py-2 text-[12px] font-black tracking-[1px] text-[var(--yellow)] cursor-pointer hover:bg-[var(--red)]"
              style={MONO}
            >
              {open ? `✕ ${t.close.toUpperCase()}` : `▶ ${t.watch.toUpperCase()} · ${guide.seconds[lang]} s`}
            </button>
            <Link href={`/${lang}/channels#secciones`} className="text-[11px] font-black text-[var(--ink)] underline underline-offset-2" style={MONO}>
              {t.all} →
            </Link>
          </div>
        </div>
        {open && (
          <div className="mt-3 border-[3px] border-[var(--ink)] shadow-[6px_6px_0_var(--red)]">
            <GuideVideo guide={guide} lang={lang} autoPlay />
          </div>
        )}
      </div>
    </section>
  )
}

/** Lista de /channels: todos los vídeos de sección publicados en este idioma. */
export function GuideList({ lang, guides }: { lang: Locale; guides: SectionGuide[] }) {
  return (
    <ol className="m-0 p-0 list-none border-[3px] border-[var(--ink)]">
      {guides.map((g) => <GuideRow key={g.base} guide={g} lang={lang} />)}
    </ol>
  )
}

function GuideRow({ guide, lang }: { guide: SectionGuide; lang: Locale }) {
  const ready = useGuideReady(guide, lang)
  const [open, setOpen] = useState(false)
  const es = lang === 'es'
  return (
    <li className="border-b-[3px] border-[var(--ink)] last:border-b-0 bg-[var(--paper)]">
      <div className="flex flex-wrap items-center justify-between gap-3 px-3 py-3">
        <div className="flex min-w-0 items-center gap-3">
          {ready && (
            <button type="button" onClick={() => setOpen((o) => !o)} aria-expanded={open} className="relative shrink-0 border-[3px] border-[var(--ink)] bg-[var(--ink)] p-0 cursor-pointer" title={GUIDE_COPY[lang].watch}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={guidePosterUrl(guide, lang, false)} alt="" width={96} height={54} loading="lazy" className="block h-[54px] w-[96px] object-cover" />
              <span className="absolute inset-0 flex items-center justify-center text-[20px] text-[var(--yellow)] [text-shadow:0_0_6px_#000]">{open ? '■' : '▶'}</span>
            </button>
          )}
          <div className="min-w-0">
            <h3 className="m-0 text-[16px] sm:text-[18px] font-black" style={DISPLAY}>{guide.label[lang]}</h3>
            <p className="m-0 text-[12px] text-[var(--ink)]/75" style={MONO}>
              {guide.host[lang]}{ready ? ` · ${guide.seconds[lang]} s` : ''}
            </p>
          </div>
        </div>
        <Link href={`/${lang}${guide.href}`} className="text-[12px] font-black tracking-[1px] text-[var(--ink)] no-underline hover:text-[var(--red)]" style={MONO}>
          {es ? 'IR A LA SECCIÓN →' : 'GO TO THE SECTION →'}
        </Link>
      </div>
      {ready === false && (
        <p className="m-0 border-t-[3px] border-[var(--ink)]/20 px-3 py-2 text-[12px] text-[var(--ink)]/60" style={MONO}>
          {es ? 'Su vídeo llega en unas horas.' : 'Its video lands in a few hours.'}
        </p>
      )}
      {open && (
        <div className="border-t-[3px] border-[var(--ink)]">
          <GuideVideo guide={guide} lang={lang} autoPlay />
        </div>
      )}
    </li>
  )
}
