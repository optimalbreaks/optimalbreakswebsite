'use client'

import { useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import type { BreakEvent } from '@/types/database'
import FavoriteButton from '@/components/FavoriteButton'

type DateWhen = 'all' | 'upcoming' | 'past' | 'undated'
type YearGroupKey = number | 'undated'

type DateFilterDict = {
  when_label: string
  all_when: string
  upcoming: string
  past: string
  undated: string
  showing: string
  no_results: string
}

interface Props {
  events: BreakEvent[]
  dict: {
    view_large: string
    view_compact: string
    view_list: string
    view_calendar?: string
    calendar_legend?: string
    calendar_undated_hint?: string
    date_filter?: DateFilterDict
  }
  lang: string
}

function parseLocalDayStart(iso: string | null | undefined): number | null {
  if (!iso) return null
  const part = String(iso).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return null
  const [y, m, d] = part.split('-').map(Number)
  const t = new Date(y, m - 1, d).setHours(0, 0, 0, 0)
  return Number.isNaN(t) ? null : t
}

function startOfLocalToday(): number {
  const d = new Date()
  d.setHours(0, 0, 0, 0)
  return d.getTime()
}

function parseIsoYmd(s: string | null | undefined): { y: number; m: number; d: number } | null {
  if (!s) return null
  const part = String(s).slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(part)) return null
  const [y, m, d] = part.split('-').map(Number)
  if (!Number.isFinite(y) || !Number.isFinite(m) || !Number.isFinite(d)) return null
  return { y, m, d }
}

