'use client'

import { useState, useEffect, useCallback } from 'react'
import { useParams } from 'next/navigation'
import { adminList, adminDelete } from '@/lib/admin-api'
import AdminTable from '@/components/admin/AdminTable'

interface BlogPost {
  id: string
  created_at: string
  slug: string
  title_en: string
  title_es: string
  excerpt_en: string
  excerpt_es: string
  content_en: string
  content_es: string
  category: 'article' | 'ranking' | 'retrospective' | 'interview' | 'review' | 'opinion'
  tags: string[]
  image_url: string | null
  author: string
  published_at: string
  is_published: boolean
  is_featured: boolean
}

const TABLE = 'blog_posts'

const columns = [
  { key: 'title_en', label: 'Title' },
  { key: 'category', label: 'Category' },
  { key: 'author', label: 'Author' },
  {
    key: 'is_published',
    label: 'Published',
    render: (v: boolean) => (v ? '✓' : '✗'),
  },
  {
    key: 'is_featured',
    label: 'Featured',
    render: (v: boolean) => (v ? '✓' : '✗'),
  },
]

export default function BlogListPage() {
  const { lang } = useParams<{ lang: string }>()
  const [data, setData] = useState<BlogPost[]>([])
  const [count, setCount] = useState(0)
  const [page, setPage] = useState(1)
  const [search, setSearch] = useState('')
  const limit = 20

  const load = useCallback(async () => {
    const res = await adminList<BlogPost>(TABLE, { page, limit, search })
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
      <h1 className="admin-page-title">Blog Posts</h1>
      <AdminTable
        columns={columns}
        data={data}
        count={count}
        page={page}
        limit={limit}
        onPageChange={setPage}
        onSearch={setSearch}
        onDelete={handleDelete}
        editHref={(row) => `/${lang}/administrator/blog/${row.id}`}
        newHref={`/${lang}/administrator/blog/new`}
        searchPlaceholder="Buscar posts…"
      />
    </div>
  )
}
