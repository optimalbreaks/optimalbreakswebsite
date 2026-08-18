// ============================================
// OPTIMAL BREAKS — Shared helpers for /dashboard & /mi-cuenta pages
// Extracted from the old monolithic DashboardClient.tsx
// ============================================

'use client'

import { useMixAudioGated } from '@/hooks/useGatedDeckAudio'
import { getMixTrack } from '@/components/MixesExplorer'
import { LazyYouTubeEmbed } from '@/components/YouTubeEmbed'
import type { ViewMode } from '@/components/ViewToggle'
import ViewToggle from '@/components/ViewToggle'

export function extractYouTubeId(url: string | null | undefined): string | null {
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

export function formatMixDateLine(m: any, lang: string): string {
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const published = m.published_at
  const datePart = published
    ? new Date(published).toLocaleDateString(locale, { year: 'numeric', month: 'short', day: 'numeric' })
    : m.year != null
      ? String(m.year)
      : '—'
  const dur = m.duration_minutes != null ? ` · ${m.duration_minutes} min` : ''
  return `${datePart}${dur}`
}

/**
 * Tarjeta YouTube del dashboard. Antes montaba el iframe en crudo, fuera del
 * coordinador «una sola fuente audible»: dar play ahí no paraba el reproductor
 * global (ni al revés) y podían sonar dos cosas a la vez. Ahora delega en
 * `LazyYouTubeEmbed` (portada + click-to-play + slot exclusivo), igual que
 * las tarjetas de /mixes.
 */
export function YouTubeIframe({ videoId, title, className = '' }: { videoId: string; title: string; className?: string }) {
  return (
    <LazyYouTubeEmbed
      videoId={videoId}
      title={title}
      className={className}
      playSlotId={`dash-yt-${videoId}`}
    />
  )
}

/**
 * Play button used in Saved Mixes cards (Favorites & Mixes sections).
 * Uses the global DeckAudioProvider to avoid multiple audio sources at once.
 */
export function DashboardMixPlayButton({ m }: { m: any }) {
  const { playMix, currentMix, mixPlaying } = useMixAudioGated()
  const track = getMixTrack(m)
  if (!track) return null

  const isThisMix = currentMix?.id === m.id
  const label = isThisMix && mixPlaying ? '■ STOP' : '▶ PLAY'

  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault()
        e.stopPropagation()
        playMix(track)
      }}
      className={`mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] hover:bg-[var(--red)] hover:text-white transition-colors cursor-pointer border-0 ${isThisMix && mixPlaying ? 'animate-pulse' : ''}`}
      style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}
    >
      {label}
    </button>
  )
}

export function viewLabels(es: boolean) {
  return { view_large: es ? 'Grande' : 'Large', view_compact: es ? 'Compacto' : 'Compact', view_list: es ? 'Lista' : 'List' }
}

export function SectionHeader({
  title,
  count,
  view,
  setView,
  es,
}: {
  title: string
  count: number
  view: ViewMode
  setView: (v: ViewMode) => void
  es: boolean
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
      <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
        {title} ({count})
      </h2>
      {count > 0 && <ViewToggle view={view} setView={setView} labels={viewLabels(es)} />}
    </div>
  )
}

/** Stars block used in Reviews section (red border, dark background for paper contrast). */
export function DashboardReviewStars({ rating }: { rating: number }) {
  if (rating < 1) return null
  return (
    <span
      className="inline-flex shrink-0 items-center border-[3px] border-[var(--red)] bg-[var(--ink)] px-2 py-1"
      style={{ fontSize: '16px', lineHeight: 1, letterSpacing: '2px' }}
      aria-label={`${rating}/5`}
    >
      <span className="text-[var(--yellow)]">{'★'.repeat(rating)}</span>
      <span style={{ color: 'rgba(232,220,200,0.4)' }}>{'☆'.repeat(5 - rating)}</span>
    </span>
  )
}
