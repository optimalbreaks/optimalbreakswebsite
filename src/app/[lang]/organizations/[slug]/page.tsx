// ============================================
// OPTIMAL BREAKS — Organization Detail Page
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { detailPageMetadata, siteNameForLang } from '@/lib/seo'
import type { Locale } from '@/lib/i18n-config'
import type { BreakEvent, Label, Organization } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import { splitBioParagraphs } from '@/lib/bio-format'
import CardThumbnail from '@/components/CardThumbnail'

type Props = { params: { lang: Locale; slug: string } }
type OrganizationSeoRow = Pick<Organization, 'name' | 'description_en' | 'description_es' | 'image_url'>
type LabelPreview = Pick<Label, 'slug' | 'name' | 'country' | 'founded_year' | 'is_active'>
type EventPreview = Pick<BreakEvent, 'slug' | 'name' | 'date_start' | 'city' | 'country' | 'event_type' | 'venue'>

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: raw } = await supabase
    .from('organizations')
    .select('name, description_en, description_es, image_url')
    .eq('slug', slug)
    .single()
  const data = raw as OrganizationSeoRow | null
  if (!data?.name) return { title: lang === 'es' ? 'Organizacion no encontrada' : 'Organization not found', robots: { index: false, follow: true } }
  const siteName = await siteNameForLang(lang)
  const description = (lang === 'es' ? data.description_es : data.description_en)?.slice(0, 160)
  return detailPageMetadata(lang, `/organizations/${slug}`, siteName, data.name, description, 'website', data.image_url)
}

function socialLabel(key: string, lang: Locale) {
  const normalized = key.toLowerCase()
  const labels: Record<string, { es: string; en: string }> = {
    website: { es: 'Web oficial', en: 'Official site' },
    records: { es: 'Records', en: 'Records' },
    tickets: { es: 'Entradas', en: 'Tickets' },
    instagram: { es: 'Instagram', en: 'Instagram' },
    facebook: { es: 'Facebook', en: 'Facebook' },
    beatport: { es: 'Beatport', en: 'Beatport' },
    soundcloud: { es: 'SoundCloud', en: 'SoundCloud' },
  }
  const entry = labels[normalized]
  return lang === 'es' ? entry?.es || key : entry?.en || key
}

