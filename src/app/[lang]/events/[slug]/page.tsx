// ============================================
// OPTIMAL BREAKS — Event Detail Page
// ============================================

import { createServerSupabase } from '@/lib/supabase'
import type { Locale } from '@/lib/i18n-config'
import type { Metadata } from 'next'
import Link from 'next/link'

type Props = { params: { lang: Locale; slug: string } }

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data } = await supabase.from('events').select('name, description_en, description_es').eq('slug', slug).single()
  if (!data) return { title: 'Event Not Found' }
  return { title: data.name, description: lang === 'es' ? data.description_es?.slice(0, 160) : data.description_en?.slice(0, 160) }
}

export default async function EventDetailPage({ params }: Props) {
  const { lang, slug } = await params
  const supabase = createServerSupabase()
  const { data: event } = await supabase.from('events').select('*').eq('slug', slug).single()

  if (!event) {
    return (
      <div className="lined min-h-screen px-4 sm:px-6 py-14 sm:py-20">
        <Link href={`/${lang}/events`} className="cutout outline no-underline mb-6 inline-block">← {lang === 'es' ? 'Volver a Eventos' : 'Back to Events'}</Link>
        <div className="sec-tag">EVENT</div>
        <h1 className="sec-title"><span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span></h1>
        <div className="mt-6 p-8 border-4 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]">
          <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '24px', color: 'var(--yellow)', marginBottom: '12px' }}>{lang === 'es' ? 'PRÓXIMAMENTE' : 'COMING SOON'}</div>
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
      <div className="flex flex-wrap gap-2 mt-4 mb-8">
        <span className="cutout red">{event.event_type}</span>
        <span className="cutout fill">{event.city}, {event.country}</span>
        {event.venue && <span className="cutout outline">{event.venue}</span>}
      </div>
      {event.date_start && (
        <div className="mb-6" style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '20px', color: 'var(--red)' }}>
          {event.date_start}{event.date_end ? ` — ${event.date_end}` : ''}
        </div>
      )}
      <p className="max-w-[700px]" style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px', lineHeight: 1.8 }}>
        {lang === 'es' ? event.description_es : event.description_en}
      </p>
      {event.lineup?.length > 0 && (
        <div className="mt-8 p-6 bg-[var(--ink)] text-[var(--paper)] border-4 border-[var(--ink)]">
          <div style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '18px', color: 'var(--yellow)', marginBottom: '12px' }}>LINEUP</div>
          <div className="flex flex-wrap gap-2">
            {event.lineup.map((a: string, i: number) => <span key={i} className="cutout red">{a}</span>)}
          </div>
        </div>
      )}
    </div>
  )
}
