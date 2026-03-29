'use client'

import { useMemo, useState, useCallback, useRef, useEffect } from 'react'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'

interface ArtistRow {
  slug: string
  name: string
  name_display: string
  country: string
  category: string
  styles: string[]
  era: string
  is_featured: boolean
  sort_order: number
  image_url: string | null
}

interface ArtistDict {
  filters: Record<string, string>
  search_placeholder: string
  view_large: string
  view_compact: string
  view_list: string
  filter_genre: string
  filter_country: string
  filter_category: string
  filter_years: string
  filter_years_label: string
  clear_filters: string
  results_count: string
  no_matches: string
}

interface Props {
  artists: ArtistRow[]
  dict: ArtistDict
  lang: string
}

const CATEGORY_MAP: Record<string, string> = {
  all: 'all',
  pioneers: 'pioneer',
  uk: 'uk_legend',
  us: 'us_artist',
  andalusia: 'andalusian',
  current: 'current',
}

const YEAR_MIN = 1970
const YEAR_MAX = 2026

/**
 * Extract the start year from an era string like "1990s-present",
 * "mid-2000s-present", "late-1960s-1970s", "early-1990s-present".
 */
function parseEraStartYear(era: string): number | null {
  if (!era) return null
  const m = era.match(/(\d{4})/)
  if (!m) return null
  const base = parseInt(m[1], 10)

  if (/\bmid[- ]?/i.test(era.split('-')[0] || '')) return base + 5
  if (/\blate[- ]?/i.test(era.split('-')[0] || '')) return base + 7
  if (/\bearly[- ]?/i.test(era.split('-')[0] || '')) return base + 2

  return base
}

export default function ArtistsExplorer({ artists, dict, lang }: Props) {
  const [view, setView] = useState<ViewMode>('compact')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeGenre, setActiveGenre] = useState('')
  const [activeCountry, setActiveCountry] = useState('')
  const [yearFrom, setYearFrom] = useState(YEAR_MIN)
  const [yearTo, setYearTo] = useState(YEAR_MAX)

  const allGenres = useMemo(() => {
    const set = new Set<string>()
    artists.forEach((a) => a.styles?.forEach((s) => set.add(s)))
    return Array.from(set).sort()
  }, [artists])

  const allCountries = useMemo(() => {
    const set = new Set<string>()
    artists.forEach((a) => {
      if (a.country) set.add(a.country)
    })
    return Array.from(set).sort()
  }, [artists])

  const yearRange = yearFrom !== YEAR_MIN || yearTo !== YEAR_MAX

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const rows = artists.filter((a) => {
      if (q && !(a.name_display || a.name).toLowerCase().includes(q) && !a.name.toLowerCase().includes(q)) return false
      if (activeCategory !== 'all' && a.category !== CATEGORY_MAP[activeCategory]) return false
      if (activeGenre && !a.styles?.includes(activeGenre)) return false
      if (activeCountry && a.country !== activeCountry) return false
      if (yearRange) {
        const y = parseEraStartYear(a.era)
        if (y == null) return true
        if (y < yearFrom || y > yearTo) return false
      }
      return true
    })
    rows.sort((a, b) =>
      (a.name_display || a.name).localeCompare(b.name_display || b.name, undefined, { sensitivity: 'base' }),
    )
    return rows
  }, [artists, search, activeCategory, activeGenre, activeCountry, yearFrom, yearTo, yearRange])

  const hasFilters = search || activeCategory !== 'all' || activeGenre || activeCountry || yearRange

  function clearAll() {
    setSearch('')
    setActiveCategory('all')
    setActiveGenre('')
    setActiveCountry('')
    setYearFrom(YEAR_MIN)
    setYearTo(YEAR_MAX)
  }

  const filters = Object.entries(dict.filters) as [string, string][]

  return (
    <div>
      {/* Search + View Toggle */}
      <div className="flex flex-col sm:flex-row gap-3 sm:items-center sm:justify-between mb-5">
        <div className="relative flex-grow max-w-md">
          <svg className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-[var(--dim)]" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" strokeLinecap="round" />
          </svg>
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={dict.search_placeholder}
            className="w-full border-[3px] border-[var(--ink)] bg-[var(--paper)] px-4 pl-10 py-2 text-sm focus:outline-none focus:border-[var(--red)] transition-colors"
            style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700 }}
          />
        </div>

        <ViewToggle view={view} setView={setView} labels={dict} />
      </div>

      {/* Category filters */}
      <div className="flex flex-wrap gap-2 mb-4">
        {filters.map(([key, label]) => (
          <button
            key={key}
            onClick={() => setActiveCategory(key)}
            className={`cutout cursor-pointer ${activeCategory === key ? 'red' : 'outline'}`}
          >
            {label}
          </button>
        ))}
      </div>

      {/* Advanced filters */}
      <div className="flex flex-wrap gap-2 items-end mb-5">
        <FilterSelect value={activeGenre} onChange={setActiveGenre} placeholder={dict.filter_genre} options={allGenres} />
        <FilterSelect value={activeCountry} onChange={setActiveCountry} placeholder={dict.filter_country} options={allCountries} />
        <YearRangeSlider
          min={YEAR_MIN}
          max={YEAR_MAX}
          from={yearFrom}
          to={yearTo}
          onChangeFrom={setYearFrom}
          onChangeTo={setYearTo}
          label={dict.filter_years}
          rangeLabel={dict.filter_years_label}
        />
        {hasFilters && (
          <button
            onClick={clearAll}
            className="cutout outline cursor-pointer hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] transition-colors"
          >
            ✕ {dict.clear_filters}
          </button>
        )}
      </div>

      {/* Results count */}
      <div className="mb-4" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '12px', letterSpacing: '1px', color: 'var(--dim)', textTransform: 'uppercase' }}>
        {dict.results_count.replace('{count}', String(filtered.length))}
      </div>

      {/* Grid / List */}
      {filtered.length === 0 ? (
        <div className="py-16 text-center" style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', color: 'var(--dim)' }}>
          {dict.no_matches}
        </div>
      ) : view === 'large' ? (
        <LargeGrid artists={filtered} lang={lang} />
      ) : view === 'compact' ? (
        <CompactGrid artists={filtered} lang={lang} />
      ) : (
        <ListView artists={filtered} lang={lang} />
      )}
    </div>
  )
}

