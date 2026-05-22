// ============================================
// OPTIMAL BREAKS — Modal promocional CHARTS
// Solo tras engagement real (2ª página o 40 s en el sitio),
// no en la primera pantalla — evita LCP/CLS en PageSpeed y no
// interrumpe la home. Reapertura cada 5 min mientras navega;
// nunca en /[lang]/charts.
// ============================================

'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

/** ms desde la última vez que mostramos el modal hasta volver a mostrarlo. */
const PROMO_REOPEN_MS = 5 * 60 * 1000
/** Pequeño respiro tras cumplir engagement antes de abrir. */
const SHOW_DELAY_MS = 800
/** Segundos acumulados en el sitio antes de poder mostrar (1ª visita). */
const MIN_SESSION_MS = 40 * 1000
/** Cada cuánto comprobamos si ya toca abrir. */
const POLL_INTERVAL_MS = 5 * 1000

const LS_LAST_SHOWN = 'ob_charts_promo_last_shown_at'
const SS_SESSION_START = 'ob_charts_promo_session_start'
const SS_PAGE_VIEWS = 'ob_charts_promo_page_views'

export interface ChartsPromoDict {
  kicker: string
  title: string
  subtitle: string
  bullets: string[]
  cta_primary: string
  cta_secondary: string
  close: string
  image_alt: string
}

interface Props {
  lang: 'es' | 'en'
  dict: ChartsPromoDict
}

function readLastShown(): number | null {
  if (typeof window === 'undefined') return null
  try {
    const v = window.localStorage.getItem(LS_LAST_SHOWN)
    if (!v) return null
    const n = Number(v)
    return Number.isFinite(n) && n > 0 ? n : null
  } catch {
    return null
  }
}

function writeLastShown(ts: number) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(LS_LAST_SHOWN, String(ts))
  } catch {
    /* localStorage puede estar bloqueado */
  }
}

function sessionStart(): number {
  if (typeof window === 'undefined') return Date.now()
  try {
    const raw = window.sessionStorage.getItem(SS_SESSION_START)
    if (raw) {
      const n = Number(raw)
      if (Number.isFinite(n) && n > 0) return n
    }
    const now = Date.now()
    window.sessionStorage.setItem(SS_SESSION_START, String(now))
    return now
  } catch {
    return Date.now()
  }
}

function bumpPageViews(): number {
  if (typeof window === 'undefined') return 1
  try {
    const prev = Number(window.sessionStorage.getItem(SS_PAGE_VIEWS) || '0')
    const next = Number.isFinite(prev) && prev > 0 ? prev + 1 : 1
    window.sessionStorage.setItem(SS_PAGE_VIEWS, String(next))
    return next
  } catch {
    return 1
  }
}

function readPageViews(): number {
  if (typeof window === 'undefined') return 0
  try {
    const n = Number(window.sessionStorage.getItem(SS_PAGE_VIEWS) || '0')
    return Number.isFinite(n) && n > 0 ? n : 0
  } catch {
    return 0
  }
}

/** Usuario con intención: al menos 2 páginas en la sesión o 40 s en el sitio. */
function hasEngaged(): boolean {
  const views = readPageViews()
  const elapsed = Date.now() - sessionStart()
  return views >= 2 || elapsed >= MIN_SESSION_MS
}

function cooldownElapsed(): boolean {
  const last = readLastShown()
  if (last == null) return true
  return Date.now() - last >= PROMO_REOPEN_MS
}

function canShowNow(): boolean {
  return hasEngaged() && cooldownElapsed()
}

