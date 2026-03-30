'use client'

import { useEffect, useState, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { adminList, adminDelete } from '@/lib/admin-api'
import AdminTable from '@/components/admin/AdminTable'

interface BreakEvent {
  id: string
  created_at: string
  slug: string
  name: string
  description_en: string
  description_es: string
  event_type: 'festival' | 'club_night' | 'past_iconic' | 'upcoming'
  date_start: string | null
  date_end: string | null
  location: string
  city: string
  country: string
  venue: string | null
  image_url: string | null
  website: string | null
  lineup: string[]
  is_featured: boolean
}

export default function EventsListPage() {
  const { lang } = useParams()
  const [data, setData] = useState<BreakEvent[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const limit = 20

  const load = useCallback(() => {
    adminList<BreakEvent>('events', { page, limit, search }).then((res) => {
      setData(res.data)
      setCount(res.count)
    })
  }, [page, search])

  useEffect(() => { load() }, [load])

  const handleDelete = (id: string) => {
    adminDelete('events', id).then(load)
  }

  return (
    <div>
      <h1 className="admin-page-title">Eventos</h1>
      <AdminTable
      columns={[
        { key: 'name', label: 'Nombre' },
        { key: 'event_type', label: 'Tipo' },
        { key: 'city', label: 'Ciudad' },
        { key: 'country', label: 'País' },
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
      editHref={(row) => `/${lang}/administrator/events/${row.id}`}
      newHref={`/${lang}/administrator/events/new`}
      searchPlaceholder="Buscar eventos…"
    />
    </div>
  )
}
