// ============================================
// OPTIMAL BREAKS — Scene Detail Page
// ============================================

import { createServerSupabase } from '@/lib/supabase'
import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import Link from 'next/link'

type Props = { params: { lang: Locale; slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data } = await supabase.from('scenes').select('name_en, name_es, description_en, description_es').eq('slug', slug).single()
  if (!data) return { title: 'Scene Not Found' }
  return { title: lang === 'es' ? data.name_es : data.name_en, description: lang === 'es' ? data.description_es?.slice(0, 160) : data.description_en?.slice(0, 160) }
}

export default async function SceneDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: scene } = await supabase.from('scenes').select('*').eq('slug', slug).single()

  if (!scene) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
        <Link href={`/${lang}/scenes`} className="cutout outline no-underline mb-6 inline-block">← {lang === 'es' ? 'Volver a Escenas' : 'Back to Scenes'}</Link>
        <div className="sec-tag">SCENE</div>
        <h1 className="sec-title"><span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span></h1>
        <div className="mt-6 p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}</div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>{lang === 'es' ? 'Contenido de la escena en preparación.' : 'Scene content in preparation.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
      <Link href={`/${lang}/scenes`} className="cutout outline no-underline mb-6 inline-block">← {lang === 'es' ? 'Volver a Escenas' : 'Back to Scenes'}</Link>
      <div className="sec-tag">SCENE</div>
      <h1 className="sec-title"><span className="hl">{lang === 'es' ? scene.name_es : scene.name_en}</span></h1>
      <div className="flex flex-wrap gap-2 mt-4 mb-8">
        <span className="cutout fill">{scene.country}</span>
        {scene.region && <span className="cutout outline">{scene.region}</span>}
        <span className="cutout red">{scene.era}</span>
      </div>
      <p className="max-w-[700px] mb-8" style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8 }}>
        {lang === 'es' ? scene.description_es : scene.description_en}
      </p>
      {scene.key_artists?.length > 0 && (
        <div className="p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)] mb-4">
          <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'ARTISTAS CLAVE' : 'KEY ARTISTS'}</div>
          <div className="flex flex-wrap gap-2">{scene.key_artists.map((a: string, i: number) => <span key={i} className="cutout red">{a}</span>)}</div>
        </div>
      )}
      {scene.key_labels?.length > 0 && (
        <div className="p-6 border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '18px', color: 'var(--red)', marginBottom: '12px' }}>{lang === 'es' ? 'SELLOS CLAVE' : 'KEY LABELS'}</div>
          <div className="flex flex-wrap gap-2">{scene.key_labels.map((l: string, i: number) => <span key={i} className="cutout fill">{l}</span>)}</div>
        </div>
      )}
    </div>
  )
}
