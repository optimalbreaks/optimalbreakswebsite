'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { adminList, adminDelete } from '@/lib/admin-api'
import AdminTable from '@/components/admin/AdminTable'

interface Label {
  id: string
  created_at: string
  slug: string
  name: string
  country: string
  founded_year: number | null
  description_en: string
  description_es: string
  image_url: string | null
  website: string | null
  key_artists: string[]
  key_releases: string[]
  is_active: boolean
  is_featured: boolean
}

export default function LabelsListPage() {
  const { lang } = useParams()
  const [data, setData] = useState<Label[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const limit = 20

  const load = useCallback(() => {
    adminList<Label>('labels', { page, limit, search }).then((res) => {
      setData(res.data)
      setCount(res.count)
    })
  }, [page, search])

  useEffect(() => { load() }, [load])

  const handleDelete = (id: string) => {
    adminDelete('labels', id).then(load)
  }

  return (
    <AdminTable
      columns={[
        { key: 'name', label: 'Nombre' },
        { key: 'country', label: 'País' },
        { key: 'founded_year', label: 'Año' },
        {
          key: 'is_active',
          label: 'Activo',
          render: (v: boolean) => (v ? '✓' : '✗'),
        },
        {
          key: 'is_featured',
          label: 'Destacado',
          render: (v: boolean) => (v ? '✓' : '✗'),
        },
      ]}
      data={data}
      count={count}
      page={page}
      limit={limit}
      onPageChange={setPage}
      onSearch={setSearch}
      onDelete={handleDelete}
      editHref={(row) => `/${lang}/administrator/labels/${row.id}`}
      newHref={`/${lang}/administrator/labels/new`}
      searchPlaceholder="Buscar sellos…"
    />
  )
}
