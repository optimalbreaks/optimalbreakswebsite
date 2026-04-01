'use client'

import { useState } from 'react'
import Link from 'next/link'
import CardThumbnail from '@/components/CardThumbnail'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import type { Scene } from '@/types/database'

interface Props {
  scenes: Scene[]
  dict: { view_large: string; view_compact: string; view_list: string }
  lang: string
}

export default function ScenesExplorer({ scenes, dict, lang }: Props) {
  const [view, setView] = useState<ViewMode>('compact')

  return (
    <div>
      <div className="flex justify-end mb-5">
        <ViewToggle view={view} setView={setView} labels={dict} />
      </div>

      {view === 'large' ? (
        <LargeGrid scenes={scenes} lang={lang} />
      ) : view === 'compact' ? (
        <CompactGrid scenes={scenes} lang={lang} />
      ) : (
        <ListView scenes={scenes} lang={lang} />
      )}
    </div>
  )
}

function LargeGrid({ scenes, lang }: { scenes: Scene[]; lang: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-0 border-4 border-[var(--ink)]">
      {scenes.map((s) => (
        <Link
          key={s.slug}
          href={`/${lang}/scenes/${s.slug}`}
          className="border-r-[3px] border-b-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] no-underline text-[var(--ink)] max-md:!border-r-0 flex flex-col overflow-hidden group min-h-0"
        >
          <CardThumbnail src={s.og_image_url || s.image_url} alt={lang === 'es' ? s.name_es : s.name_en} aspectClass="aspect-[5/3]" />
          <div className="p-6 sm:p-8">
            <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>{s.era}</div>
            <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(18px, 3vw, 24px)', textTransform: 'uppercase', letterSpacing: '-0.5px' }}>
              {lang === 'es' ? s.name_es : s.name_en}
            </div>
            <div className="mt-1" style={{ fontSize: '14px', color: 'var(--dim)' }}>{s.region || s.country}</div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function CompactGrid({ scenes, lang }: { scenes: Scene[]; lang: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
      {scenes.map((s) => (
        <Link
          key={s.slug}
          href={`/${lang}/scenes/${s.slug}`}
          className="border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)] flex flex-col overflow-hidden"
        >
          <CardThumbnail src={s.og_image_url || s.image_url} alt={lang === 'es' ? s.name_es : s.name_en} aspectClass="aspect-square" />
          <div className="p-3 flex flex-col flex-grow min-h-0">
            <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '11px', color: 'var(--red)' }}>{s.era}</div>
            <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
              {lang === 'es' ? s.name_es : s.name_en}
            </div>
            <div className="flex gap-1 mt-1">
              <span className="cutout fill" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{s.country}</span>
            </div>
          </div>
        </Link>
      ))}
    </div>
  )
}

function ListView({ scenes, lang }: { scenes: Scene[]; lang: string }) {
  return (
    <div className="border-4 border-[var(--ink)]">
      {scenes.map((s) => (
        <Link
          key={s.slug}
          href={`/${lang}/scenes/${s.slug}`}
          className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 border-b-[2px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group no-underline text-[var(--ink)]"
        >
          <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 overflow-hidden border-[2px] border-[var(--ink)]">
            <CardThumbnail src={s.og_image_url || s.image_url} alt={lang === 'es' ? s.name_es : s.name_en} aspectClass="aspect-square" frameClass="" />
          </div>
          <div className="flex-grow min-w-0">
            <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
              {lang === 'es' ? s.name_es : s.name_en}
            </div>
            <div className="mt-[2px]" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>
              {s.era}
            </div>
          </div>
          <div className="hidden sm:flex gap-2 shrink-0">
            <span className="cutout fill" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{s.country}</span>
            <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{s.region}</span>
          </div>
        </Link>
      ))}
    </div>
  )
}
