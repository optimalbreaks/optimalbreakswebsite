// ============================================
// OPTIMAL BREAKS — Label Detail Page
// + ShareButtons + FanCounter
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { detailPageMetadata, siteNameForLang } from '@/lib/seo'
import type { Locale } from '@/lib/i18n-config'
import type { Label } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import FanCounter from '@/components/FanCounter'
import CardThumbnail from '@/components/CardThumbnail'

type Props = { params: { lang: Locale; slug: string } }
type LabelSeoRow = Pick<Label, 'name' | 'description_en' | 'description_es' | 'image_url'>

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: raw } = await supabase.from('labels').select('name, description_en, description_es, image_url').eq('slug', slug).single()
  const data = raw as LabelSeoRow | null
  if (!data?.name)
    return { title: lang === 'es' ? 'Sello no encontrado' : 'Label not found', robots: { index: false, follow: true } }
  const siteName = await siteNameForLang(lang)
  const description = (lang === 'es' ? data.description_es : data.description_en)?.slice(0, 160)
  return detailPageMetadata(lang, `/labels/${slug}`, siteName, data.name, description, 'website', data.image_url)
}

export default async function LabelDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: rawLabel } = await supabase.from('labels').select('*').eq('slug', slug).single()
  const label = rawLabel as Label | null

  if (!label) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <Link href={`/${lang}/labels`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Sellos' : 'Back to Labels'}</Link>
        <div className="sec-tag">LABEL</div>
        <h1 className="sec-title"><span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span></h1>
        <div className="mt-6 p-4 sm:p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}</div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>{lang === 'es' ? 'Ficha del sello en preparación.' : 'Label profile in preparation.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
      <Link href={`/${lang}/labels`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Sellos' : 'Back to Labels'}</Link>
      <div className="sec-tag">LABEL</div>
      <h1 className="sec-title"><span className="hl">{label.name}</span></h1>

      {/* Share + Fan counter row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <FanCounter type="label" entityId={label.id} lang={lang} />
        <ShareButtons url={`/${lang}/labels/${slug}`} title={`${label.name} | Optimal Breaks`} lang={lang} />
      </div>

      <div className="mb-8 -mx-4 sm:mx-0 border-y-[3px] border-[var(--ink)] overflow-hidden">
        <CardThumbnail src={label.image_url} alt={label.name} heightClass="h-44 sm:h-52 md:h-56" frameClass="border-0" />
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        <span className="cutout fill">{label.country}</span>
        {label.founded_year && <span className="cutout outline">Est. {label.founded_year}</span>}
        <span className={`cutout ${label.is_active ? 'acid' : 'red'}`}>{label.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
      </div>
      <p className="max-w-[700px]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8 }}>
        {lang === 'es' ? label.description_es : label.description_en}
      </p>

      {label.key_artists?.length > 0 && (
        <div className="mt-8 p-4 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'ARTISTAS CLAVE' : 'KEY ARTISTS'}</div>
          <div className="flex flex-wrap gap-2">{label.key_artists.map((a: string, i: number) => <span key={i} className="cutout red">{a}</span>)}</div>
        </div>
      )}
      {label.key_releases?.length > 0 && (
        <div className="mt-4 p-4 sm:p-6 border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--red)', marginBottom: '12px' }}>{lang === 'es' ? 'RELEASES CLAVE' : 'KEY RELEASES'}</div>
          <div className="flex flex-wrap gap-2">{label.key_releases.map((r: string, i: number) => <span key={i} className="cutout fill">{r}</span>)}</div>
        </div>
      )}
    </div>
  )
}
