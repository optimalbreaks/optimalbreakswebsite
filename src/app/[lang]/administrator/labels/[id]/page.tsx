'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminGetRowById, adminUpdate, normalizeAdminRouteParam } from '@/lib/admin-api'
import AdminForm from '@/components/admin/AdminForm'
import BilingualTextarea from '@/components/admin/BilingualTextarea'
import ArrayEditor from '@/components/admin/ArrayEditor'
import ImageUpload from '@/components/admin/ImageUpload'
import SlugField from '@/components/admin/SlugField'

export default function LabelsEditPage() {
  const { lang, id: idParam } = useParams()
  const id = normalizeAdminRouteParam(idParam as string | string[] | undefined)
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

  useEffect(() => {
    if (!id) return
    adminGetRowById('labels', id)
      .then((found: any) => {
        if (found) setForm(found)
      })
      .catch(() => {})
  }, [id])

  const set = (key: string, val: any) => setForm((p) => ({ ...p, [key]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await adminUpdate('labels', {
        id,
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
      title="Editar Sello"
      backHref={`/${lang}/administrator/labels`}
      onSubmit={handleSubmit}
      loading={loading}
    >
      <div>
        <label className="admin-label">Nombre</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          className="admin-input"
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
        <label className="admin-label">País</label>
        <input
          type="text"
          value={form.country}
          onChange={(e) => set('country', e.target.value)}
          className="admin-input"
        />
      </div>

      <div>
        <label className="admin-label">Año de fundación</label>
        <input
          type="number"
          value={form.founded_year}
          onChange={(e) => set('founded_year', e.target.value)}
          className="admin-input"
        />
      </div>

      <div>
        <label className="admin-label">Website</label>
        <input
          type="url"
          value={form.website}
          onChange={(e) => set('website', e.target.value)}
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
        <label className="admin-check-row">
          <input
            type="checkbox"
            checked={form.is_active}
            onChange={(e) => set('is_active', e.target.checked)}
            className="admin-checkbox"
          />
          Activo
        </label>
        <label className="admin-check-row">
          <input
            type="checkbox"
            checked={form.is_featured}
            onChange={(e) => set('is_featured', e.target.checked)}
            className="admin-checkbox"
          />
          Destacado
        </label>
      </div>
    </AdminForm>
  )
}
