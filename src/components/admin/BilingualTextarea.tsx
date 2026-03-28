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
      {label && (
        <label className="block text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <div className="flex gap-px bg-[#12121f] rounded-t-md overflow-hidden border border-b-0 border-[#2a2a4a]">
        {(['es', 'en'] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={`flex-1 px-4 py-2 text-sm font-medium uppercase transition-colors ${
              tab === t
                ? 'bg-[#2a2a4a] text-white'
                : 'text-gray-500 hover:text-gray-300'
            }`}
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
        className="w-full px-3 py-2 rounded-b-md bg-[#12121f] border border-t-0 border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a] resize-y"
      />
    </div>
  )
}
