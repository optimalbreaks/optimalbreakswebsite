// ============================================
// OPTIMAL BREAKS — Scene Detail Page
// + ShareButtons
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { detailPageMetadata, siteNameForLang } from '@/lib/seo'
import type { Locale } from '@/lib/i18n-config'
import type { Scene } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import CardThumbnail from '@/components/CardThumbnail'

type Props = { params: { lang: Locale; slug: string } }
type SceneSeoRow = Pick<Scene, 'name_en' | 'name_es' | 'description_en' | 'description_es' | 'image_url'>

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: raw } = await supabase
    .from('scenes')
    .select('name_en, name_es, description_en, description_es, image_url')
    .eq('slug', slug)
    .single()
  const data = raw as SceneSeoRow | null
  if (!data) return { title: lang === 'es' ? 'Escena no encontrada' : 'Scene not found', robots: { index: false, follow: true } }
  const title = lang === 'es' ? data.name_es : data.name_en
  const siteName = await siteNameForLang(lang)
  const description = (lang === 'es' ? data.description_es : data.description_en)?.slice(0, 160)
  return detailPageMetadata(lang, `/scenes/${slug}`, siteName, title, description, 'website', data.image_url)
}

export default async function SceneDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: rawScene } = await supabase.from('scenes').select('*').eq('slug', slug).single()
  const scene = rawScene as Scene | null

  if (!scene) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <Link href={`/${lang}/scenes`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Escenas' : 'Back to Scenes'}</Link>
        <div className="sec-tag">SCENE</div>
        <h1 className="sec-title"><span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span></h1>
        <div className="mt-6 p-4 sm:p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}</div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>{lang === 'es' ? 'Contenido de la escena en preparación.' : 'Scene content in preparation.'}</p>
        </div>
      </div>
    )
  }

  const sceneName = lang === 'es' ? scene.name_es : scene.name_en

  return (
    <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
      <Link href={`/${lang}/scenes`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Escenas' : 'Back to Scenes'}</Link>
      <div className="sec-tag">SCENE</div>
      <h1 className="sec-title"><span className="hl">{sceneName}</span></h1>

      {/* Share row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <ShareButtons url={`/${lang}/scenes/${slug}`} title={`${sceneName} | Optimal Breaks`} lang={lang} />
      </div>

      <div className="mb-8 -mx-4 sm:mx-0 border-y-[3px] border-[var(--ink)] overflow-hidden">
        <CardThumbnail src={scene.image_url} alt={sceneName} heightClass="h-48 sm:h-56 md:h-64" frameClass="border-0" />
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        <span className="cutout fill">{scene.country}</span>
        {scene.region && <span className="cutout outline">{scene.region}</span>}
        <span className="cutout red">{scene.era}</span>
      </div>
      <p className="max-w-[700px] mb-8" style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8 }}>
        {lang === 'es' ? scene.description_es : scene.description_en}
      </p>
      {scene.key_artists?.length > 0 && (
        <div className="p-4 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)] mb-4">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'ARTISTAS CLAVE' : 'KEY ARTISTS'}</div>
          <div className="flex flex-wrap gap-2">{scene.key_artists.map((a: string, i: number) => <span key={i} className="cutout red">{a}</span>)}</div>
        </div>
      )}
      {scene.key_labels?.length > 0 && (
        <div className="p-4 sm:p-6 border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--red)', marginBottom: '12px' }}>{lang === 'es' ? 'SELLOS CLAVE' : 'KEY LABELS'}</div>
          <div className="flex flex-wrap gap-2">{scene.key_labels.map((l: string, i: number) => <span key={i} className="cutout fill">{l}</span>)}</div>
        </div>
      )}
    </div>
  )
}