export default function ChartsPromoModal({ lang, dict }: Props) {
  const pathname = usePathname() || ''
  const onChartsPage = pathname.includes(`/${lang}/charts`) || pathname.endsWith('/charts')

  const [open, setOpen] = useState(false)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)
  const showTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const showNow = useCallback(() => {
    if (!canShowNow()) return
    setOpen(true)
    writeLastShown(Date.now())
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    writeLastShown(Date.now())
  }, [])

  const scheduleShowIfReady = useCallback(() => {
    if (onChartsPage || open) return
    if (!canShowNow()) return
    if (showTimerRef.current) clearTimeout(showTimerRef.current)
    showTimerRef.current = setTimeout(showNow, SHOW_DELAY_MS)
  }, [onChartsPage, open, showNow])

  // Contabilizar vistas de página en la sesión (cada ruta distinta cuenta).
  useEffect(() => {
    if (onChartsPage) return
    bumpPageViews()
    scheduleShowIfReady()
  }, [pathname, onChartsPage, scheduleShowIfReady])

  // Polling: abrir cuando cumpla 40 s aunque no haya cambiado de página.
  useEffect(() => {
    if (onChartsPage) return

    const interval = setInterval(() => {
      if (open) return
      scheduleShowIfReady()
    }, POLL_INTERVAL_MS)

    return () => {
      clearInterval(interval)
      if (showTimerRef.current) clearTimeout(showTimerRef.current)
    }
  }, [onChartsPage, open, scheduleShowIfReady])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    closeBtnRef.current?.focus()
    return () => {
      window.removeEventListener('keydown', onKey)
      document.body.style.overflow = prevOverflow
    }
  }, [open, close])

  if (!open) return null

  const es = lang === 'es'

  return (
    <div
      className="fixed inset-0 z-[210] flex items-center justify-center p-3 sm:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby="charts-promo-title"
    >
      <button
        type="button"
        aria-label={dict.close}
        onClick={close}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px] cursor-default"
      />

      <div className="relative z-10 w-full max-w-4xl border-[5px] sm:border-[6px] border-[var(--ink)] bg-[var(--paper)] shadow-[10px_10px_0_rgba(0,0,0,0.35)] max-h-[92vh] overflow-y-auto motion-safe:animate-[stamp_0.45s_ease-out]">
        <div className="danger-bar" />

        <div className="grid grid-cols-1 md:grid-cols-2">
          <div className="relative bg-[var(--paper-dark)] border-b-[5px] md:border-b-0 md:border-r-[5px] border-[var(--ink)] aspect-[4/5] md:aspect-auto md:min-h-[520px]">
            <Image
              src={
                lang === 'en'
                  ? '/images/promo/charts-promo-en.webp'
                  : '/images/promo/charts-promo.webp'
              }
              alt={dict.image_alt}
              fill
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover md:object-contain"
            />
            <div
              className="absolute -top-3 -right-3 sm:-top-4 sm:-right-4 bg-[var(--yellow)] border-[3px] border-[var(--ink)] px-3 py-1 rotate-[-6deg] shadow-[3px_3px_0_var(--ink)]"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: '11px',
                fontWeight: 700,
                letterSpacing: '2px',
                textTransform: 'uppercase',
              }}
            >
              {es ? 'ESCUCHA YA' : 'PRESS PLAY'}
            </div>
          </div>

          <div className="p-5 sm:p-7 flex flex-col gap-4 relative">
            <button
              ref={closeBtnRef}
              type="button"
              onClick={close}
              aria-label={dict.close}
              className="absolute top-2 right-2 sm:top-3 sm:right-3 w-9 h-9 border-[3px] border-[var(--ink)] bg-[var(--paper)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors flex items-center justify-center"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontSize: '18px',
                fontWeight: 900,
                lineHeight: 1,
              }}
            >
              ×
            </button>

            <span
              className="sec-tag self-start mb-0"
              style={{ background: 'var(--red)', color: 'white', borderColor: 'var(--red)' }}
            >
              {dict.kicker}
            </span>

            <h2
              id="charts-promo-title"
              className="font-black uppercase leading-[0.95] tracking-tight"
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontSize: 'clamp(26px, 5.2vw, 40px)',
                letterSpacing: '-0.02em',
              }}
            >
              <span className="hl">{dict.title}</span>
            </h2>

            <p
              className="text-[13px] sm:text-[14px] leading-relaxed text-[var(--text-muted)]"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {dict.subtitle}
            </p>

            <ul className="grid gap-2 mt-1">
              {dict.bullets.map((line, i) => (
                <li
                  key={i}
                  className="flex items-start gap-2 text-[13px] sm:text-[14px] leading-snug"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  <span
                    className="inline-block mt-[2px] shrink-0 w-5 text-center font-black"
                    style={{ color: 'var(--red)' }}
                    aria-hidden="true"
                  >
                    ▶
                  </span>
                  <span dangerouslySetInnerHTML={{ __html: line }} />
                </li>
              ))}
            </ul>

            <div className="flex flex-col sm:flex-row gap-2 mt-3">
              <Link
                href={`/${lang}/charts`}
                onClick={close}
                className="flex-1 text-center px-5 py-3 border-[3px] border-[var(--ink)] bg-[var(--red)] text-white shadow-[4px_4px_0_var(--ink)] hover:translate-y-[1px] hover:shadow-[2px_2px_0_var(--ink)] transition-transform"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  fontSize: '13px',
                  fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                }}
              >
                {dict.cta_primary}
              </Link>
              <button
                type="button"
                onClick={close}
                className="flex-1 px-5 py-3 border-[3px] border-[var(--ink)] bg-transparent hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  fontSize: '12px',
                  fontWeight: 700,
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                }}
              >
                {dict.cta_secondary}
              </button>
            </div>
          </div>
        </div>

        <div className="danger-bar" />
      </div>
    </div>
  )
}
