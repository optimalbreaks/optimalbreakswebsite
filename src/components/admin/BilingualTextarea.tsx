'use client'

import { useState } from 'react'

interface BilingualTextareaProps {
  valueEn: string
  valueEs: string
  onChangeEn: (val: string) => void
  onChangeEs: (val: string) => void
  label?: string
  rows?: number
}

export default function BilingualTextarea({
  valueEn,
  valueEs,
  onChangeEn,
  onChangeEs,
  label,
  rows = 8,
}: BilingualTextareaProps) {
  const [tab, setTab] = useState<'en' | 'es'>('es')

  return (
    <div className="space-y-2">
      {label && <label className="admin-label">{label}</label>}
      <div className="border-[3px] border-[var(--ink)] bg-[#fffef6] shadow-[4px_4px_0_rgba(26,26,26,0.12)]">
        <div className="flex border-b-[3px] border-[var(--ink)]">
          {(['es', 'en'] as const).map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`flex-1 px-4 py-2.5 text-[11px] font-bold uppercase tracking-wider transition-colors border-r-[3px] border-[var(--ink)] last:border-r-0 ${
                tab === t
                  ? 'bg-[var(--red)] text-white'
                  : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'
              }`}
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {t}
            </button>
          ))}
        </div>
        <textarea
          value={tab === 'en' ? valueEn : valueEs}
          onChange={(e) =>
            tab === 'en' ? onChangeEn(e.target.value) : onChangeEs(e.target.value)
          }
          rows={rows}
          className="w-full px-3 py-2.5 bg-transparent text-[var(--ink)] resize-y border-0 focus:outline-none focus:ring-0 focus-visible:shadow-[inset_0_0_0_3px_var(--yellow)]"
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}
        />
      </div>
    </div>
  )
}
