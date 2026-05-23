'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { adminListUsers, type AdminUserRow } from '@/lib/admin-api'
import AdminTable from '@/components/admin/AdminTable'
import AdminUserEngagementDrawer from '@/components/admin/AdminUserEngagementDrawer'

type DrawerTab = 'favorites' | 'mixes' | 'tracks'

function fmtDate(iso: string | null) {
  if (!iso) return '—'
  try {
    return new Date(iso).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' })
  } catch {
    return iso
  }
}

function CountCell({
  value,
  onOpen,
  label,
}: {
  value: number | null | undefined
  onOpen: () => void
  label: string
}) {
  const v = typeof value === 'number' ? value : 0
  if (v === 0) {
    return (
      <span
        className="text-[var(--text-muted)]"
        style={{ fontFamily: "'Courier Prime', monospace" }}
      >
        0
      </span>
    )
  }
  return (
    <button
      type="button"
      onClick={onOpen}
      title={`Ver ${label}`}
      className="font-bold text-[var(--ink)] hover:text-[var(--red)] underline decoration-2 underline-offset-2 decoration-[var(--ink)]/30 hover:decoration-[var(--red)] transition-colors cursor-pointer bg-transparent border-0 p-0"
      style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}
    >
      {v}
    </button>
  )
}

export default function AdminUsersPage() {
  const { lang } = useParams<{ lang: string }>()
  const [data, setData] = useState<AdminUserRow[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const [drawer, setDrawer] = useState<{ user: AdminUserRow; tab: DrawerTab } | null>(null)
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

  const openDrawer = useCallback((user: AdminUserRow, tab: DrawerTab) => {
    setDrawer({ user, tab })
  }, [])

  const columns = [
    { key: 'email', label: 'Email' },
    { key: 'display_name', label: 'Nombre' },
    { key: 'username', label: 'Usuario' },
    {
      key: 'role',
      label: 'Rol',
      render: (v: string) => (
        <span className={v === 'admin' ? 'font-bold text-[var(--red)]' : ''}>
          {v === 'admin' ? 'Admin' : 'Usuario'}
        </span>
      ),
    },
    {
      key: 'favorites_count',
      label: 'Favoritos',
      render: (_: unknown, row: AdminUserRow) => (
        <CountCell
          value={row.favorites_count}
          onOpen={() => openDrawer(row, 'favorites')}
          label="favoritos"
        />
      ),
    },
    {
      key: 'mixes_count',
      label: 'Mixes',
      render: (_: unknown, row: AdminUserRow) => (
        <CountCell value={row.mixes_count} onOpen={() => openDrawer(row, 'mixes')} label="mixes guardados" />
      ),
    },
    {
      key: 'tracks_count',
      label: 'Tracks',
      render: (_: unknown, row: AdminUserRow) => (
        <CountCell value={row.tracks_count} onOpen={() => openDrawer(row, 'tracks')} label="tracks guardadas" />
      ),
    },
    {
      key: 'last_sign_in_at',
      label: 'Último acceso',
      render: (_: unknown, row: AdminUserRow) => fmtDate(row.last_sign_in_at),
    },
  ]

  return (
    <div>
      <h1 className="admin-page-title">Usuarios</h1>
      <p className="admin-muted mb-6 max-w-2xl">
        Cuentas registradas (Auth + perfil). Puedes asignar o quitar el rol de administrador. La búsqueda filtra por
        nombre visible o nombre de usuario en el perfil. <strong>Favoritos</strong> = artistas + sellos + eventos con
        corazón; <strong>Mixes</strong> = mixes guardados; <strong>Tracks</strong> = canciones en su lista My Tracks.
        Pulsa sobre cualquiera de esos números para ver el detalle.
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
      {drawer ? (
        <AdminUserEngagementDrawer
          userId={drawer.user.id}
          userLabel={
            drawer.user.display_name ||
            drawer.user.username ||
            drawer.user.email ||
            drawer.user.id
          }
          initialTab={drawer.tab}
          lang={lang}
          onClose={() => setDrawer(null)}
        />
      ) : null}
    </div>
  )
}