/* ─── Filter Select ─── */

function FilterSelect({ value, onChange, placeholder, options }: { value: string; onChange: (v: string) => void; placeholder: string; options: string[] }) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-[6px] text-xs font-bold uppercase tracking-wider cursor-pointer focus:outline-none focus:border-[var(--red)] transition-colors appearance-none pr-8"
      style={{ fontFamily: "'Courier Prime', monospace", backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%231a1a1a' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`, backgroundRepeat: 'no-repeat', backgroundPosition: 'right 8px center' }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>{o}</option>
      ))}
    </select>
  )
}

/* ─── Year Range Slider (dual thumb) ─── */

function YearRangeSlider({
  min, max, from, to, onChangeFrom, onChangeTo, label, rangeLabel,
}: {
  min: number; max: number; from: number; to: number
  onChangeFrom: (v: number) => void; onChangeTo: (v: number) => void
  label: string; rangeLabel: string
}) {
  const trackRef = useRef<HTMLDivElement>(null)
  const dragging = useRef<'from' | 'to' | null>(null)

  const pct = useCallback((v: number) => ((v - min) / (max - min)) * 100, [min, max])

  const valueFromX = useCallback((clientX: number) => {
    const rect = trackRef.current?.getBoundingClientRect()
    if (!rect) return min
    const ratio = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width))
    return Math.round(min + ratio * (max - min))
  }, [min, max])

  const onPointerDown = useCallback((thumb: 'from' | 'to') => (e: React.PointerEvent) => {
    e.preventDefault()
    dragging.current = thumb
    ;(e.target as HTMLElement).setPointerCapture(e.pointerId)
  }, [])

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    if (!dragging.current) return
    const v = valueFromX(e.clientX)
    if (dragging.current === 'from') {
      onChangeFrom(Math.min(v, to - 1))
    } else {
      onChangeTo(Math.max(v, from + 1))
    }
  }, [valueFromX, from, to, onChangeFrom, onChangeTo])

  const onPointerUp = useCallback(() => {
    dragging.current = null
  }, [])

  const handleTrackClick = useCallback((e: React.MouseEvent) => {
    if (dragging.current) return
    const v = valueFromX(e.clientX)
    const distFrom = Math.abs(v - from)
    const distTo = Math.abs(v - to)
    if (distFrom <= distTo) {
      onChangeFrom(Math.min(v, to - 1))
    } else {
      onChangeTo(Math.max(v, from + 1))
    }
  }, [valueFromX, from, to, onChangeFrom, onChangeTo])

  const isActive = from !== min || to !== max
  const displayLabel = rangeLabel.replace('{from}', String(from)).replace('{to}', String(to))

  return (
    <div className="flex flex-col gap-1">
      <div
        className="flex items-center justify-between"
        style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', textTransform: 'uppercase' }}
      >
        <span className="text-[var(--ink)]">{label}</span>
        <span className={isActive ? 'text-[var(--red)] font-black' : 'text-[var(--dim)]'}>{displayLabel}</span>
      </div>
      <div
        ref={trackRef}
        className="relative h-7 w-48 sm:w-56 cursor-pointer select-none touch-none"
        onClick={handleTrackClick}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
      >
        {/* track bg */}
        <div className="absolute top-1/2 -translate-y-1/2 left-0 right-0 h-[6px] bg-[var(--paper-dark)] border-2 border-[var(--ink)]" />
        {/* active range */}
        <div
          className="absolute top-1/2 -translate-y-1/2 h-[6px] bg-[var(--ink)]"
          style={{ left: `${pct(from)}%`, width: `${pct(to) - pct(from)}%` }}
        />
        {/* from thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-[var(--yellow)] border-[3px] border-[var(--ink)] cursor-grab active:cursor-grabbing z-10 hover:scale-110 transition-transform"
          style={{ left: `${pct(from)}%` }}
          onPointerDown={onPointerDown('from')}
        />
        {/* to thumb */}
        <div
          className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2 w-5 h-5 bg-[var(--yellow)] border-[3px] border-[var(--ink)] cursor-grab active:cursor-grabbing z-10 hover:scale-110 transition-transform"
          style={{ left: `${pct(to)}%` }}
          onPointerDown={onPointerDown('to')}
        />
      </div>
    </div>
  )
}

