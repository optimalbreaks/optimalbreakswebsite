'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'

interface Column {
  key: string
  label: string
  render?: (value: any, row: any) => React.ReactNode
  sortable?: boolean
  /** Dirección al pulsar la columna por primera vez. */
  sortDefault?: 'asc' | 'desc'
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
  sortKey?: string | null
  sortDir?: 'asc' | 'desc'
  onSort?: (key: string, dir: 'asc' | 'desc') => void
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
  sortKey = null,
  sortDir = 'asc',
  onSort,
}: AdminTableProps) {
  const [search, setSearch] = useState('')
  const [confirmId, setConfirmId] = useState<string | null>(null)
  const searchTimer = useRef<ReturnType<typeof setTimeout> | null>(null)
  const totalPages = Math.max(1, Math.ceil(count / limit))

  useEffect(() => {
    return () => {
      if (searchTimer.current) clearTimeout(searchTimer.current)
    }
  }, [])

  const handleSort = (col: Column) => {
    if (!onSort || col.sortable === false) return
    if (sortKey === col.key) {
      onSort(col.key, sortDir === 'asc' ? 'desc' : 'asc')
    } else {
      onSort(col.key, col.sortDefault ?? 'asc')
    }
  }

  const handleSearch = (val: string) => {
    setSearch(val)
    if (searchTimer.current) clearTimeout(searchTimer.current)
    // Vaciar el campo aplica al instante: si no, una respuesta lenta del
    // filtro anterior deja la tabla a 4 filas con el buscador ya limpio.
    if (!val.trim()) {
      searchTimer.current = null
      onSearch('')
      return
    }
    searchTimer.current = setTimeout(() => {
      searchTimer.current = null
      onSearch(val)
    }, 280)
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
        <div className="relative flex-1 max-w-md">
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            placeholder={searchPlaceholder}
            className="admin-input w-full"
            style={{ paddingRight: 36 }}
            autoComplete="off"
            spellCheck={false}
          />
          {search ? (
            <button
              type="button"
              onClick={() => handleSearch('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 bg-transparent border-0 p-1 cursor-pointer text-[var(--dim)] hover:text-[var(--red)] text-lg leading-none"
              title="Limpiar búsqueda"
              aria-label="Limpiar búsqueda"
            >
              ×
            </button>
          ) : null}
        </div>
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
              {columns.map((col) => {
                const canSort = Boolean(onSort) && col.sortable !== false
                const active = sortKey === col.key
                const ariaSort = !canSort
                  ? undefined
                  : active
                    ? sortDir === 'asc'
                      ? 'ascending'
                      : 'descending'
                    : 'none'
                return (
                  <th
                    key={col.key}
                    aria-sort={ariaSort}
                    className="px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]"
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={() => handleSort(col)}
                        title={`Ordenar por ${col.label}`}
                        className="inline-flex items-center gap-1 bg-transparent border-0 p-0 cursor-pointer font-inherit text-inherit uppercase tracking-wider hover:text-[var(--red)]"
                      >
                        {col.label}
                        <span aria-hidden className={active ? 'opacity-100' : 'opacity-40'}>
                          {active ? (sortDir === 'asc' ? '▲' : '▼') : '↕'}
                        </span>
                      </button>
                    ) : (
                      col.label
                    )}
                  </th>
                )
              })}
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
