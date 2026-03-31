'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { adminList, adminDelete } from '@/lib/admin-api'
import AdminTable from '@/components/admin/AdminTable'

interface Mix {
  id: string
  created_at: string
  slug: string
  title: string
  artist_name: string
  artist_id: string | null
  description_en: string
  description_es: string
  mix_type: 'essential_mix' | 'classic_set' | 'radio_show' | 'youtube_session' | 'podcast'
  year: number | null
  duration_minutes: number | null
  embed_url: string | null
  platform: 'soundcloud' | 'youtube' | 'mixcloud' | 'other'
  image_url: string | null
  is_featured: boolean
  published_at?: string | null
}

export default function MixesListPage() {
  const { lang } = useParams()
  const [data, setData] = useState<Mix[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const limit = 20

  const load = useCallback(() => {
    adminList<Mix>('mixes', { page, limit, search }).then((res) => {
      setData(res.data)
      setCount(res.count)
    })
  }, [page, search])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (id: string) => {
    await adminDelete('mixes', id)
    load()
  }

  return (
    <div>
      <h1 className="admin-page-title">Mixes</h1>
      <AdminTable
        columns={[
          { key: 'title', label: 'Título' },
          { key: 'artist_name', label: 'Artista' },
          { key: 'mix_type', label: 'Tipo' },
          { key: 'platform', label: 'Plataforma' },
          { key: 'year', label: 'Año' },
          {
            key: 'published_at',
            label: 'Publicado',
            render: (_: unknown, row: Mix) =>
              row.published_at
                ? new Date(row.published_at).toLocaleDateString('es-ES', {
                    year: 'numeric',
                    month: 'short',
                    day: 'numeric',
                  })
                : '—',
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
        onSearch={(term) => {
          setSearch(term)
          setPage(1)
        }}
        onDelete={handleDelete}
        editHref={(row) => `/${lang}/administrator/mixes/${row.id}`}
        newHref={`/${lang}/administrator/mixes/new`}
        searchPlaceholder="Buscar mixes…"
      />
    </div>
  )
}
