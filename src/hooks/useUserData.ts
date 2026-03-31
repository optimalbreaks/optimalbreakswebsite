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
