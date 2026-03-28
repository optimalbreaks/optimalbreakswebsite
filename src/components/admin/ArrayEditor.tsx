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
      {label && (
        <label className="block text-sm font-medium text-gray-300">
          {label}
        </label>
      )}
      {value.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {value.map((item, i) => (
            <span
              key={i}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-md bg-[#2a2a4a] text-gray-200 text-sm"
            >
              {item}
              <button
                type="button"
                onClick={() => remove(i)}
                className="ml-1 text-gray-500 hover:text-red-400 transition-colors"
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
          className="flex-1 px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#4a4a6a]"
        />
        <button
          type="button"
          onClick={add}
          className="px-3 py-2 rounded-md bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-200 text-sm transition-colors"
        >
          Añadir
        </button>
      </div>
    </div>
  )
}
