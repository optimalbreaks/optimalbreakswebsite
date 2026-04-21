// ============================================
// OPTIMAL BREAKS — User Hooks
// Favorites, sightings, attendance, ratings
// ============================================

'use client'

import { useCallback, useEffect, useState } from 'react'
import { createBrowserSupabase } from '@/lib/supabase'
import { useAuth } from '@/components/AuthProvider'
import type { ProfileRow, BreakbeatProfileRow, BreakbeatProfileStats } from '@/types/database'

// Tipos manuales: Insert/Omit no encajan con `GenericTable` de supabase-js → mutaciones inferidas como `never`; el runtime es correcto.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const supabase: any = createBrowserSupabase()

// =============================================
// FAVORITE ARTISTS
// =============================================
export function useFavoriteArtists() {
  const { user } = useAuth()
  const [favorites, setFavorites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) { setFavorites([]); setLoading(false); return }
    const { data } = await supabase.from('favorite_artists').select('artist_id').eq('user_id', user.id)
    setFavorites(data?.map((d: any) => d.artist_id) || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const toggle = async (artistId: string) => {
    if (!user) return
    if (favorites.includes(artistId)) {
      await supabase.from('favorite_artists').delete().eq('user_id', user.id).eq('artist_id', artistId)
      setFavorites((f) => f.filter((id) => id !== artistId))
    } else {
      await supabase.from('favorite_artists').insert({ user_id: user.id, artist_id: artistId })
      setFavorites((f) => [...f, artistId])
    }
  }

  return { favorites, loading, toggle, isFavorite: (id: string) => favorites.includes(id), refetch: fetch }
}

// =============================================
// FAVORITE LABELS
// =============================================
export function useFavoriteLabels() {
  const { user } = useAuth()
  const [favorites, setFavorites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) { setFavorites([]); setLoading(false); return }
    const { data } = await supabase.from('favorite_labels').select('label_id').eq('user_id', user.id)
    setFavorites(data?.map((d: any) => d.label_id) || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const toggle = async (labelId: string) => {
    if (!user) return
    if (favorites.includes(labelId)) {
      await supabase.from('favorite_labels').delete().eq('user_id', user.id).eq('label_id', labelId)
      setFavorites((f) => f.filter((id) => id !== labelId))
    } else {
      await supabase.from('favorite_labels').insert({ user_id: user.id, label_id: labelId })
      setFavorites((f) => [...f, labelId])
    }
  }

  return { favorites, loading, toggle, isFavorite: (id: string) => favorites.includes(id), refetch: fetch }
}

// =============================================
// SAVED MIXES
// =============================================
export function useSavedMixes() {
  const { user } = useAuth()
  const [saved, setSaved] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) { setSaved([]); setLoading(false); return }
    const { data } = await supabase.from('saved_mixes').select('mix_id').eq('user_id', user.id)
    setSaved(data?.map((d: any) => d.mix_id) || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const toggle = async (mixId: string) => {
    if (!user) return
    if (saved.includes(mixId)) {
      await supabase.from('saved_mixes').delete().eq('user_id', user.id).eq('mix_id', mixId)
      setSaved((s) => s.filter((id) => id !== mixId))
    } else {
      await supabase.from('saved_mixes').insert({ user_id: user.id, mix_id: mixId })
      setSaved((s) => [...s, mixId])
    }
  }

  return { saved, loading, toggle, isSaved: (id: string) => saved.includes(id), refetch: fetch }
}

// =============================================
// FAVORITE EVENTS (corazón; independiente de event_attendance)
// =============================================
export function useFavoriteEvents() {
  const { user } = useAuth()
  const [favorites, setFavorites] = useState<string[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) { setFavorites([]); setLoading(false); return }
    const { data } = await supabase.from('favorite_events').select('event_id').eq('user_id', user.id)
    setFavorites(data?.map((d: any) => d.event_id) || [])
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const toggle = async (eventId: string) => {
    if (!user) return
    if (favorites.includes(eventId)) {
      await supabase.from('favorite_events').delete().eq('user_id', user.id).eq('event_id', eventId)
      setFavorites((f) => f.filter((id) => id !== eventId))
    } else {
      await supabase.from('favorite_events').insert({ user_id: user.id, event_id: eventId })
      setFavorites((f) => [...f, eventId])
    }
  }

  return { favorites, loading, toggle, isFavorite: (id: string) => favorites.includes(id), refetch: fetch }
}

// =============================================
// EVENT ATTENDANCE
// =============================================
type AttendanceStatus = 'wishlist' | 'attending' | 'attended' | null

export function useEventAttendance() {
  const { user } = useAuth()
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({})
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) { setAttendance({}); setLoading(false); return }
    const { data } = await supabase.from('event_attendance').select('event_id, status').eq('user_id', user.id)
    const map: Record<string, AttendanceStatus> = {}
    data?.forEach((d: any) => { map[d.event_id] = d.status })
    setAttendance(map)
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const setStatus = async (eventId: string, status: AttendanceStatus) => {
    if (!user) return
    if (status === null) {
      await supabase.from('event_attendance').delete().eq('user_id', user.id).eq('event_id', eventId)
      setAttendance((a) => { const n = { ...a }; delete n[eventId]; return n })
    } else {
      await supabase.from('event_attendance').upsert(
        { user_id: user.id, event_id: eventId, status },
        { onConflict: 'user_id,event_id' }
      )
      setAttendance((a) => ({ ...a, [eventId]: status }))
    }
  }

  return { attendance, loading, setStatus, getStatus: (id: string): AttendanceStatus => attendance[id] || null, refetch: fetch }
}

// =============================================
// ARTIST SIGHTINGS
// =============================================
export interface Sighting {
  id: string
  artist_id: string
  seen_at: string | null
  venue: string
  city: string
  country: string
  event_name: string
  notes: string
  rating: number
  /** Rellenado al listar (join vía segunda query) */
  artist_name?: string
  artist_slug?: string
}

export function useArtistSightings() {
  const { user } = useAuth()
  const [sightings, setSightings] = useState<Sighting[]>([])
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) { setSightings([]); setLoading(false); return }
    const { data } = await supabase.from('artist_sightings').select('*').eq('user_id', user.id).order('created_at', { ascending: false })
    const rows = (data as Sighting[]) || []
    const artistIds = Array.from(new Set(rows.map((r) => r.artist_id).filter(Boolean)))
    const nameById: Record<string, { name: string; slug: string }> = {}
    if (artistIds.length) {
      const { data: artists } = await supabase.from('artists').select('id, name, slug').in('id', artistIds)
      artists?.forEach((a: { id: string; name: string; slug: string }) => {
        nameById[a.id] = { name: a.name, slug: a.slug }
      })
    }
    setSightings(
      rows.map((r) => ({
        ...r,
        artist_name: nameById[r.artist_id]?.name,
        artist_slug: nameById[r.artist_id]?.slug,
      }))
    )
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const add = async (sighting: Omit<Sighting, 'id'>) => {
    if (!user) return false
    const payload = {
      user_id: user.id,
      artist_id: sighting.artist_id,
      seen_at: sighting.seen_at || null,
      venue: sighting.venue ?? '',
      city: sighting.city ?? '',
      country: sighting.country ?? '',
      event_name: sighting.event_name ?? '',
      notes: sighting.notes ?? '',
      rating: sighting.rating,
    }
    const { error } = await supabase.from('artist_sightings').insert(payload)
    if (error) {
      console.error('[artist_sightings insert]', error)
      return false
    }
    await fetch()
    return true
  }

  const remove = async (id: string) => {
    if (!user) return
    await supabase.from('artist_sightings').delete().eq('id', id).eq('user_id', user.id)
    setSightings((s) => s.filter((sight) => sight.id !== id))
  }

  return { sightings, loading, add, remove, refetch: fetch }
}

