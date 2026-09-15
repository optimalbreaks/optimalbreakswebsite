// ============================================
// OPTIMAL BREAKS — Saved Mixes section
// ============================================

'use client'

import { useEffect, useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase'
import { useSavedMixes } from '@/hooks/useUserData'
import CardThumbnail from '@/components/CardThumbnail'
import FavoriteButton from '@/components/FavoriteButton'
import type { ViewMode } from '@/components/ViewToggle'
import SoundCloudVisualEmbed, { isSoundCloudTrackEmbedUrl } from '@/components/SoundCloudVisualEmbed'
import { getMixTrack } from '@/components/MixesExplorer'
import {
  DashboardMixPlayButton,
  SectionHeader,
  YouTubeIframe,
  extractYouTubeId,
  formatMixDateLine,
} from './shared'

export default function MixesSection({ lang }: { lang: string }) {
  const { saved } = useSavedMixes()
  const [mixes, setMixes] = useState<any[]>([])
  const [mixesLoading, setMixesLoading] = useState(true)
  const [view, setView] = useState<ViewMode>('large')
  const es = lang === 'es'

  useEffect(() => {
    if (saved.length === 0) { setMixes([]); setMixesLoading(false); return }
    let cancelled = false
    setMixesLoading(true)
    const supabase = createBrowserSupabase()
    ;(async () => {
      const { data, error } = await supabase.from('mixes').select('id, slug, title, artist_name, mix_type, image_url, video_url, published_at, year, duration_minutes, embed_url, platform, audio_url').in('id', saved)
      if (!cancelled) {
        setMixes(data || [])
        setMixesLoading(false)
        if (error) console.warn('[MixesSection] Error fetching mixes:', error.message)
      }
    })()
    return () => { cancelled = true }
  }, [saved])

  return (
    <div>
      <SectionHeader title={es ? 'MIXES GUARDADOS' : 'SAVED MIXES'} count={saved.length} view={view} setView={setView} es={es} />
      {saved.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'Guarda mixes desde la sección de Mixes.' : 'Save mixes from the Mixes section.'}
        </p>
      ) : mixesLoading ? (
        <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', color: 'var(--dim)' }}>
          {es ? 'Cargando mixes…' : 'Loading mixes…'}
        </p>
      ) : mixes.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'No se pudieron cargar los mixes. Puede que hayan sido eliminados.' : 'Could not load mixes. They may have been removed.'}
        </p>
      ) : view === 'large' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-[18px]">
          {mixes.map((m) => {
            const ytId = extractYouTubeId(m.video_url)
            const scTrackUrl = !ytId && isSoundCloudTrackEmbedUrl(m.embed_url) ? m.embed_url!.trim() : null
            return (
              <div key={m.id} className="border-[3px] border-[var(--ink)] relative transition-all duration-150 bg-[var(--paper)] overflow-hidden group">
                <FavoriteButton type="mix" entityId={m.id} lang={lang} />
                {ytId ? (
                  <YouTubeIframe videoId={ytId} title={m.title} />
                ) : scTrackUrl ? (
                  <SoundCloudVisualEmbed trackUrl={scTrackUrl} title={m.title} />
                ) : (
                  <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-video" />
                )}
                <div className="p-5 sm:p-7 relative">
                  <div className="absolute -top-[6px] left-[20px] w-[60px] h-[18px] z-[1]" style={{ background: 'var(--tape)', transform: 'rotate(-2deg)' }} />
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="cutout red" style={{ margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                    <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '11px', color: 'var(--dim)' }}>{formatMixDateLine(m, lang)}</span>
                  </div>
                  <div className="mt-3" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(14px, 2.5vw, 18px)', textTransform: 'uppercase', letterSpacing: '-0.5px', lineHeight: 1.1 }}>{m.title}</div>
                  <div className="mt-2" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '14px', color: 'var(--red)' }}>{m.artist_name}</div>
                  {ytId ? (
                    <a href={m.video_url!} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}>YouTube ↗</a>
                  ) : scTrackUrl ? (
                    <a href={scTrackUrl} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}>SoundCloud ↗</a>
                  ) : getMixTrack(m) ? (
                    <DashboardMixPlayButton m={m} />
                  ) : m.embed_url ? (
                    <a href={m.embed_url} target="_blank" rel="noopener noreferrer" className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}>▶ PLAY</a>
                  ) : m.platform ? (
                    <div className="mt-3 inline-block bg-[var(--ink)] text-[var(--yellow)]" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '4px 12px' }}>▶ {m.platform.toUpperCase()}</div>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : view === 'compact' ? (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-0 border-4 border-[var(--ink)]">
          {mixes.map((m) => {
            const ytId = extractYouTubeId(m.video_url)
            const scTrackUrl = !ytId && isSoundCloudTrackEmbedUrl(m.embed_url) ? m.embed_url!.trim() : null
            return (
              <div key={m.id} className="border-b-[3px] border-r-[3px] border-[var(--ink)] transition-all duration-150 hover:bg-[var(--yellow)] group flex flex-col overflow-hidden relative">
                <FavoriteButton type="mix" entityId={m.id} lang={lang} />
                {ytId ? (
                  <YouTubeIframe videoId={ytId} title={m.title} className="border-b-[3px] border-[var(--ink)]" />
                ) : scTrackUrl ? (
                  <SoundCloudVisualEmbed trackUrl={scTrackUrl} title={m.title} className="border-b-[3px] border-[var(--ink)]" />
                ) : (
                  <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-video" />
                )}
                <div className="p-3 flex flex-col flex-grow min-h-0">
                  <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '11px', color: 'var(--red)' }}>{m.artist_name}</div>
                  <div className="mt-1" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(11px, 2vw, 14px)', textTransform: 'uppercase', letterSpacing: '-0.3px', lineHeight: 1.2 }}>{m.title}</div>
                  <div className="flex flex-wrap gap-1 mt-1 items-center">
                    <span className="cutout red" style={{ fontSize: '7px', padding: '0px 4px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                    <span style={{ fontFamily: "'Courier Prime', monospace", fontSize: '9px', color: 'var(--dim)' }}>{formatMixDateLine(m, lang)}</span>
                  </div>
                  {ytId ? (
                    <a href={m.video_url!} target="_blank" rel="noopener noreferrer" className="mt-2 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors text-center" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '2px 6px' }}>YouTube ↗</a>
                  ) : scTrackUrl ? (
                    <a href={scTrackUrl} target="_blank" rel="noopener noreferrer" className="mt-2 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors text-center" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '2px 6px' }}>SoundCloud ↗</a>
                  ) : null}
                </div>
              </div>
            )
          })}
        </div>
      ) : (
        <div className="border-4 border-[var(--ink)]">
          {mixes.map((m) => {
            const ytId = extractYouTubeId(m.video_url)
            const scTrackUrl = !ytId && isSoundCloudTrackEmbedUrl(m.embed_url) ? m.embed_url!.trim() : null
            return (
              <div key={m.id} className="border-b-[2px] border-[var(--ink)] px-4 sm:px-6 py-3 transition-all duration-150 hover:bg-[var(--yellow)]/40 relative">
                <FavoriteButton type="mix" entityId={m.id} lang={lang} className="!top-1/2 !-translate-y-1/2 !right-3" />
                <div className="flex items-center gap-3 sm:gap-5 pr-10">
                  <div className="shrink-0 w-10 h-10 sm:w-12 sm:h-12 overflow-hidden border-[2px] border-[var(--ink)]">
                    {ytId ? (
                      <div className="w-full h-full bg-[var(--ink)] flex items-center justify-center text-[var(--yellow)] text-xs">▶</div>
                    ) : scTrackUrl ? (
                      m.image_url ? (
                        <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" frameClass="" />
                      ) : (
                        <div className="w-full h-full bg-[var(--ink)] flex items-center justify-center text-[var(--yellow)] text-[9px] font-bold" style={{ fontFamily: "'Courier Prime', monospace" }}>SC</div>
                      )
                    ) : (
                      <CardThumbnail src={m.image_url} alt={m.title} aspectClass="aspect-square" frameClass="" />
                    )}
                  </div>
                  <div className="flex-grow min-w-0">
                    <div className="truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(12px, 2.5vw, 16px)', textTransform: 'uppercase', letterSpacing: '-0.3px' }}>{m.title}</div>
                    <div className="mt-[2px]" style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '12px', color: 'var(--red)' }}>{m.artist_name}</div>
                  </div>
                  <div className="hidden sm:flex gap-2 shrink-0 items-center">
                    <span className="cutout red" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{m.mix_type?.replace('_', ' ')}</span>
                    <span className="cutout outline" style={{ fontSize: '8px', padding: '1px 6px', margin: 0 }}>{formatMixDateLine(m, lang)}</span>
                    {scTrackUrl ? (
                      <a href={scTrackUrl} target="_blank" rel="noopener noreferrer" className="bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors" style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '9px', letterSpacing: '1px', padding: '2px 8px' }}>SC ↗</a>
                    ) : null}
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}
