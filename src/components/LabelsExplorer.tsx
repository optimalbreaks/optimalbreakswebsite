'use client'

import { useState } from 'react'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import type { Label } from '@/types/database'
import FavoriteButton from '@/components/FavoriteButton'

interface Props {
  labels: Label[]
  dict: { view_large: string; view_compact: string; view_list: string }
  lang: string
}

export default function LabelsExplorer({ labels, dict, lang }: Props) {
  const [view, setView] = useState<ViewMode>('compact')

  return (
    <div>
      <div className="flex justify-end mb-5">
        <ViewToggle view={view} setView={setView} labels={dict} />
      </div>

      {view === 'large' ? (
        <LargeGrid labels={labels} lang={lang} />
      ) : view === 'compact' ? (
        <CompactGrid labels={labels} lang={lang} />
      ) : (
        <ListView labels={labels} lang={lang} />
      )}
    </div>
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