// =============================================
// EVENT RATINGS
// =============================================
export type EventRatingSummary = {
  rating: number
  review: string
  attended_at: string | null
  venue: string
  city: string
  country: string
}

export type EventRatingSave = {
  rating: number
  review?: string
  attended_at?: string | null
  venue?: string
  city?: string
  country?: string
}

export function useEventRatings() {
  const { user } = useAuth()
  const [ratings, setRatings] = useState<Record<string, EventRatingSummary>>({})
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) { setRatings({}); setLoading(false); return }
    const { data } = await supabase
      .from('event_ratings')
      .select('event_id, rating, review, attended_at, venue, city, country')
      .eq('user_id', user.id)
    const map: Record<string, EventRatingSummary> = {}
    data?.forEach((d: any) => {
      map[d.event_id] = {
        rating: d.rating,
        review: d.review || '',
        attended_at: d.attended_at ?? null,
        venue: d.venue || '',
        city: d.city || '',
        country: d.country || '',
      }
    })
    setRatings(map)
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const rate = async (eventId: string, data: EventRatingSave) => {
    if (!user) return { error: new Error('Not signed in') }
    const payload = {
      user_id: user.id,
      event_id: eventId,
      rating: data.rating,
      review: data.review ?? '',
      attended_at: data.attended_at?.trim() ? data.attended_at.trim() : null,
      venue: data.venue ?? '',
      city: data.city ?? '',
      country: data.country ?? '',
    }
    const { error } = await supabase.from('event_ratings').upsert(payload, { onConflict: 'user_id,event_id' })
    if (error) return { error: new Error(error.message) }
    setRatings((r) => ({
      ...r,
      [eventId]: {
        rating: payload.rating,
        review: payload.review,
        attended_at: payload.attended_at,
        venue: payload.venue,
        city: payload.city,
        country: payload.country,
      },
    }))
    return { error: null }
  }

  return { ratings, loading, rate, getRating: (id: string) => ratings[id] || null, refetch: fetch }
}

