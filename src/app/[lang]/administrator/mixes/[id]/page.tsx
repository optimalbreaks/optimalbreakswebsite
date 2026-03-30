'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminGetRowById, adminUpdate, normalizeAdminRouteParam } from '@/lib/admin-api'
import AdminForm from '@/components/admin/AdminForm'
import SlugField from '@/components/admin/SlugField'
import BilingualTextarea from '@/components/admin/BilingualTextarea'
import ImageUpload from '@/components/admin/ImageUpload'

const MIX_TYPES = [
  { value: 'essential_mix', label: 'Essential Mix' },
  { value: 'classic_set', label: 'Classic Set' },
  { value: 'radio_show', label: 'Radio Show' },
  { value: 'youtube_session', label: 'YouTube Session' },
  { value: 'podcast', label: 'Podcast' },
]

const PLATFORMS = [
  { value: 'soundcloud', label: 'SoundCloud' },
  { value: 'youtube', label: 'YouTube' },
  { value: 'mixcloud', label: 'Mixcloud' },
  { value: 'other', label: 'Other' },
]

const inputClass =
  'w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]'
const labelClass = 'block text-sm font-medium text-gray-300 mb-1'

export default function MixEditPage() {
  const { lang, id: idParam } = useParams()
  const id = normalizeAdminRouteParam(idParam as string | string[] | undefined)
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  const [form, setForm] = useState({
    title: '',
    slug: '',
    artist_name: '',
    artist_id: '' as string | null,
    description_en: '',
    description_es: '',
    mix_type: 'essential_mix' as string,
    year: null as number | null,
    duration_minutes: null as number | null,
    embed_url: '' as string | null,
    platform: 'soundcloud' as string,
    image_url: null as string | null,
    is_featured: false,
  })

  useEffect(() => {
    if (!id) return
    adminGetRowById('mixes', id)
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
      await adminUpdate('mixes', {
        id,
        ...form,
        artist_id: form.artist_id || null,
        embed_url: form.embed_url || null,
      })
      router.push(`/${lang}/administrator/mixes`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminForm
      title="Editar Mix"
      onSubmit={handleSubmit}
      loading={loading}
      backHref={`/${lang}/administrator/mixes`}
    >
      <div>
        <label className={labelClass}>Título</label>
        <input
          type="text"
          value={form.title}
          onChange={(e) => set('title', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <SlugField
          value={form.slug}
          onChange={(v) => set('slug', v)}
          nameValue={form.title}
          label="Slug"
        />
      </div>

      <div>
        <label className={labelClass}>Artista</label>
        <input
          type="text"
          value={form.artist_name}
          onChange={(e) => set('artist_name', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Artist ID</label>
        <input
          type="text"
          value={form.artist_id ?? ''}
          onChange={(e) => set('artist_id', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Tipo de Mix</label>
        <select
          value={form.mix_type}
          onChange={(e) => set('mix_type', e.target.value)}
          className={inputClass}
        >
          {MIX_TYPES.map((t) => (
            <option key={t.value} value={t.value}>
              {t.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Plataforma</label>
        <select
          value={form.platform}
          onChange={(e) => set('platform', e.target.value)}
          className={inputClass}
        >
          {PLATFORMS.map((p) => (
            <option key={p.value} value={p.value}>
              {p.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Año</label>
        <input
          type="number"
          value={form.year ?? ''}
          onChange={(e) =>
            set('year', e.target.value ? Number(e.target.value) : null)
          }
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Duración (min)</label>
        <input
          type="number"
          value={form.duration_minutes ?? ''}
          onChange={(e) =>
            set('duration_minutes', e.target.value ? Number(e.target.value) : null)
          }
          className={inputClass}
        />
      </div>

      <div className="md:col-span-2">
        <label className={labelClass}>Embed URL</label>
        <input
          type="text"
          value={form.embed_url ?? ''}
          onChange={(e) => set('embed_url', e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="md:col-span-2">
        <BilingualTextarea
          valueEn={form.description_en}
          valueEs={form.description_es}
          onChangeEn={(v) => set('description_en', v)}
          onChangeEs={(v) => set('description_es', v)}
          label="Descripción"
          rows={6}
        />
      </div>

      <div className="md:col-span-2">
        <ImageUpload
          value={form.image_url}
          onChange={(v) => set('image_url', v)}
          label="Imagen"
        />
      </div>

      <div>
        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={form.is_featured}
            onChange={(e) => set('is_featured', e.target.checked)}
            className="w-4 h-4 rounded bg-[#12121f] border-[#2a2a4a]"
          />
          <span className="text-sm text-gray-300">Destacado</span>
        </label>
      </div>
    </AdminForm>
  )
}
