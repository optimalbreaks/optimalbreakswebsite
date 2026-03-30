'use client'

import { useCallback, useEffect, useState } from 'react'
import { useParams } from 'next/navigation'
import { adminList, adminDelete } from '@/lib/admin-api'
import AdminTable from '@/components/admin/AdminTable'

interface HistoryEntry {
  id: string
  created_at: string
  slug: string
  title_en: string
  title_es: string
  content_en: string
  content_es: string
  section: 'origins' | 'uk_breakbeat' | 'us_breaks' | 'andalusian' | 'australian' | 'rise_decline_revival' | 'digital_era'
  year_start: number
  year_end: number | null
  image_url: string | null
  sort_order: number
}

export default function HistoryListPage() {
  const { lang } = useParams()
  const [data, setData] = useState<HistoryEntry[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const limit = 20

  const load = useCallback(() => {
    adminList<HistoryEntry>('history', { page, limit, search }).then((res) => {
      setData(res.data)
      setCount(res.count)
    })
  }, [page, search])

  useEffect(() => {
    load()
  }, [load])

  const handleDelete = async (id: string) => {
    await adminDelete('history', id)
    load()
  }

  return (
    <div>
      <h1 className="admin-page-title">Historia</h1>
      <AdminTable
        columns={[
          { key: 'title_en', label: 'Título (EN)' },
          { key: 'section', label: 'Sección' },
          { key: 'year_start', label: 'Año Inicio' },
          { key: 'year_end', label: 'Año Fin' },
          { key: 'sort_order', label: 'Orden' },
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
        editHref={(row) => `/${lang}/administrator/history/${row.id}`}
        newHref={`/${lang}/administrator/history/new`}
        searchPlaceholder="Buscar entradas…"
      />
    </div>
  )
}
