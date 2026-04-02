'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import type { Label } from '@/types/database'
import FavoriteButton from '@/components/FavoriteButton'
import { YearRangeSlider } from '@/components/ArtistsExplorer'

/** Rango que cubre sellos históricos (p. ej. majors) hasta el presente. */
const LABEL_YEAR_MIN = 1940
const LABEL_YEAR_MAX = 2026

interface LabelDict {
  search_placeholder: string
  view_large: string
  view_compact: string
  view_list: string
  filter_country: string
  filter_years: string
  filter_years_label: string
  clear_filters: string
  results_count: string
  no_matches: string
}

interface Props {
  labels: Label[]
  dict: LabelDict
  lang: string
}

export default function LabelsExplorer({ labels, dict, lang }: Props) {
  const [view, setView] = useState<ViewMode>('compact')
  const [search, setSearch] = useState('')
  const [activeCountry, setActiveCountry] = useState('')
  const [yearFrom, setYearFrom] = useState(LABEL_YEAR_MIN)
  const [yearTo, setYearTo] = useState(LABEL_YEAR_MAX)

  const allCountries = useMemo(() => {
    const set = new Set<string>()
    labels.forEach((l) => {
      if (l.country) set.add(l.country)
    })
    return Array.from(set).sort()
  }, [labels])

  const yearRange = yearFrom !== LABEL_YEAR_MIN || yearTo !== LABEL_YEAR_MAX

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const rows = labels.filter((l) => {
      if (q && !l.name.toLowerCase().includes(q)) return false
      if (activeCountry && l.country !== activeCountry) return false
      if (yearRange) {
        const y = l.founded_year
        if (y == null) return true
        if (y < yearFrom || y > yearTo) return false
      }
      return true
    })
    rows.sort((a, b) => a.name.localeCompare(b.name, undefined, { sensitivity: 'base' }))
    return rows
  }, [labels, search, activeCountry, yearFrom, yearTo, yearRange])

  const hasFilters = search || activeCountry || yearRange

  function clearAll() {
    setSearch('')
    setActiveCountry('')
    setYearFrom(LABEL_YEAR_MIN)
    setYearTo(LABEL_YEAR_MAX)
  }

  return (
    <div>
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

      <div className="flex flex-wrap gap-2 items-end mb-5">
        <FilterSelect
          value={activeCountry}
          onChange={setActiveCountry}
          placeholder={dict.filter_country}
          options={allCountries}
        />
        <YearRangeSlider
          min={LABEL_YEAR_MIN}
          max={LABEL_YEAR_MAX}
          from={yearFrom}
          to={yearTo}
          onChangeFrom={setYearFrom}
          onChangeTo={setYearTo}
          label={dict.filter_years}
          rangeLabel={dict.filter_years_label}
        />
        {hasFilters && (
          <button
            type="button"
            onClick={clearAll}
            className="cutout outline cursor-pointer hover:bg-[var(--red)] hover:text-white hover:border-[var(--red)] transition-colors"
          >
            ✕ {dict.clear_filters}
          </button>
        )}
      </div>

      <div className="mb-4" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '12px', letterSpacing: '1px', color: 'var(--dim)', textTransform: 'uppercase' }}>
        {dict.results_count.replace('{count}', String(filtered.length))}
      </div>

      {filtered.length === 0 ? (
        <div className="py-16 text-center" style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', color: 'var(--dim)' }}>
          {dict.no_matches}
        </div>
      ) : view === 'large' ? (
        <LargeGrid labels={filtered} lang={lang} />
      ) : view === 'compact' ? (
        <CompactGrid labels={filtered} lang={lang} />
      ) : (
        <ListView labels={filtered} lang={lang} />
      )}
    </div>
  )
}