function dayKey(y: number, m: number, d: number) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`
}

/** Días del año con eventos (incluye rangos date_start–date_end). */
function buildDayMap(events: BreakEvent[], year: number): Map<string, BreakEvent[]> {
  const map = new Map<string, BreakEvent[]>()
  for (const e of events) {
    const start = parseIsoYmd(e.date_start)
    if (!start) continue
    const end = parseIsoYmd(e.date_end) ?? start
    const startD = new Date(start.y, start.m - 1, start.d)
    const endD = new Date(end.y, end.m - 1, end.d)
    if (startD > endD) continue
    const cur = new Date(startD)
    let guard = 0
    while (cur <= endD && guard++ < 400) {
      if (cur.getFullYear() === year) {
        const k = dayKey(cur.getFullYear(), cur.getMonth() + 1, cur.getDate())
        let arr = map.get(k)
        if (!arr) {
          arr = []
          map.set(k, arr)
        }
        if (!arr.some((x) => x.slug === e.slug)) arr.push(e)
      }
      cur.setDate(cur.getDate() + 1)
    }
  }
  return map
}

function weekdayLabelsMonFirst(locale: string): string[] {
  const base = new Date(2024, 0, 1)
  const fmt = new Intl.DateTimeFormat(locale, { weekday: 'narrow' })
  const out: string[] = []
  for (let i = 0; i < 7; i++) {
    const d = new Date(base)
    d.setDate(base.getDate() + i)
    out.push(fmt.format(d))
  }
  return out
}

function eventYear(e: BreakEvent): number | null {
  const src = e.date_start || e.date_end
  if (!src) return null
  const y = parseInt(String(src).slice(0, 4), 10)
  return Number.isFinite(y) ? y : null
}

/** Para ordenar: día local de inicio, o fin si no hay inicio; sin fecha → al final del bloque. */
function eventSortTimestamp(e: BreakEvent): number {
  const t = parseLocalDayStart(e.date_start) ?? parseLocalDayStart(e.date_end)
  return t ?? Number.NEGATIVE_INFINITY
}

/** Dentro de cada año: fechas de más reciente a más antigua (p. ej. 24/11/2025 antes que 24/03/2025). */
function sortEventsByDateDesc(items: BreakEvent[]): BreakEvent[] {
  return [...items].sort((a, b) => eventSortTimestamp(b) - eventSortTimestamp(a))
}

/** Años numéricos primero (año más reciente arriba); dentro de cada año, orden por fecha desc. «Sin fecha» al final. */
function groupByYearOrdered(items: BreakEvent[]): { key: YearGroupKey; items: BreakEvent[] }[] {
  const map = new Map<YearGroupKey, BreakEvent[]>()
  for (const e of items) {
    const y = eventYear(e)
    const k: YearGroupKey = y == null ? 'undated' : y
    if (!map.has(k)) map.set(k, [])
    map.get(k)!.push(e)
  }
  const numeric = Array.from(map.keys()).filter((k): k is number => k !== 'undated')
  numeric.sort((a, b) => b - a)
  const out: { key: YearGroupKey; items: BreakEvent[] }[] = numeric.map((k) => ({
    key: k,
    items: sortEventsByDateDesc(map.get(k)!),
  }))
  const und = map.get('undated')
  if (und && und.length > 0) out.push({ key: 'undated', items: sortEventsByDateDesc(und) })
  return out
}

export default function EventsExplorer({ events, dict, lang }: Props) {
  const [view, setView] = useState<ViewMode>('compact')
  const [when, setWhen] = useState<DateWhen>('all')

  const df = dict.date_filter

  const filtered = useMemo(() => {
    const today = startOfLocalToday()
    return events.filter((e) => {
      const day = parseLocalDayStart(e.date_start) ?? parseLocalDayStart(e.date_end)

      if (when === 'upcoming') {
        if (day == null) return false
        return day >= today
      }
      if (when === 'past') {
        if (day == null) return false
        return day < today
      }
      if (when === 'undated') return day == null
      return true
    })
  }, [events, when])

  const yearGroups = useMemo(() => groupByYearOrdered(filtered), [filtered])

  const chipBase =
    'cursor-pointer border-[3px] border-[var(--ink)] px-2.5 py-1 transition-colors text-[9px] sm:text-[10px] font-bold uppercase tracking-wider'
  const chipFont: CSSProperties = {
    fontFamily: "'Courier Prime', monospace",
  }

  return (
    <div>
      {df ? (
        <div className="mb-6 space-y-4 border-b-[3px] border-[var(--ink)] pb-6">
          <div className="flex flex-wrap items-center gap-2 gap-y-3">
            <span
              className="shrink-0 text-[var(--dim)] mr-1"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase' }}
            >
              {df.when_label}
            </span>
            {(
              [
                ['all', df.all_when] as const,
                ['upcoming', df.upcoming] as const,
                ['past', df.past] as const,
                ['undated', df.undated] as const,
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                style={chipFont}
                className={`${chipBase} ${when === key ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-[var(--paper)] hover:bg-[var(--yellow)]'}`}
                onClick={() => setWhen(key)}
              >
                {label}
              </button>
            ))}
          </div>
          <p
            className="text-[var(--dim)]"
            style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }}
          >
            {df.showing.replace('{n}', String(filtered.length)).replace('{total}', String(events.length))}
          </p>
        </div>
      ) : null}

      <div className="flex justify-end mb-5">
        <ViewToggle view={view} setView={setView} labels={dict} />
      </div>

      {filtered.length === 0 ? (
        <p
          className="py-12 text-center text-[var(--dim)] border-4 border-[var(--ink)] border-dashed px-4"
          style={{ fontFamily: "'Special Elite', monospace", fontSize: '16px' }}
        >
          {df?.no_results ?? '—'}
        </p>
      ) : (
        <div className="space-y-10 sm:space-y-14">
          {yearGroups.map(({ key, items }, idx) => {
            const title = key === 'undated' ? (df?.undated ?? '—') : String(key)
            return (
              <section key={String(key)} aria-labelledby={`events-year-${key}`}>
                <h2
                  id={`events-year-${key}`}
                  className={`mt-0 mb-4 sm:mb-5 pb-3 border-b-[4px] border-[var(--ink)] ${idx === 0 ? '' : 'pt-2'}`}
                  style={{
                    fontFamily: "'Unbounded', sans-serif",
                    fontWeight: 900,
                    fontSize: 'clamp(26px, 4.5vw, 40px)',
                    letterSpacing: '-0.04em',
                    lineHeight: 1.05,
                  }}
                >
                  {title}
                </h2>
                {view === 'calendar' && key !== 'undated' ? (
                  <YearCalendar
                    year={key}
                    events={items}
                    lang={lang}
                    legend={dict.calendar_legend ?? ''}
                  />
                ) : view === 'calendar' && key === 'undated' ? (
                  <div className="space-y-4">
                    <p
                      className="text-[var(--dim)] max-w-xl"
                      style={{ fontFamily: "'Special Elite', monospace", fontSize: '15px', lineHeight: 1.7 }}
                    >
                      {dict.calendar_undated_hint ?? ''}
                    </p>
                    <ListView events={items} lang={lang} />
                  </div>
                ) : view === 'large' ? (
                  <LargeGrid events={items} lang={lang} />
                ) : view === 'compact' ? (
                  <CompactGrid events={items} lang={lang} />
                ) : (
                  <ListView events={items} lang={lang} />
                )}
              </section>
            )
          })}
        </div>
      )}
    </div>
  )
}