/* ─── Large Grid (vista actual) ─── */

function LargeGrid({ artists, lang }: { artists: ArtistRow[]; lang: string }) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-0 border-4 border-[var(--ink)]">
      {artists.map((a) => (
        <Link
          key={a.slug}
          href={`/${lang}/artists/${a.slug}`}
          className="border-b-[3px] sm:border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden h-full min-h-0"
        >
          <CardThumbnail src={a.image_url} alt={a.name_display || a.name} aspectClass="aspect-[5/3]" />
          <div className="p-5 sm:p-[22px_30px] flex flex-col flex-grow min-h-0">
            <div className="mt-0" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(16px, 3vw, 20px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
              {a.name_display || a.name}
            </div>
            <div className="flex flex-wrap gap-1 mt-[6px]">
              {a.styles?.map((s, si) => (
                <span key={si} className="bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', textTransform: 'uppercase', padding: '2px 7px' }}>
                  {s}
                </span>
              ))}
            </div>
            <div className="flex gap-2 mt-2">
              <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{a.country}</span>
              <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{a.era}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

/* ─── Compact Grid ─── */

function CompactGrid({ artists, lang }: { artists: ArtistRow[]; lang: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
      {artists.map((a) => (
        <Link
          key={a.slug}
          href={`/${lang}/artists/${a.slug}`}
          className="border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden"
        >
          <CardThumbnail src={a.image_url} alt={a.name_display || a.name} aspectClass="aspect-square" />
          <div className="p-3 flex flex-col flex-grow min-h-0">
            <div className="mt-0" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              {a.name_display || a.name}
            </div>
            <div className="flex flex-wrap gap-[2px] mt-1">
              {a.styles?.slice(0, 2).map((s, si) => (
                <span key={si} className="bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '7px', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '1px 4px' }}>
                  {s}
                </span>
              ))}
            </div>
            <div className="flex gap-1 mt-1">
              <span className="cutout fill" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{a.country}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

/* ─── List View ─── */

function ListView({ artists, lang }: { artists: ArtistRow[]; lang: string }) {
  return (
    <div className="border-4 border-[var(--ink)]">
      {artists.map((a) => (
        <Link
          key={a.slug}
          href={`/${lang}/artists/${a.slug}`}
          className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 border-b-[2px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)]"
        >
          <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 overflow-hidden border-[2px] border-[var(--ink)]">
            <CardThumbnail src={a.image_url} alt={a.name_display || a.name} aspectClass="aspect-square" frameClass="" />
          </div>
          <div className="flex-grow min-w-0">
            <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
              {a.name_display || a.name}
            </div>
            <div className="flex flex-wrap gap-[3px] mt-[2px]">
              {a.styles?.slice(0, 3).map((s, si) => (
                <span key={si} className="bg-[var(--ink)] text-[var(--paper)] group-hover:bg-[var(--red)] group-hover:text-white" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '8px', letterSpacing: '0.5px', textTransform: 'uppercase', padding: '1px 5px' }}>
                  {s}
                </span>
              ))}
            </div>
          </div>
          <div className="hidden sm:flex gap-2 shrink-0">
            <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{a.country}</span>
            <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{a.era}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
