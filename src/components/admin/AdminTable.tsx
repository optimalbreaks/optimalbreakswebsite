'use client'

import Link from 'next/link'
import { useState } from 'react'

interface Column {
  key: string
  label: string
  render?: (value: any, row: any) => React.ReactNode
}

interface AdminTableProps {
  columns: Column[]
  data: any[]
  count: number
  page: number
  limit: number
  onPageChange: (page: number) => void
  onSearch: (term: string) => void
  onDelete?: (id: string) => void
  editHref: (row: any) => string
  newHref: string
  searchPlaceholder?: string
}

export default function AdminTable({
  columns,
  data,
  count,
  page,
  limit,
  onPageChange,
  onSearch,
  onDelete,
  editHref,
  newHref,
  searchPlaceholder = 'Buscar…',
}: AdminTableProps) {
  const [search, setSearch] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const totalPages = Math.max(1, Math.ceil(count / limit))

  const handleSearch = (val: string) => {
    setSearch(val)
    onSearch(val)
  }

  const handleDelete = (id: string) => {
    if (confirmId === id) {
      onDelete?.(id)
      setConfirmId(null)
    } else {
      setConfirmId(id)
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="flex-1 max-w-sm px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm placeholder:text-gray-500 focus:outline-none focus:border-[#4a4a6a]"
        />
        <Link
          href={newHref}
          className="px-4 py-2 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-sm font-medium transition-colors"
        >
          + Nuevo
        </Link>
      </div>

      <div className="overflow-x-auto rounded-lg border border-[#2a2a4a]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#12121f] border-b border-[#2a2a4a]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wider text-gray-400"
                >
                  {col.label}
                </th>
              ))}
              <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wider text-gray-400">
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#2a2a4a]">
            {data.map((row, i) => (
              <tr
                key={row.id ?? i}
                className="bg-[#1a1a2e] hover:bg-[#22223a] transition-colors"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-gray-200">
                    {col.render
                      ? col.render(row[col.key], row)
                      : (row[col.key] ?? '—')}
                  </td>
                ))}
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  <Link
                    href={editHref(row)}
                    className="inline-block px-3 py-1 rounded bg-[#2a2a4a] hover:bg-[#3a3a5a] text-gray-200 text-xs transition-colors"
                  >
                    Editar
                  </Link>
                  {onDelete && (
                    <button
                      onClick={() => handleDelete(row.id)}
                      onBlur={() => setConfirmId(null)}
                      className={`inline-block px-3 py-1 rounded text-xs transition-colors ${
                        confirmId === row.id
                          ? 'bg-red-600 text-white'
                          : 'bg-[#2a2a4a] hover:bg-red-900/50 text-gray-400 hover:text-red-300'
                      }`}
                    >
                      {confirmId === row.id ? '¿Seguro?' : 'Eliminar'}
                    </button>
                  )}
                </td>
              </tr>
            ))}
            {data.length === 0 && (
              <tr>
                <td
                  colSpan={columns.length + 1}
                  className="px-4 py-8 text-center text-gray-500"
                >
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="flex items-center justify-between text-sm text-gray-400">
        <span>
          {count} registro{count !== 1 ? 's' : ''} — Página {page} de{' '}
          {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="px-3 py-1 rounded bg-[#2a2a4a] hover:bg-[#3a3a5a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            ← Anterior
          </button>
          <button
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="px-3 py-1 rounded bg-[#2a2a4a] hover:bg-[#3a3a5a] disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  )
}