function YearCalendar({
  year,
  events,
  lang,
  legend,
}: {
  year: number
  events: BreakEvent[]
  lang: string
  legend: string
}) {
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const dayMap = useMemo(() => buildDayMap(events, year), [events, year])
  const weekdayLabels = useMemo(() => weekdayLabelsMonFirst(locale), [locale])

  return (
    <div>
      {legend ? (
        <p
          className="flex flex-wrap items-center gap-2 mb-4 text-[var(--dim)]"
          style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }}
        >
          <span className="inline-block w-5 h-5 shrink-0 bg-[var(--red)] border-2 border-[var(--ink)]" aria-hidden />
          <span>{legend}</span>
        </p>
      ) : null}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
        {Array.from({ length: 12 }, (_, monthIndex) => (
          <MonthMiniCalendar
            key={monthIndex}
            year={year}
            monthIndex={monthIndex}
            dayMap={dayMap}
            weekdayLabels={weekdayLabels}
            lang={lang}
          />
        ))}
      </div>
    </div>
  )
}

function MonthMiniCalendar({
  year,
  monthIndex,
  dayMap,
  weekdayLabels,
  lang,
}: {
  year: number
  monthIndex: number
  dayMap: Map<string, BreakEvent[]>
  weekdayLabels: string[]
  lang: string
}) {
  const monthTitle = new Intl.DateTimeFormat(lang === 'es' ? 'es-ES' : 'en-GB', {
    month: 'long',
  }).format(new Date(year, monthIndex, 1))
  const lastDay = new Date(year, monthIndex + 1, 0).getDate()
  const offset = (new Date(year, monthIndex, 1).getDay() + 6) % 7

  const cells: ReactNode[] = []
  for (let i = 0; i < offset; i++) {
    cells.push(<div key={`pad-${monthIndex}-${i}`} className="min-h-[1.35rem]" />)
  }
  for (let d = 1; d <= lastDay; d++) {
    const k = dayKey(year, monthIndex + 1, d)
    const list = dayMap.get(k)
    const has = list && list.length > 0
    const title = has ? list!.map((e) => e.name).join(' · ') : undefined
    const first = has ? list![0] : null

    cells.push(
      <div key={k} className="min-h-[1.35rem] flex items-center justify-center p-[1px]">
        {has && first ? (
          <Link
            href={`/${lang}/events/${first.slug}`}
            title={title}
            className="w-full min-h-[1.35rem] flex items-center justify-center text-[10px] sm:text-[11px] font-bold border border-[var(--ink)] bg-[var(--red)] text-[var(--paper)] hover:bg-[var(--ink)] transition-colors no-underline rounded-sm"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {d}
          </Link>
        ) : (
          <span
            className="text-[10px] sm:text-[11px] text-[var(--dim)] tabular-nums"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            {d}
          </span>
        )}
      </div>,
    )
  }

  return (
    <div className="border-[3px] border-[var(--ink)] bg-[var(--paper)] p-2 sm:p-3">
      <div
        className="text-center mb-2 capitalize"
        style={{
          fontFamily: "'Unbounded', sans-serif",
          fontWeight: 800,
          fontSize: 'clamp(11px, 2.5vw, 13px)',
          letterSpacing: '-0.02em',
        }}
      >
        {monthTitle}
      </div>
      <div className="grid grid-cols-7 gap-px">
        {weekdayLabels.map((w, wi) => (
          <div
            key={`${monthIndex}-wd-${wi}`}
            className="text-center text-[8px] sm:text-[9px] text-[var(--dim)] pb-1"
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700 }}
          >
            {w}
          </div>
        ))}
        {cells}
      </div>
    </div>
  )
}

