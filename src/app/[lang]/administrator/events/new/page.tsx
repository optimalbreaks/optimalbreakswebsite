'use client'

import { useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminCreate } from '@/lib/admin-api'
import AdminForm from '@/components/admin/AdminForm'
import BilingualTextarea from '@/components/admin/BilingualTextarea'
import ArrayEditor from '@/components/admin/ArrayEditor'
import ImageUpload from '@/components/admin/ImageUpload'
import SlugField from '@/components/admin/SlugField'

const EVENT_TYPES = [
  { value: 'festival', label: 'Festival' },
  { value: 'club_night', label: 'Club Night' },
  { value: 'past_iconic', label: 'Past Iconic' },
  { value: 'upcoming', label: 'Upcoming' },
]

export default function EventsNewPage() {
  const { lang } = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [form, setForm] = useState({
    slug: '',
    name: '',
    description_en: '',
    description_es: '',
    event_type: 'festival' as string,
    date_start: '',
    date_end: '',
    location: '',
    city: '',
    country: '',
    venue: '',
    image_url: null as string | null,
    website: '',
    lineup: [] as string[],
    is_featured: false,
  })

  const set = (key: string, val: any) => setForm((p) => ({ ...p, [key]: val }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await adminCreate('events', {
        ...form,
        date_start: form.date_start || null,
        date_end: form.date_end || null,
        venue: form.venue || null,
      })
      router.push(`/${lang}/administrator/events`)
    } finally {
      setLoading(false)
    }
  }

  return (
    <AdminForm
      title="Nuevo Evento"
      backHref={`/${lang}/administrator/events`}
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
        <label className="block text-sm font-medium text-gray-300 mb-1">Tipo de evento</label>
        <select
          value={form.event_type}
          onChange={(e) => set('event_type', e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
        >
          {EVENT_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Ubicación</label>
        <input
          type="text"
          value={form.location}
          onChange={(e) => set('location', e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Ciudad</label>
        <input
          type="text"
          value={form.city}
          onChange={(e) => set('city', e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
        />
      </div>

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
        <label className="block text-sm font-medium text-gray-300 mb-1">Venue</label>
        <input
          type="text"
          value={form.venue}
          onChange={(e) => set('venue', e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Fecha inicio</label>
        <input
          type="date"
          value={form.date_start}
          onChange={(e) => set('date_start', e.target.value)}
          className="w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-300 mb-1">Fecha fin</label>
        <input
          type="date"
          value={form.date_end}
          onChange={(e) => set('date_end', e.target.value)}
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
          label="Lineup"
          value={form.lineup}
          onChange={(v) => set('lineup', v)}
          placeholder="Añadir artista al lineup…"
        />
      </div>

      <div>
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