export default async function OrganizationDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: rawOrganization } = await supabase.from('organizations').select('*').eq('slug', slug).single()
  const organization = rawOrganization as Organization | null

  if (!organization) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
        <Link href={`/${lang}/labels`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Sellos' : 'Back to Labels'}</Link>
        <div className="sec-tag">ORGANIZATION</div>
        <h1 className="sec-title"><span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span></h1>
        <div className="mt-6 p-4 sm:p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>
            {lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}
          </div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>
            {lang === 'es' ? 'Ficha de la organizacion en preparacion.' : 'Organization profile in preparation.'}
          </p>
        </div>
      </div>
    )
  }

  const [{ data: rawLabels }, { data: rawEvents }] = await Promise.all([
    supabase
      .from('labels')
      .select('slug, name, country, founded_year, is_active')
      .eq('organization_id', organization.id)
      .order('founded_year', { ascending: true }),
    supabase
      .from('events')
      .select('slug, name, date_start, city, country, event_type, venue')
      .eq('promoter_organization_id', organization.id)
      .order('date_start', { ascending: false }),
  ])

  const labels = (rawLabels || []) as LabelPreview[]
  const events = (rawEvents || []) as EventPreview[]
  const upcomingEvents = events.filter((event) => event.event_type === 'upcoming')
  const archiveEvents = events.filter((event) => event.event_type !== 'upcoming')
  const socials = Object.entries(organization.socials || {}).filter(([, value]) => typeof value === 'string' && value)

  return (
    <div className="lined min-h-screen px-4 sm:px-6 pt-8 pb-14 sm:pt-12 sm:pb-20">
      <Link href={`/${lang}/labels`} className="btn-back"><span className="arrow">←</span> {lang === 'es' ? 'Volver a Sellos' : 'Back to Labels'}</Link>
      <div className="sec-tag">ORGANIZATION</div>
      <h1 className="sec-title"><span className="hl">{organization.name}</span></h1>

      <div className="flex flex-wrap items-center gap-3 mb-6">
        <ShareButtons url={`/${lang}/organizations/${slug}`} title={`${organization.name} | Optimal Breaks`} lang={lang} />
      </div>

      <div className="mb-8 -mx-4 sm:mx-0 border-y-[3px] border-[var(--ink)] overflow-hidden">
        <CardThumbnail src={organization.image_url} alt={organization.name} heightClass="h-44 sm:h-52 md:h-56" frameClass="border-0" />
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        {organization.roles?.map((role) => (
          <span key={role} className="cutout red">{role.replace('_', ' ')}</span>
        ))}
        <span className="cutout fill">{organization.country}</span>
        {organization.base_city && <span className="cutout outline">{organization.base_city}</span>}
        {organization.founded_year && <span className="cutout outline">Est. {organization.founded_year}</span>}
      </div>

      <div className="max-w-[760px] space-y-5">
        {splitBioParagraphs(lang === 'es' ? organization.description_es : organization.description_en).map((para, i) => (
          <p
            key={i}
            style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.85 }}
            className="text-[var(--ink)]"
          >
            {para}
          </p>
        ))}
      </div>

      {socials.length > 0 && (
        <div className="mt-8 p-4 sm:p-6 border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--red)', marginBottom: '12px' }}>
            {lang === 'es' ? 'ENLACES' : 'LINKS'}
          </div>
          <div className="flex flex-wrap gap-2">
            {socials.map(([key, value]) => (
              <a
                key={key}
                href={value}
                target="_blank"
                rel="noreferrer"
                className="cutout outline no-underline text-[var(--ink)]"
              >
                {socialLabel(key, lang)}
              </a>
            ))}
          </div>
        </div>
      )}

      {labels.length > 0 && (
        <div className="mt-8 p-4 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px' }}>
            {lang === 'es' ? 'SELLOS RELACIONADOS' : 'RELATED LABELS'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {labels.map((label) => (
              <Link
                key={label.slug}
                href={`/${lang}/labels/${label.slug}`}
                className="border-2 border-[var(--paper)] p-4 no-underline text-[var(--paper)]"
              >
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '18px', textTransform: 'uppercase' }}>
                  {label.name}
                </div>
                <div className="mt-2 text-[13px]" style={{ color: 'rgba(232,220,200,0.78)' }}>
                  {label.country}{label.founded_year ? ` · Est. ${label.founded_year}` : ''} · {label.is_active ? 'ACTIVE' : 'ARCHIVE'}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {upcomingEvents.length > 0 && (
        <div className="mt-8 p-4 sm:p-6 border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--red)', marginBottom: '12px' }}>
            {lang === 'es' ? 'PROXIMOS EVENTOS' : 'UPCOMING EVENTS'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upcomingEvents.map((event) => (
              <Link
                key={event.slug}
                href={`/${lang}/events/${event.slug}`}
                className="border-2 border-[var(--ink)] p-4 no-underline text-[var(--ink)] bg-[var(--paper)]"
              >
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '18px', textTransform: 'uppercase' }}>
                  {event.name}
                </div>
                <div className="mt-2" style={{ fontSize: '14px', color: 'var(--dim)' }}>
                  {event.date_start || 'TBA'} · {event.venue || 'TBA'} · {event.city}, {event.country}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {archiveEvents.length > 0 && (
        <div className="mt-8 p-4 sm:p-6 border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--red)', marginBottom: '12px' }}>
            {lang === 'es' ? 'ARCHIVO DE EVENTOS' : 'EVENT ARCHIVE'}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {archiveEvents.map((event) => (
              <Link
                key={event.slug}
                href={`/${lang}/events/${event.slug}`}
                className="border-2 border-[var(--ink)] p-4 no-underline text-[var(--ink)] bg-[var(--paper)]"
              >
                <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 800, fontSize: '18px', textTransform: 'uppercase' }}>
                  {event.name}
                </div>
                <div className="mt-2" style={{ fontSize: '14px', color: 'var(--dim)' }}>
                  {event.date_start || 'TBA'} · {event.venue || 'TBA'} · {event.city}, {event.country}
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  )
}
