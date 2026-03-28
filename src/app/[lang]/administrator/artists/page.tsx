'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { adminList, adminDelete } from '@/lib/admin-api'
import AdminTable from '@/components/admin/AdminTable'

interface Artist {
  id: string
  name: string
  category: string
  country: string
  is_featured: boolean
  sort_order: number
}

const columns = [
  { key: 'name', label: 'Nombre' },
  { key: 'category', label: 'Categoría' },
  { key: 'country', label: 'País' },
  {
    key: 'is_featured',
    label: 'Destacado',
    render: (v: boolean) => (v ? '✓' : '✗'),
  },
  { key: 'sort_order', label: 'Orden' },
]

export default function ArtistsListPage() {
  const { lang } = useParams()
  const [data, setData] = useState<Artist[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const limit = 20

  const load = useCallback(() => {
    adminList<Artist>('artists', { page, limit, search }).then((res) => {
      setData(res.data)
      setCount(res.count)
    })
  }, [page, search])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (id: string) => {
    await adminDelete('artists', id)
    load()
  }

  return (
    <div>
      <h1 className="text-xl font-bold text-gray-100 mb-6">Artistas</h1>
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
        onDelete={handleDelete}
        editHref={(row) => `/${lang}/administrator/artists/${row.id}`}
        newHref={`/${lang}/administrator/artists/new`}
        searchPlaceholder="Buscar artistas…"
      />
    </div>
  )
}
