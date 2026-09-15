// ============================================
// OPTIMAL BREAKS — Almas Gemelas (Soulmates)
// ----------------------------------------------
// Endpoint AUTENTICADO. Calcula on-demand el top de usuarios con mayor
// afinidad respecto al usuario actual cruzando los saves polimórficos de
// `saved_chart_tracks` (chart | featured | vinyl | beatport_top) por
// "clave canónica" (URL normalizada de la canción) — la misma normalización
// que ya usamos en `/api/admin/tracks` y `useUserData.ts`.
//
// Métrica:
//   - Jaccard(self, other) = |intersection| / |union|
//
// Filtros (anti-trolls / privacidad):
//   - El propio usuario debe tener `is_tracks_public = TRUE`. Si no, se
//     devuelve un 200 con `disabled: true` (la UI muestra el aviso).
//   - Sólo se consideran candidatos con `is_tracks_public = TRUE`.
//   - Se exigen mínimos: self_count >= MIN_SELF, other_count >= MIN_OTHER,
//     common >= MIN_COMMON.
//   - Auto-voto (fichaje / claim): un tema donde el usuario está acreditado
//     no entra en SU set Jaccard (misma identidad que el Top de artistas).
//     Mis Tracks y el Top 100 de canciones no se tocan. El resto de sus
//     «+» (otros artistas) sí cuentan.
//
// Además devuelve `recommended_tracks`: temas que las almas gemelas tienen
// guardados y el usuario aún no, ordenados por número de almas gemelas que
// los han guardado (con info suficiente para construir un share-link a /charts).
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import { createServiceSupabase, fetchAllRows, selectByIds } from '@/lib/supabase-admin'
import { isArtistSelfCreditSave, loadSelfCreditSkipMap } from '@/lib/artist-self-credit'

type ChartTrackSource = 'chart' | 'featured' | 'vinyl' | 'beatport_top'

// Cálculo on-demand sobre toda la tabla de saves: nunca cachear (por usuario)
// y dar margen a Vercel cuando Supabase va justo de Disk IO (el default de
// 10-15 s cortaba en 504 y la UI se quedaba «cargando»).
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const MIN_SELF = 5
const MIN_OTHER = 3
const MIN_COMMON = 2

const NO_STORE = { 'Cache-Control': 'private, no-store' }

type SavedRow = {
  user_id: string
  track_source: ChartTrackSource
  track_id: string
  canonical_url: string | null
  snapshot: Record<string, unknown> | null
  created_at: string | null
}

type ProfileMini = {
  id: string
  username: string | null
  display_name: string | null
  avatar_url: string | null
  country: string | null
  is_tracks_public: boolean | null
}

type ChartRow = {
  id: string
  chart_edition_id: string | null
  title: string
  mix_name: string | null
  artists: unknown
  label: string | null
  release_year: number | null
  release_date: string | null
  artwork_url: string | null
  beatport_url: string | null
  bpm: number | null
  music_key: string | null
  sample_url: string | null
  spotify_url: string | null
  tidal_url: string | null
}
type FeatRow = {
  id: string
  chart_edition_id: string | null
  title: string
  mix_name: string | null
  artists: unknown
  label: string | null
  release_year: number | null
  release_date: string | null
  artwork_url: string | null
  link_url: string | null
  link_label: string | null
  platform: string | null
  bpm: number | null
  music_key: string | null
  sample_url: string | null
  full_audio_url: string | null
  spotify_url: string | null
  tidal_url: string | null
  note_en: string | null
  note_es: string | null
}
type VinylRow = {
  id: string
  title: string
  mix_name: string | null
  artists: unknown
  label: string | null
  year: number | null
  artwork_url: string | null
  discogs_url: string | null
  youtube_url: string | null
  note_en: string | null
  note_es: string | null
}
type EditionRow = { id: string; week_date: string }

function artistsToString(a: unknown): string {
  if (!Array.isArray(a)) return ''
  return a
    .map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x))
    .filter(Boolean)
    .join(', ')
}

