// ============================================
// OPTIMAL BREAKS — Events Page
// ============================================

import { getDictionary } from '@/lib/dictionaries'
import type { Locale } from '@/lib/i18n-config'
import EventFlyer from '@/components/EventFlyer'

const PLACEHOLDER_EVENTS = [
  { date: '12 Apr 2026', name: 'BREAKPOINT FESTIVAL', location: 'Warehouse BCN — Barcelona', type: 'FESTIVAL' },
  { date: '23 May 2026', name: 'NU BREAKS SESSIONS', location: 'Fabric — London', type: 'CLUB' },
  { date: '15 Jun 2026', name: 'AMEN GATHERING', location: 'Tresor — Berlin', type: 'RAVE' },
  { date: '08 Sep 2026', name: 'OPTIMAL BREAKS SHOWCASE', location: 'Sala B — Murcia', type: 'HOME' },
  { date: '1999-2002', name: 'BREAKSPOLL AWARDS', location: 'Fabric — London', type: 'ICONIC' },
  { date: '2001-2022', name: 'BREAKFEST', location: 'Perth — Australia', type: 'ICONIC' },
]

export default async function EventsPage({ params }: { params: { lang: Locale } }) {
  const { lang } = await params
  const dict = await getDictionary(lang)

  const filters = Object.entries(dict.events.filters) as [string, string][]

  return (
    <div className="lined min-h-screen">
      <section className="px-6 py-20 border-b-[5px] border-[var(--ink)]">
        <div className="sec-tag">EVENTS</div>
        <h1 className="sec-title">
          {dict.events.title}
          <br />
          <span className="hl">BREAKBEAT</span>
        </h1>
        <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', lineHeight: 1.8, maxWidth: '700px', color: 'var(--dim)' }}>
          {dict.events.subtitle}
        </p>

        <div className="flex flex-wrap gap-2 mt-8">
          {filters.map(([key, label]) => (
            <span key={key} className={`cutout ${key === 'all' ? 'red' : 'outline'}`}>
              {label}
            </span>
          ))}
        </div>
      </section>

      <section className="px-6 py-16">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-[18px]">
          {PLACEHOLDER_EVENTS.map((e, i) => (
            <EventFlyer key={i} date={e.date} name={e.name} location={e.location} type={e.type} />
          ))}
        </div>
      </section>
    </div>
  )
}
