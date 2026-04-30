// ============================================
// OPTIMAL BREAKS — Modal promocional CHARTS
// Aparece en la primera visita (a los 1.5 s) y se vuelve a
// mostrar cada 5 min mientras el usuario navega por el sitio,
// salvo en /[lang]/charts (ya está dentro).
// Estética fanzine/brutalist (cream + ink + red + yellow).
// ============================================

'use client'

import Link from 'next/link'
import Image from 'next/image'
import { usePathname } from 'next/navigation'
import { useCallback, useEffect, useRef, useState } from 'react'

/** ms desde la última vez que mostramos el modal hasta volver a mostrarlo. */
const PROMO_REOPEN_MS = 5 * 60 * 1000 // 5 minutos
/** retraso antes de la primera apertura (deja respirar al hero). */
const FIRST_SHOW_DELAY_MS = 1500
/** cada cuánto comprobamos si toca reabrir mientras el modal está cerrado. */
const POLL_INTERVAL_MS = 30 * 1000

const LS_LAST_SHOWN = 'ob_charts_promo_last_shown_at'

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
    /* localStorage puede estar bloqueado (modo incógnito ZIP, iframe, etc.) */
  }
}

export default function ChartsPromoModal({ lang, dict }: Props) {
  const pathname = usePathname() || ''
  // Si ya está en la página de charts, no tiene sentido empujar nada.
  const onChartsPage = pathname.includes(`/${lang}/charts`) || pathname.endsWith('/charts')

  const [open, setOpen] = useState(false)
  const closeBtnRef = useRef<HTMLButtonElement | null>(null)

  const showNow = useCallback(() => {
    setOpen(true)
    writeLastShown(Date.now())
  }, [])

  const close = useCallback(() => {
    setOpen(false)
    // Al cerrar, marcamos que se acaba de ver para que el siguiente
    // ciclo de 5 min cuente desde ahora, no desde la apertura.
    writeLastShown(Date.now())
  }, [])

  // Apertura inicial + polling para reabrir cada PROMO_REOPEN_MS.
  useEffect(() => {
    if (onChartsPage) return
    let timer: ReturnType<typeof setTimeout> | null = null
    let interval: ReturnType<typeof setInterval> | null = null

    const last = readLastShown()
    const now = Date.now()

    if (last == null) {
      timer = setTimeout(showNow, FIRST_SHOW_DELAY_MS)
    } else {
      const remaining = PROMO_REOPEN_MS - (now - last)
      if (remaining <= 0) {
        timer = setTimeout(showNow, FIRST_SHOW_DELAY_MS)
      } else {
        timer = setTimeout(showNow, remaining)
      }
    }

    interval = setInterval(() => {
      if (open) return
      const last2 = readLastShown()
      if (last2 == null) return
      if (Date.now() - last2 >= PROMO_REOPEN_MS) showNow()
    }, POLL_INTERVAL_MS)

    return () => {
      if (timer) clearTimeout(timer)
      if (interval) clearInterval(interval)
    }
    // showNow + open son referencias estables / leídas dentro; sólo dependemos de la ruta.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChartsPage])

  // ESC para cerrar + bloqueo de scroll del body mientras está abierto.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') close()
    }
    window.addEventListener('keydown', onKey)
    const prevOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    // Foco al cerrar: accesibilidad.
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
      {/* Overlay: clic fuera cierra. */}
      <button
        type="button"
        aria-label={dict.close}
        onClick={close}
        className="absolute inset-0 bg-black/65 backdrop-blur-[2px] cursor-default"
      />

      {/* Caja principal. shake muy sutil al entrar (animación ya definida en globals.css). */}
      <div
        className="relative z-10 w-full max-w-4xl border-[5px] sm:border-[6px] border-[var(--ink)] bg-[var(--paper)] shadow-[10px_10px_0_rgba(0,0,0,0.35)] max-h-[92vh] overflow-y-auto motion-safe:animate-[stamp_0.45s_ease-out]"
      >
        {/* Tira de peligro arriba */}
        <div className="danger-bar" />

        <div className="grid grid-cols-1 md:grid-cols-2">
          {/* Imagen — móvil: object-cover (al usuario le gusta así).
                     desktop: object-contain para no recortar las
                     palabras del cartel ("VINYL PICKS", "SAVE",
                     "COMMUNITY LIST"); el fondo `paper-dark` rellena
                     los laterales en la misma paleta. */}
          <div className="relative bg-[var(--paper-dark)] border-b-[5px] md:border-b-0 md:border-r-[5px] border-[var(--ink)] aspect-[4/5] md:aspect-auto md:min-h-[520px]">
            <Image
              src={
                lang === 'en'
                  ? '/images/promo/charts-promo-en.webp'
                  : '/images/promo/charts-promo.webp'
              }
              alt={dict.image_alt}
              fill
              priority
              sizes="(min-width: 768px) 50vw, 100vw"
              className="object-cover md:object-contain"
            />
            {/* Pegatina rotada para reforzar el "fanzine" */}
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

          {/* Texto + CTAs */}
          <div className="p-5 sm:p-7 flex flex-col gap-4 relative">
            {/* Cerrar (X) — esquina superior derecha del bloque */}
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

            {/* Bullets de listas */}
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

            {/* CTAs */}
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

        {/* Tira de peligro abajo */}
        <div className="danger-bar" />
      </div>
    </div>
  )
}