function LargeGrid({ events, lang }: { events: BreakEvent[]; lang: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
      {events.map((e) => (
        <Link
          key={e.slug}
          href={`/${lang}/events/${e.slug}`}
          className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] sm:hover:rotate-[-1deg] sm:hover:shadow-[6px_6px_0_var(--ink)] no-underline text-[var(--ink)] block overflow-hidden group"
        >
          <FavoriteButton type="event" entityId={e.id} lang={lang} />
          <CardThumbnail
            src={e.image_url}
            alt={e.name}
            aspectClass="aspect-poster w-full"
            frameClass="border-b-[3px] border-[var(--ink)]"
            fit="contain"
          />
          <div className="p-5 sm:p-7 relative">
            <div className="absolute -top-[6px] right-[25px] w-[50px] sm:w-[60px] h-[16px] sm:h-[18px] z-[1]" style={{ background: 'var(--tape)', transform: 'rotate(2deg)' }} />
            <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 2vw, 16px)', color: 'var(--red)' }}>
              {e.date_start || 'TBA'}
            </div>
            <div className="mt-2 leading-none" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
              {e.name}
            </div>
            <div className="mt-2" style={{ fontSize: 'clamp(12px, 2vw, 14px)', color: 'var(--text-muted)' }}>
              {e.venue ? `${e.venue} — ` : ''}{e.city}, {e.country}
            </div>
            <div className="absolute bottom-3 right-3 bg-[var(--red)] text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '2px', textTransform: 'uppercase', padding: '3px 10px', transform: 'rotate(3deg)' }}>
              {e.event_type?.replace('_', ' ')}
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function CompactGrid({ events, lang }: { events: BreakEvent[]; lang: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)] items-start">
      {events.map((e) => (
        <Link
          key={e.slug}
          href={`/${lang}/events/${e.slug}`}
          className="relative border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden"
        >
          <FavoriteButton type="event" entityId={e.id} lang={lang} />
          <CardThumbnail src={e.image_url} alt={e.name} aspectClass="aspect-poster w-full" fit="cover" />
          <div className="p-3 flex flex-col flex-grow min-h-0">
            <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '11px', color: 'var(--red)' }}>
              {e.date_start || 'TBA'}
            </div>
            <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              {e.name}
            </div>
            <div className="flex gap-1 mt-1">
              <span className="cutout fill" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{e.country}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function ListView({ events, lang }: { events: BreakEvent[]; lang: string }) {
  return (
    <div className="border-4 border-[var(--ink)]">
      {events.map((e) => (
        <div key={e.slug} className="relative border-b-[2px] border-[var(--ink)]">
          <FavoriteButton type="event" entityId={e.id} lang={lang} className="!top-1/2 !-translate-y-1/2 !right-3" />
          <Link
            href={`/${lang}/events/${e.slug}`}
            className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 pr-12 transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)]"
          >
            <div className="shrink-0 w-[2.75rem] sm:w-14 overflow-hidden border-[2px] border-[var(--ink)]">
              <CardThumbnail src={e.image_url} alt={e.name} aspectClass="aspect-poster w-full" frameClass="" fit="cover" />
            </div>
            <div className="flex-grow min-w-0">
              <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
                {e.name}
              </div>
              <div className="mt-[2px]" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>
                {e.date_start || 'TBA'}
              </div>
            </div>
            <div className="hidden sm:flex gap-2 shrink-0">
              <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{e.city}, {e.country}</span>
              <span className="cutout red" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{e.event_type?.replace('_', ' ')}</span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  )
}
