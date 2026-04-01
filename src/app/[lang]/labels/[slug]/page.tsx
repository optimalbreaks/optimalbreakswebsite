// ============================================
// OPTIMAL BREAKS — Label Detail Page
// + ShareButtons + FanCounter
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { detailPageMetadata, siteNameForLang } from '@/lib/seo'
import type { Locale } from '@/lib/i18n-config'
import type { Artist, Label, Organization } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import { splitBioParagraphs } from '@/lib/bio-format'
import FanCounter from '@/components/FanCounter'
import FavoriteButton from '@/components/FavoriteButton'
import CardThumbnail from '@/components/CardThumbnail'

type Props = { params: { lang: Locale; slug: string } }
type LabelSeoRow = Pick<Label, 'name' | 'description_en' | 'description_es' | 'image_url' | 'og_image_url'>
type LabelPageRow = Label & {
  organization: Pick<Organization, 'slug' | 'name'> | null
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: raw } = await supabase.from('labels').select('name, description_en, description_es, image_url, og_image_url').eq('slug', slug).single()
  const data = raw as LabelSeoRow | null
  if (!data?.name)
    return { title: lang === 'es' ? 'Sello no encontrado' : 'Label not found', robots: { index: false, follow: true } }
  const siteName = await siteNameForLang(lang)
  const description = (lang === 'es' ? data.description_es : data.description_en)?.slice(0, 160)
  return detailPageMetadata(lang, `/labels/${slug}`, siteName, data.name, description, 'website', data.og_image_url || data.image_url)
}

export default async function LabelDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: rawLabel } = await supabase
    .from('labels')
    .select('*, organization:organizations!labels_organization_id_fkey(slug, name)')
    .eq('slug', slug)
    .single()
  const label = rawLabel as LabelPageRow | null

  const artistSlugs = new Map<string, string>()
  if (label?.key_artists?.length) {
    const { data: matchedArtists } = await supabase
      .from('artists')
      .select('name, slug')
      .in('name', label.key_artists)
    const rows = (matchedArtists ?? []) as Pick<Artist, 'name' | 'slug'>[]
    for (const a of rows) artistSlugs.set(a.name, a.slug)
  }

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

      {/* Misma estructura hero que artistas: logo acotado + título/compartir en fila (md+) */}
      <header className="mb-8 md:mb-10 border-b-[3px] border-[var(--ink)] pb-8 md:pb-10">
        <div className="flex flex-col-reverse md:flex-row gap-6 md:gap-8 lg:gap-10 items-stretch md:items-start">
          <div className="w-full max-w-[min(100%,300px)] sm:max-w-[340px] md:max-w-[min(400px,40vw)] shrink-0 mx-auto md:mx-0">
            <CardThumbnail
              src={label.image_url}
              alt={label.name}
              aspectClass="aspect-square w-full"
              frameClass="border-[3px] border-[var(--ink)]"
              fit="contain"
            />
          </div>
          <div className="min-w-0 flex-1 flex flex-col justify-center md:justify-start md:pt-0">
            <div className="sec-tag w-fit">LABEL</div>
            <h1 className="sec-title mt-2 md:mt-3">
              <span className="hl">{label.name}</span>
            </h1>
            <div className="flex flex-wrap items-center gap-3 mt-4 md:mt-6">
              <FavoriteButton type="label" entityId={label.id} size="md" lang={lang} />
              <FanCounter type="label" entityId={label.id} lang={lang} />
              <ShareButtons url={`/${lang}/labels/${slug}`} title={`${label.name} | Optimal Breaks`} lang={lang} />
            </div>
          </div>
        </div>
      </header>

      <div className="flex flex-wrap gap-2 mb-8">
        <span className="cutout fill">{label.country}</span>
        {label.founded_year && <span className="cutout outline">Est. {label.founded_year}</span>}
        <span className={`cutout ${label.is_active ? 'acid' : 'red'}`}>{label.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
        {label.organization && (
          <Link href={`/${lang}/organizations/${label.organization.slug}`} className="cutout outline no-underline text-[var(--ink)]">
            {lang === 'es' ? 'Organizacion: ' : 'Organization: '}{label.organization.name}
          </Link>
        )}
      </div>
      <div className="max-w-[700px] space-y-5">
        {splitBioParagraphs(lang === 'es' ? label.description_es : label.description_en).map((para, i) => (
          <p
            key={i}
            style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.85 }}
            className="text-[var(--ink)]"
          >
            {para}
          </p>
        ))}
      </div>

      {label.key_artists?.length > 0 && (
        <div className="mt-8 p-4 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'ARTISTAS CLAVE' : 'KEY ARTISTS'}</div>
          <div className="flex flex-wrap gap-2">{label.key_artists.map((a: string, i: number) => {
            const artistSlug = artistSlugs.get(a)
            return artistSlug
              ? <Link key={i} href={`/${lang}/artists/${artistSlug}`} className="cutout red no-underline">{a}</Link>
              : <span key={i} className="cutout red">{a}</span>
          })}</div>
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
