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
  /** Si se omite, no se muestra el botón «+ Nuevo». */
  newHref?: string
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
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
        <input
          type="text"
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder={searchPlaceholder}
          className="admin-input flex-1 max-w-md"
        />
        {newHref ? (
          <Link href={newHref} className="admin-btn admin-btn--yellow no-underline text-center sm:text-left">
            + Nuevo
          </Link>
        ) : null}
      </div>

      <div className="overflow-x-auto border-[3px] border-[var(--ink)] bg-[#fffef6] shadow-[6px_6px_0_rgba(26,26,26,0.12)]">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[var(--yellow)] border-b-[3px] border-[var(--ink)]">
              {columns.map((col) => (
                <th
                  key={col.key}
                  className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  {col.label}
                </th>
              ))}
              <th
                className="px-4 py-3 text-right text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                Acciones
              </th>
            </tr>
          </thead>
          <tbody className="divide-y-[3px] divide-[var(--ink)]">
            {data.map((row, i) => (
              <tr
                key={row.id ?? i}
                className="bg-[var(--paper)] hover:bg-[var(--paper-dark)] transition-colors"
              >
                {columns.map((col) => (
                  <td
                    key={col.key}
                    className="px-4 py-3 text-[var(--ink)]"
                    style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}
                  >
                    {col.render
                      ? col.render(row[col.key], row)
                      : (row[col.key] ?? '—')}
                  </td>
                ))}
                <td className="px-4 py-3 text-right space-x-2 whitespace-nowrap">
                  <Link href={editHref(row)} className="admin-btn admin-btn--ghost admin-btn--sm no-underline">
                    Editar
                  </Link>
                  {onDelete && (
                    <button
                      type="button"
                      onClick={() => handleDelete(row.id)}
                      onBlur={() => setConfirmId(null)}
                      className={`admin-btn admin-btn--sm ${
                        confirmId === row.id ? '' : 'admin-btn--ghost'
                      }`}
                      style={
                        confirmId === row.id
                          ? { background: 'var(--red)', color: '#fff' }
                          : undefined
                      }
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
                  className="px-4 py-8 text-center admin-muted normal-case"
                >
                  Sin resultados
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      <div
        className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 text-[var(--text-muted)]"
        style={{ fontFamily: "'Courier Prime', monospace", fontSize: '12px' }}
      >
        <span>
          {count} registro{count !== 1 ? 's' : ''} — Página {page} de {totalPages}
        </span>
        <div className="flex gap-2">
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className="admin-btn admin-btn--ghost admin-btn--sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            ← Anterior
          </button>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className="admin-btn admin-btn--ghost admin-btn--sm disabled:opacity-30 disabled:cursor-not-allowed"
          >
            Siguiente →
          </button>
        </div>
      </div>
    </div>
  )
}
