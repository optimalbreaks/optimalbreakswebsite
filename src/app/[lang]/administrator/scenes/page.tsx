'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { adminList, adminDelete } from '@/lib/admin-api'
import AdminTable from '@/components/admin/AdminTable'

interface Scene {
  id: string
  created_at: string
  slug: string
  name_en: string
  name_es: string
  country: string
  region: string | null
  description_en: string
  description_es: string
  key_artists: string[]
  key_labels: string[]
  key_venues: string[]
  era: string
  image_url: string | null
  is_featured: boolean
}

const TABLE = 'scenes'

const columns = [
  { key: 'name_en', label: 'Name' },
  { key: 'country', label: 'Country' },
  { key: 'region', label: 'Region' },
  { key: 'era', label: 'Era' },
  {
    key: 'is_featured',
    label: 'Featured',
    render: (v: boolean) => (v ? '✓' : '✗'),
  },
]

export default function ScenesListPage() {
  const { lang } = useParams<{ lang: string }>()
  const [data, setData] = useState<Scene[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const limit = 20

  const load = useCallback(async () => {
    const res = await adminList<Scene>(TABLE, { page, limit, search })
    setData(res.data)
    setCount(res.count)
  }, [page, search])

  useEffect(() => { load() }, [load])

  const handleDelete = async (id: string) => {
    await adminDelete(TABLE, id)
    load()
  }

  return (
    <div>
      <h1 className="admin-page-title">Escenas</h1>
      <AdminTable
        columns={columns}
        data={data}
        count={count}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onSearch={setSearch}
        onDelete={handleDelete}
        editHref={(row) => `/${lang}/administrator/scenes/${row.id}`}
        newHref={`/${lang}/administrator/scenes/new`}
        searchPlaceholder="Buscar scenes…"
      />
    </div>
  )
}
