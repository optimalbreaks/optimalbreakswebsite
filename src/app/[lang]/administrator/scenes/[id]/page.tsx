'use client'

import { useState, useEffect } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { adminGetRowById, adminTranslateScene, adminUpdate, normalizeAdminRouteParam } from '@/lib/admin-api'
import AdminForm from '@/components/admin/AdminForm'
import BilingualTextarea from '@/components/admin/BilingualTextarea'
import BilingualHtmlEditor from '@/components/admin/BilingualHtmlEditor'
import ArrayEditor from '@/components/admin/ArrayEditor'
import ImageUpload from '@/components/admin/ImageUpload'
import SlugField from '@/components/admin/SlugField'

const TABLE = 'scenes'

export default function SceneEditPage() {
  const { lang, id: idParam } = useParams()
  const id = normalizeAdminRouteParam(idParam as string | string[] | undefined)
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [translateLoading, setTranslateLoading] = useState(false)
  const [translateMsg, setTranslateMsg] = useState<string | null>(null)
  const [form, setForm] = useState({
    id: '',
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

  useEffect(() => {
    if (!id) return
    adminGetRowById(TABLE, id)
      .then((found: any) => {
        if (found) setForm(found)
      })
      .catch(() => {})
  }, [id])

  const set = <K extends keyof typeof form>(k: K, v: (typeof form)[K]) =>
    setForm((f) => ({ ...f, [k]: v }))

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    try {
      await adminUpdate(TABLE, form)
      router.push(`/${lang}/administrator/scenes`)
    } finally {
      setLoading(false)
    }
  }

  const runTranslate = async (force: boolean) => {
    if (!form.id) return
    setTranslateMsg(null)
    setTranslateLoading(true)
    try {
      const { row } = await adminTranslateScene({ id: form.id, force })
      const r = row as typeof form
      setForm((f) => ({
        ...f,
        name_en: typeof r.name_en === 'string' ? r.name_en : f.name_en,
        description_en: typeof r.description_en === 'string' ? r.description_en : f.description_en,
      }))
      setTranslateMsg(force ? 'Inglés regenerado.' : 'Campos EN rellenados desde ES.')
    } catch (e) {
      setTranslateMsg(e instanceof Error ? e.message : 'Error al traducir')
    } finally {
      setTranslateLoading(false)
    }
  }

  return (
    <AdminForm
      title="Editar Scene"
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
          instanceKey={form.id || 'scene'}
          valueEn={form.description_en}
          valueEs={form.description_es}
          onChangeEn={(v) => set('description_en', v)}
          onChangeEs={(v) => set('description_es', v)}
        />
        {form.id ? (
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={translateLoading}
              onClick={() => runTranslate(false)}
              className="admin-btn admin-btn--ghost admin-btn--sm text-[11px] uppercase tracking-wide"
            >
              {translateLoading ? 'Traduciendo…' : 'Rellenar inglés desde español'}
            </button>
            <button
              type="button"
              disabled={translateLoading}
              onClick={() => {
                if (
                  typeof window !== 'undefined' &&
                  !window.confirm(
                    '¿Sobrescribir name_en y description_en con una nueva traducción desde el español?',
                  )
                ) {
                  return
                }
                runTranslate(true)
              }}
              className="admin-btn admin-btn--ghost admin-btn--sm text-[11px] uppercase tracking-wide !border-[var(--red)] !text-[var(--red)]"
            >
              Regenerar todo el inglés
            </button>
            <span className="admin-muted text-[11px] normal-case">
              OpenAI · inglés neutro · conserva HTML
            </span>
          </div>
        ) : null}
        {translateMsg ? (
          <p className="mt-2 text-[12px] normal-case" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {translateMsg}
          </p>
        ) : null}
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
