// ============================================
// OPTIMAL BREAKS — My Tracks section
// Tracks guardados desde charts (Beatport preview),
// featured (new releases, Beatport/Bandcamp) y vinyl (YouTube).
// Reproductor unificado: audio proxy para Beatport/Bandcamp y
// LazyYouTubeEmbed para vinilos.
// ============================================

'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import Image from 'next/image'
import { createBrowserSupabase } from '@/lib/supabase'
import { useSavedChartTracks, type ChartTrackSource } from '@/hooks/useUserData'
import { useAuth } from '@/components/AuthProvider'
import SaveTrackButton from '@/components/SaveTrackButton'
import TrackShareButton from '@/components/TrackShareButton'
import { usePreviewAudioGated } from '@/hooks/useGatedDeckAudio'
import type { PreviewTrack, PreviewShareData } from '@/components/DeckAudioProvider'
import { extractYouTubeId, LazyYouTubeEmbed } from '@/components/YouTubeEmbed'
import type { SavedChartTrackSnapshot } from '@/types/database'
import type { Locale } from '@/lib/i18n-config'
import {
  formatTrackReleaseDisplay,
  effectiveReleaseYear,
  buildAbsoluteShareUrl,
  copyShareLink,
  releaseSortTimestampMs,
  buildBeatportSharePath,
  buildTrackSharePath,
  buildVinylSharePath,
  extractBeatportTrackId,
} from '@/lib/share-track'

/**
 * Payload público pre-cargado por la página compartida. Lo envía el endpoint
 * `/api/public/user-tracks` y evita que el componente tenga que usar el hook
 * `useSavedChartTracks` (que solo lee lo del usuario actual).
 */
export type PublicTracksPayload = {
  owner: {
    id: string
    username: string | null
    display_name: string | null
    avatar_url: string | null
    country: string | null
  }
  saved: Array<{
    track_source: ChartTrackSource
    track_id: string
    canonical_url: string | null
    snapshot: Record<string, any> | null
    created_at: string | null
  }>
  tracks: {
    chart: Array<{ id: string; title: string; mix_name: string | null; artists: string; label: string | null; year: number | null; release_date?: string | null; bpm: number | null; music_key: string | null; artwork_url: string | null; beatport_url: string | null; sample_url: string | null; week_date?: string | null }>
    featured: Array<{ id: string; title: string; mix_name: string | null; artists: string; label: string | null; year: number | null; release_date?: string | null; bpm: number | null; music_key: string | null; artwork_url: string | null; link_url: string | null; link_label: string | null; platform: string | null; sample_url: string | null; note_en: string | null; note_es: string | null; week_date?: string | null }>
    vinyl: Array<{ id: string; title: string; mix_name: string | null; artists: string; label: string | null; year: number | null; artwork_url: string | null; discogs_url: string | null; youtube_url: string | null; note_en: string | null; note_es: string | null }>
  }
}

type UnifiedTrack = {
  key: string
  source: ChartTrackSource
  id: string
  title: string
  mix_name?: string
  artists: string
  label?: string
  year?: number | null
  /** YYYY-MM-DD cuando existe (chart / featured / beatport_top). */
  release_date?: string | null
  bpm?: number | null
  music_key?: string
  artwork_url?: string | null
  external_url?: string | null
  external_label?: string
  sample_url?: string | null
  youtube_url?: string | null
  platform?: string
  note?: string
  saved_at?: string | null
  /**
   * Fecha ISO (YYYY-MM-DD) de la edición del chart a la que pertenece esta
   * track (solo `chart` y `featured`). Null para vinyl y beatport_top.
   * La usa `TrackShareButton` para construir /charts?week=..&play=..
   */
  week_date?: string | null
  /**
   * Refs `{source, id}` del track representativo + sus duplicados colapsados
   * (misma canción guardada desde distintas listas). Se usa para que el
   * botón de guardar actúe sobre TODAS las filas a la vez.
   */
  refs?: Array<{ source: ChartTrackSource; id: string }>
  /**
   * Snapshot serializado de la canción. Obligatorio para las tracks
   * `beatport_top` (que no tienen fila en ninguna tabla de charts) y también
   * útil en listas compartidas para que el visitante, al clonar la track a
   * su propia lista, preserve el título/artista/artwork/origin originales.
   */
  snapshot?: SavedChartTrackSnapshot | null
  /**
   * URL canónica almacenada en `saved_chart_tracks.canonical_url`. Sirve
   * para deduplicar cross-source por URL cuando el visitante guarda la
   * track desde una lista compartida.
   */
  canonical_url?: string | null
}

function previewAudioSrc(sampleUrl: string, platform?: string, linkUrl?: string | null): string {
  if (platform === 'bandcamp' && linkUrl) {
    return `/api/bandcamp-preview?track=${encodeURIComponent(linkUrl)}`
  }
  try {
    const host = new URL(sampleUrl).hostname.toLowerCase()
    if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') {
      return `/api/audio-proxy?url=${encodeURIComponent(sampleUrl)}`
    }
  } catch { /* raw url */ }
  return sampleUrl
}

function artistsToString(artists: any): string {
  if (!Array.isArray(artists)) return ''
  return artists.map((a: any) => (a && typeof a === 'object' ? a.name : a)).filter(Boolean).join(', ')
}

type SortBy = 'added' | 'artist' | 'title' | 'release'
type PlaybackKind = 'beatport' | 'bandcamp' | 'youtube'
const ALL_PLAYBACK_KINDS: PlaybackKind[] = ['beatport', 'bandcamp', 'youtube']

// Clasifica la fuente de reproducción real basándose en lo que realmente se
// puede reproducir en la fila (no en el chart del que se guardó). Damos
// prioridad al audio preview (Beatport/Bandcamp) porque es el que suena en
// segundo plano; si no hay audio pero sí vídeo, es YouTube.
function playbackOf(t: UnifiedTrack): PlaybackKind {
  if (t.sample_url) return 'beatport'
  if (t.platform === 'bandcamp' && t.external_url) return 'bandcamp'
  if (t.youtube_url) return 'youtube'
  if (t.source === 'vinyl') return 'youtube'
  if (t.source === 'featured' && t.platform === 'bandcamp') return 'bandcamp'
  return 'beatport'
}

interface TracksSectionProps {
  lang: string
  /** Si se pasa, el componente entra en modo "lista compartida": usa ese payload
   *  pre-cargado del servidor en vez del hook del usuario, y oculta el botón
   *  de compartir (que solo tiene sentido en la lista propia). */
  publicPayload?: PublicTracksPayload
}

/**
 * Slider dual (rango min-max) para filtrar por años. Estilo Optimal Breaks:
 * pista neutra con el tramo activo en rojo, dos pomos negros. Implementado
 * con dos <input type="range"> apilados que se reparten el eje; el CSS vive
 * en `tracks-year-slider.css` (clases `.ob-range`).
 */
