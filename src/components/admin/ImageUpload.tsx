'use client'

import { useState, useRef } from 'react'
import Image from 'next/image'

interface ImageUploadProps {
  value: string | null
  onChange: (url: string | null) => void
  label?: string
}

export default function ImageUpload({
  value,
  onChange,
  label,
}: ImageUploadProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const handleFile = async (file: File) => {
    setError(null)
    setLoading(true)
    try {
      const form = new FormData()
      form.append('file', file)
      const res = await fetch('/api/admin/upload', {
        method: 'POST',
        body: form,
      })
      if (!res.ok) throw new Error('Error al subir imagen')
      const data = await res.json()
      onChange(data.url)
    } catch (e: any) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) handleFile(file)
  }

  return (
    <div className="space-y-2">
      {label && <label className="admin-label">{label}</label>}

      {value ? (
        <div className="relative inline-block">
          <Image
            src={value}
            alt="Preview"
            width={200}
            height={200}
            className="border-[3px] border-[var(--ink)] object-cover shadow-[4px_4px_0_var(--ink)]"
          />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="absolute top-1 right-1 w-7 h-7 flex items-center justify-center border-[3px] border-[var(--ink)] bg-[var(--red)] text-white text-sm font-bold leading-none hover:bg-[var(--ink)] transition-colors"
            aria-label="Quitar imagen"
          >
            ×
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          disabled={loading}
          className="w-full max-w-xs h-32 border-[3px] border-dashed border-[var(--ink)] bg-[#fffef6] flex flex-col items-center justify-center gap-2 text-[var(--text-muted)] hover:bg-[var(--yellow)]/40 hover:text-[var(--ink)] transition-colors cursor-pointer disabled:opacity-50"
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', fontWeight: 700 }}
        >
          {loading ? (
            <span className="animate-pulse">Subiendo…</span>
          ) : (
            <>
              <span className="text-2xl">📁</span>
              <span>Seleccionar imagen</span>
            </>
          )}
        </button>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        onChange={handleChange}
        className="hidden"
      />

      {error && (
        <p className="text-xs font-bold uppercase tracking-wide text-[var(--red)]">
          {error}
        </p>
      )}
    </div>
  )
}
