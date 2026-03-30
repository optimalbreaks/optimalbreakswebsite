'use client'

import { useState } from 'react'

interface ArrayEditorProps {
  value: string[]
  onChange: (val: string[]) => void
  placeholder?: string
  label?: string
}

export default function ArrayEditor({
  value,
  onChange,
  placeholder = 'Añadir elemento…',
  label,
}: ArrayEditorProps) {
  const [input, setInput] = useState('')

  const add = () => {
    const trimmed = input.trim()
    if (!trimmed) return
    onChange([...value, trimmed])
    setInput('')
  }

  const remove = (index: number) => {
    onChange(value.filter((_, i) => i !== index))
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      add()
    }
  }

  return (
    <div className="space-y-2">
      {label && <label className="admin-label">{label}</label>}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 cutout fill text-xs"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {item}
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-0.5 opacity-70 hover:opacity-100 hover:text-[var(--red)] transition-opacity"
                aria-label="Quitar"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}
      <div className="flex gap-2">
        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          className="admin-input flex-1"
        />
        <button type="button" onClick={add} className="admin-btn admin-btn--ghost admin-btn--sm shrink-0">
          Añadir
        </button>
      </div>
    </div>
  )
}
