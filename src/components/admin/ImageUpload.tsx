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
      onChange(await uploadAdminImage(file))
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al subir imagen')
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

async function uploadAdminImage(file: File): Promise<string> {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch('/api/admin/upload', {
    method: 'POST',
    body: form,
  })
  if (!res.ok) throw new Error('Error al subir imagen')
  const data = await res.json()
  const url = typeof data.url === 'string' ? data.url.trim() : ''
  if (!url) throw new Error('Error al subir imagen')
  return url
}

/** Varias imágenes extra (horario, hoja de info…). El cartel de portada usa `ImageUpload`. */
export function ImageGalleryUpload({
  value,
  onChange,
  label = 'Más imágenes',
  hint,
}: {
  value: string[]
  onChange: (urls: string[]) => void
  label?: string
  hint?: string
}) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const urls = Array.isArray(value) ? value.filter((u) => typeof u === 'string' && u.trim()) : []

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return
    setError(null)
    setLoading(true)
    try {
      const added: string[] = []
      for (const file of Array.from(files)) {
        added.push(await uploadAdminImage(file))
      }
      const seen = new Set(urls)
      onChange([...urls, ...added.filter((u) => !seen.has(u))])
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Error al subir imagen')
    } finally {
      setLoading(false)
      if (inputRef.current) inputRef.current.value = ''
    }
  }

  const remove = (index: number) => {
    onChange(urls.filter((_, i) => i !== index))
  }

  const move = (index: number, dir: -1 | 1) => {
    const next = index + dir
    if (next < 0 || next >= urls.length) return
    const copy = [...urls]
    const tmp = copy[index]
    copy[index] = copy[next]
    copy[next] = tmp
    onChange(copy)
  }

  return (
    <div className="space-y-2">
      {label && <label className="admin-label">{label}</label>}
      {hint && (
        <p
          className="text-[var(--text-muted)]"
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', margin: 0 }}
        >
          {hint}
        </p>
      )}
      {urls.length > 0 && (
        <div className="flex flex-wrap gap-3">
          {urls.map((url, i) => (
            <div key={`${url}-${i}`} className="relative inline-block">
              <Image
                src={url}
                alt={`Imagen extra ${i + 1}`}
                width={140}
                height={180}
                className="border-[3px] border-[var(--ink)] object-contain bg-[#fffef6] shadow-[4px_4px_0_var(--ink)]"
              />
              <div className="absolute top-1 right-1 flex gap-1">
                {i > 0 && (
                  <button
                    type="button"
                    onClick={() => move(i, -1)}
                    className="w-7 h-7 flex items-center justify-center border-[3px] border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] text-sm font-bold leading-none hover:bg-[var(--ink)] hover:text-white transition-colors"
                    aria-label="Mover a la izquierda"
                  >
                    ‹
                  </button>
                )}
                {i < urls.length - 1 && (
                  <button
                    type="button"
                    onClick={() => move(i, 1)}
                    className="w-7 h-7 flex items-center justify-center border-[3px] border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] text-sm font-bold leading-none hover:bg-[var(--ink)] hover:text-white transition-colors"
                    aria-label="Mover a la derecha"
                  >
                    ›
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => remove(i)}
                  className="w-7 h-7 flex items-center justify-center border-[3px] border-[var(--ink)] bg-[var(--red)] text-white text-sm font-bold leading-none hover:bg-[var(--ink)] transition-colors"
                  aria-label="Quitar imagen"
                >
                  ×
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
      <button
        type="button"
        onClick={() => inputRef.current?.click()}
        disabled={loading}
        className="w-full max-w-xs h-24 border-[3px] border-dashed border-[var(--ink)] bg-[#fffef6] flex flex-col items-center justify-center gap-1 text-[var(--text-muted)] hover:bg-[var(--yellow)]/40 hover:text-[var(--ink)] transition-colors cursor-pointer disabled:opacity-50"
        style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px', fontWeight: 700 }}
      >
        {loading ? (
          <span className="animate-pulse">Subiendo…</span>
        ) : (
          <>
            <span className="text-xl">📁</span>
            <span>Añadir imagen(es)</span>
          </>
        )}
      </button>
      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        onChange={(e) => void handleFiles(e.target.files)}
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