// =============================================
// UNIFIED FAVORITE TOGGLE
// Single hook for FavoriteButton across all entity types
// =============================================
export type FavoriteType = 'artist' | 'label' | 'event' | 'mix'

const FAV_CONFIG: Record<FavoriteType, { table: string; column: string }> = {
  artist: { table: 'favorite_artists', column: 'artist_id' },
  label: { table: 'favorite_labels', column: 'label_id' },
  event: { table: 'favorite_events', column: 'event_id' },
  mix: { table: 'saved_mixes', column: 'mix_id' },
}

export function useFavoriteToggle(type: FavoriteType, entityId: string) {
  const { user } = useAuth()
  const [isFavorite, setIsFavorite] = useState(false)
  const [loading, setLoading] = useState(true)
  const cfg = FAV_CONFIG[type]

  useEffect(() => {
    let cancelled = false
    const check = async () => {
      if (!user || !entityId) { setIsFavorite(false); setLoading(false); return }

      const { count } = await supabase
        .from(cfg.table)
        .select('*', { count: 'exact', head: true })
        .eq('user_id', user.id)
        .eq(cfg.column, entityId)
      if (!cancelled) setIsFavorite((count ?? 0) > 0)
      if (!cancelled) setLoading(false)
    }
    check()
    return () => { cancelled = true }
  }, [user, entityId, type, cfg.table, cfg.column])

  const toggle = useCallback(async () => {
    if (!user || !entityId) return

    if (isFavorite) {
      await supabase.from(cfg.table).delete().eq('user_id', user.id).eq(cfg.column, entityId)
      setIsFavorite(false)
    } else {
      await supabase.from(cfg.table).insert({ user_id: user.id, [cfg.column]: entityId })
      setIsFavorite(true)
    }
  }, [user, entityId, isFavorite, type, cfg.table, cfg.column])

  return { isFavorite, loading, toggle, isLoggedIn: !!user }
}

// =============================================
// SAVED CHART TRACKS  (polymorphic: chart | featured | vinyl | beatport_top)
// Stored in saved_chart_tracks (migraciones 053 + 054).
// =============================================
export type ChartTrackSource = 'chart' | 'featured' | 'vinyl' | 'beatport_top'

import type { SavedChartTrackSnapshot } from '@/types/database'

export interface SavedChartTrackRef {
  track_source: ChartTrackSource
  track_id: string
  canonical_url?: string | null
  snapshot?: SavedChartTrackSnapshot | null
  created_at?: string
}

function makeKey(source: ChartTrackSource, id: string) {
  return `${source}:${id}`
}

