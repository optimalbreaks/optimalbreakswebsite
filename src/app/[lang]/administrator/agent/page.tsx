'use client'

import { useState, useEffect } from 'react'
import { adminCreate } from '@/lib/admin-api'
import { useParams, useRouter } from 'next/navigation'

function toSlug(name: string): string {
  return name
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export default function AgentPage() {
  const params = useParams()
  const router = useRouter()
  const lang = (params.lang as string) || 'es'

  const [artistName, setArtistName] = useState('')
  const [slug, setSlug] = useState('')
  const [notes, setNotes] = useState('')
  const [search, setSearch] = useState(true)
  const [loading, setLoading] = useState(false)
  const [result, setResult] = useState<Record<string, unknown> | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    setSlug(toSlug(artistName))
  }, [artistName])

  async function handleGenerate(e: React.FormEvent) {
    e.preventDefault()
    if (!artistName.trim()) return

    setLoading(true)
    setError(null)
    setResult(null)
    setSaved(false)

    try {
      const res = await fetch('/api/admin/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ slug, artistName, notes, search }),
      })

      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error || res.statusText)
      }

      const json = await res.json()
      setResult(json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error desconocido')
    } finally {
      setLoading(false)
    }
  }

  async function handleSave() {
    if (!result) return
    setError(null)
    setSaved(false)

    try {
      await adminCreate('artists', result)
      setSaved(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error al guardar')
    }
  }

  function handleDownload() {
    if (!result) return
    const blob = new Blob([JSON.stringify(result, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${slug}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div className="min-h-screen bg-[#12121f] text-gray-200 p-6 md:p-10">
      <div className="max-w-3xl mx-auto space-y-8">
        <h1 className="text-2xl font-bold text-white">Agente IA — Generador de Biografías</h1>

        <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-6">
          <form onSubmit={handleGenerate} className="space-y-5">
            <div>
              <label htmlFor="artistName" className="block text-sm font-medium text-gray-300 mb-1">
                Nombre del artista
              </label>
              <input
                id="artistName"
                type="text"
                required
                value={artistName}
                onChange={(e) => setArtistName(e.target.value)}
                placeholder="Ej: Charlotte de Witte"
                className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
              />
            </div>

            <div>
              <label htmlFor="slug" className="block text-sm font-medium text-gray-300 mb-1">
                Slug
              </label>
              <input
                id="slug"
                type="text"
                value={slug}
                onChange={(e) => setSlug(e.target.value)}
                className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
              />
            </div>

            <div>
              <label htmlFor="notes" className="block text-sm font-medium text-gray-300 mb-1">
                Notas editoriales (opcional)
              </label>
              <textarea
                id="notes"
                rows={3}
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Indicaciones adicionales para el agente..."
                className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a] resize-y"
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                id="search"
                type="checkbox"
                checked={search}
                onChange={(e) => setSearch(e.target.checked)}
                className="w-4 h-4 rounded border-[#2a2a4a] bg-[#12121f] text-emerald-600 focus:ring-emerald-600"
              />
              <label htmlFor="search" className="text-sm text-gray-300">
                Buscar información en la web (SerpAPI)
              </label>
            </div>

            <button
              type="submit"
              disabled={loading || !artistName.trim()}
              className="px-6 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Generar
            </button>
          </form>
        </div>

        {loading && (
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-6 text-center">
            <p className="text-emerald-400 animate-pulse text-lg">Generando biografía con IA...</p>
          </div>
        )}

        {error && (
          <div className="bg-red-900/30 border border-red-700/50 rounded-xl p-4">
            <p className="text-red-300 text-sm">{error}</p>
          </div>
        )}

        {result && (
          <div className="bg-[#1a1a2e] border border-[#2a2a4a] rounded-xl p-6 space-y-4">
            <h2 className="text-lg font-semibold text-white">Resultado</h2>

            <textarea
              readOnly
              value={JSON.stringify(result, null, 2)}
              rows={20}
              className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-300 text-sm font-mono focus:outline-none resize-y"
            />

            <div className="flex gap-3">
              <button
                onClick={handleSave}
                className="px-6 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
              >
                Guardar en BD
              </button>
              <button
                onClick={handleDownload}
                className="px-4 py-2 rounded-md bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-200 text-sm transition-colors"
              >
                Descargar JSON
              </button>
            </div>

            {saved && (
              <p className="text-emerald-400 text-sm">Artista guardado correctamente en la base de datos.</p>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
