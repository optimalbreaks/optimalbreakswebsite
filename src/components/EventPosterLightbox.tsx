'use client'

import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import CardThumbnail from '@/components/CardThumbnail'

type Props = {
  src: string | null | undefined
  alt: string
  zoomAria: string
  closeLabel: string
  lightboxTitle: string
}

export default function EventPosterLightbox({
  src,
  alt,
  zoomAria,
  closeLabel,
  lightboxTitle,
}: Props) {
  const url = src?.trim()
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
        className="fixed inset-0 z-[400] flex items-center justify-center bg-[var(--ink)]/92 p-3 sm:p-6 box-border"
        role="dialog"
        aria-modal="true"
        aria-label={lightboxTitle}
        onClick={() => setOpen(false)}
      >
        <button
          ref={closeBtnRef}
          type="button"
          onClick={(e) => {
            e.stopPropagation()
            setOpen(false)
          }}
          className="absolute right-3 top-3 z-[2] border-4 border-[var(--ink)] bg-[var(--yellow)] px-3 py-2 text-[var(--ink)] shadow-[4px_4px_0_var(--ink)] transition-colors hover:bg-[var(--red)] hover:text-white"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 900,
            fontSize: '18px',
            lineHeight: 1,
          }}
          aria-label={closeLabel}
        >
          ×
        </button>
        <div
          className="relative z-[1] box-border flex h-[min(94dvh,calc(100vh-2.5rem))] w-[min(100%,calc(100vw-1.5rem))] max-h-[min(94dvh,calc(100vh-2.5rem))] max-w-[min(100%,calc(100vw-1.5rem))] shrink-0 items-center justify-center border-4 border-[var(--paper)] shadow-[8px_8px_0_rgba(232,220,200,0.2)] sm:w-[min(100%,calc(100vw-3rem))] sm:max-w-[min(100%,calc(100vw-3rem))]"
          onClick={(e) => e.stopPropagation()}
        >
          {/* eslint-disable-next-line @next/next/no-img-element -- URL dinámica evento */}
          <img src={url} alt={alt} className="h-full w-full object-contain" />
        </div>
      </div>,
      document.body,
    )

  return (
    <>
      <div className="relative w-full">
        <CardThumbnail
          src={url}
          alt={alt}
          aspectClass="aspect-poster w-full"
          frameClass="border-0"
          fit="contain"
        />
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
