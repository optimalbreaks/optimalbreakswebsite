// ============================================
// OPTIMAL BREAKS — Label Detail Page
// ============================================

import { createServerSupabase } from '@/lib/supabase'
import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import Link from 'next/link'

type Props = { params: { lang: Locale; slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data } = await supabase.from('labels').select('name, description_en, description_es').eq('slug', slug).single()
  if (!data) return { title: 'Label Not Found' }
  return {
    title: data.name,
    description: lang === 'es' ? data.description_es?.slice(0, 160) : data.description_en?.slice(0, 160),
  }
}

export default async function LabelDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: label } = await supabase.from('labels').select('*').eq('slug', slug).single()

  if (!label) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
        <Link href={`/${lang}/labels`} className="cutout outline no-underline mb-6 inline-block">← {lang === 'es' ? 'Volver a Sellos' : 'Back to Labels'}</Link>
        <div className="sec-tag">LABEL</div>
        <h1 className="sec-title"><span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span></h1>
        <div className="mt-6 p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}</div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>{lang === 'es' ? 'Ficha del sello en preparación.' : 'Label profile in preparation.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
      <Link href={`/${lang}/labels`} className="cutout outline no-underline mb-6 inline-block">← {lang === 'es' ? 'Volver a Sellos' : 'Back to Labels'}</Link>
      <div className="sec-tag">LABEL</div>
      <h1 className="sec-title"><span className="hl">{label.name}</span></h1>
      <div className="flex flex-wrap gap-2 mt-4 mb-8">
        <span className="cutout fill">{label.country}</span>
        {label.founded_year && <span className="cutout outline">Est. {label.founded_year}</span>}
        <span className={`cutout ${label.is_active ? 'acid' : 'red'}`}>{label.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
      </div>
      <p className="max-w-[700px]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8 }}>
        {lang === 'es' ? label.description_es : label.description_en}
      </p>
    </div>
  )
}
