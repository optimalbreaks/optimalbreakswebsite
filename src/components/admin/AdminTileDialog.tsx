'use client'

import { useRef, type ReactNode } from 'react'

const MONO = { fontFamily: "'Courier Prime', monospace" } as const
const DISPLAY = { fontFamily: "'Unbounded', sans-serif" } as const

/** Casilla con cifra; al pulsarla abre la lista en una ventana (dialog nativo, capa superior). */
export default function AdminTileDialog({
  label,
  value,
  hint,
  title,
  tone = 'paper',
  children,
}: {
  label: string
  value: number | string
  hint?: string
  title: string
  tone?: 'paper' | 'yellow' | 'muted'
  children: ReactNode
}) {
  const ref = useRef<HTMLDialogElement>(null)
  const empty = value === 0 || value === '0'
  const bg = tone === 'yellow' ? 'bg-[var(--yellow)]' : tone === 'muted' ? 'bg-[#eeeade]' : 'bg-white'

  return (
    <>
      <button
        type="button"
        disabled={empty}
        onClick={() => ref.current?.showModal()}
        className={`flex min-h-[88px] flex-col justify-between border-[3px] border-[var(--ink)] px-3 py-2 text-left transition-transform ${bg} ${
          empty ? 'cursor-default opacity-40' : 'cursor-pointer hover:-translate-y-0.5 active:translate-y-0'
        }`}
        style={empty ? undefined : { boxShadow: '3px 3px 0 var(--ink)' }}
      >
        <span className="text-[10px] font-bold uppercase tracking-wide" style={MONO}>
          {label}
        </span>
        <span className="text-2xl font-black leading-none" style={DISPLAY}>
          {value}
        </span>
        {hint ? (
          <span className="text-[10px] leading-snug opacity-70" style={MONO}>
            {hint}
          </span>
        ) : null}
      </button>
      <dialog
        ref={ref}
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close()
        }}
        className="m-auto w-[min(720px,calc(100vw-24px))] max-h-[85dvh] border-[3px] border-[var(--ink)] bg-[#fffef6] p-0 text-[var(--ink)] backdrop:bg-black/50"
        style={{ boxShadow: '6px 6px 0 var(--ink)' }}
      >
        <div className="sticky top-0 z-[1] flex items-center justify-between gap-3 border-b-[3px] border-[var(--ink)] bg-[var(--ink)] px-4 py-3 text-[var(--paper)]">
          <h3 className="text-sm font-black uppercase" style={DISPLAY}>
            {title}
          </h3>
          <button
            type="button"
            onClick={() => ref.current?.close()}
            className="border-[2px] border-[var(--paper)] px-2 py-0.5 text-[11px] font-bold uppercase"
            style={MONO}
            aria-label="Cerrar"
          >
            ✕
          </button>
        </div>
        <div className="p-4">{children}</div>
      </dialog>
    </>
  )
}
