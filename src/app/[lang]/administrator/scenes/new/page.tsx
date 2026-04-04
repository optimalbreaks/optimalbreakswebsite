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

const TABLE = 'scenes'

export default function SceneNewPage() {
  const { lang } = useParams<{ lang: string }>()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    slug: '',
    name_en: '',
    name_es: '',
    country: '',
    region: '',
    description_en: '',
    description_es: '',
    key_artists: [] as string[],
    key_labels: [] as string[],
    key_venues: [] as string[],
    era: '',
    image_url: null as string | null,
    is_featured: false,
  })

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await adminCreate(TABLE, form)
      router.push(`/${lang}/administrator/scenes`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminForm
      title="Nueva Scene"
      backHref={`/${lang}/administrator/scenes`}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <div className="md:col-span-2">
        <BilingualTextarea
          label="Nombre"
          rows={2}
          valueEn={form.name_en}
          valueEs={form.name_es}
          onChangeEn={(v) => set('name_en', v)}
          onChangeEs={(v) => set('name_es', v)}
        />
      </div>

      <div className="md:col-span-2">
        <SlugField
          label="Slug"
          value={form.slug}
          onChange={(v) => set('slug', v)}
          nameValue={form.name_en}
        />
      </div>

      <div className="md:col-span-2">
        <BilingualHtmlEditor
          label="Descripción"
          instanceKey="new-scene"
          valueEn={form.description_en}
          valueEs={form.description_es}
          onChangeEn={(v) => set('description_en', v)}
          onChangeEs={(v) => set('description_es', v)}
        />
      </div>

      <div>
        <label className="admin-label">País</label>
        <input
          type="text"
          value={form.country}
          onChange={(e) => set('country', e.target.value)}
          className="admin-input"
        />
      </div>

      <div>
        <label className="admin-label">Región</label>
        <input
          type="text"
          value={form.region}
          onChange={(e) => set('region', e.target.value)}
          className="admin-input"
        />
      </div>

      <div>
        <label className="admin-label">Era</label>
        <input
          type="text"
          value={form.era}
          onChange={(e) => set('era', e.target.value)}
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
          label="Key Artists"
          value={form.key_artists}
          onChange={(v) => set('key_artists', v)}
          placeholder="Añadir artista…"
        />
      </div>

      <div className="md:col-span-2">
        <ArrayEditor
          label="Key Labels"
          value={form.key_labels}
          onChange={(v) => set('key_labels', v)}
          placeholder="Añadir label…"
        />
      </div>

      <div className="md:col-span-2">
        <ArrayEditor
          label="Key Venues"
          value={form.key_venues}
          onChange={(v) => set('key_venues', v)}
          placeholder="Añadir venue…"
        />
      </div>

      <div className="flex items-center gap-6">
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
