'use client'

import { useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import type { BreakEvent } from '@/types/database'
import { eventNoticeKind } from '@/types/database'
import FavoriteButton from '@/components/FavoriteButton'
import { EventCancelledStamp } from '@/components/EventPosterLightbox'

type DateWhen = 'all' | 'upcoming' | 'past' | 'undated'
type YearGroupKey = number | 'undated'

type DateFilterDict = {
  when_label: string
  all_when: string
  upcoming: string
  past: string
  undated: string
  country_label?: string
  all_countries?: string
  showing: string
  no_results: string
}

function normalizeCountry(s: string | null | undefined): string {
  return String(s ?? '').trim()
}

interface Props {
  events: BreakEvent[]
  dict: {
    view_large: string
    view_compact: string
    view_list: string
    view_calendar?: string
    /** Leyenda calendario: pasado (rojo) / próximo (amarillo). */
    calendar_legend_past?: string
    calendar_legend_upcoming?: string
    calendar_undated_hint?: string
    calendar_modal_close?: string
    calendar_modal_view_event?: string
    calendar_modal_lineup?: string
    calendar_modal_location?: string
    calendar_modal_dates?: string
    calendar_modal_badge_past?: string
    calendar_modal_badge_upcoming?: string
    date_filter?: DateFilterDict
    cancelled_stamp?: string
    calendar_modal_badge_cancelled?: string
    calendar_modal_badge_postponed?: string
    postponed_stamp?: string
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

/** Último día del evento (date_end o date_start) estrictamente antes que hoy → pasado. Sin fecha válida → no pasado (se trata como «aún relevante»). */
function isEventPast(e: BreakEvent): boolean {
  const last = parseLocalDayStart(e.date_end) ?? parseLocalDayStart(e.date_start)
  if (last == null) return false
  return last < startOfLocalToday()
}

/** Aclarar ~50 % hacia blanco: pie o imagen (todo el <Link> es `group/link`). */
const EVENT_FOOTER_HOVER_PAST =
  'hover:bg-[color-mix(in_srgb,var(--red)_50%,white)] group-hover/link:bg-[color-mix(in_srgb,var(--red)_50%,white)]' as const
/** Amarillo de marca (`--yellow`, logo / navbar) en lugar de verde. */
const EVENT_FOOTER_HOVER_UPCOMING =
  'hover:bg-[color-mix(in_srgb,var(--yellow)_50%,white)] group-hover/link:bg-[color-mix(in_srgb,var(--yellow)_50%,white)]' as const

/** Franja detrás del cartel al hover: mismo cromatismo que el pie (rojo pasado / amarillo próximo). */
const EVENT_POSTER_STRIP_HOVER_PAST =
  'group-hover/link:bg-[color-mix(in_srgb,var(--red)_42%,white)]' as const
const EVENT_POSTER_STRIP_HOVER_UPCOMING = 'group-hover/link:bg-[var(--yellow)]' as const

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

function sortEventsForCalendarModal(events: BreakEvent[]): BreakEvent[] {
  return [...events].sort((a, b) => {
    const ap = isEventPast(a) ? 1 : 0
    const bp = isEventPast(b) ? 1 : 0
    if (ap !== bp) return ap - bp
    return (parseLocalDayStart(b.date_start) ?? 0) - (parseLocalDayStart(a.date_start) ?? 0)
  })
}

function formatEventDatesBrief(e: BreakEvent, locale: string): string {
  const ds = e.date_start?.slice(0, 10)
  const de = e.date_end?.slice(0, 10)
  if (!ds) return '—'
  if (!de || de === ds) {
    return new Date(`${ds}T12:00:00`).toLocaleDateString(locale, {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
  }
  const a = new Date(`${ds}T12:00:00`)
  const b = new Date(`${de}T12:00:00`)
  return `${a.toLocaleDateString(locale, { day: 'numeric', month: 'short' })} – ${b.toLocaleDateString(locale, { day: 'numeric', month: 'short', year: 'numeric' })}`
}

function eventLocationBrief(e: BreakEvent): string {
  const parts = [e.venue, e.city, e.country].map((x) => String(x ?? '').trim()).filter(Boolean)
  if (parts.length > 0) return parts.join(' · ')
  return String(e.location ?? '').trim() || '—'
}

function lineupPreviewText(e: BreakEvent, max: number): string | null {
  const names: string[] = []
  const seen = new Set<string>()
  for (const n of e.lineup ?? []) {
    const t = String(n).trim()
    if (t && !seen.has(t.toLowerCase())) {
      seen.add(t.toLowerCase())
      names.push(t)
    }
  }
  for (const st of e.stages ?? []) {
    for (const n of st.lineup ?? []) {
      const t = String(n).trim()
      if (t && !seen.has(t.toLowerCase())) {
        seen.add(t.toLowerCase())
        names.push(t)
      }
    }
  }
  if (names.length === 0) return null
  if (names.length <= max) return names.join(', ')
  return `${names.slice(0, max).join(', ')}…`
}

function descriptionExcerpt(e: BreakEvent, lang: string, maxLen: number): string {
  const raw =
    (lang === 'es' ? e.description_es : e.description_en) || e.description_en || e.description_es || ''
  const plain = raw.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim()
  if (plain.length <= maxLen) return plain
  return `${plain.slice(0, maxLen).trim()}…`
}

type CalendarModalLabels = {
  close: string
  viewEvent: string
  lineup: string
  location: string
  dates: string
  badgePast: string
  badgeUpcoming: string
  badgeCancelled: string
  badgePostponed: string
}

function noticeStampLabel(lang: string, kind: 'cancelled' | 'postponed') {
  if (kind === 'postponed') return lang === 'es' ? 'APLAZADO' : 'POSTPONED'
  return lang === 'es' ? 'CANCELADO' : 'CANCELLED'
}

function CalendarDayEventsModal({
  payload,
  lang,
  labels,
  onClose,
}: {
  payload: { events: BreakEvent[]; date: Date }
  lang: string
  labels: CalendarModalLabels
  onClose: () => void
}) {
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const heading = new Intl.DateTimeFormat(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(payload.date)

  return (
    <>
      <div
        className="fixed inset-0 z-[520] bg-black/55 backdrop-blur-[2px]"
        onClick={onClose}
        aria-hidden
      />
      <div className="fixed inset-0 z-[521] flex items-center justify-center p-3 sm:p-6 pointer-events-none overflow-y-auto">
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="cal-day-modal-title"
          className="pointer-events-auto w-full max-w-lg my-auto border-[4px] border-[var(--ink)] bg-[var(--paper)] shadow-[8px_8px_0_var(--ink)] max-h-[min(92vh,calc(100dvh-24px))] flex flex-col"
        >
          <div className="shrink-0 flex items-start justify-between gap-3 border-b-[3px] border-[var(--ink)] px-4 py-3 bg-[color-mix(in_srgb,var(--yellow)_22%,var(--paper))]">
            <h2
              id="cal-day-modal-title"
              className="m-0 pr-2 capitalize text-[var(--ink)]"
              style={{
                fontFamily: "'Unbounded', sans-serif",
                fontWeight: 900,
                fontSize: 'clamp(14px, 3.2vw, 19px)',
                lineHeight: 1.15,
                letterSpacing: '-0.03em',
              }}
            >
              {heading}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="shrink-0 w-9 h-9 flex items-center justify-center border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--red)] hover:text-white transition-colors cursor-pointer"
              style={{ fontFamily: "'Courier Prime', monospace", fontSize: '18px', lineHeight: 1 }}
              aria-label={labels.close}
            >
              ✕
            </button>
          </div>
          <div className="overflow-y-auto flex-1 min-h-0 px-4 py-5 space-y-10">
            {payload.events.map((e) => {
              const past = isEventPast(e)
              const notice = eventNoticeKind(e)
              const lineup = lineupPreviewText(e, 18)
              const excerpt = descriptionExcerpt(e, lang, 220)
              return (
                <article key={e.slug} className="pb-10 border-b-[2px] border-[var(--ink)] last:border-b-0 last:pb-0">
                  <div className="flex flex-col sm:flex-row gap-4">
                    <div className="relative sm:w-[min(42%,160px)] shrink-0 overflow-hidden bg-[var(--paper)]">
                      <CardThumbnail src={e.image_url} alt={e.name} aspectClass="aspect-poster w-full" fit="cover" />
                      {notice ? (
                        <EventCancelledStamp
                          label={noticeStampLabel(lang, notice)}
                          size="card"
                          tone={notice === 'postponed' ? 'postpone' : 'cancel'}
                        />
                      ) : null}
                    </div>
                    <div className="min-w-0 flex-1 flex flex-col gap-2 text-[var(--ink)]">
                      <span
                        className={`self-start text-[9px] uppercase tracking-wider px-2 py-0.5 border border-[var(--ink)] ${
                          notice === 'cancelled' || past
                            ? 'bg-[var(--red)] text-white'
                            : notice === 'postponed'
                              ? 'bg-[var(--yellow)] text-[var(--ink)]'
                              : 'bg-[var(--yellow)] text-[var(--ink)]'
                        }`}
                        style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700 }}
                      >
                        {notice === 'cancelled'
                          ? labels.badgeCancelled
                          : notice === 'postponed'
                            ? labels.badgePostponed
                            : past
                              ? labels.badgePast
                              : labels.badgeUpcoming}
                      </span>
                      <h3
                        className="m-0 uppercase"
                        style={{
                          fontFamily: "'Unbounded', sans-serif",
                          fontWeight: 900,
                          fontSize: 'clamp(14px, 2.8vw, 17px)',
                          letterSpacing: '-0.03em',
                          lineHeight: 1.2,
                        }}
                      >
                        {e.name}
                      </h3>
                      <dl className="m-0 space-y-2 text-sm" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        <div>
                          <dt className="text-[var(--dim)] text-[10px] uppercase tracking-wide m-0">{labels.dates}</dt>
                          <dd className="m-0 mt-0.5 font-bold">{formatEventDatesBrief(e, locale)}</dd>
                        </div>
                        <div>
                          <dt className="text-[var(--dim)] text-[10px] uppercase tracking-wide m-0">{labels.location}</dt>
                          <dd className="m-0 mt-0.5 font-bold">{eventLocationBrief(e)}</dd>
                        </div>
                        {lineup ? (
                          <div>
                            <dt className="text-[var(--dim)] text-[10px] uppercase tracking-wide m-0">{labels.lineup}</dt>
                            <dd className="m-0 mt-0.5 font-bold leading-snug">{lineup}</dd>
                          </div>
                        ) : null}
                      </dl>
                      {excerpt ? (
                        <p
                          className="m-0 text-[var(--dim)] text-[13px] leading-relaxed"
                          style={{ fontFamily: "'Special Elite', system-ui", lineHeight: 1.55 }}
                        >
                          {excerpt}
                        </p>
                      ) : null}
                      <Link
                        href={`/${lang}/events/${e.slug}`}
                        onClick={onClose}
                        className="mt-2 inline-flex items-center justify-center text-center no-underline border-[3px] border-[var(--ink)] bg-[var(--red)] text-white px-4 py-2.5 hover:bg-[color-mix(in_srgb,var(--red)_55%,white)] transition-colors"
                        style={{
                          fontFamily: "'Unbounded', sans-serif",
                          fontWeight: 900,
                          fontSize: '12px',
                          letterSpacing: '0.06em',
                        }}
                      >
                        {labels.viewEvent}
                      </Link>
                    </div>
                  </div>
                </article>
              )
            })}
          </div>
        </div>
      </div>
    </>
  )
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
  const [country, setCountry] = useState<string | 'all'>('all')
  const [calDayModal, setCalDayModal] = useState<null | { events: BreakEvent[]; date: Date }>(null)
  const [calPortalMounted, setCalPortalMounted] = useState(false)

  const df = dict.date_filter

  const calendarModalLabels = useMemo<CalendarModalLabels>(
    () => ({
      close: dict.calendar_modal_close ?? 'Close',
      viewEvent: dict.calendar_modal_view_event ?? 'View event page',
      lineup: dict.calendar_modal_lineup ?? 'Lineup',
      location: dict.calendar_modal_location ?? 'Location',
      dates: dict.calendar_modal_dates ?? 'Dates',
      badgePast: dict.calendar_modal_badge_past ?? 'Past',
      badgeUpcoming: dict.calendar_modal_badge_upcoming ?? 'Upcoming',
      badgeCancelled: dict.calendar_modal_badge_cancelled ?? (lang === 'es' ? 'Cancelado' : 'Cancelled'),
      badgePostponed: dict.calendar_modal_badge_postponed ?? (lang === 'es' ? 'Aplazado' : 'Postponed'),
    }),
    [dict, lang],
  )

  useEffect(() => {
    setCalPortalMounted(true)
  }, [])

  useEffect(() => {
    if (view !== 'calendar') setCalDayModal(null)
  }, [view])

  useEffect(() => {
    if (!calDayModal) return undefined
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setCalDayModal(null)
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = prev
      window.removeEventListener('keydown', onKey)
    }
  }, [calDayModal])

  const countryOptions = useMemo(() => {
    const set = new Set<string>()
    for (const e of events) {
      const c = normalizeCountry(e.country)
      if (c) set.add(c)
    }
    return Array.from(set).sort((a, b) => a.localeCompare(b, lang, { sensitivity: 'base' }))
  }, [events, lang])

  const filtered = useMemo(() => {
    const today = startOfLocalToday()
    return events.filter((e) => {
      const day = parseLocalDayStart(e.date_start) ?? parseLocalDayStart(e.date_end)

      if (when === 'upcoming') {
        if (day == null) return false
        if (day < today) return false
      } else if (when === 'past') {
        if (day == null) return false
        if (day >= today) return false
      } else if (when === 'undated') {
        if (day != null) return false
      }

      if (country !== 'all' && normalizeCountry(e.country) !== country) return false

      return true
    })
  }, [events, when, country])

  const yearGroups = useMemo(() => groupByYearOrdered(filtered), [filtered])

  const chipBase =
    'cursor-pointer border-[3px] border-[var(--ink)] px-2.5 py-1 transition-colors text-[9px] sm:text-[10px] font-bold uppercase tracking-wider'
  const chipFont: CSSProperties = {
    fontFamily: "'Courier Prime', monospace",
  }

  return (
    <>
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
          {df.country_label && countryOptions.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2 gap-y-3">
              <span
                className="shrink-0 text-[var(--dim)] mr-1"
                style={{ fontFamily: "'Courier Prime', monospace", fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase' }}
              >
                {df.country_label}
              </span>
              <button
                type="button"
                style={chipFont}
                className={`${chipBase} ${country === 'all' ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-[var(--paper)] hover:bg-[var(--yellow)]'}`}
                onClick={() => setCountry('all')}
              >
                {df.all_countries ?? 'All'}
              </button>
              {countryOptions.map((c) => (
                <button
                  key={c}
                  type="button"
                  style={chipFont}
                  className={`${chipBase} ${country === c ? 'bg-[var(--red)] text-white border-[var(--red)]' : 'bg-[var(--paper)] hover:bg-[var(--yellow)]'}`}
                  onClick={() => setCountry(c)}
                >
                  {c}
                </button>
              ))}
            </div>
          ) : null}
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
                    legendPast={dict.calendar_legend_past ?? ''}
                    legendUpcoming={dict.calendar_legend_upcoming ?? ''}
                    onOpenCalendarDay={(list, y, m, d) =>
                      setCalDayModal({
                        events: sortEventsForCalendarModal(list),
                        date: new Date(y, m - 1, d),
                      })
                    }
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
    {calPortalMounted && calDayModal
      ? createPortal(
          <CalendarDayEventsModal
            payload={calDayModal}
            lang={lang}
            labels={calendarModalLabels}
            onClose={() => setCalDayModal(null)}
          />,
          document.body,
        )
      : null}
    </>
  )
}

function YearCalendar({
  year,
  events,
  lang,
  legendPast,
  legendUpcoming,
  onOpenCalendarDay,
}: {
  year: number
  events: BreakEvent[]
  lang: string
  legendPast: string
  legendUpcoming: string
  onOpenCalendarDay: (events: BreakEvent[], y: number, month: number, day: number) => void
}) {
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const dayMap = useMemo(() => buildDayMap(events, year), [events, year])
  const weekdayLabels = useMemo(() => weekdayLabelsMonFirst(locale), [locale])
  const showLegend = Boolean(legendPast || legendUpcoming)

  return (
    <div>
      {showLegend ? (
        <div
          className="flex flex-wrap items-center gap-x-5 gap-y-2 mb-4 text-[var(--dim)]"
          style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }}
        >
          {legendPast ? (
            <p className="flex flex-wrap items-center gap-2 m-0">
              <span className="inline-block w-5 h-5 shrink-0 bg-[var(--red)] border-2 border-[var(--ink)]" aria-hidden />
              <span>{legendPast}</span>
            </p>
          ) : null}
          {legendUpcoming ? (
            <p className="flex flex-wrap items-center gap-2 m-0">
              <span
                className="inline-block w-5 h-5 shrink-0 bg-[var(--yellow)] border-2 border-[var(--ink)]"
                aria-hidden
              />
              <span>{legendUpcoming}</span>
            </p>
          ) : null}
        </div>
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
            onOpenDayWithEvents={onOpenCalendarDay}
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
  onOpenDayWithEvents,
}: {
  year: number
  monthIndex: number
  dayMap: Map<string, BreakEvent[]>
  weekdayLabels: string[]
  lang: string
  onOpenDayWithEvents: (events: BreakEvent[], y: number, month: number, day: number) => void
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
    /** Amarillo si queda algún evento no pasado ese día; rojo si todos ya pasaron (misma regla que el listado). */
    const anyUpcoming = Boolean(has && list!.some((e) => !isEventPast(e)))

    const dayBtnClass = anyUpcoming
      ? 'w-full min-h-[1.35rem] flex items-center justify-center text-[10px] sm:text-[11px] font-bold border border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] hover:bg-[color-mix(in_srgb,var(--yellow)_50%,white)] transition-colors rounded-sm cursor-pointer'
      : 'w-full min-h-[1.35rem] flex items-center justify-center text-[10px] sm:text-[11px] font-bold border border-[var(--ink)] bg-[var(--red)] text-[var(--paper)] hover:bg-[color-mix(in_srgb,var(--red)_50%,white)] transition-colors rounded-sm cursor-pointer'

    cells.push(
      <div key={k} className="min-h-[1.35rem] flex items-center justify-center p-[1px]">
        {has && list ? (
          <button
            type="button"
            title={title}
            aria-haspopup="dialog"
            aria-label={title}
            className={dayBtnClass}
            style={{ fontFamily: "'Courier Prime', monospace" }}
            onClick={() => onOpenDayWithEvents(list, year, monthIndex + 1, d)}
          >
            {d}
          </button>
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
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)] items-stretch">
      {events.map((e) => {
        const past = isEventPast(e)
        const notice = eventNoticeKind(e)
        return (
        <Link
          key={e.slug}
          href={`/${lang}/events/${e.slug}`}
          className="relative h-full min-h-0 border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 group/link no-underline text-[var(--ink)] flex flex-col overflow-hidden"
        >
          <FavoriteButton type="event" entityId={e.id} lang={lang} />
          <div
            className={`relative shrink-0 overflow-hidden transition-colors duration-150 ${
              past ? EVENT_POSTER_STRIP_HOVER_PAST : EVENT_POSTER_STRIP_HOVER_UPCOMING
            }`}
          >
            <CardThumbnail src={e.image_url} alt={e.name} aspectClass="aspect-poster w-full" fit="cover" groupHoverGroup="link" />
            {notice ? (
              <EventCancelledStamp
                label={noticeStampLabel(lang, notice)}
                size="card"
                tone={notice === 'postponed' ? 'postpone' : 'cancel'}
              />
            ) : null}
          </div>
          <div
            className={`flex flex-1 flex-col justify-start p-3 text-left transition-colors duration-200 ease-out min-h-[5.25rem] ${
              past
                ? `bg-[var(--red)] text-white ${EVENT_FOOTER_HOVER_PAST}`
                : `bg-[var(--yellow)] text-[var(--ink)] ${EVENT_FOOTER_HOVER_UPCOMING}`
            }`}
          >
            <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '11px', color: 'inherit' }}>
              {e.date_start || 'TBA'}
            </div>
            <div
              className="mt-1 line-clamp-3 text-left"
              style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2, color: 'inherit' }}
            >
              {e.name}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              <span
                className={
                  past
                    ? 'inline-block border border-white/35 bg-white/15 text-white'
                    : 'inline-block border border-[var(--ink)]/30 bg-[var(--ink)]/10 text-[var(--ink)]'
                }
                style={{ fontSize: '7px', padding: '0px 4px', margin: 0, fontFamily: "'Courier Prime', monospace", fontWeight: 700, letterSpacing: '0.5px' }}
              >
                {e.country}
              </span>
            </div>
          </div>
        </Link>
        )
      })}
    </div>
  )
}

function CompactGrid({ events, lang }: { events: BreakEvent[]; lang: string }) {
  return (
    <div className="grid grid-cols-3 sm:grid-cols-5 md:grid-cols-7 lg:grid-cols-10 gap-0 border-4 border-[var(--ink)] items-stretch">
      {events.map((e) => {
        const past = isEventPast(e)
        const notice = eventNoticeKind(e)
        return (
        <Link
          key={e.slug}
          href={`/${lang}/events/${e.slug}`}
          className="relative h-full min-h-0 border-b-[2px] border-r-[2px] border-[var(--ink)] transition-all duration-150 group/link no-underline text-[var(--ink)] flex flex-col overflow-hidden"
        >
          <div
            className={`relative shrink-0 overflow-hidden transition-colors duration-150 ${
              past ? EVENT_POSTER_STRIP_HOVER_PAST : EVENT_POSTER_STRIP_HOVER_UPCOMING
            }`}
          >
            <CardThumbnail src={e.image_url} alt={e.name} aspectClass="aspect-poster w-full" fit="cover" groupHoverGroup="link" />
            {notice ? (
              <EventCancelledStamp
                label={noticeStampLabel(lang, notice)}
                size="card"
                tone={notice === 'postponed' ? 'postpone' : 'cancel'}
              />
            ) : null}
          </div>
          <div
            className={`flex flex-1 flex-col justify-start p-1.5 text-left transition-colors duration-200 ease-out min-h-[3.75rem] ${
              past
                ? `bg-[var(--red)] text-white ${EVENT_FOOTER_HOVER_PAST}`
                : `bg-[var(--yellow)] text-[var(--ink)] ${EVENT_FOOTER_HOVER_UPCOMING}`
            }`}
          >
            <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '9px', color: 'inherit' }}>
              {e.date_start || 'TBA'}
            </div>
            <div className="mt-0.5 line-clamp-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '9px', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.15, color: 'inherit' }}>
              {e.name}
            </div>
          </div>
        </Link>
        )
      })}
    </div>
  )
}

