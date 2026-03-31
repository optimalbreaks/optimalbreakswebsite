'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { adminListUsers, type AdminUserRow } from '@/lib/admin-api'
import AdminTable from '@/components/admin/AdminTable'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

const columns = [
  { key: 'email', label: 'Email' },
  { key: 'display_name', label: 'Nombre' },
  { key: 'username', label: 'Usuario' },
  {
    key: 'role',
    label: 'Rol',
    render: (v: string) => (
      <span className={v === 'admin' ? 'font-bold text-[var(--red)]' : ''}>{v === 'admin' ? 'Admin' : 'Usuario'}</span>
    ),
  },
  {
    key: 'last_sign_in_at',
    label: 'Último acceso',
    render: (_: unknown, row: AdminUserRow) => fmtDate(row.last_sign_in_at),
  },
]

export default function AdminUsersPage() {
  const { lang } = useParams<{ lang: string }>()
  const [data, setData] = useState<AdminUserRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const limit = 20

  const load = useCallback(() => {
    adminListUsers({ page, limit, search }).then((res) => {
      setData(res.data)
      setCount(res.count)
    })
  }, [page, search])

  useEffect(() => {
    load()
  }, [load])

  return (
    <div>
      <h1 className="admin-page-title">Usuarios</h1>
      <p className="admin-muted mb-6 max-w-2xl">
        Cuentas registradas (Auth + perfil). Puedes asignar o quitar el rol de administrador. La búsqueda filtra por
        nombre visible o nombre de usuario en el perfil.
      </p>
      <AdminTable
        columns={columns}
        data={data}
        count={count}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onSearch={(term) => {
          setSearch(term)
          setPage(1)
        }}
        editHref={(row) => `/${lang}/administrator/users/${row.id}`}
        searchPlaceholder="Buscar por nombre o usuario…"
      />
    </div>
  )
}
