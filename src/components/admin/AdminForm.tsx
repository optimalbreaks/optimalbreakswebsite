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
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <h1 className="admin-page-title !mb-0">{title}</h1>
        <Link href={backHref} className="btn-back !mb-0">
          <span className="arrow">←</span> Volver
        </Link>
      </div>

      <div className="admin-panel">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">{children}</div>
      </div>

      <div className="flex justify-end">
        <button type="submit" disabled={loading} className="admin-btn">
          {loading ? 'Guardando…' : 'Guardar'}
        </button>
      </div>
    </form>
  )
}
