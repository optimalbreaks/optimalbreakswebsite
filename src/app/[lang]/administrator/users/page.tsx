'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
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
  const [sortKey, setSortKey] = useState<string | null>(null)
  const [sortDir, setSortDir] = useState<'asc' | 'desc'>('desc')
  const [drawer, setDrawer] = useState<{ user: AdminUserRow; tab: DrawerTab } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const loadSeq = useRef(0)
  const limit = 20

  const load = useCallback(() => {
    const seq = ++loadSeq.current
    setError(null)
    adminListUsers({
      page,
      limit,
      search,
      order: sortKey ?? undefined,
      dir: sortKey ? sortDir : undefined,
    })
      .then((res) => {
        if (seq !== loadSeq.current) return
        setData(res.data)
        setCount(res.count)
      })
      .catch((e) => {
        if (seq !== loadSeq.current) return
        setError(e instanceof Error ? e.message : 'Error al cargar usuarios')
      })
  }, [page, search, sortKey, sortDir])

  useEffect(() => {
    load()
  }, [load])

  const openDrawer = useCallback((user: AdminUserRow, tab: DrawerTab) => {
    setDrawer({ user, tab })
  }, [])

  const columns = [
    { key: 'email', label: 'Email', sortDefault: 'asc' as const },
    { key: 'display_name', label: 'Nombre', sortDefault: 'asc' as const },
    { key: 'username', label: 'Usuario', sortDefault: 'asc' as const },
    {
      key: 'role',
      label: 'Rol',
      sortDefault: 'asc' as const,
      render: (v: string) => (
        <span className={v === 'admin' ? 'font-bold text-[var(--red)]' : ''}>
          {v === 'admin' ? 'Admin' : 'Usuario'}
        </span>
      ),
    },
    {
      key: 'artist_level',
      label: 'Artista',
      render: (_: unknown, row: AdminUserRow) => {
        const level = row.artist_level || 'user'
        if (level === 'claimed') {
          return <span className="font-bold text-[var(--red)]">Reclamado</span>
        }
        if (level === 'marked') {
          return <span className="font-bold">Marcado</span>
        }
        return <span className="text-[var(--text-muted)]">—</span>
      },
    },
    {
      key: 'favorites_count',
      label: 'Favoritos',
      sortDefault: 'desc' as const,
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
      sortDefault: 'desc' as const,
      render: (_: unknown, row: AdminUserRow) => (
        <CountCell value={row.mixes_count} onOpen={() => openDrawer(row, 'mixes')} label="mixes guardados" />
      ),
    },
    {
      key: 'tracks_count',
      label: 'Tracks',
      sortDefault: 'desc' as const,
      render: (_: unknown, row: AdminUserRow) => (
        <CountCell value={row.tracks_count} onOpen={() => openDrawer(row, 'tracks')} label="tracks guardadas" />
      ),
    },
    {
      key: 'last_activity_at',
      label: 'Última actividad',
      sortDefault: 'desc' as const,
      render: (_: unknown, row: AdminUserRow) => fmtDate(row.last_activity_at),
    },
  ]

  return (
    <div>
      <h1 className="admin-page-title">Usuarios</h1>
      <p className="admin-muted mb-6 max-w-2xl">
        Cuentas registradas (Auth + perfil). Puedes asignar o quitar el rol de administrador. La búsqueda filtra por
        email, nombre visible o nombre de usuario. <strong>Favoritos</strong> = artistas + sellos + eventos con
        corazón; <strong>Mixes</strong> = mixes guardados; <strong>Tracks</strong> = canciones
        únicas en su lista My Tracks (la misma pista no se cuenta dos veces si la guardó desde
        varias listas).
        Pulsa sobre cualquiera de esos números para ver el detalle. Pulsa el
        encabezado de una columna para ordenar (el segundo clic invierte el
        sentido).{' '}
        <strong>Artista</strong> = <em>Marcado</em> (fichaje editorial) o <em>Reclamado</em> (claim
        aprobado). En ambos casos sus «+» en temas donde sale <em>él</em> no suman al Top de
        artistas; esos mismos saves <strong>sí cuentan</strong> en el Top 100 de canciones y en Mis
        Tracks, y los créditos de colaboradores u otros artistas también. Editar la fila para
        marcar o quitar.{' '}
        <strong>Última actividad</strong> = la fecha más reciente entre inicio de sesión, edición de
        perfil y acciones en el sitio (favoritos, tracks guardados, mixes, valoraciones, etc.).
      </p>
      {error ? (
        <p className="text-[var(--red)] mb-4" style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px' }}>
          {error}
        </p>
      ) : null}
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
        sortKey={sortKey}
        sortDir={sortDir}
        onSort={(key, dir) => {
          setSortKey(key)
          setSortDir(dir)
          setPage(1)
        }}
        editHref={(row) => `/${lang}/administrator/users/${row.id}`}
        searchPlaceholder="Buscar por email, nombre o usuario…"
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
