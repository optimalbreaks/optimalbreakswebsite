'use client'

import { useState } from 'react'
import CardThumbnail from '@/components/CardThumbnail'
import ViewToggle, { type ViewMode } from '@/components/ViewToggle'
import type { Mix } from '@/types/database'

function extractYouTubeId(url: string | null | undefined): string | null {
  if (!url) return null
  const patterns = [
    /youtu\.be\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/watch\?v=([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/v\/([a-zA-Z0-9_-]{11})/,
    /youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  ]
  for (const re of patterns) {
    const m = url.match(re)
    if (m) return m[1]
  }
  return null
}

/** Reproductor embebido 16:9 (estilo tutoriales: iframe visible, lazy-load del navegador). */
function YouTubeIframe({ videoId, title, className = '' }: { videoId: string; title: string; className?: string }) {
  return (
    <div className={`relative w-full aspect-video bg-black overflow-hidden ${className}`}>
      <iframe
        src={`https://www.youtube.com/embed/${videoId}?rel=0`}
        title={title}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
        loading="lazy"
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  )
}

/** Fecha de publicación (YouTube) o año catalogado + duración opcional. */
function formatMixDateLine(m: Mix, lang: string): string {
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const published = m.published_at
  const datePart = published
    ? new Date(published).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : m.year != null
      ? String(m.year)
      : '—'
  const dur = m.duration_minutes != null ? ` · ${m.duration_minutes} min` : ''
  return `${datePart}${dur}`
}

interface Props {
  mixes: Mix[]
  dict: { view_large: string; view_compact: string; view_list: string }
  lang: string
}

export default function MixesExplorer({ mixes, dict, lang }: Props) {
  const [view, setView] = useState<ViewMode>('compact')

  return (
    <div>
      <div className="flex justify-end mb-5">
        <ViewToggle view={view} setView={setView} labels={dict} />
      </div>

      {view === 'large' ? (
        <LargeGrid mixes={mixes} lang={lang} />
      ) : view === 'compact' ? (
        <CompactGrid mixes={mixes} lang={lang} />
      ) : (
        <ListView mixes={mixes} lang={lang} />
      )}
    </div>
  )
}

function PlayLink({ mix }: { mix: Mix }) {
  if (mix.embed_url) {
    return (
      <a href={mix.embed_url} target="_blank" rel="noopener noreferrer" className="absolute bottom-3 right-3 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', padding: '4px 12px', transform: 'rotate(2deg)' }}>
        ▶ PLAY
      </a>
    )
  }
  return (
    <div className="absolute bottom-3 right-3 bg-[var(--ink)] text-[var(--yellow)]" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', padding: '4px 12px', transform: 'rotate(2deg)' }}>
      ▶ {mix.platform?.toUpperCase()}
    </div>
  )
}

function LargeGrid({ mixes, lang }: { mixes: Mix[]; lang: string }) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
      {mixes.map((m) => {
        const ytId = extractYouTubeId(m.video_url)
        return (
          <div
            key={m.slug}
            className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] overflow-hidden group"
          >
            {ytId ? (
              <YouTubeIframe videoId={ytId} title={m.title} />
            ) : (
              <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-[16/10]" />
            )}
            <div className="p-5 sm:p-7 relative">
              <div className="absolute -top-[6px] left-[20px] w-[60px] h-[18px] z-[1]" style={{ background: 'var(--tape)', transform: 'rotate(-2deg)' }} />
              <div className="flex flex-wrap items-center gap-2">
                <span className="cutout red" style={{ margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>
                  {formatMixDateLine(m, lang)}
                </span>
              </div>
              <div className="mt-3" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase', letterSpacing: '-0.5px', lineHeight: 1.1 }}>
                {m.title}
              </div>
              <div className="mt-2" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>
                {m.artist_name}
              </div>
              {ytId ? (
                <a
                  href={m.video_url!}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors"
                  style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}
                >
                  YouTube ↗
                </a>
              ) : (
                <PlayLink mix={m} />
              )}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function CompactGrid({ mixes, lang }: { mixes: Mix[]; lang: string }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
      {mixes.map((m) => {
        const ytId = extractYouTubeId(m.video_url)
        return (
          <div
            key={m.slug}
            className="border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group flex flex-col overflow-hidden"
          >
            {ytId ? (
              <YouTubeIframe videoId={ytId} title={m.title} className="border-b-[3px] border-[var(--ink)]" />
            ) : (
              <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" />
            )}
            <div className="p-3 flex flex-col flex-grow min-h-0">
              <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '11px', color: 'var(--red)' }}>
                {m.artist_name}
              </div>
              <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>
                {m.title}
              </div>
              <div className="flex flex-wrap gap-1 mt-1 items-center">
                <span className="cutout red" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', color: 'var(--dim)' }}>
                  {formatMixDateLine(m, lang)}
                </span>
              </div>
              {ytId ? (
                <a href={m.video_url!} target="_blank" rel="noopener noreferrer" className="mt-2 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors text-center" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '2px 6px' }}>
                  YouTube ↗
                </a>
              ) : m.embed_url ? (
                <a href={m.embed_url} target="_blank" rel="noopener noreferrer" className="mt-2 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors text-center" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '2px 6px' }}>
                  ▶ PLAY
                </a>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}

function ListView({ mixes, lang }: { mixes: Mix[]; lang: string }) {
  return (
    <div className="border-4 border-[var(--ink)]">
      {mixes.map((m) => {
        const ytId = extractYouTubeId(m.video_url)
        if (ytId) {
          return (
            <div
              key={m.slug}
              className="border-b-[2px] border-[var(--ink)] px-4 sm:px-6 py-4 sm:py-5 transition-all duration-150 hover:bg-[var(--yellow)]/40"
            >
              <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:gap-6">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cutout red" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                    <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>
                      {m.published_at
                        ? new Date(m.published_at).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
                            year: 'numeric',
                            month: 'short',
                            day: 'numeric',
                          })
                        : m.year ?? '—'}
                    </span>
                  </div>
                  <div className="mt-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(13px, 2.5vw, 18px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.15 }}>
                    {m.title}
                  </div>
                  <div className="mt-1" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>
                    {m.artist_name}
                  </div>
                  <a
                    href={m.video_url!}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors"
                    style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 10px' }}
                  >
                    YouTube ↗
                  </a>
                </div>
                <div className="w-full shrink-0 lg:max-w-md lg:w-[min(100%,420px)]">
                  <YouTubeIframe videoId={ytId} title={m.title} className="border-[3px] border-[var(--ink)]" />
                </div>
              </div>
            </div>
          )
        }
        return (
          <div
            key={m.slug}
            className="flex items-center gap-3 sm:gap-5 px-4 sm:px-6 py-3 border-b-[2px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group"
          >
            <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 overflow-hidden border-[2px] border-[var(--ink)] relative">
              <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" frameClass="" />
            </div>
            <div className="flex-grow min-w-0">
              <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>
                {m.title}
              </div>
              <div className="mt-[2px]" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>
                {m.artist_name}
              </div>
            </div>
            <div className="hidden sm:flex gap-2 shrink-0 items-center">
              <span className="cutout red" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
              <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>
                {m.published_at
                  ? new Date(m.published_at).toLocaleDateString(lang === 'es' ? 'es-ES' : 'en-GB', {
                      year: 'numeric',
                      month: 'short',
                      day: 'numeric',
                    })
                  : m.year ?? '—'}
              </span>
              {m.embed_url ? (
                <a href={m.embed_url} target="_blank" rel="noopener noreferrer" className="bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '2px 8px' }}>
                  ▶
                </a>
              ) : null}
            </div>
          </div>
        )
      })}
    </div>
  )
}
