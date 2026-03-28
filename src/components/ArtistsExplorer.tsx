'use client'

import { useMemo, useState } from 'react'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'

type ViewMode = 'large' | 'compact' | 'list'

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

export default function ArtistsExplorer({ artists, dict, lang }: Props) {
  const [view, setView] = useState<ViewMode>('large')
  const [search, setSearch] = useState('')
  const [activeCategory, setActiveCategory] = useState('all')
  const [activeGenre, setActiveGenre] = useState('')
  const [activeCountry, setActiveCountry] = useState('')

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

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim()
    const rows = artists.filter((a) => {
      if (q && !(a.name_display || a.name).toLowerCase().includes(q) && !a.name.toLowerCase().includes(q)) return false
      if (activeCategory !== 'all' && a.category !== CATEGORY_MAP[activeCategory]) return false
      if (activeGenre && !a.styles?.includes(activeGenre)) return false
      if (activeCountry && a.country !== activeCountry) return false
      return true
    })
    rows.sort((a, b) =>
      (a.name_display || a.name).localeCompare(b.name_display || b.name, undefined, { sensitivity: 'base' }),
    )
    return rows
  }, [artists, search, activeCategory, activeGenre, activeCountry])

  const hasFilters = search || activeCategory !== 'all' || activeGenre || activeCountry

  function clearAll() {
    setSearch('')
    setActiveCategory('all')
    setActiveGenre('')
    setActiveCountry('')
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

        <div className="flex items-center gap-1 border-[3px] border-[var(--ink)] bg-[var(--paper)] p-[2px]">
          <ViewBtn active={view === 'large'} onClick={() => setView('large')} label={dict.view_large}>
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="6" height="6" rx="0.5" /><rect x="9" y="1" width="6" height="6" rx="0.5" /><rect x="1" y="9" width="6" height="6" rx="0.5" /><rect x="9" y="9" width="6" height="6" rx="0.5" /></svg>
          </ViewBtn>
          <ViewBtn active={view === 'compact'} onClick={() => setView('compact')} label={dict.view_compact}>
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="1" width="3.5" height="3.5" rx="0.3" /><rect x="6.25" y="1" width="3.5" height="3.5" rx="0.3" /><rect x="11.5" y="1" width="3.5" height="3.5" rx="0.3" /><rect x="1" y="6.25" width="3.5" height="3.5" rx="0.3" /><rect x="6.25" y="6.25" width="3.5" height="3.5" rx="0.3" /><rect x="11.5" y="6.25" width="3.5" height="3.5" rx="0.3" /><rect x="1" y="11.5" width="3.5" height="3.5" rx="0.3" /><rect x="6.25" y="11.5" width="3.5" height="3.5" rx="0.3" /><rect x="11.5" y="11.5" width="3.5" height="3.5" rx="0.3" /></svg>
          </ViewBtn>
          <ViewBtn active={view === 'list'} onClick={() => setView('list')} label={dict.view_list}>
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="currentColor"><rect x="1" y="2" width="14" height="2.5" rx="0.3" /><rect x="1" y="6.75" width="14" height="2.5" rx="0.3" /><rect x="1" y="11.5" width="14" height="2.5" rx="0.3" /></svg>
          </ViewBtn>
        </div>
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
      <div className="flex flex-wrap gap-2 mb-5">
        <FilterSelect value={activeGenre} onChange={setActiveGenre} placeholder={dict.filter_genre} options={allGenres} />
        <FilterSelect value={activeCountry} onChange={setActiveCountry} placeholder={dict.filter_country} options={allCountries} />
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

/* ─── View Toggle Button ─── */

function ViewBtn({ active, onClick, label, children }: { active: boolean; onClick: () => void; label: string; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      title={label}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-xs font-bold uppercase tracking-wider transition-colors cursor-pointer ${active ? 'bg-[var(--ink)] text-[var(--paper)]' : 'text-[var(--ink)] hover:bg-[var(--ink)]/10'}`}
      style={{ fontFamily: "'Courier Prime', monospace" }}
    >
      {children}
      <span className="hidden sm:inline">{label}</span>
    </button>
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