// Normaliza URLs para comparar canónicamente entre fuentes distintas.
// Para YouTube usamos el ID de vídeo (el `watch?v=…` queda en el querystring
// y un simple `host + pathname` colapsaría todos los vídeos en la misma clave).
function normalizeCanonicalUrl(u: string | null | undefined): string {
  const s = (u || '').trim().toLowerCase()
  if (!s) return ''
  const ytMatch = s.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-z0-9_-]{11})/i,
  )
  if (ytMatch) return `yt:${ytMatch[1]}`
  try {
    const url = new URL(s)
    return `${url.host}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return s.replace(/[?#].*$/, '').replace(/\/$/, '')
  }
}

// =============================================
// Store compartido a nivel módulo para saved_chart_tracks.
// Cada instancia de `useSavedChartTracks()` lee/escribe de este único store,
// así todas las filas de la página (muchísimas en /charts, por ejemplo) se
// mantienen sincronizadas sin hacer un round-trip a Supabase por cada render.
// Cuando una instancia muta el estado (toggle/toggleGroup/toggleGroupRefs),
// se notifica a todas las demás para que repinten al instante.
// =============================================
let savedChartTracksCache: SavedChartTrackRef[] = []
let savedChartTracksUserId: string | null = null
const savedChartTracksListeners = new Set<(rows: SavedChartTrackRef[]) => void>()

function setSavedChartTracksCache(
  next: SavedChartTrackRef[] | ((prev: SavedChartTrackRef[]) => SavedChartTrackRef[]),
) {
  savedChartTracksCache =
    typeof next === 'function'
      ? (next as (prev: SavedChartTrackRef[]) => SavedChartTrackRef[])(savedChartTracksCache)
      : next
  savedChartTracksListeners.forEach((l) => l(savedChartTracksCache))
}

export function useSavedChartTracks() {
  const { user } = useAuth()
  const [saved, setSaved] = useState<SavedChartTrackRef[]>(savedChartTracksCache)
  const [loading, setLoading] = useState(true)

  // Suscripción al store: cada cambio global propaga el nuevo array a este hook.
  useEffect(() => {
    const listener = (rows: SavedChartTrackRef[]) => setSaved(rows)
    savedChartTracksListeners.add(listener)
    return () => { savedChartTracksListeners.delete(listener) }
  }, [])

  const fetch = useCallback(async () => {
    if (!user) {
      savedChartTracksUserId = null
      setSavedChartTracksCache([])
      setLoading(false)
      return
    }
    const { data } = await supabase
      .from('saved_chart_tracks')
      .select('track_source, track_id, canonical_url, snapshot, created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
    savedChartTracksUserId = user.id
    setSavedChartTracksCache((data as SavedChartTrackRef[]) || [])
    setLoading(false)
  }, [user])

  useEffect(() => {
    // Solo refetch de red si cambia el usuario; si ya tenemos cache válida,
    // nos basta con suscribirnos. Evita "loading…" y parpadeos entre rutas.
    if (user && user.id === savedChartTracksUserId) {
      setSaved(savedChartTracksCache)
      setLoading(false)
      return
    }
    fetch()
  }, [fetch, user])

  const savedSet = new Set(saved.map((s) => makeKey(s.track_source, s.track_id)))

  // Set de URLs canónicas de todos los saves del usuario (cualquier fuente).
  // Se usa para mostrar en verde un botón "+" cuyo Beatport URL coincida con
  // una canción ya guardada desde otra lista (p.ej. 40 Breaks Vitales vs
  // Beatport Top 10 de un artista).
  const savedUrlSet = new Set(
    saved
      .map((s) => normalizeCanonicalUrl(s.canonical_url))
      .filter((s): s is string => !!s),
  )

  const isSaved = (source: ChartTrackSource, id: string) => savedSet.has(makeKey(source, id))

  const isSavedByUrl = (url: string | null | undefined) => {
    const key = normalizeCanonicalUrl(url)
    return !!key && savedUrlSet.has(key)
  }

  const toggle = async (
    source: ChartTrackSource,
    id: string,
    canonicalUrl?: string | null,
  ) => {
    if (!user || !id) return
    if (isSaved(source, id)) {
      await supabase
        .from('saved_chart_tracks')
        .delete()
        .eq('user_id', user.id)
        .eq('track_source', source)
        .eq('track_id', id)
      setSavedChartTracksCache((s) => s.filter((r) => !(r.track_source === source && r.track_id === id)))
    } else {
      const insert: Record<string, unknown> = { user_id: user.id, track_source: source, track_id: id }
      if (canonicalUrl) insert.canonical_url = canonicalUrl
      const { data } = await supabase
        .from('saved_chart_tracks')
        .insert(insert)
        .select('track_source, track_id, canonical_url, snapshot, created_at')
        .single()
      const row = (data as SavedChartTrackRef | null) || {
        track_source: source,
        track_id: id,
        canonical_url: canonicalUrl ?? null,
      }
      setSavedChartTracksCache((s) => [row, ...s])
    }
  }

  // Considera guardado el grupo si CUALQUIER id del grupo está guardado.
  // Útil para tracks que aparecen en varias semanas (misma URL canónica).
  const isAnySaved = (source: ChartTrackSource, ids: string[]) =>
    ids.some((id) => savedSet.has(makeKey(source, id)))

  // Alterna todo un grupo canónico (distintos id que representan la misma
  // canción). Al desmarcar borra todas las filas del grupo en una sola
  // sentencia. Al marcar inserta solo `primaryId` (el de la fila visible).
  const toggleGroup = async (
    source: ChartTrackSource,
    primaryId: string,
    groupIds: string[],
  ) => {
    if (!user || !primaryId) return
    const ids = groupIds.length ? groupIds : [primaryId]
    if (isAnySaved(source, ids)) {
      await supabase
        .from('saved_chart_tracks')
        .delete()
        .eq('user_id', user.id)
        .eq('track_source', source)
        .in('track_id', ids)
      setSavedChartTracksCache((s) => s.filter((r) => !(r.track_source === source && ids.includes(r.track_id))))
    } else {
      await toggle(source, primaryId)
    }
  }

  // ---- Variante polimórfica (refs con fuente + id) ----
  // La misma canción puede aparecer en distintas fuentes (p.ej. mismo Beatport
  // URL presente como fila en `chart_tracks` y en `chart_featured_tracks`).
  // Estas funciones permiten tratar esa mezcla como un único grupo: marcarla
  // desde cualquier fuente la deja marcada en todas y, al desmarcar, se borran
  // todas las filas guardadas del grupo.
  type Ref = { source: ChartTrackSource; id: string }

  const isAnySavedRefs = (refs: Ref[]) =>
    refs.some((r) => savedSet.has(makeKey(r.source, r.id)))

  const toggleGroupRefs = async (
    primary: Ref,
    refs: Ref[],
    canonicalUrl?: string | null,
  ) => {
    if (!user || !primary.id) return
    const group = refs.length ? refs : [primary]
    if (isAnySavedRefs(group)) {
      // Borrar por fuente: agrupamos por source y hacemos una sentencia por
      // cada una (habitualmente 1-2 fuentes, nunca más de 3).
      const bySource = new Map<ChartTrackSource, string[]>()
      for (const r of group) {
        const arr = bySource.get(r.source) || []
        arr.push(r.id)
        bySource.set(r.source, arr)
      }
      await Promise.all(
        Array.from(bySource.entries()).map(([src, ids]) =>
          supabase
            .from('saved_chart_tracks')
            .delete()
            .eq('user_id', user.id)
            .eq('track_source', src)
            .in('track_id', ids)
        )
      )
      setSavedChartTracksCache((s) =>
        s.filter((row) => {
          const ids = bySource.get(row.track_source as ChartTrackSource)
          return !(ids && ids.includes(row.track_id))
        })
      )
    } else {
      await toggle(primary.source, primary.id, canonicalUrl ?? null)
    }
  }

  // ---- Variante por URL canónica (beatport_top y otros sin id de tabla) ----
  // Si CUALQUIER save ya coincide por URL canónica con `url`, se borran todos
  // (cross-source). Si no, se inserta una fila con source='beatport_top' y
  // `track_id` = id provisto (p.ej. beatport_id numérico en texto) o la URL.
  const toggleByUrl = async (
    url: string,
    opts: {
      trackId?: string
      snapshot?: SavedChartTrackSnapshot
    } = {},
  ) => {
    if (!user || !url) return
    const normalized = normalizeCanonicalUrl(url)
    if (!normalized) return

    // Buscar TODAS las filas cuya URL canónica normalizada coincide, sin
    // importar la fuente. Un insert por URL coincidente es un borrado total.
    const matching = saved.filter(
      (r) => !!r.canonical_url && normalizeCanonicalUrl(r.canonical_url) === normalized,
    )

    if (matching.length > 0) {
      // Desmarca cross-source: borramos por pares (source, track_id) de todo
      // lo que comparte la misma URL canónica.
      const bySource = new Map<ChartTrackSource, string[]>()
      for (const r of matching) {
        const arr = bySource.get(r.track_source) || []
        arr.push(r.track_id)
        bySource.set(r.track_source, arr)
      }
      await Promise.all(
        Array.from(bySource.entries()).map(([src, ids]) =>
          supabase
            .from('saved_chart_tracks')
            .delete()
            .eq('user_id', user.id)
            .eq('track_source', src)
            .in('track_id', ids),
        ),
      )
      setSavedChartTracksCache((s) =>
        s.filter((row) => {
          const ids = bySource.get(row.track_source)
          return !(ids && ids.includes(row.track_id))
        }),
      )
      return
    }

    // Insertar como beatport_top con snapshot. track_id = beatport numeric id
    // o fallback a la URL normalizada (sirve de clave única).
    const track_id = opts.trackId || normalized
    const insert = {
      user_id: user.id,
      track_source: 'beatport_top' as const,
      track_id,
      canonical_url: url,
      snapshot: opts.snapshot ?? null,
    }
    const { data } = await supabase
      .from('saved_chart_tracks')
      .insert(insert)
      .select('track_source, track_id, canonical_url, snapshot, created_at')
      .single()
    const row =
      (data as SavedChartTrackRef | null) ||
      {
        track_source: 'beatport_top' as ChartTrackSource,
        track_id,
        canonical_url: url,
        snapshot: opts.snapshot ?? null,
      }
    setSavedChartTracksCache((s) => [row, ...s])
  }

  return {
    saved,
    loading,
    isSaved,
    isSavedByUrl,
    isAnySaved,
    isAnySavedRefs,
    toggle,
    toggleGroup,
    toggleGroupRefs,
    toggleByUrl,
    refetch: fetch,
  }
}

export type SavedChartTrackGroupRef = { source: ChartTrackSource; id: string }

// =============================================
// USER PROFILE
// =============================================
export type UserProfile = ProfileRow

export function useProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<UserProfile | null>(null)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return }
    const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
    setProfile(data as UserProfile | null)
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const update = async (updates: Partial<Omit<ProfileRow, 'id'>>) => {
    if (!user) return
    const { data } = await supabase.from('profiles').update(updates).eq('id', user.id).select().single()
    if (data) setProfile(data as UserProfile)
  }

  return { profile, loading, update, refetch: fetch }
}

// =============================================
// BREAKBEAT PROFILE (DNA analysis)
// =============================================
export function useBreakbeatProfile() {
  const { user } = useAuth()
  const [profile, setProfile] = useState<BreakbeatProfileRow | null>(null)
  const [loading, setLoading] = useState(true)
  const [generating, setGenerating] = useState(false)

  const fetch = useCallback(async () => {
    if (!user) { setProfile(null); setLoading(false); return }
    const { data } = await supabase
      .from('breakbeat_profiles')
      .select('*')
      .eq('user_id', user.id)
      .single()
    setProfile(data as BreakbeatProfileRow | null)
    setLoading(false)
  }, [user])

  useEffect(() => { fetch() }, [fetch])

  const save = async (row: {
    stats: BreakbeatProfileStats
    analysis_text_en: string
    analysis_text_es: string
    archetype_en: string
    archetype_es: string
    input_hash: string
    generated_by: 'rules' | 'openai' | 'manual'
  }) => {
    if (!user) return
    const payload = { user_id: user.id, ...row }
    const { data } = await supabase
      .from('breakbeat_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()
    if (data) setProfile(data as BreakbeatProfileRow)
  }

  return { profile, loading, generating, setGenerating, save, refetch: fetch }
}
