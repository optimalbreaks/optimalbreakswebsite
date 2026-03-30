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
      {label && <label className="admin-label">{label}</label>}
      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={handleBlur}
        rows={8}
        spellCheck={false}
        className={`admin-input admin-input-mono resize-y ${
          error ? '!border-[var(--red)] focus:!shadow-[4px_4px_0_var(--red)]' : ''
        }`}
      />
      {error && (
        <p className="text-xs font-bold text-[var(--red)]">
          JSON inválido: {error}
        </p>
      )}
    </div>
  )
}
