'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminCreate } from '@/lib/admin-api'
import AdminForm from '@/components/admin/AdminForm'
import BilingualTextarea from '@/components/admin/BilingualTextarea'
import BilingualHtmlEditor from '@/components/admin/BilingualHtmlEditor'
import ArrayEditor from '@/components/admin/ArrayEditor'
import ImageUpload from '@/components/admin/ImageUpload'
import SlugField from '@/components/admin/SlugField'

const TABLE = 'blog_posts'

const CATEGORIES = ['article', 'ranking', 'retrospective', 'interview', 'review', 'opinion'] as const

export default function BlogNewPage() {
  const { lang } = useParams<{ lang: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    slug: '',
    title_en: '',
    title_es: '',
    excerpt_en: '',
    excerpt_es: '',
    content_en: '',
    content_es: '',
    category: 'article' as string,
    tags: [] as string[],
    image_url: null as string | null,
    author: '',
    published_at: '',
    is_published: false,
    is_featured: false,
  })

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await adminCreate(TABLE, form)
      router.push(`/${lang}/administrator/blog`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminForm
      title="Nuevo Blog Post"
      backHref={`/${lang}/administrator/blog`}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <div className="md:col-span-2">
        <BilingualTextarea
          label="Título"
          rows={2}
          valueEn={form.title_en}
          valueEs={form.title_es}
          onChangeEn={(v) => set('title_en', v)}
          onChangeEs={(v) => set('title_es', v)}
        />
      </div>

      <div className="md:col-span-2">
        <SlugField
          label="Slug"
          value={form.slug}
          onChange={(v) => set('slug', v)}
          nameValue={form.title_en}
        />
      </div>

      <div className="md:col-span-2">
        <BilingualTextarea
          label="Extracto"
          rows={4}
          valueEn={form.excerpt_en}
          valueEs={form.excerpt_es}
          onChangeEn={(v) => set('excerpt_en', v)}
          onChangeEs={(v) => set('excerpt_es', v)}
        />
      </div>

      <div className="md:col-span-2">
        <BilingualHtmlEditor
          label="Contenido"
          instanceKey="new"
          valueEn={form.content_en}
          valueEs={form.content_es}
          onChangeEn={(v) => set('content_en', v)}
          onChangeEs={(v) => set('content_es', v)}
        />
      </div>

      <div>
        <label className="admin-label">Categoría</label>
        <select
          value={form.category}
          onChange={(e) => set('category', e.target.value)}
          className="admin-input"
        >
          {CATEGORIES.map((c) => (
            <option key={c} value={c}>{c}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="admin-label">Autor</label>
        <input
          type="text"
          value={form.author}
          onChange={(e) => set('author', e.target.value)}
          className="admin-input"
        />
      </div>

      <div>
        <label className="admin-label">Fecha publicación</label>
        <input
          type="date"
          value={form.published_at}
          onChange={(e) => set('published_at', e.target.value)}
          className="admin-input"
        />
      </div>

      <div>
        <ImageUpload
          label="Imagen"
          value={form.image_url}
          onChange={(v) => set('image_url', v)}
        />
      </div>

      <div className="md:col-span-2">
        <ArrayEditor
          label="Tags"
          value={form.tags}
          onChange={(v) => set('tags', v)}
          placeholder="Añadir tag…"
        />
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_published}
            onChange={(e) => set('is_published', e.target.checked)}
            className="admin-checkbox"
          />
          <span className="admin-muted normal-case">Publicado</span>
        </label>
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.is_featured}
            onChange={(e) => set('is_featured', e.target.checked)}
            className="admin-checkbox"
          />
          <span className="admin-muted normal-case">Destacado</span>
        </label>
      </div>
    </AdminForm>
  )
}
