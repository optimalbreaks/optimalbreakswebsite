'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminUpdate } from '@/lib/admin-api'
import AdminForm from '@/components/admin/AdminForm'
import SlugField from '@/components/admin/SlugField'
import BilingualTextarea from '@/components/admin/BilingualTextarea'
import ArrayEditor from '@/components/admin/ArrayEditor'
import JsonEditor from '@/components/admin/JsonEditor'
import ImageUpload from '@/components/admin/ImageUpload'

const CATEGORIES = [
  { value: 'pioneer', label: 'Pioneer' },
  { value: 'uk_legend', label: 'UK Legend' },
  { value: 'us_artist', label: 'US Artist' },
  { value: 'andalusian', label: 'Andalusian' },
  { value: 'current', label: 'Current' },
  { value: 'crew', label: 'Crew' },
]

const inputClass =
  'w-full px-3 py-2 rounded-md bg-[#12121f] border border-[#2a2a4a] text-gray-200 text-sm focus:outline-none focus:border-[#4a4a6a]'
const labelClass = 'block text-sm font-medium text-gray-300 mb-1'

interface Artist {
  id: string
  name: string
  name_display: string
  slug: string
  real_name: string | null
  country: string
  era: string
  website: string | null
  category: string
  bio_en: string
  bio_es: string
  styles: string[]
  essential_tracks: string[]
  recommended_mixes: string[]
  related_artists: string[]
  labels_founded: string[]
  key_releases: any[]
  socials: Record<string, string>
  image_url: string | null
  is_featured: boolean
  sort_order: number
}

export default function ArtistEditPage() {
  const { lang, id } = useParams()
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [ready, setReady] = useState(false)

  const [form, setForm] = useState({
    name: '',
    name_display: '',
    slug: '',
    real_name: '',
    country: '',
    era: '',
    website: '',
    category: 'current',
    bio_en: '',
    bio_es: '',
    styles: [] as string[],
    essential_tracks: [] as string[],
    recommended_mixes: [] as string[],
    related_artists: [] as string[],
    labels_founded: [] as string[],
    key_releases: [] as any[],
    socials: {} as Record<string, string>,
    image_url: null as string | null,
    is_featured: false,
    sort_order: 0,
  })

  useEffect(() => {
    fetch(`/api/admin/artists?limit=999`)
      .then((r) => r.json())
      .then((res) => {
        const found = res.data?.find((a: Artist) => a.id === id)
        if (found) {
          setForm({
            name: found.name ?? '',
            name_display: found.name_display ?? '',
            slug: found.slug ?? '',
            real_name: found.real_name ?? '',
            country: found.country ?? '',
            era: found.era ?? '',
            website: found.website ?? '',
            category: found.category ?? 'current',
            bio_en: found.bio_en ?? '',
            bio_es: found.bio_es ?? '',
            styles: found.styles ?? [],
            essential_tracks: found.essential_tracks ?? [],
            recommended_mixes: found.recommended_mixes ?? [],
            related_artists: found.related_artists ?? [],
            labels_founded: found.labels_founded ?? [],
            key_releases: found.key_releases ?? [],
            socials: found.socials ?? {},
            image_url: found.image_url ?? null,
            is_featured: found.is_featured ?? false,
            sort_order: found.sort_order ?? 0,
          })
        }
        setReady(true)
      })
  }, [id])

  const set = <K extends keyof typeof form>(key: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await adminUpdate('artists', { id, ...form })
      router.push(`/${lang}/administrator/artists`)
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Error al guardar')
    } finally {
      setLoading(false)
    }
  }

  if (!ready) {
    return <p className="text-gray-400">Cargando…</p>
  }

  return (
    <AdminForm
      title="Editar Artista"
      onSubmit={handleSubmit}
      loading={loading}
      backHref={`/${lang}/administrator/artists`}
    >
      <div>
        <label className={labelClass}>Nombre</label>
        <input
          type="text"
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Nombre Display</label>
        <input
          type="text"
          value={form.name_display}
          onChange={(e) => set('name_display', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <SlugField
          value={form.slug}
          onChange={(v) => set('slug', v)}
          nameValue={form.name}
          label="Slug"
        />
      </div>

      <div>
        <label className={labelClass}>Nombre Real</label>
        <input
          type="text"
          value={form.real_name ?? ''}
          onChange={(e) => set('real_name', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>País</label>
        <input
          type="text"
          value={form.country}
          onChange={(e) => set('country', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Categoría</label>
        <select
          value={form.category}
          onChange={(e) => set('category', e.target.value)}
          className={inputClass}
        >
          {CATEGORIES.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label className={labelClass}>Era</label>
        <input
          type="text"
          value={form.era}
          onChange={(e) => set('era', e.target.value)}
          className={inputClass}
        />
      </div>

      <div>
        <label className={labelClass}>Website</label>
        <input
          type="text"
          value={form.website ?? ''}
          onChange={(e) => set('website', e.target.value)}
          className={inputClass}
        />
      </div>

      <div className="md:col-span-2">
        <BilingualTextarea
          valueEn={form.bio_en}
          valueEs={form.bio_es}
          onChangeEn={(v) => set('bio_en', v)}
          onChangeEs={(v) => set('bio_es', v)}
          label="Biografía"
          rows={12}
        />
      </div>

      <div className="md:col-span-2">
        <ArrayEditor
          value={form.styles}
          onChange={(v) => set('styles', v)}
          placeholder="Añadir estilo"
          label="Estilos"
        />
      </div>

      <div className="md:col-span-2">
        <ArrayEditor
          value={form.essential_tracks}
          onChange={(v) => set('essential_tracks', v)}
          placeholder="Añadir track"
          label="Tracks Esenciales"
        />
      </div>

      <div className="md:col-span-2">
        <ArrayEditor
          value={form.recommended_mixes}
          onChange={(v) => set('recommended_mixes', v)}
          placeholder="Añadir mix"
          label="Mixes Recomendados"
        />
      </div>

      <div className="md:col-span-2">
        <ArrayEditor
          value={form.related_artists}
          onChange={(v) => set('related_artists', v)}
          placeholder="Añadir artista"
          label="Artistas Relacionados"
        />
      </div>

      <div className="md:col-span-2">
        <ArrayEditor
          value={form.labels_founded}
          onChange={(v) => set('labels_founded', v)}
          placeholder="Añadir sello"
          label="Sellos Fundados"
        />
      </div>

      <div className="md:col-span-2">
        <JsonEditor
          value={form.key_releases}
          onChange={(v) => set('key_releases', v)}
          label="Key Releases"
        />
      </div>

      <div className="md:col-span-2">
        <JsonEditor
          value={form.socials}
          onChange={(v) => set('socials', v)}
          label="Redes Sociales"
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

      <div>
        <label className={labelClass}>Orden</label>
        <input
          type="number"
          value={form.sort_order}
          onChange={(e) => set('sort_order', Number(e.target.value))}
          className={inputClass}
        />
      </div>
    </AdminForm>
  )
}