function FilterSelect({
  value,
  onChange,
  placeholder,
  options,
}: {
  value: string
  onChange: (v: string) => void
  placeholder: string
  options: string[]
}) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="border-[3px] border-[var(--ink)] bg-[var(--paper)] px-3 py-[6px] text-xs font-bold uppercase tracking-wider cursor-pointer focus:outline-none focus:border-[var(--red)] transition-colors appearance-none pr-8"
      style={{
        fontFamily: "'Courier Prime', monospace",
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%231a1a1a' stroke-width='3' stroke-linecap='round'%3E%3Cpath d='M6 9l6 6 6-6'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 8px center',
      }}
    >
      <option value="">{placeholder}</option>
      {options.map((o) => (
        <option key={o} value={o}>
          {o}
        </option>
      ))}
    </select>
  )
}

function LargeGrid({ labels, lang }: { labels: Label[]; lang: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
      {labels.map((l) => (
        <div key={l.slug} className="relative border-r-[3px] border-b-[3px] border-[var(--ink)] max-md:!border-r-0">
          <FavoriteButton type="label" entityId={l.id} lang={lang} />
          <Link
            href={`/${lang}/labels/${l.slug}`}
            className="transition-all duration-150 hover:bg-[var(--yellow)] no-underline text-[var(--ink)] flex flex-col overflow-hidden group min-h-0"
          >
            <CardThumbnail src={l.image_url} alt={l.name} aspectClass="aspect-[3/2]" />
            <div className="p-6 sm:p-8 flex flex-col flex-grow min-h-0">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '16px', color: 'var(--red)' }}>Est. {l.founded_year || '?'}</div>
              <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>{l.name}</div>
              <div className="flex gap-2 mt-2">
                <span className="cutout fill" style={{ margin: 0 }}>{l.country}</span>
                <span className={`cutout ${l.is_active ? 'acid' : 'outline'}`} style={{ margin: 0 }}>{l.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
              </div>
            </div>
          </Link>
        </div>
      ))}
    </div>
  )
}

function CompactGrid({ labels, lang }: { labels: Label[]; lang: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
      {labels.map((l) => (
        <div key={l.slug} className="relative border-b-[3px] border-r-[3px] border-[var(--ink)]">
          <FavoriteButton type="label" entityId={l.id} lang={lang} />
          <Link
            href={`/${lang}/labels/${l.slug}`}
            className="transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden"
          >
            <CardThumbnail src={l.image_url} alt={l.name} aspectClass="aspect-square" />
            <div className="p-3 flex flex-col flex-grow min-h-0">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>Est. {l.founded_year || '?'}</div>
              <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                {l.name}
              </div>
              <div className="flex gap-1 mt-1">
                <span className="cutout fill" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{l.country}</span>
                <span className={`cutout ${l.is_active ? 'acid' : 'outline'}`} style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{l.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
              </div>
            </div>
          </Link>
        </div>
      ))}
    </div>
  )
}

function ListView({ labels, lang }: { labels: Label[]; lang: string }) {
  return (
    <div className="border-4 border-[var(--ink)]">
      {labels.map((l) => (
        <div key={l.slug} className="relative border-b-[2px] border-[var(--ink)]">
          <FavoriteButton type="label" entityId={l.id} lang={lang} className="!top-1/2 !-translate-y-1/2 !right-3" />
          <Link
            href={`/${lang}/labels/${l.slug}`}
            className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] pr-12"
          >
            <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 overflow-hidden border-[2px] border-[var(--ink)]">
              <CardThumbnail src={l.image_url} alt={l.name} aspectClass="aspect-square" frameClass="" />
            </div>
            <div className="flex-grow min-w-0">
              <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
                {l.name}
              </div>
              <div className="mt-[2px]" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>
                Est. {l.founded_year || '?'}
              </div>
            </div>
            <div className="hidden sm:flex gap-2 shrink-0">
              <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{l.country}</span>
              <span className={`cutout ${l.is_active ? 'acid' : 'outline'}`} style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{l.is_active ? 'ACTIVE' : 'INACTIVE'}</span>
            </div>
          </Link>
        </div>
      ))}
    </div>
  )
}
