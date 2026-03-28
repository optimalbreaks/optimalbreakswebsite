'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminCreate } from '@/lib/admin-api'
import AdminForm from '@/components/admin/AdminForm'
import BilingualTextarea from '@/components/admin/BilingualTextarea'
import ArrayEditor from '@/components/admin/ArrayEditor'
import ImageUpload from '@/components/admin/ImageUpload'
import SlugField from '@/components/admin/SlugField'

export default function LabelsNewPage() {
  const { lang } = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    slug: '',
    name: '',
    country: '',
    founded_year: '' as string | number,
    description_en: '',
    description_es: '',
    image_url: null as string | null,
    website: '',
    key_artists: [] as string[],
    key_releases: [] as string[],
    is_active: true,
    is_featured: false,
  })

  const set = (key: string, val: any) => setForm((p) => ({ ...p, [key]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await adminCreate('labels', {
        ...form,
        founded_year: form.founded_year ? Number(form.founded_year) : null,
      })
      router.push(`/${lang}/administrator/labels`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminForm
      title="Nuevo Sello"
      backHref={`/${lang}/administrator/labels`}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Nombre</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
          required
        />
      </div>

      <SlugField
        label="Slug"
        value={form.slug}
        onChange={(v) => set('slug', v)}
        nameValue={form.name}
      />

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">País</label>
        <input
          type="text"
          value={form.country}
          onChange={(e) => set('country', e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Año de fundación</label>
        <input
          type="number"
          value={form.founded_year}
          onChange={(e) => set('founded_year', e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Website</label>
        <input
          type="url"
          value={form.website}
          onChange={(e) => set('website', e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
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
        <BilingualTextarea
          label="Descripción"
          valueEn={form.description_en}
          valueEs={form.description_es}
          onChangeEn={(v) => set('description_en', v)}
          onChangeEs={(v) => set('description_es', v)}
        />
      </div>

      <div className="md:col-span-2">
        <ArrayEditor
          label="Artistas clave"
          value={form.key_artists}
          onChange={(v) => set('key_artists', v)}
          placeholder="Añadir artista…"
        />
      </div>

      <div className="md:col-span-2">
        <ArrayEditor
          label="Releases clave"
          value={form.key_releases}
          onChange={(v) => set('key_releases', v)}
          placeholder="Añadir release…"
        />
      </div>

      <div className="flex items-center gap-6">
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            className="w-4 h-4 rounded bg-[#12121f] border-[#2a2a4a]"
          />
          Activo
        </label>
        <label className="flex items-center gap-2 text-sm text-gray-300">
          <input
            type="checkbox"
            checked={form.is_featured}
            onChange={(e) => set('is_featured', e.target.checked)}
            className="w-4 h-4 rounded bg-[#12121f] border-[#2a2a4a]"
          />
          Destacado
        </label>
      </div>
    </AdminForm>
  )
}
