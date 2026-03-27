// ============================================
// OPTIMAL BREAKS — History Page (Supabase)
// ============================================

import { createServerSupabase } from '@/lib/supabase-server'
import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import type { HistoryEntry } from '@/types/database'
import { staticPageMetadata } from '@/lib/seo'
import type { Metadata } from 'next'

type HistorySection = {
  title: string
  paragraphs: string[]
  links?: Array<{ label: string; href: string }>
}

type HistorySectionMap = Record<string, HistorySection>

type RenderEntry = {
  slug: string
  section: string
  yearLabel: string
  title: string
  content: string
}

const SECTION_RANGES: Record<string, string> = {
  origins: '1973 — 1986',
  uk_breakbeat: '1988 — 2004',
  us_breaks: '1980s — 2000s',
  andalusian: '1992 — 2002',
  australian: '2001 — 2025',
  rise_decline_revival: '2005 — hoy',
  digital_era: '1998 — hoy',
}

export async function generateMetadata({ params }: { params: { lang: Locale } }): Promise<Metadata> {
  const { lang } = await params
  return staticPageMetadata(lang, '/history', 'history')
}

const SECTION_COLORS: Record<string, string> = {
  origins: 'var(--yellow)',
  uk_breakbeat: 'var(--red)',
  us_breaks: 'var(--blue)',
  andalusian: 'var(--orange)',
  australian: 'var(--acid)',
  rise_decline_revival: 'var(--pink)',
  digital_era: 'var(--uv)',
}

export default async function HistoryPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)
  const supabase = createServerSupabase()
  const { data: entries } = await supabase.from('history_entries').select('*').order('sort_order', { ascending: true })
  const list = (entries || []) as HistoryEntry[]
  const sectionMap = dict.history.sections as HistorySectionMap

  const fallbackEntries: RenderEntry[] = Object.entries(sectionMap).map(([section, value]) => ({
    slug: section,
    section,
    yearLabel: SECTION_RANGES[section] || 'Historia viva',
    title: value.title,
    content: [
      ...value.paragraphs.map((paragraph) => `<p>${paragraph}</p>`),
      ...(value.links || []).map(
        (link) =>
          `<p><a href="${link.href}" target="_blank" rel="noopener noreferrer">${link.label}</a></p>`,
      ),
    ].join(''),
  }))

  const renderEntries: RenderEntry[] =
    list.length > 0
      ? list.map((entry) => ({
          slug: entry.slug,
          section: entry.section,
          yearLabel: entry.year_end ? `${entry.year_start} — ${entry.year_end}` : `${entry.year_start}`,
          title: lang === 'es' ? entry.title_es : entry.title_en,
          content: lang === 'es' ? entry.content_es : entry.content_en,
        }))
      : fallbackEntries

  return (
    <div className="min-h-screen">
      {/* Hero */}
      <section className="lined px-4 sm:px-6 py-14 sm:py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">HISTORY</div>
        <h1 className="sec-title">{dict.history.title}<br /><span className="hl">BREAKBEAT</span></h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>{dict.history.subtitle}</p>
      </section>

      {renderEntries.map((entry, i) => {
        const isDark = i % 2 === 1
        const color = SECTION_COLORS[entry.section] || 'var(--red)'

        return (
          <section
            key={entry.slug}
            className={`px-4 sm:px-6 py-14 sm:py-20 ${isDark ? 'bg-[var(--ink)] text-[var(--paper)]' : 'lined'}`}
            style={isDark ? { borderTop: `6px solid ${color}`, borderBottom: `6px solid ${color}` } : {}}
          >
            <div className="max-w-[800px] mx-auto">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(36px, 8vw, 60px)', color, lineHeight: 1, marginBottom: '12px' }}>
                {entry.yearLabel}
              </div>

              <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(22px, 4vw, 36px)', textTransform: 'uppercase', letterSpacing: '-1px', marginBottom: '20px' }}>
                {entry.title}
              </h2>

              <span
                className="inline-block mb-6"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  fontWeight: 700,
                  fontSize: '9px',
                  letterSpacing: '2px',
                  textTransform: 'uppercase',
                  padding: '3px 10px',
                  background: color,
                  color: isDark ? 'var(--ink)' : 'white',
                }}
              >
                {entry.section.replace(/_/g, ' ')}
              </span>

              <div
                className="prose-ob"
                style={{
                  fontFamily: "'Special Elite', monospace",
                  fontSize: '16px',
                  lineHeight: 1.9,
                  color: isDark ? 'rgba(232,220,200,0.75)' : 'var(--ink)',
                }}
                dangerouslySetInnerHTML={{ __html: entry.content }}
              />
            </div>
          </section>
        )
      })}
    </div>
  )
}
