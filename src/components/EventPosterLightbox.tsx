'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CardThumbnail from '@/components/CardThumbnail'
import { displayImageUrl } from '@/lib/image-url'

type Props = {
  src: string | null | undefined
  alt: string
  zoomAria: string
  closeLabel: string
  lightboxTitle: string
  cancelled?: boolean
  cancelledLabel?: string
}

/** Sello diagonal sobre el cartel original (ficha, listado y redes). */
export function EventCancelledStamp({
  label,
  size = 'card',
}: {
  label: string
  size?: 'hero' | 'card' | 'thumb'
}) {
  const textClass =
    size === 'hero'
      ? 'text-[clamp(26px,7.2vw,48px)] tracking-[0.14em] py-2.5 sm:py-3.5'
      : size === 'thumb'
        ? 'text-[8px] tracking-[0.08em] py-0.5'
        : 'text-[clamp(11px,2.1vw,17px)] tracking-[0.1em] py-1'
  return (
    <div className="pointer-events-none absolute inset-0 z-[3] overflow-hidden" aria-hidden>
      <div className="absolute inset-0 bg-[var(--ink)]/32" />
      <div className="absolute left-[-28%] right-[-28%] top-1/2 -translate-y-1/2 rotate-[-13deg] border-y-[4px] border-[var(--ink)] bg-[var(--red)] text-center shadow-[0_4px_0_rgba(0,0,0,0.35)]">
        <span
          className={`block font-black uppercase text-white ${textClass}`}
          style={{ fontFamily: "'Unbounded', sans-serif" }}
        >
          {label}
        </span>
      </div>
    </div>
  )
}

export default function EventPosterLightbox({
  src,
  alt,
  zoomAria,
  closeLabel,
  lightboxTitle,
  cancelled = false,
  cancelledLabel = 'CANCELADO',
}: Props) {
  const url = displayImageUrl(src)?.trim()
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)
  const closeBtnRef = useRef<HTMLButtonElement>(null)

  useEffect(() => setMounted(true), [])

  useEffect(() => {
    if (!open) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    window.addEventListener('keydown', onKey)
    queueMicrotask(() => closeBtnRef.current?.focus())
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [open])

  const modal =
    mounted &&
    open &&
    url &&
    createPortal(
      <div
        className="fixed inset-0 z-[400] box-border"
        role="dialog"
        aria-modal="true"
        aria-label={lightboxTitle}
      >
        {/* Capa de fondo: clic fuera del cartel cierra (toda el área oscura) */}
        <div
          role="presentation"
          className="absolute inset-0 cursor-pointer bg-[var(--ink)]/92"
          onClick={() => setOpen(false)}
        />
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center p-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))] sm:p-8">
          {/* Marco solo alrededor del cartel (no pantalla completa): la X queda junto al borde del póster */}
          <div
            className="pointer-events-auto relative z-[1] inline-block max-h-[min(88dvh,calc(100dvh-2rem))] max-w-[min(100%,calc(100vw-2rem))] border-4 border-[var(--paper)] bg-[var(--paper-dark)] shadow-[8px_8px_0_rgba(232,220,200,0.2)] sm:max-w-[min(100%,calc(100vw-4rem))]"
            onClick={(e) => e.stopPropagation()}
            role="presentation"
          >
            <button
              ref={closeBtnRef}
              type="button"
              onClick={(e) => {
                e.stopPropagation()
                setOpen(false)
              }}
              className="absolute z-[2] flex h-11 min-h-[44px] min-w-[44px] w-11 items-center justify-center border-4 border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] shadow-[4px_4px_0_var(--ink)] transition-colors hover:bg-[var(--red)] hover:text-white right-2 top-2 sm:right-3 sm:top-3"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 900,
                fontSize: '22px',
                lineHeight: 1,
              }}
              aria-label={closeLabel}
            >
              ×
            </button>
            {/* eslint-disable-next-line @next/next/no-img-element -- URL dinámica evento */}
            <div className="relative inline-block max-w-full">
              <img
                src={url}
                alt={alt}
                className="block max-h-[min(82dvh,calc(100dvh-5.5rem))] w-auto max-w-full object-contain"
              />
              {cancelled ? <EventCancelledStamp label={cancelledLabel} size="hero" /> : null}
            </div>
          </div>
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      <div className="relative w-full overflow-hidden">
        <CardThumbnail
          src={url}
          alt={alt}
          aspectClass="aspect-poster w-full"
          frameClass="border-0"
          fit="contain"
        />
        {cancelled ? <EventCancelledStamp label={cancelledLabel} size="hero" /> : null}
        {url ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="absolute inset-0 z-[2] flex cursor-zoom-in items-end justify-end bg-transparent p-3 text-[var(--ink)] outline-none transition-colors hover:bg-[rgba(26,26,26,0.05)] focus-visible:ring-2 focus-visible:ring-[var(--ink)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--paper)]"
            aria-label={zoomAria}
          >
            <span
              className="pointer-events-none flex h-11 w-11 items-center justify-center border-4 border-[var(--ink)] bg-[var(--yellow)] shadow-[4px_4px_0_var(--ink)]"
              aria-hidden
            >
              <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round">
                <circle cx="10" cy="10" r="6.5" />
                <path d="M14.5 14.5L21 21" />
              </svg>
            </span>
          </button>
        ) : null}
      </div>
      {modal}
    </>
  )
}
