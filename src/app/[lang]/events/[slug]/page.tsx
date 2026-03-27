// ============================================
// OPTIMAL BREAKS — Event Detail Page
// + ShareButtons + FanCounter
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { detailPageMetadata, siteNameForLang } from '@/lib/seo'
import type { Locale } from '@/lib/i18n-config'
import type { BreakEvent } from '@/types/database'
import type { Metadata } from 'next'
import Link from 'next/link'
import ShareButtons from '@/components/ShareButtons'
import FanCounter from '@/components/FanCounter'

type Props = { params: { lang: Locale; slug: string } }
type EventSeoRow = Pick<BreakEvent, 'name' | 'description_en' | 'description_es'>

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: raw } = await supabase.from('events').select('name, description_en, description_es').eq('slug', slug).single()
  const data = raw as EventSeoRow | null
  if (!data?.name) return { title: lang === 'es' ? 'Evento no encontrado' : 'Event not found', robots: { index: false, follow: true } }
  const siteName = await siteNameForLang(lang)
  const description = (lang === 'es' ? data.description_es : data.description_en)?.slice(0, 160)
  return detailPageMetadata(lang, `/events/${slug}`, siteName, data.name, description, 'website')
}

export default async function EventDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: rawEvent } = await supabase.from('events').select('*').eq('slug', slug).single()
  const event = rawEvent as BreakEvent | null

  if (!event) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
        <Link href={`/${lang}/events`} className="cutout outline no-underline mb-6 inline-block">← {lang === 'es' ? 'Volver a Eventos' : 'Back to Events'}</Link>
        <div className="sec-tag">EVENT</div>
        <h1 className="sec-title"><span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span></h1>
        <div className="mt-6 p-4 sm:p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}</div>
          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.8, color: 'rgba(232,220,200,0.6)' }}>{lang === 'es' ? 'Detalle del evento en preparación.' : 'Event details in preparation.'}</p>
        </div>
      </div>
    )
  }

  return (
    <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
      <Link href={`/${lang}/events`} className="cutout outline no-underline mb-6 inline-block">← {lang === 'es' ? 'Volver a Eventos' : 'Back to Events'}</Link>
      <div className="sec-tag">{event.event_type?.toUpperCase() || 'EVENT'}</div>
      <h1 className="sec-title"><span className="hl">{event.name}</span></h1>

      {/* Share + Fan counter row */}
      <div className="flex flex-wrap items-center gap-3 mb-6">
        <FanCounter type="event" entityId={event.id} lang={lang} />
        <ShareButtons url={`/${lang}/events/${slug}`} title={`${event.name} | Optimal Breaks`} lang={lang} />
      </div>

      <div className="flex flex-wrap gap-2 mb-8">
        <span className="cutout red">{event.event_type}</span>
        <span className="cutout fill">{event.city}, {event.country}</span>
        {event.venue && <span className="cutout outline">{event.venue}</span>}
      </div>
      {event.date_start && (
        <div className="mb-6 break-words" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(16px, 4vw, 20px)', color: 'var(--red)' }}>
          {event.date_start}{event.date_end ? ` — ${event.date_end}` : ''}
        </div>
      )}
      <p className="max-w-[700px]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8 }}>
        {lang === 'es' ? event.description_es : event.description_en}
      </p>
      {event.lineup?.length > 0 && (
        <div className="mt-8 p-4 sm:p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px' }}>LINEUP</div>
          <div className="flex flex-wrap gap-2">{event.lineup.map((a: string, i: number) => <span key={i} className="cutout red">{a}</span>)}</div>
        </div>
      )}
    </div>
  )
}