function normalizeUrl(u: string | null | undefined): string {
  const s = (u || '').trim().toLowerCase()
  if (!s) return ''
  const ytMatch = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-z0-9_-]{11})/i)
  if (ytMatch) return `yt:${ytMatch[1]}`
  try {
    const url = new URL(s)
    return `${url.host}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return s.replace(/[?#].*$/, '').replace(/\/$/, '')
  }
}

async function getAuthenticatedUser() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!
  const supabase = createServerClient<Database>(url, key, {
    global: {
      // Auth colgado ≠ petición colgada: 8 s y devolvemos 401/500 con JSON.
      fetch: (input, init) => fetch(input, { ...init, signal: AbortSignal.timeout(8000) }),
    },
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          )
        } catch { /* server component limitation */ }
      },
    },
  })
  const { data: { user } } = await supabase.auth.getUser()
  return { user }
}

interface CanonicalMeta {
  canonical_key: string
  title: string
  mix_name: string | null
  artists: string
  label: string | null
  year: number | null
  release_date: string | null
  artwork_url: string | null
  external_url: string | null
  primary: { source: ChartTrackSource; id: string; week_date: string | null }
  // Campos ricos para que /almas-gemelas pinte cada recomendación como una
  // fila de /tracks (play, info, links, guardar, compartir). Opcionales:
  // vinyl no tiene bpm/sample; beatport_top los saca del snapshot.
  bpm?: number | null
  music_key?: string | null
  sample_url?: string | null
  full_audio_url?: string | null
  spotify_url?: string | null
  tidal_url?: string | null
  platform?: string | null
  link_label?: string | null
  beatport_url?: string | null
  youtube_url?: string | null
  note_en?: string | null
  note_es?: string | null
}

export async function GET(_request: NextRequest) {
  try {
    return await computeSoulmates()
  } catch (e) {
    // Nunca dejar escapar una excepción: la UI espera JSON y un HTML 500 de
    // Vercel la dejaba sin mensaje útil.
    console.error('[OB] soulmates:', e)
    return NextResponse.json(
      { error: e instanceof Error ? e.message : 'Error interno' },
      { status: 500, headers: NO_STORE },
    )
  }
}

async function computeSoulmates() {
  const { user } = await getAuthenticatedUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401, headers: NO_STORE })
  }

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503, headers: NO_STORE })
  }

  // 0) Visibilidad propia. Si el usuario tiene su lista marcada como privada,
  // no calculamos almas gemelas (tampoco aparecerá en los rankings de otros).
  const { data: selfProfile } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, country, is_tracks_public')
    .eq('id', user.id)
    .maybeSingle()
  const self = (selfProfile as ProfileMini | null)
  if (!self || self.is_tracks_public === false) {
    return NextResponse.json({
      disabled: true,
      reason: 'private',
      self: self ? {
        id: self.id,
        username: self.username,
        display_name: self.display_name,
        avatar_url: self.avatar_url,
      } : null,
      soulmates: [],
      recommended_tracks: [],
    }, { headers: NO_STORE })
  }

  // 1) Cargar TODOS los saves de usuarios con lista pública.
  const { data: pubProfiles, error: pubErr } = await sb
    .from('profiles')
    .select('id, username, display_name, avatar_url, country, is_tracks_public')
    .eq('is_tracks_public', true)
  if (pubErr) return NextResponse.json({ error: pubErr.message }, { status: 500, headers: NO_STORE })
  const allowedIds = new Set(((pubProfiles as ProfileMini[] | null) ?? []).map((p) => p.id))
  if (!allowedIds.has(user.id)) allowedIds.add(user.id)

  // Construir mapa de perfiles para enriquecer la respuesta.
  const profileById = new Map<string, ProfileMini>()
  for (const p of ((pubProfiles as ProfileMini[] | null) ?? [])) profileById.set(p.id, p)

  const [{ data: savedData, error: savedErr }, selfCreditSkip] = await Promise.all([
    fetchAllRows<SavedRow>((from, to) =>
      sb
        .from('saved_chart_tracks')
        .select('user_id, track_source, track_id, canonical_url, snapshot, created_at')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    loadSelfCreditSkipMap(sb),
  ])
  if (savedErr) return NextResponse.json({ error: savedErr.message }, { status: 500, headers: NO_STORE })

  const saved = savedData.filter((s) => allowedIds.has(s.user_id) && s.track_source && s.track_id)

  // 2) Catálogo canónico necesario para mapear (source, id) → canonical_key.
  const chartIds = Array.from(new Set(saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)))
  const featIds = Array.from(new Set(saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)))
  const vinylIds = Array.from(new Set(saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)))

  const [chartRes, featRes, vinylRes] = await Promise.all([
    chartIds.length
      ? selectByIds<ChartRow>(chartIds, (chunk) =>
          sb.from('chart_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, artwork_url, beatport_url, bpm, music_key, sample_url, spotify_url, tidal_url').in('id', chunk),
        )
      : Promise.resolve({ data: [] as ChartRow[], error: null }),
    featIds.length
      ? selectByIds<FeatRow>(featIds, (chunk) =>
          sb.from('chart_featured_tracks').select('id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, artwork_url, link_url, link_label, platform, bpm, music_key, sample_url, full_audio_url, spotify_url, tidal_url, note_en, note_es').in('id', chunk),
        )
      : Promise.resolve({ data: [] as FeatRow[], error: null }),
    vinylIds.length
      ? selectByIds<VinylRow>(vinylIds, (chunk) =>
          sb.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url, note_en, note_es').in('id', chunk),
        )
      : Promise.resolve({ data: [] as VinylRow[], error: null }),
  ])

  const editionIdSet = new Set<string>()
  for (const c of (chartRes.data || []) as ChartRow[]) if (c.chart_edition_id) editionIdSet.add(c.chart_edition_id)
  for (const f of (featRes.data || []) as FeatRow[]) if (f.chart_edition_id) editionIdSet.add(f.chart_edition_id)
  const editionIds = Array.from(editionIdSet)
  const editionRes = editionIds.length
    ? await sb.from('chart_editions').select('id, week_date').in('id', editionIds)
    : { data: [] as EditionRow[], error: null }
  const weekByEdition = new Map<string, string>()
  for (const e of ((editionRes.data || []) as EditionRow[])) weekByEdition.set(e.id, e.week_date)

  const metaByRefKey = new Map<string, CanonicalMeta>()
  for (const c of ((chartRes.data || []) as ChartRow[])) {
    const canonical_key = normalizeUrl(c.beatport_url) || `t:chart:${c.id}`
    metaByRefKey.set(`chart:${c.id}`, {
      canonical_key,
      title: c.title,
      mix_name: c.mix_name,
      artists: artistsToString(c.artists),
      label: c.label,
      year: c.release_year,
      release_date: c.release_date,
      artwork_url: c.artwork_url,
      external_url: c.beatport_url,
      primary: { source: 'chart', id: c.id, week_date: c.chart_edition_id ? weekByEdition.get(c.chart_edition_id) || null : null },
      bpm: c.bpm,
      music_key: c.music_key,
      sample_url: c.sample_url,
      spotify_url: c.spotify_url,
      tidal_url: c.tidal_url,
      beatport_url: c.beatport_url,
    })
  }
  for (const f of ((featRes.data || []) as FeatRow[])) {
    const canonical_key = normalizeUrl(f.link_url) || `t:featured:${f.id}`
    metaByRefKey.set(`featured:${f.id}`, {
      canonical_key,
      title: f.title,
      mix_name: f.mix_name,
      artists: artistsToString(f.artists),
      label: f.label,
      year: f.release_year,
      release_date: f.release_date,
      artwork_url: f.artwork_url,
      external_url: f.link_url,
      primary: { source: 'featured', id: f.id, week_date: f.chart_edition_id ? weekByEdition.get(f.chart_edition_id) || null : null },
      bpm: f.bpm,
      music_key: f.music_key,
      sample_url: f.sample_url,
      full_audio_url: f.full_audio_url,
      spotify_url: f.spotify_url,
      tidal_url: f.tidal_url,
      platform: f.platform,
      link_label: f.link_label,
      beatport_url: f.link_url,
      note_en: f.note_en,
      note_es: f.note_es,
    })
  }
  for (const v of ((vinylRes.data || []) as VinylRow[])) {
    const canonical_key = normalizeUrl(v.youtube_url) || `t:vinyl:${v.id}`
    metaByRefKey.set(`vinyl:${v.id}`, {
      canonical_key,
      title: v.title,
      mix_name: v.mix_name,
      artists: artistsToString(v.artists),
      label: v.label,
      year: v.year,
      release_date: null,
      artwork_url: v.artwork_url,
      external_url: v.discogs_url || v.youtube_url,
      primary: { source: 'vinyl', id: v.id, week_date: null },
      youtube_url: v.youtube_url,
      note_en: v.note_en,
      note_es: v.note_es,
    })
  }
  for (const s of saved) {
    if (s.track_source === 'beatport_top') continue
    if (metaByRefKey.has(`${s.track_source}:${s.track_id}`)) continue
    const snap = (s.snapshot || {}) as Record<string, unknown>
    if (!snap || !snap.title) continue
    const snapYoutube = typeof snap.youtube_url === 'string' ? snap.youtube_url.trim() : ''
    const externalUrl = (snap.beatport_url as string | null) || s.canonical_url
    const canonical_key = s.track_source === 'vinyl'
      ? normalizeUrl(snapYoutube || s.canonical_url) || `t:vinyl:${s.track_id}`
      : normalizeUrl(externalUrl as string | null) || `t:${s.track_source}:${s.track_id}`
    const release_date_raw = typeof snap.release_date === 'string' ? snap.release_date.trim().slice(0, 10) : ''
    metaByRefKey.set(`${s.track_source}:${s.track_id}`, {
      canonical_key,
      title: String(snap.title || ''),
      mix_name: (snap.mix_name as string | null) ?? null,
      artists: String(snap.artists || ''),
      label: (snap.label as string | null) ?? null,
      year: typeof snap.year === 'number' ? (snap.year as number) : null,
      release_date: /^\d{4}-\d{2}-\d{2}$/.test(release_date_raw) ? release_date_raw : null,
      artwork_url: (snap.artwork_url as string | null) ?? null,
      external_url: (externalUrl as string | null) ?? null,
      primary: { source: s.track_source, id: s.track_id, week_date: null },
      bpm: typeof snap.bpm === 'number' ? (snap.bpm as number) : null,
      music_key: (snap.music_key as string | null) ?? null,
      sample_url: (snap.sample_url as string | null) ?? null,
      full_audio_url: (snap.full_audio_url as string | null) ?? null,
      spotify_url: (snap.spotify_url as string | null) ?? null,
      tidal_url: (snap.tidal_url as string | null) ?? null,
      platform: (snap.platform as string | null) ?? null,
      beatport_url: (snap.beatport_url as string | null) ?? null,
      youtube_url: snapYoutube || null,
    })
  }

  // Saves "beatport_top" usan snapshot como meta.
  for (const s of saved) {
    if (s.track_source !== 'beatport_top') continue
    if (metaByRefKey.has(`beatport_top:${s.track_id}`)) continue
    const snap = (s.snapshot || {}) as Record<string, unknown>
    const beatport_url = (snap.beatport_url as string | null) || s.canonical_url
    const canonical_key = normalizeUrl(beatport_url) || `t:beatport_top:${s.track_id}`
    const release_date_raw = typeof snap.release_date === 'string' ? snap.release_date.trim().slice(0, 10) : ''
    const release_date_v = /^\d{4}-\d{2}-\d{2}$/.test(release_date_raw) ? release_date_raw : null
    metaByRefKey.set(`beatport_top:${s.track_id}`, {
      canonical_key,
      title: String(snap.title || ''),
      mix_name: (snap.mix_name as string | null) ?? null,
      artists: String(snap.artists || ''),
      label: (snap.label as string | null) ?? null,
      year: typeof snap.year === 'number' ? (snap.year as number) : null,
      release_date: release_date_v,
      artwork_url: (snap.artwork_url as string | null) ?? null,
      external_url: beatport_url,
      primary: { source: 'beatport_top', id: s.track_id, week_date: null },
      bpm: typeof snap.bpm === 'number' ? (snap.bpm as number) : null,
      music_key: (snap.music_key as string | null) ?? null,
      sample_url: (snap.sample_url as string | null) ?? null,
      full_audio_url: (snap.full_audio_url as string | null) ?? null,
      spotify_url: (snap.spotify_url as string | null) ?? null,
      tidal_url: (snap.tidal_url as string | null) ?? null,
      beatport_url: (beatport_url as string | null) ?? null,
    })
  }

  // 3) Construye, por usuario, el set de claves canónicas que tiene guardadas
  // y el "mejor meta" disponible para cada clave (preferimos chart/featured
  // sobre vinyl/beatport_top porque tienen sample y week_date).
  const keysByUser = new Map<string, Set<string>>()
  const metaByKey = new Map<string, CanonicalMeta>()

  function preferMeta(prev: CanonicalMeta | undefined, next: CanonicalMeta): CanonicalMeta {
    if (!prev) return next
    const rank = (m: CanonicalMeta) => {
      if (m.primary.source === 'chart' && m.primary.week_date) return 4
      if (m.primary.source === 'featured' && m.primary.week_date) return 3
      if (m.primary.source === 'vinyl') return 2
      return 1
    }
    const prevRank = rank(prev)
    const nextRank = rank(next)
    if (nextRank > prevRank) return { ...next, artwork_url: next.artwork_url || prev.artwork_url }
    if (nextRank === prevRank && !prev.artwork_url && next.artwork_url) return next
    return prev
  }

  for (const s of saved) {
    const metaRaw = metaByRefKey.get(`${s.track_source}:${s.track_id}`)
    if (!metaRaw) continue
    const snap = (s.snapshot || {}) as Record<string, unknown>
    const snapArtwork = typeof snap.artwork_url === 'string' ? snap.artwork_url.trim() : ''
    const meta = metaRaw.artwork_url || !snapArtwork
      ? metaRaw
      : { ...metaRaw, artwork_url: snapArtwork }
    if (!meta) continue
    const key = meta.canonical_key
    metaByKey.set(key, preferMeta(metaByKey.get(key), meta))
    if (isArtistSelfCreditSave(selfCreditSkip, s.user_id, meta.artists, meta.mix_name)) continue
    const set = keysByUser.get(s.user_id) || new Set<string>()
    set.add(key)
    keysByUser.set(s.user_id, set)
  }

  const selfKeys = keysByUser.get(user.id) || new Set<string>()
  if (selfKeys.size < MIN_SELF) {
    return NextResponse.json({
      disabled: true,
      reason: 'too_few_saves',
      min_required: MIN_SELF,
      self_count: selfKeys.size,
      self: {
        id: self.id,
        username: self.username,
        display_name: self.display_name,
        avatar_url: self.avatar_url,
      },
      soulmates: [],
      recommended_tracks: [],
    }, { headers: NO_STORE })
  }

  // 4) Para cada candidato, calculamos la similitud Jaccard.
  type Affinity = {
    user: ProfileMini
    common: string[]
    common_count: number
    other_count: number
    self_count: number
    union_count: number
    jaccard: number
    overlap_self: number
    overlap_other: number
  }
  const affinities: Affinity[] = []
  Array.from(keysByUser.entries()).forEach(([uid, theirKeys]) => {
    if (uid === user.id) return
    if (theirKeys.size < MIN_OTHER) return
    const profile = profileById.get(uid)
    if (!profile) return
    let common = 0
    const commonKeys: string[] = []
    Array.from(theirKeys).forEach((k) => {
      if (selfKeys.has(k)) {
        common += 1
        commonKeys.push(k)
      }
    })
    if (common < MIN_COMMON) return
    const unionSize = selfKeys.size + theirKeys.size - common
    const jaccard = unionSize > 0 ? common / unionSize : 0
    affinities.push({
      user: profile,
      common: commonKeys,
      common_count: common,
      other_count: theirKeys.size,
      self_count: selfKeys.size,
      union_count: unionSize,
      jaccard,
      overlap_self: selfKeys.size > 0 ? common / selfKeys.size : 0,
      overlap_other: theirKeys.size > 0 ? common / theirKeys.size : 0,
    })
  })

  affinities.sort((a, b) =>
    b.jaccard - a.jaccard ||
    b.common_count - a.common_count ||
    (a.user.display_name || '').localeCompare(b.user.display_name || ''),
  )

  const top = affinities.slice(0, 10)

  // 5) Recomendaciones: para cada alma gemela del top, contamos sus tracks
  // que el usuario aún no tiene. Ordenamos por número de almas gemelas que
  // las han guardado (popularidad dentro del subgrupo afín).
  const recCount = new Map<string, { count: number; saved_by: Set<string> }>()
  for (const a of top) {
    const theirKeys = keysByUser.get(a.user.id) || new Set<string>()
    Array.from(theirKeys).forEach((k) => {
      if (selfKeys.has(k)) return
      const cur = recCount.get(k) || { count: 0, saved_by: new Set<string>() }
      cur.count += 1
      cur.saved_by.add(a.user.id)
      recCount.set(k, cur)
    })
  }
  const recommended_tracks = Array.from(recCount.entries())
    .map(([key, info]) => ({ key, info, meta: metaByKey.get(key) }))
    .filter((r) => !!r.meta && r.info.count >= 2) // al menos 2 almas gemelas
    .sort((a, b) =>
      b.info.count - a.info.count ||
      (a.meta!.title || '').localeCompare(b.meta!.title || ''),
    )
    .slice(0, 25)
    .map((r) => ({
      canonical_key: r.key,
      title: r.meta!.title,
      mix_name: r.meta!.mix_name,
      artists: r.meta!.artists,
      label: r.meta!.label,
      year: r.meta!.year,
      release_date: r.meta!.release_date,
      artwork_url: r.meta!.artwork_url,
      external_url: r.meta!.external_url,
      soulmates_count: r.info.count,
      soulmate_ids: Array.from(r.info.saved_by),
      primary: r.meta!.primary,
      // Campos ricos para pintar la fila como en /tracks (play/info/links).
      bpm: r.meta!.bpm ?? null,
      music_key: r.meta!.music_key ?? null,
      sample_url: r.meta!.sample_url ?? null,
      full_audio_url: r.meta!.full_audio_url ?? null,
      spotify_url: r.meta!.spotify_url ?? null,
      tidal_url: r.meta!.tidal_url ?? null,
      platform: r.meta!.platform ?? null,
      link_label: r.meta!.link_label ?? null,
      beatport_url: r.meta!.beatport_url ?? null,
      youtube_url: r.meta!.youtube_url ?? null,
      note_en: r.meta!.note_en ?? null,
      note_es: r.meta!.note_es ?? null,
    }))

  return NextResponse.json({
    disabled: false,
    self: {
      id: self.id,
      username: self.username,
      display_name: self.display_name,
      avatar_url: self.avatar_url,
      saved_count: selfKeys.size,
    },
    soulmates: top.map((a) => ({
      user: {
        id: a.user.id,
        username: a.user.username,
        display_name: a.user.display_name,
        avatar_url: a.user.avatar_url,
        country: a.user.country,
      },
      common_count: a.common_count,
      other_count: a.other_count,
      self_count: a.self_count,
      union_count: a.union_count,
      jaccard: a.jaccard,
      overlap_self: a.overlap_self,
      overlap_other: a.overlap_other,
      // Una muestra (5) de pistas que tenéis en común para enseñar en la card.
      sample_common_tracks: a.common.slice(0, 8).map((k) => {
        const m = metaByKey.get(k)
        return m
          ? {
              canonical_key: k,
              title: m.title,
              mix_name: m.mix_name,
              artists: m.artists,
              artwork_url: m.artwork_url,
            }
          : null
      }).filter(Boolean),
    })),
    recommended_tracks,
  }, { headers: NO_STORE })
}
