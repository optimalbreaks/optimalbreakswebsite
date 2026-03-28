'use client'

import { useState, useEffect } from 'react'

interface JsonEditorProps {
  value: any
  onChange: (val: any) => void
  label?: string
}

export default function JsonEditor({ value, onChange, label }: JsonEditorProps) {
  const [text, setText] = useState(() => JSON.stringify(value, null, 2) ?? '{}')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    setText(JSON.stringify(value, null, 2) ?? '{}')
    setError(null)
  }, [value])

  const handleBlur = () => {
    try {
      const parsed = JSON.parse(text)
      setError(null)
      onChange(parsed)
    } catch (e: any) {
      setError(e.message)
    }
  }

  return (
    <div className="space-y-2">
      {label && (
        <label className="block text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        rows={8}
        spellCheck={false}
        className={`w-full px-3 py-2 rounded-md bg-[#12121f] border text-gray-200 text-sm font-mono focus:outline-none resize-y ${
          error
            ? 'border-red-500 focus:border-red-400'
            : 'border-[#2a2a4a] focus:border-[#4a4a6a]'
        }`}
      />
      {error && <p className="text-xs text-red-400">JSON inválido: {error}</p>}
    </div>
  )
}
