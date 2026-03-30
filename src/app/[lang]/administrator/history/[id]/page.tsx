'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminGetRowById, adminUpdate, normalizeAdminRouteParam } from '@/lib/admin-api'
import AdminForm from '@/components/admin/AdminForm'
import SlugField from '@/components/admin/SlugField'
import BilingualTextarea from '@/components/admin/BilingualTextarea'
import ImageUpload from '@/components/admin/ImageUpload'

const SECTIONS = [
  { value: 'origins', label: 'Origins' },
  { value: 'uk_breakbeat', label: 'UK Breakbeat' },
  { value: 'us_breaks', label: 'US Breaks' },
  { value: 'andalusian', label: 'Andalusian' },
  { value: 'australian', label: 'Australian' },
  { value: 'rise_decline_revival', label: 'Rise, Decline & Revival' },
  { value: 'digital_era', label: 'Digital Era' },
]

const inputClass =
  'w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]'
const labelClass = 'block text-sm font-medium text-gray-300 mb-1'

const TABLE = 'history_entries'

export default function HistoryEditPage() {
  const { lang, id: idParam } = useParams()
  const id = normalizeAdminRouteParam(idParam as string | string[] | undefined)
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    title_en: '',
    title_es: '',
    slug: '',
    content_en: '',
    content_es: '',
    section: 'origins' as string,
    year_start: 0,
    year_end: null as number | null,
    image_url: null as string | null,
    sort_order: 0,
  })

  useEffect(() => {
    if (!id) return
    adminGetRowById(TABLE, id)
      .then((found: any) => {
        if (found) setForm(found)
      })
      .catch(() => {})
  }, [id])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await adminUpdate(TABLE, { id, ...form })
      router.push(`/${lang}/administrator/history`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminForm
      title="Editar Entrada de Historia"
      onSubmit={handleSubmit}
      loading={loading}
      backHref={`/${lang}/administrator/history`}
    >
      <div className="md:col-span-2">
        <BilingualTextarea
          valueEn={form.title_en}
          valueEs={form.title_es}
          onChangeEn={(v) => set('title_en', v)}
          onChangeEs={(v) => set('title_es', v)}
          label="Título"
          rows={2}
        />
      </div>

      <div>
        <SlugField
          value={form.slug}
          onChange={(v) => set('slug', v)}
          nameValue={form.title_en}
          label="Slug"
        />
      </div>

      <div>
        <label className={labelClass}>Sección</label>
        <select
          value={form.section}
          onChange={(e) => set('section', e.target.value)}
          className={inputClass}
        >
          {SECTIONS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Año Inicio</label>
        <input
          type="number"
          value={form.year_start}
          onChange={(e) => set('year_start', Number(e.target.value))}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Año Fin</label>
        <input
          type="number"
          value={form.year_end ?? ''}
          onChange={(e) =>
            set('year_end', e.target.value ? Number(e.target.value) : null)
          }
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Orden</label>
        <input
          type="number"
          value={form.sort_order}
          onChange={(e) => set('sort_order', Number(e.target.value))}
          className={inputClass}
        />
      </div>

      <div className="md:col-span-2">
        <BilingualTextarea
          valueEn={form.content_en}
          valueEs={form.content_es}
          onChangeEn={(v) => set('content_en', v)}
          onChangeEs={(v) => set('content_es', v)}
          label="Contenido"
          rows={12}
        />
      </div>

      <div className="md:col-span-2">
        <ImageUpload
          value={form.image_url}
          onChange={(v) => set('image_url', v)}
          label="Imagen"
        />
      </div>
    </AdminForm>
  )
}