function ListView({ events, lang }: { events: BreakEvent[]; lang: string }) {
  return (
    <div className="border-4 border-[var(--ink)]">
      {events.map((e) => {
        const past = isEventPast(e)
        const notice = eventNoticeKind(e)
        return (
        <div key={e.slug} className="relative border-b-[2px] border-[var(--ink)]">
          <FavoriteButton type="event" entityId={e.id} lang={lang} className="!top-1/2 !-translate-y-1/2 !right-3" />
          <Link
            href={`/${lang}/events/${e.slug}`}
            className="group/link flex flex-col no-underline text-[var(--ink)]"
          >
            <div
              className={`flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 pr-12 transition-colors duration-150 ${
                past ? EVENT_POSTER_STRIP_HOVER_PAST : EVENT_POSTER_STRIP_HOVER_UPCOMING
              }`}
            >
              <div
                className={`relative shrink-0 w-[2.75rem] sm:w-14 overflow-hidden border-[2px] border-[var(--ink)] transition-colors duration-150 ${
                  past ? EVENT_POSTER_STRIP_HOVER_PAST : EVENT_POSTER_STRIP_HOVER_UPCOMING
                }`}
              >
                <CardThumbnail src={e.image_url} alt={e.name} aspectClass="aspect-poster w-full" frameClass="" fit="cover" groupHoverGroup="link" />
                {notice ? (
                  <EventCancelledStamp
                    label={noticeStampLabel(lang, notice)}
                    size="thumb"
                    tone={notice === 'postponed' ? 'postpone' : 'cancel'}
                  />
                ) : null}
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
            </div>
            <div
              role="presentation"
              aria-hidden
              title={past ? (lang === 'es' ? 'Evento pasado' : 'Past event') : lang === 'es' ? 'Próximo — aún puedes ir' : 'Upcoming'}
              className={`h-2.5 w-full shrink-0 border-t-[2px] border-[var(--ink)] transition-colors duration-200 ease-out ${
                past
                  ? `bg-[var(--red)] ${EVENT_FOOTER_HOVER_PAST}`
                  : `bg-[var(--yellow)] ${EVENT_FOOTER_HOVER_UPCOMING}`
              }`}
            />
          </Link>
        </div>
        )
      })}
    </div>
  )
}
