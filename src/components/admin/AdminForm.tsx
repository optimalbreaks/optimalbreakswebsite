'use client'

import Link from 'next/link'

interface AdminFormProps {
  children: React.ReactNode
  onSubmit: (e: React.FormEvent) => void
  loading?: boolean
  title: string
  backHref: string
}

export default function AdminForm({
  children,
  onSubmit,
  loading = false,
  title,
  backHref,
}: AdminFormProps) {
  return (
    <form onSubmit={onSubmit} className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold text-gray-100">{title}</h1>
        <Link
          href={backHref}
          className="px-3 py-1.5 rounded-md bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-300 text-sm transition-colors"
        >
          ← Volver
        </Link>
      </div>

      <div className="rounded-lg border border-[#2a2a4a] bg-[#1a1a2e] p-6">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>
      </div>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={loading}
          className="px-6 py-2.5 rounded-md bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm font-medium transition-colors"
        >
          {loading ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