function YearRangeSlider({
  bounds, value, onChange, es,
}: {
  bounds: { min: number; max: number }
  value: [number, number]
  onChange: (v: [number, number]) => void
  es: boolean
}) {
  const min = bounds.min
  const max = bounds.max
  const [lo, hi] = value
  const span = Math.max(1, max - min)
  const pctLo = ((lo - min) / span) * 100
  const pctHi = ((hi - min) / span) * 100
  const reset = () => onChange([min, max])
  const isFull = lo === min && hi === max

  return (
    <div className="w-full" style={{ fontFamily: "'Courier Prime', monospace" }}>
      <div className="flex items-center gap-3 mb-2">
        <span className="text-[10px] font-bold tracking-[2px] text-[var(--ink)]/60">
          {es ? 'AÑOS:' : 'YEARS:'}
        </span>
        <span
          className="h-[24px] px-2 inline-flex items-center border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] tabular-nums"
          style={{ fontWeight: 700, fontSize: '11px', letterSpacing: '1px' }}
        >
          {lo} – {hi}
        </span>
        {!isFull && (
          <button
            type="button"
            onClick={reset}
            className="h-[24px] px-2 border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)] transition-colors cursor-pointer"
            style={{ fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
            title={es ? 'Restablecer rango completo' : 'Reset to full range'}
          >
            {es ? 'TODO' : 'ALL'}
          </button>
        )}
      </div>

      {max === min ? (
        <p className="text-[10px] text-[var(--ink)]/40" style={{ letterSpacing: '1px' }}>
          {es ? `SOLO UN AÑO PRESENTE: ${min}` : `ONLY ONE YEAR: ${min}`}
        </p>
      ) : (
        <div className="ob-range-wrap">
          <div className="ob-range-track" />
          <div
            className="ob-range-fill"
            style={{ left: `${pctLo}%`, right: `${100 - pctHi}%` }}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={lo}
            onChange={(e) => {
              const v = Math.min(Number(e.target.value), hi)
              onChange([v, hi])
            }}
            className="ob-range ob-range-lo"
            aria-label={es ? 'Año mínimo' : 'Min year'}
          />
          <input
            type="range"
            min={min}
            max={max}
            step={1}
            value={hi}
            onChange={(e) => {
              const v = Math.max(Number(e.target.value), lo)
              onChange([lo, v])
            }}
            className="ob-range ob-range-hi"
            aria-label={es ? 'Año máximo' : 'Max year'}
          />
          <div className="flex justify-between mt-1 text-[9px] text-[var(--ink)]/40 tabular-nums" style={{ letterSpacing: '1px' }}>
            <span>{min}</span>
            <span>{max}</span>
          </div>
        </div>
      )}
    </div>
  )
}

export default function TracksSection({ lang, publicPayload }: TracksSectionProps) {
  const isShared = !!publicPayload
  const { user } = useAuth()
  const ownHook = useSavedChartTracks()
  // En modo compartido, saved/loading vienen del payload; si no, del hook.
  const saved = isShared ? publicPayload!.saved : ownHook.saved
  const loading = isShared ? false : ownHook.loading
  const [tracks, setTracks] = useState<UnifiedTrack[]>([])
  const [tracksLoading, setTracksLoading] = useState(false)
  const [copiedUrl, setCopiedUrl] = useState(false)
  // Filtro multiselección. Por defecto las tres fuentes están activas
  // (equivalente a TODO). Útil para, p.ej., elegir solo Beatport+Bandcamp
  // cuando quieres reproducir en segundo plano sin YouTube.
  const [activeKinds, setActiveKinds] = useState<Set<PlaybackKind>>(
    () => new Set(ALL_PLAYBACK_KINDS),
  )
  // Rango de años seleccionado. `null` = todavía no calculado (o sin datos).
  // Se inicializa automáticamente al `{min, max}` real en cuanto tenemos los
  // tracks; el usuario luego puede acotarlo arrastrando los pomos del slider.
  const [yearRange, setYearRange] = useState<[number, number] | null>(null)
  const [sortBy, setSortBy] = useState<SortBy>('added')
  const es = lang === 'es'

  // Clave del grupo dentro del provider global. Propia del usuario logueado
  // (o del owner en listas compartidas) para que el provider sepa si la cola
  // actual pertenece a este listado y pueda resaltar la pista activa.
  const groupKey = useMemo(() => {
    if (isShared && publicPayload) return `tracks:shared:${publicPayload.owner.id}`
    return user ? `tracks:mine:${user.id}` : 'tracks:anon'
  }, [isShared, publicPayload, user])

  const {
    previewQueue,
    previewIndex,
    previewPlaying,
    previewGroupKey,
    playPreviewQueue,
    togglePreview,
    stopPreview,
  } = usePreviewAudioGated()

  // Key de la pista que actualmente suena desde ESTA lista (si la hay).
  const activeRowKey = previewGroupKey === groupKey ? previewQueue[previewIndex]?.rowKey ?? null : null
  // Si shuffle está activo, al reconstruir la cola por un play individual
  // queremos mantener el orden barajado actual; en caso contrario usamos el
  // orden visible. Sacamos el flag de si la cola activa coincide con
  // `orderedAudioQueue` para detectarlo.
  const [shuffleMode, setShuffleMode] = useState(false)

  // Load real track data for every saved ref (grouped by source).
  useEffect(() => {
    if (loading) return
    if (saved.length === 0) { setTracks([]); return }

    let cancelled = false
    setTracksLoading(true)

    ;(async () => {
      // En modo compartido, los registros ya vienen en el payload; en modo
      // propio se consultan las tablas de charts desde el cliente.
      let chartData: any[] = []
      let featData: any[] = []
      let vinylData: any[] = []
      if (isShared) {
        const p = publicPayload!
        chartData = p.tracks.chart.map((c) => ({ ...c, release_year: c.year, release_date: c.release_date ?? null, artists: c.artists }))
        featData = p.tracks.featured.map((f) => ({ ...f, release_year: f.year, release_date: f.release_date ?? null, artists: f.artists }))
        vinylData = p.tracks.vinyl.map((v) => ({ ...v, artists: v.artists }))
      } else {
        const supabase = createBrowserSupabase()
        const chartIds = saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)
        const featuredIds = saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)
        const vinylIds = saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)

        const [chartRes, featRes, vinylRes] = await Promise.all([
          chartIds.length
            ? supabase.from('chart_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, beatport_url, sample_url').in('id', chartIds)
            : Promise.resolve({ data: [] as any[] }),
          featuredIds.length
            ? supabase.from('chart_featured_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, link_url, link_label, platform, sample_url, note_en, note_es').in('id', featuredIds)
            : Promise.resolve({ data: [] as any[] }),
          vinylIds.length
            ? supabase.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year, format, catalog_number, artwork_url, discogs_url, youtube_url, note_en, note_es').in('id', vinylIds)
            : Promise.resolve({ data: [] as any[] }),
        ])
        chartData = chartRes.data || []
        featData = featRes.data || []
        vinylData = vinylRes.data || []

        // Resolvemos week_date de las ediciones implicadas para poder generar
        // links compartibles "/charts?week=..&play=<source>:<id>" sin consulta
        // extra por fila.
        const editionIds = Array.from(new Set(
          [
            ...chartData.map((c: any) => c.chart_edition_id as string | null).filter((x): x is string => !!x),
            ...featData.map((f: any) => f.chart_edition_id as string | null).filter((x): x is string => !!x),
          ],
        ))
        if (editionIds.length) {
          const { data: edData } = await supabase
            .from('chart_editions')
            .select('id, week_date')
            .in('id', editionIds)
          const weekBy = new Map<string, string>()
          for (const e of ((edData as Array<{ id: string; week_date: string }> | null) || [])) {
            weekBy.set(e.id, e.week_date)
          }
          chartData = chartData.map((c: any) => ({ ...c, week_date: c.chart_edition_id ? weekBy.get(c.chart_edition_id) ?? null : null }))
          featData = featData.map((f: any) => ({ ...f, week_date: f.chart_edition_id ? weekBy.get(f.chart_edition_id) ?? null : null }))
        }
      }

      const byKey = new Map<string, UnifiedTrack>()
      for (const c of chartData) {
        byKey.set(`chart:${c.id}`, {
          key: `chart:${c.id}`, source: 'chart', id: c.id,
          title: c.title, mix_name: c.mix_name, artists: typeof c.artists === 'string' ? c.artists : artistsToString(c.artists),
          label: c.label, year: c.release_year, release_date: c.release_date ?? null, bpm: c.bpm, music_key: c.music_key,
          artwork_url: c.artwork_url, external_url: c.beatport_url, external_label: 'BEATPORT',
          sample_url: c.sample_url,
          week_date: c.week_date ?? null,
        })
      }
      for (const f of featData) {
        byKey.set(`featured:${f.id}`, {
          key: `featured:${f.id}`, source: 'featured', id: f.id,
          title: f.title, mix_name: f.mix_name, artists: typeof f.artists === 'string' ? f.artists : artistsToString(f.artists),
          label: f.label, year: f.release_year, release_date: f.release_date ?? null, bpm: f.bpm, music_key: f.music_key,
          artwork_url: f.artwork_url, external_url: f.link_url,
          external_label: f.link_label || (f.platform ? String(f.platform).toUpperCase() : 'LINK'),
          sample_url: f.sample_url, platform: f.platform,
          note: lang === 'es' ? f.note_es : f.note_en,
          week_date: f.week_date ?? null,
        })
      }
      for (const v of vinylData) {
        byKey.set(`vinyl:${v.id}`, {
          key: `vinyl:${v.id}`, source: 'vinyl', id: v.id,
          title: v.title, mix_name: v.mix_name, artists: typeof v.artists === 'string' ? v.artists : artistsToString(v.artists),
          label: v.label, year: v.year,
          artwork_url: v.artwork_url, external_url: v.discogs_url, external_label: 'DISCOGS',
          youtube_url: v.youtube_url,
          note: lang === 'es' ? v.note_es : v.note_en,
        })
      }

      // Beatport Top 10: no hay fila en ninguna tabla de charts — la info
      // viene embebida en `snapshot` del propio saved_chart_tracks.
      for (const s of saved) {
        if (s.track_source !== 'beatport_top') continue
        const snap = (s.snapshot || {}) as Record<string, any>
        byKey.set(`beatport_top:${s.track_id}`, {
          key: `beatport_top:${s.track_id}`,
          source: 'beatport_top',
          id: s.track_id,
          title: snap.title || '',
          mix_name: snap.mix_name || undefined,
          artists: snap.artists || '',
          label: snap.label || undefined,
          year: snap.year ?? null,
          release_date: snap.release_date ?? null,
          bpm: snap.bpm ?? null,
          music_key: snap.music_key || undefined,
          artwork_url: snap.artwork_url || null,
          external_url: snap.beatport_url || s.canonical_url || null,
          external_label: 'BEATPORT',
          sample_url: snap.sample_url || null,
        })
      }

      if (cancelled) return
      const ordered = saved
        .map((s) => {
          const t = byKey.get(`${s.track_source}:${s.track_id}`)
          if (!t) return null
          // Propagamos snapshot y canonical_url del registro original a la
          // UnifiedTrack. Esto es lo que permite que, desde una lista
          // compartida, el visitante pueda clonar la track a su propia
          // lista con toda la info necesaria (crítico para beatport_top,
          // que no tiene fila en ninguna tabla de charts).
          return {
            ...t,
            saved_at: s.created_at ?? null,
            snapshot: (s.snapshot as SavedChartTrackSnapshot | null) ?? null,
            canonical_url: s.canonical_url ?? null,
          }
        })
        .filter(Boolean) as UnifiedTrack[]

      // Dedupe: una canción sólo puede aparecer una vez aunque esté guardada
      // desde varias fuentes (p.ej. 40 Breaks + Novedades). Clave canónica:
      // URL externa normalizada; fallback a título+mix+artistas.
      //
      // IMPORTANTE para vinyl: `external_url` es la URL de Discogs, que
      // identifica el RELEASE completo (muchas canciones del mismo LP
      // comparten discogs_url). Si lo usásemos como clave, todas las pistas
      // del mismo vinilo colapsarían en una sola fila. Para vinyl usamos el
      // `youtube_url`, que sí es único por canción.
      const normalizeUrl = (u: string) => {
        // YouTube: el ID del vídeo está en la querystring (?v=…); host+pathname
        // colapsaría todos los watch?v=… en la misma clave. Usamos el ID.
        const yt = extractYouTubeId(u)
        if (yt) return `yt:${yt}`
        try {
          const url = new URL(u)
          return `${url.host}${url.pathname.replace(/\/$/, '')}`
        } catch {
          return u.replace(/[?#].*$/, '').replace(/\/$/, '')
        }
      }
      const canonicalKey = (t: UnifiedTrack) => {
        if (t.source === 'vinyl') {
          const yt = (t.youtube_url || '').trim().toLowerCase()
          if (yt) return normalizeUrl(yt)
          return `nm:${(t.title || '').toLowerCase()}|${(t.mix_name || '').toLowerCase()}|${(t.artists || '').toLowerCase()}`
        }
        const u = (t.external_url || '').trim().toLowerCase()
        if (u) return normalizeUrl(u)
        return `nm:${(t.title || '').toLowerCase()}|${(t.mix_name || '').toLowerCase()}|${(t.artists || '').toLowerCase()}`
      }
      const byCanon = new Map<string, UnifiedTrack>()
      for (const t of ordered) {
        const k = canonicalKey(t)
        const existing = byCanon.get(k)
        if (!existing) {
          byCanon.set(k, { ...t, refs: [{ source: t.source, id: t.id }] })
          continue
        }
        existing.refs!.push({ source: t.source, id: t.id })
        // Enriquecemos el representativo con campos que puedan faltarle
        // (p.ej. el vinilo aporta youtube_url; chart/featured aportan sample).
        if (!existing.sample_url && t.sample_url) existing.sample_url = t.sample_url
        if (!existing.youtube_url && t.youtube_url) existing.youtube_url = t.youtube_url
        if (!existing.artwork_url && t.artwork_url) existing.artwork_url = t.artwork_url
        if (!existing.bpm && t.bpm) existing.bpm = t.bpm
        if (!existing.music_key && t.music_key) existing.music_key = t.music_key
        if (!existing.note && t.note) existing.note = t.note
        // Preservamos snapshot / canonical_url si el representativo no los
        // tiene pero un duplicado sí (típicamente: representativo es chart y
        // se fusiona con su gemela beatport_top que sí trae snapshot).
        if (!existing.snapshot && t.snapshot) existing.snapshot = t.snapshot
        if (!existing.canonical_url && t.canonical_url) existing.canonical_url = t.canonical_url
        // week_date del representativo puede venir null si es un beatport_top
        // que se fusiona con un chart/featured de una semana concreta: en ese
        // caso nos quedamos con la semana del duplicado (para que el botón
        // "compartir" pueda apuntar al chart).
        if (!existing.week_date && t.week_date) existing.week_date = t.week_date
        if (!(existing.release_date || '').trim() && (t.release_date || '').trim()) existing.release_date = t.release_date
      }
      const deduped = Array.from(byCanon.values())
      setTracks(deduped)
      setTracksLoading(false)
    })()

    return () => { cancelled = true }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved, loading, lang, isShared])

  // Años mín / máx presentes en el conjunto de tracks (ignora los que no
  // tienen año). Sirve para fijar los topes del slider de rango.
  const yearBounds = useMemo(() => {
    let min = Infinity
    let max = -Infinity
    for (const t of tracks) {
      const y = effectiveReleaseYear(t.release_date, t.year)
      if (typeof y === 'number' && Number.isFinite(y)) {
        if (y < min) min = y
        if (y > max) max = y
      }
    }
    if (!Number.isFinite(min) || !Number.isFinite(max)) return null
    return { min, max }
  }, [tracks])

  // Auto-ajusta el rango seleccionado cuando los topes cambian: si el usuario
  // tenía un rango que queda fuera, lo recortamos; si nunca tocó el slider,
  // lo inicializamos al rango completo.
  useEffect(() => {
    if (!yearBounds) { setYearRange(null); return }
    setYearRange((prev) => {
      if (!prev) return [yearBounds.min, yearBounds.max]
      const lo = Math.max(yearBounds.min, Math.min(prev[0], yearBounds.max))
      const hi = Math.min(yearBounds.max, Math.max(prev[1], yearBounds.min))
      return [Math.min(lo, hi), Math.max(lo, hi)]
    })
  }, [yearBounds])

  // `true` si el slider está en los topes (no filtra nada por año).
  const yearRangeIsFull = !!yearBounds && !!yearRange
    && yearRange[0] === yearBounds.min && yearRange[1] === yearBounds.max

  const filtered = useMemo(() => {
    let out = tracks
    if (activeKinds.size !== ALL_PLAYBACK_KINDS.length) {
      out = out.filter((t) => activeKinds.has(playbackOf(t)))
    }
    // Filtro por año sólo si el usuario acotó el rango. Los tracks sin año
    // se muestran únicamente cuando el slider está en el rango completo, para
    // no descartarlos sin querer al tocar los pomos.
    if (yearRange && yearBounds && !yearRangeIsFull) {
      const [lo, hi] = yearRange
      out = out.filter((t) => {
        const y = effectiveReleaseYear(t.release_date, t.year)
        return typeof y === 'number' && y >= lo && y <= hi
      })
    }
    return out
  }, [tracks, activeKinds, yearRange, yearBounds, yearRangeIsFull])

  const toggleKind = (k: PlaybackKind) => {
    setActiveKinds((prev) => {
      const next = new Set(prev)
      if (next.has(k)) next.delete(k)
      else next.add(k)
      // Si el usuario deja el set vacío, recuperamos las tres fuentes.
      if (next.size === 0) return new Set(ALL_PLAYBACK_KINDS)
      return next
    })
  }
  const selectAllKinds = () => setActiveKinds(new Set(ALL_PLAYBACK_KINDS))

  const sorted = useMemo(() => {
    const loc = es ? 'es' : 'en'
    const arr = [...filtered]
    switch (sortBy) {
      case 'artist':
        arr.sort((A, B) => (A.artists || '').localeCompare(B.artists || '', loc, { sensitivity: 'base' })
          || (A.title || '').localeCompare(B.title || '', loc, { sensitivity: 'base' }))
        break
      case 'title':
        arr.sort((A, B) => (A.title || '').localeCompare(B.title || '', loc, { sensitivity: 'base' })
          || (A.artists || '').localeCompare(B.artists || '', loc, { sensitivity: 'base' }))
        break
      case 'release':
        arr.sort(
          (A, B) =>
            releaseSortTimestampMs(B.release_date, B.year) - releaseSortTimestampMs(A.release_date, A.year)
            || (A.artists || '').localeCompare(B.artists || '', loc, { sensitivity: 'base' }),
        )
        break
      case 'added':
      default:
        arr.sort((A, B) => {
          const a = A.saved_at || ''
          const b = B.saved_at || ''
          if (a === b) return 0
          return a < b ? 1 : -1
        })
    }
    return arr
  }, [filtered, sortBy, es])

  // Queue of audio-only (Beatport / Bandcamp). YouTube se reproduce con embed
  // aparte. Se basa en los campos efectivos del track (tras dedupe), no en
  // la fuente original.
  const isAudioPlayable = (t: UnifiedTrack) => {
    if (t.sample_url) return true
    if (t.platform === 'bandcamp' && t.external_url) return true
    return false
  }
  const orderedAudioQueue = useMemo(() => sorted.filter(isAudioPlayable), [sorted])

  // Si el grupo activo es OTRO (otra lista, otro chart, otra página), el
  // reproductor global seguirá sonando pero aquí no resaltamos ninguna fila.
  const isGroupActive = previewGroupKey === groupKey && previewQueue.length > 0

  // Si cambia la lista visible mientras seguimos siendo el grupo activo, al
  // salir del modo shuffle queremos reflejarlo.
  useEffect(() => {
    if (!isGroupActive) setShuffleMode(false)
  }, [isGroupActive])

  // Convierte un UnifiedTrack a PreviewTrack del provider.
  // Adjuntamos `save` con la misma lógica que la fila de la lista (URL mode
  // para `beatport_top` en lista compartida, ref mode con `relatedRefs` en
  // la lista propia) para que el botón "+/✓" del MiniPreviewBar opere
  // exactamente sobre el mismo registro al añadir o quitar la pista que
  // está sonando en ese momento.
  // Calcula los datos de "compartir" para el mini reproductor reusando la
  // MISMA lógica que la fila visible (ver el bloque `TrackShareButton` en
  // el render). El reproductor persiste entre rutas; sin esto, el usuario
  // ya no tiene la fila a mano para copiar el enlace de lo que suena.
  const toPreviewShare = useCallback((t: UnifiedTrack): PreviewShareData | undefined => {
    if (!lang) return undefined
    if (t.source === 'chart' || t.source === 'featured') {
      return {
        mode: 'chart',
        source: t.source,
        trackId: t.id,
        weekDate: t.week_date ?? null,
      }
    }
    if (t.source === 'vinyl') {
      return { mode: 'path', path: buildVinylSharePath(lang as Locale, t.id) }
    }
    if (t.source === 'beatport_top') {
      const snap = t.snapshot
      const origin = snap?.origin
      const bpUrl =
        (typeof snap?.beatport_url === 'string' && snap.beatport_url) ||
        t.external_url ||
        t.canonical_url
      const bpId = extractBeatportTrackId(bpUrl)
      if (
        origin?.kind &&
        origin.slug &&
        bpId &&
        (origin.kind === 'artist' || origin.kind === 'label')
      ) {
        const folder = origin.kind === 'artist' ? 'artists' : 'labels'
        return {
          mode: 'path',
          path: buildBeatportSharePath(`/${lang}/${folder}/${origin.slug}`, bpId),
        }
      }
      const externalUrl = (t.external_url || t.canonical_url || '').trim()
      if (externalUrl) return { mode: 'url', externalUrl }
    }
    return undefined
  }, [lang])

  const toPreviewTrack = useCallback((t: UnifiedTrack): PreviewTrack | null => {
    const src = t.source === 'featured' && t.platform === 'bandcamp'
      ? previewAudioSrc('', 'bandcamp', t.external_url)
      : t.sample_url ? previewAudioSrc(t.sample_url, t.platform || undefined) : ''
    if (!src) return null
    const useUrlMode = isShared && t.source === 'beatport_top' && !!(t.external_url || t.canonical_url)
    return {
      rowKey: t.key,
      src,
      title: t.title,
      artist: t.artists,
      artworkUrl: t.artwork_url ?? null,
      // domId no aplica aquí; las filas no tienen id único en el DOM y el
      // scroll-to-row sólo tiene sentido dentro de la misma ruta.
      save: useUrlMode
        ? {
            mode: 'url',
            externalUrl: (t.external_url || t.canonical_url) as string,
            externalTrackId: t.id,
            canonicalUrl: t.external_url || t.canonical_url || null,
            snapshot: t.snapshot ?? null,
          }
        : {
            mode: 'ref',
            source: t.source,
            trackId: t.id,
            // En la lista compartida, los refs pertenecen al dueño, no al
            // visitante: pasamos solo el primario para que el botón opere
            // sobre la lista del que mira. (Mismo criterio que la fila.)
            relatedRefs: !isShared && t.refs && t.refs.length > 1 ? t.refs : undefined,
            canonicalUrl: t.external_url || t.youtube_url || t.canonical_url || null,
            snapshot: t.snapshot ?? null,
          },
      share: toPreviewShare(t),
    }
  }, [isShared, toPreviewShare])

  const buildQueue = useCallback((src: UnifiedTrack[]): PreviewTrack[] => {
    const out: PreviewTrack[] = []
    for (const t of src) {
      const p = toPreviewTrack(t)
      if (p) out.push(p)
    }
    return out
  }, [toPreviewTrack])

  // Play individual: si es la misma pista, toggle pause/resume; si no, se
  // construye la cola usando el orden visible (o el barajado, si está
  // activo) y se salta al índice elegido.
  const playTrackInOrdered = useCallback((t: UnifiedTrack) => {
    if (activeRowKey === t.key) {
      togglePreview()
      return
    }
    const baseQueue = shuffleMode && isGroupActive ? previewQueue : buildQueue(orderedAudioQueue)
    const idx = baseQueue.findIndex((p) => p.rowKey === t.key)
    if (idx < 0) {
      // No está en la cola base (p.ej. filtro distinto): reconstruye visible.
      const queue = buildQueue(orderedAudioQueue)
      const i = queue.findIndex((p) => p.rowKey === t.key)
      if (i < 0) return
      setShuffleMode(false)
      playPreviewQueue(queue, i, groupKey)
      return
    }
    playPreviewQueue(baseQueue, idx, groupKey)
  }, [activeRowKey, togglePreview, shuffleMode, isGroupActive, previewQueue, buildQueue, orderedAudioQueue, playPreviewQueue, groupKey])

  const playAll = useCallback(() => {
    const queue = buildQueue(orderedAudioQueue)
    if (queue.length === 0) return
    setShuffleMode(false)
    playPreviewQueue(queue, 0, groupKey)
  }, [orderedAudioQueue, buildQueue, playPreviewQueue, groupKey])

  const playShuffle = useCallback(() => {
    const queue = buildQueue(orderedAudioQueue)
    if (queue.length === 0) return
    for (let i = queue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1))
      ;[queue[i], queue[j]] = [queue[j], queue[i]]
    }
    setShuffleMode(true)
    playPreviewQueue(queue, 0, groupKey)
  }, [orderedAudioQueue, buildQueue, playPreviewQueue, groupKey])

  const stopAll = useCallback(() => {
    stopPreview()
    setShuffleMode(false)
  }, [stopPreview])

  const counts = useMemo(() => {
    const c = { all: tracks.length, beatport: 0, bandcamp: 0, youtube: 0 }
    for (const t of tracks) c[playbackOf(t)]++
    return c
  }, [tracks])

  // URL pública compartible de mi lista (solo en modo propio).
  // IMPORTANTE: este `useMemo` y el `useCallback` siguiente deben quedarse
  // por encima del early-return de abajo; si no, React cambia la cantidad de
  // hooks entre renders y lanza el error #310.
  const shareUrl = useMemo(() => {
    if (isShared || !user) return ''
    const handle = user.id // UUID como handle; el endpoint también acepta username
    return buildAbsoluteShareUrl(`/${lang}/u/${handle}/tracks`)
  }, [isShared, user, lang])

  const onCopyShareUrl = useCallback(async () => {
    if (!shareUrl) return
    const nav = typeof navigator !== 'undefined' ? navigator : null
    if (nav?.share) {
      try {
        await nav.share({
          title: es ? 'Mis tracks en Optimal Breaks' : 'My tracks on Optimal Breaks',
          url: shareUrl,
        })
        return
      } catch {
        // Cancelado o no disponible → copiar.
      }
    }
    const ok = await copyShareLink(shareUrl)
    if (ok) {
      setCopiedUrl(true)
      setTimeout(() => setCopiedUrl(false), 1800)
    }
  }, [shareUrl, es])

  if (loading || tracksLoading) {
    return <p style={{ fontFamily: "'Courier Prime', monospace", fontSize: '13px', color: 'var(--dim)' }}>
      {isShared
        ? (es ? 'Cargando tracks…' : 'Loading tracks…')
        : (es ? 'Cargando tus tracks…' : 'Loading your tracks…')}
    </p>
  }

  return (
    <div>
      {isShared && publicPayload ? (
        <div className="mb-4 p-3 border-[3px] border-[var(--ink)] bg-[var(--yellow)]/30 flex items-center gap-3">
          <div className="shrink-0 w-11 h-11 rounded-full border-2 border-[var(--ink)] bg-[var(--paper-dark)] overflow-hidden relative">
            {publicPayload.owner.avatar_url ? (
              <Image src={publicPayload.owner.avatar_url} alt="" fill className="object-cover" sizes="44px" unoptimized />
            ) : (
              <div className="w-full h-full flex items-center justify-center font-black text-[var(--ink)]" style={{ fontFamily: "'Unbounded', sans-serif" }}>
                {(publicPayload.owner.display_name || publicPayload.owner.username || '?')[0].toUpperCase()}
              </div>
            )}
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] tracking-[2px] text-[var(--ink)]/60 font-bold" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {es ? 'LISTA COMPARTIDA' : 'SHARED LIST'}
            </p>
            <p className="font-black text-[var(--ink)] truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '15px' }}>
              {publicPayload.owner.display_name || publicPayload.owner.username || (es ? 'Breaker anónimo' : 'Anonymous breaker')}
            </p>
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
        <h2 style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '20px', textTransform: 'uppercase' }}>
          {isShared
            ? (es ? `TRACKS DE ${(publicPayload!.owner.display_name || publicPayload!.owner.username || 'BREAKER').toString().toUpperCase()}` : `${(publicPayload!.owner.display_name || publicPayload!.owner.username || 'BREAKER').toString().toUpperCase()}'S TRACKS`)
            : (es ? 'MIS TRACKS' : 'MY TRACKS')}
          {' '}({counts.all})
        </h2>
        <div className="flex items-center gap-2 flex-wrap">
          {!isShared && user ? (
            <button
              type="button"
              onClick={onCopyShareUrl}
              className="inline-flex items-center gap-1.5 min-h-[36px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--yellow)] transition-all cursor-pointer whitespace-nowrap"
              style={{ fontFamily: "'Courier Prime', monospace" }}
              title={es ? 'Copiar URL pública de mi lista' : 'Copy public URL of my list'}
              aria-label={es ? 'Copiar URL pública de mis tracks' : 'Copy public URL of my tracks'}
            >
              {copiedUrl
                ? (es ? '✓ COPIADO' : '✓ COPIED')
                : (es ? '🔗 COMPARTIR' : '🔗 SHARE')}
            </button>
          ) : null}
          {/*
            PLAY ALL / ALEATORIO / PARAR se han movido a la barra contextual
            situada justo sobre la lista (más abajo), para que el botón y
            las pistas que va a reproducir queden visualmente juntos. Esto
            evita la duda de "¿estoy reproduciendo todas o las filtradas?".
          */}
        </div>
      </div>

      {tracks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-3">
          <span className="text-[10px] font-bold tracking-[2px] text-[var(--ink)]/60 mr-1" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {es ? 'ORDENAR:' : 'SORT:'}
          </span>
          {(['added', 'artist', 'title', 'release'] as const).map((k) => {
            const label = k === 'added'
              ? (es ? 'AÑADIDO' : 'ADDED')
              : k === 'artist'
                ? (es ? 'ARTISTA' : 'ARTIST')
                : k === 'title'
                  ? (es ? 'TÍTULO' : 'TITLE')
                  : (es ? 'RELEASE' : 'RELEASE')
            const active = sortBy === k
            return (
              <button
                key={k}
                type="button"
                onClick={() => setSortBy(k)}
                className={`h-[28px] px-2.5 border-2 border-[var(--ink)] transition-colors cursor-pointer ${
                  active ? 'bg-[var(--ink)] text-[var(--yellow)]' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'
                }`}
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {tracks.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 mb-4">
          <span className="text-[10px] font-bold tracking-[2px] text-[var(--ink)]/60 mr-1" style={{ fontFamily: "'Courier Prime', monospace" }}>
            {es ? 'FUENTE:' : 'SOURCE:'}
          </span>
          {(() => {
            const allActive = activeKinds.size === ALL_PLAYBACK_KINDS.length
            return (
              <button
                type="button"
                onClick={selectAllKinds}
                className={`h-[30px] px-3 border-2 border-[var(--ink)] transition-colors cursor-pointer ${
                  allActive ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'
                }`}
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
                title={es ? 'Mostrar todas las fuentes' : 'Show all sources'}
              >
                {es ? `TODO (${counts.all})` : `ALL (${counts.all})`}
              </button>
            )
          })()}
          {ALL_PLAYBACK_KINDS.map((k) => {
            const label = k === 'beatport'
              ? `BEATPORT (${counts.beatport})`
              : k === 'bandcamp'
                ? `BANDCAMP (${counts.bandcamp})`
                : `YOUTUBE (${counts.youtube})`
            const active = activeKinds.has(k)
            const disabled = counts[k] === 0
            return (
              <button
                key={k}
                type="button"
                onClick={() => toggleKind(k)}
                disabled={disabled}
                className={`h-[30px] px-3 border-2 border-[var(--ink)] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed ${
                  active ? 'bg-[var(--red)] text-white' : 'bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)]'
                }`}
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px' }}
                aria-pressed={active}
                title={active
                  ? (es ? 'Click para quitar de la selección' : 'Click to remove from selection')
                  : (es ? 'Click para añadir a la selección' : 'Click to add to selection')}
              >
                {label}
              </button>
            )
          })}
        </div>
      )}

      {tracks.length > 0 && yearBounds && yearRange ? (
        <div className="mb-4 p-3 border-[3px] border-[var(--ink)] bg-[var(--paper-dark)]">
          <YearRangeSlider
            bounds={yearBounds}
            value={yearRange}
            onChange={setYearRange}
            es={es}
          />
        </div>
      ) : null}

      {tracks.length === 0 ? (
        <div className="p-5 border-4 border-[var(--ink)] bg-[var(--paper-dark)]">
          <p className="mb-2" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px', textTransform: 'uppercase' }}>
            {isShared
              ? (es ? 'Lista vacía' : 'Empty list')
              : (es ? 'Aún no has guardado ningún track' : 'No saved tracks yet')}
          </p>
          <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)', fontSize: '14px', lineHeight: 1.6 }}>
            {isShared
              ? (es ? 'Este usuario todavía no ha guardado ningún track.' : 'This user has not saved any tracks yet.')
              : (es
                ? 'Abre la página de charts y pulsa el botón «+» en los tracks que quieras guardar.'
                : 'Open the charts page and press the "+" button on any track you want to save.')}
          </p>
          {!isShared ? (
            <Link
              href={`/${lang}/charts`}
              className="inline-block mt-3 bg-[var(--ink)] text-[var(--yellow)] no-underline hover:bg-[var(--red)] hover:text-white transition-colors"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '1px', padding: '6px 14px' }}
            >
              {es ? '▶ IR A CHARTS' : '▶ GO TO CHARTS'}
            </Link>
          ) : null}
        </div>
      ) : sorted.length === 0 ? (
        <p style={{ fontFamily: "'Special Elite', monospace", color: 'var(--dim)' }}>
          {es ? 'Nada guardado en esta categoría todavía.' : 'Nothing saved in this category yet.'}
        </p>
      ) : (
        <>
          {(() => {
            const isFiltered = sorted.length < tracks.length
            const audioN = orderedAudioQueue.length
            const hasAudio = audioN > 0
            const clearFilters = () => {
              setActiveKinds(new Set(ALL_PLAYBACK_KINDS))
              if (yearBounds) setYearRange([yearBounds.min, yearBounds.max])
            }
            // La barra se muestra siempre que haya algo que controlar: pistas
            // con audio reproducible, o filtros activos aunque no haya audio
            // (para que el usuario siempre pueda pulsar LIMPIAR).
            if (!hasAudio && !isFiltered) return null
            return (
              <div
                className={`mb-2 px-3 py-2 border-[3px] border-[var(--ink)] flex items-center justify-between gap-3 flex-wrap ${
                  isFiltered ? 'bg-[var(--yellow)] text-[var(--ink)]' : 'bg-[var(--paper-dark)] text-[var(--ink)]'
                }`}
                style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px' }}
                role="status"
                aria-live="polite"
              >
                <span className="shrink-0">
                  {isFiltered
                    ? `${es ? 'FILTRADAS' : 'FILTERED'} (${sorted.length} / ${tracks.length})`
                    : `${es ? 'TODAS' : 'ALL'} (${tracks.length})`}
                </span>
                <div className="flex items-center gap-2 flex-wrap">
                  {hasAudio ? (
                    isGroupActive ? (
                      <button
                        type="button"
                        onClick={stopAll}
                        className="inline-flex items-center gap-1.5 min-h-[32px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--red)] text-white transition-all cursor-pointer whitespace-nowrap"
                        style={{ fontFamily: "'Courier Prime', monospace" }}
                        title={es ? 'Parar reproducción' : 'Stop playback'}
                      >
                        {es ? '■ PARAR' : '■ STOP'}
                      </button>
                    ) : (
                      <>
                        <button
                          type="button"
                          onClick={playAll}
                          className="inline-flex items-center gap-1.5 min-h-[32px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white transition-all cursor-pointer whitespace-nowrap"
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                          title={isFiltered
                            ? (es ? 'Reproducir las filtradas en orden' : 'Play filtered tracks in order')
                            : (es ? 'Reproducir todas en orden' : 'Play all in order')}
                        >
                          {isFiltered
                            ? `▶ ${es ? 'PLAY FILTRADAS' : 'PLAY FILTERED'} (${audioN})`
                            : `▶ ${es ? 'PLAY ALL' : 'PLAY ALL'} (${audioN})`}
                        </button>
                        <button
                          type="button"
                          onClick={playShuffle}
                          className="inline-flex items-center gap-1.5 min-h-[32px] px-3 text-[11px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--uv)] text-white hover:bg-[var(--ink)] hover:text-[var(--yellow)] transition-all cursor-pointer whitespace-nowrap"
                          style={{ fontFamily: "'Courier Prime', monospace" }}
                          title={isFiltered
                            ? (es ? 'Aleatorio sobre las filtradas' : 'Shuffle filtered tracks')
                            : (es ? 'Reproducir aleatorio' : 'Play shuffled')}
                        >
                          {`⇄ ${es ? 'ALEATORIO' : 'SHUFFLE'} (${audioN})`}
                        </button>
                      </>
                    )
                  ) : isFiltered ? (
                    <span className="text-[10px] text-[var(--ink)]/60" style={{ letterSpacing: '1px' }}>
                      {es ? 'SIN AUDIO REPRODUCIBLE' : 'NO PLAYABLE AUDIO'}
                    </span>
                  ) : null}
                  {isFiltered ? (
                    <button
                      type="button"
                      onClick={clearFilters}
                      className="h-[32px] px-2.5 border-2 border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--yellow)] transition-colors cursor-pointer"
                      style={{ fontSize: '10px', letterSpacing: '1px' }}
                      title={es ? 'Limpiar filtros' : 'Clear filters'}
                    >
                      {es ? '✕ LIMPIAR' : '✕ CLEAR'}
                    </button>
                  ) : null}
                </div>
              </div>
            )
          })()}
          <div className="border-4 border-[var(--ink)] bg-[var(--paper)]">
          {sorted.map((t) => {
            const isCurrent = activeRowKey === t.key
            const isPausedHere = isCurrent && !previewPlaying
            const ytId = (t.source === 'vinyl' || t.youtube_url) ? extractYouTubeId(t.youtube_url || '') : null
            const hasAudio = !!(t.sample_url || (t.platform === 'bandcamp' && t.external_url))
            const releaseDisp = formatTrackReleaseDisplay(t.release_date, t.year)

            return (
              <div key={t.key} className={`flex flex-col gap-3 py-3 sm:py-4 px-3 sm:px-5 border-b-[3px] transition-colors ${isCurrent ? 'bg-[var(--red)]/15 border-[var(--red)]/30' : 'border-[var(--ink)]/10 hover:bg-[var(--yellow)]/10'}`}>
                <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
                  <div className="flex items-start gap-3 min-w-0 flex-1">
                    {t.artwork_url ? (
                      <div className="shrink-0 w-14 h-14 sm:w-16 sm:h-16 border-[3px] border-[var(--ink)] overflow-hidden bg-[var(--paper-dark)] relative">
                        <Image src={t.artwork_url} alt="" fill className="object-cover" sizes="(max-width: 640px) 56px, 64px" unoptimized={false} />
                      </div>
                    ) : null}

                    <div className="flex-1 min-w-0">
                      <h3 className="text-sm sm:text-base font-black leading-snug sm:leading-tight sm:truncate" style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}>
                        {t.title}
                        {t.mix_name ? <span className="font-normal text-xs text-[var(--ink)]/50 ml-1.5">{t.mix_name}</span> : null}
                      </h3>
                      <p className="text-xs sm:text-sm mt-0.5 break-words" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        <span className="text-[var(--ink)]/70">{t.artists || '—'}</span>
                        {t.label ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/50">{t.label}</span></> : null}
                        {releaseDisp ? <><span className="mx-1.5 text-[var(--ink)]/30">|</span><span className="text-[var(--ink)]/45 font-bold tabular-nums whitespace-nowrap">{releaseDisp}</span></> : null}
                      </p>
                      {t.note ? (
                        <p className="text-xs text-[var(--ink)]/55 mt-1 leading-relaxed" style={{ fontFamily: "'Courier Prime', monospace" }}>{t.note}</p>
                      ) : null}
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 w-full sm:w-auto sm:shrink-0 sm:justify-end sm:self-center sm:gap-2">
                    {hasAudio ? (
                      <button
                        type="button"
                        onClick={() => playTrackInOrdered(t)}
                        className={`h-[36px] px-2.5 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] transition-all cursor-pointer
                          ${isCurrent ? 'bg-[var(--red)] text-white' : 'bg-transparent text-[var(--ink)] hover:bg-[var(--yellow)]'}`}
                        style={{ fontFamily: "'Courier Prime', monospace" }}
                        title={isCurrent && !isPausedHere ? (es ? 'Pausar' : 'Pause') : (es ? 'Reproducir' : 'Play')}
                      >
                        {isCurrent && !isPausedHere ? '❚❚' : '▶'}
                      </button>
                    ) : null}
                    {t.bpm ? (
                      <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--uv)] text-white border-2 border-[var(--ink)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        {t.bpm}
                      </span>
                    ) : null}
                    {t.music_key ? (
                      <span className="inline-flex items-center justify-center h-[36px] px-2 text-[10px] font-bold tracking-wider bg-[var(--cyan)] text-white border-2 border-[var(--ink)]" style={{ fontFamily: "'Courier Prime', monospace" }}>
                        {t.music_key}
                      </span>
                    ) : null}
                    {isShared && t.source === 'beatport_top' && (t.external_url || t.canonical_url) ? (
                      /* Lista compartida + Beatport Top 10 del dueño: la track no
                         tiene fila en ninguna tabla de charts (la info vive en
                         `snapshot`). Si usáramos modo ref, al visitante se le
                         guardaría una fila sin snapshot y luego aparecería en
                         blanco en su lista. Usamos modo URL + snapshot para
                         clonar toda la info del dueño a la lista del visitante,
                         igual que hace BeatportTopTracks cuando se guarda por
                         primera vez. */
                      <SaveTrackButton
                        externalUrl={(t.external_url || t.canonical_url) as string}
                        externalTrackId={t.id}
                        snapshot={t.snapshot ?? undefined}
                        canonicalUrl={t.external_url || t.canonical_url || null}
                        lang={lang}
                        size="sm"
                      />
                    ) : (
                      <SaveTrackButton
                        source={t.source}
                        trackId={t.id}
                        /* En la lista compartida, los refs pertenecen al dueño de
                           la lista, no al espectador: pasamos solo el ref primario
                           para que el botón opere sobre la lista del visitante. */
                        relatedRefs={!isShared && t.refs && t.refs.length > 1 ? t.refs : undefined}
                        canonicalUrl={t.external_url || t.youtube_url || t.canonical_url || null}
                        lang={lang}
                        size="sm"
                      />
                    )}
                    {(() => {
                      // Botón compartir por fila — disponible para TODAS las
                      // fuentes, eligiendo el mejor enlace:
                      //   · chart / featured → /charts?play=chart|featured:<uuid>
                      //     (week= opcional; sin ella ChartView localiza la edición).
                      //   · beatport_top → ficha artista/sello ?play=beatport:<id>
                      //   · vinyl → /charts?play=vinyl:<uuid> (Retro Vinyl Picks).
                      //   · beatport_top sin contexto / id → último recurso: Beatport.
                      const shareTitle = `${t.title}${t.artists ? ` — ${t.artists}` : ''}`
                      if (t.source === 'chart' || t.source === 'featured') {
                        return (
                          <TrackShareButton
                            path={buildTrackSharePath(lang as Locale, t.source, t.id, t.week_date ?? null)}
                            lang={lang as Locale}
                            shareTitle={shareTitle}
                          />
                        )
                      }
                      if (t.source === 'beatport_top') {
                        const snap = t.snapshot
                        const origin = snap?.origin
                        const bpUrl =
                          (typeof snap?.beatport_url === 'string' && snap.beatport_url) ||
                          t.external_url ||
                          t.canonical_url
                        const bpId = extractBeatportTrackId(bpUrl)
                        if (
                          origin?.kind &&
                          origin.slug &&
                          bpId &&
                          (origin.kind === 'artist' || origin.kind === 'label')
                        ) {
                          const folder = origin.kind === 'artist' ? 'artists' : 'labels'
                          const path = buildBeatportSharePath(
                            `/${lang}/${folder}/${origin.slug}`,
                            bpId,
                          )
                          return (
                            <TrackShareButton
                              path={path}
                              lang={lang as Locale}
                              shareTitle={shareTitle}
                            />
                          )
                        }
                      }
                      if (t.source === 'vinyl') {
                        return (
                          <TrackShareButton
                            path={buildVinylSharePath(lang as Locale, t.id)}
                            lang={lang as Locale}
                            shareTitle={shareTitle}
                          />
                        )
                      }
                      const externalUrl = (t.external_url || t.canonical_url || '').trim()
                      if (t.source !== 'beatport_top' || !externalUrl) return null
                      return (
                        <TrackShareButton
                          externalUrl={externalUrl}
                          lang={lang as Locale}
                          shareTitle={shareTitle}
                        />
                      )
                    })()}
                    {t.external_url ? (
                      <a
                        href={t.external_url} target="_blank" rel="noopener noreferrer"
                        className="inline-flex items-center justify-center h-[36px] px-2.5 text-[10px] font-black tracking-wider border-2 border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)] hover:bg-[var(--red)] hover:text-white transition-all no-underline whitespace-nowrap"
                        style={{ fontFamily: "'Courier Prime', monospace" }}
                      >
                        {t.external_label || (es ? 'ABRIR' : 'OPEN')}
                      </a>
                    ) : null}
                  </div>
                </div>

                {/* YouTube embed for vinyls */}
                {ytId ? (
                  <div className="w-full max-w-sm">
                    <LazyYouTubeEmbed
                      videoId={ytId}
                      title={`${t.title} — ${t.artists}`}
                      className="border-[3px] border-[var(--ink)]"
                    />
                  </div>
                ) : null}
              </div>
            )
          })}
          </div>
        </>
      )}

      {/* La barra flotante de now-playing la monta `DeckAudioProvider` en
          modo `preview` para que el audio persista al navegar entre rutas. */}
    </div>
  )
}
