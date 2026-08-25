// ============================================
// OPTIMAL BREAKS — Detalle de engagement por usuario (admin)
// Endpoint para abrir el "qué hay detrás del número" de la tabla
// /administrator/users: devuelve los artistas/sellos/eventos favoritos,
// los mixes guardados o las canciones de Mis Tracks de un usuario.
//
// Query params:
//   - type=favorites  → { artists, labels, events }
//   - type=mixes      → { mixes }
//   - type=tracks     → { tracks: { chart, featured, vinyl, beatport_top } }
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase, fetchAllRows, selectByIds } from '@/lib/supabase-admin'
import { uniqueSavedTrackKey } from '@/lib/track-canonical-key'

type EngagementType = 'favorites' | 'mixes' | 'tracks'

function artistsToString(a: unknown): string {
  if (typeof a === 'string') return a
  if (!Array.isArray(a)) return ''
  return a
    .map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x))
    .filter(Boolean)
    .join(', ')
}

type OriginKind = 'artist' | 'label'
type ParsedOrigin = { kind: OriginKind; slug: string | null; id: string | null }

function parseBeatportOrigin(snap: Record<string, unknown>): ParsedOrigin | null {
  const o = snap.origin as Record<string, unknown> | undefined
  if (!o || typeof o !== 'object') return null
  if (o.kind !== 'artist' && o.kind !== 'label') return null
  const slug = typeof o.slug === 'string' && o.slug.trim() ? o.slug.trim() : null
  const id = typeof o.id === 'string' && o.id.trim() ? o.id.trim() : null
  if (!slug && !id) return null
  return { kind: o.kind, slug, id }
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Falta id de usuario' }, { status: 400 })
  }

  const url = new URL(request.url)
  const rawType = (url.searchParams.get('type') || '').trim().toLowerCase()
  const type: EngagementType | null =
    rawType === 'favorites' || rawType === 'mixes' || rawType === 'tracks'
      ? (rawType as EngagementType)
      : null
  if (!type) {
    return NextResponse.json(
      { error: 'type debe ser favorites | mixes | tracks' },
      { status: 400 },
    )
  }

  const sb = createServiceSupabase()

  try {
    if (type === 'favorites') {
      const [favArtistsRes, favLabelsRes, favEventsRes] = await Promise.all([
        fetchAllRows<{ artist_id: string; created_at: string | null }>((from, to) =>
          sb
            .from('favorite_artists')
            .select('artist_id, created_at')
            .eq('user_id', id)
            .order('created_at', { ascending: false })
            .order('artist_id', { ascending: true })
            .range(from, to),
        ),
        fetchAllRows<{ label_id: string; created_at: string | null }>((from, to) =>
          sb
            .from('favorite_labels')
            .select('label_id, created_at')
            .eq('user_id', id)
            .order('created_at', { ascending: false })
            .order('label_id', { ascending: true })
            .range(from, to),
        ),
        fetchAllRows<{ event_id: string; created_at: string | null }>((from, to) =>
          sb
            .from('favorite_events')
            .select('event_id, created_at')
            .eq('user_id', id)
            .order('created_at', { ascending: false })
            .order('event_id', { ascending: true })
            .range(from, to),
        ),
      ])
      if (favArtistsRes.error) return NextResponse.json({ error: favArtistsRes.error.message }, { status: 500 })
      if (favLabelsRes.error) return NextResponse.json({ error: favLabelsRes.error.message }, { status: 500 })
      if (favEventsRes.error) return NextResponse.json({ error: favEventsRes.error.message }, { status: 500 })

      const artistIds = favArtistsRes.data.map((r) => r.artist_id)
      const labelIds = favLabelsRes.data.map((r) => r.label_id)
      const eventIds = favEventsRes.data.map((r) => r.event_id)

      const [artistsRes, labelsRes, eventsRes] = await Promise.all([
        artistIds.length
          ? selectByIds<{
              id: string
              slug: string
              name: string
              name_display: string | null
              country: string | null
              image_url: string | null
              styles: string[] | null
              era: string | null
            }>(artistIds, (chunk) =>
              sb
                .from('artists')
                .select('id, slug, name, name_display, country, image_url, styles, era')
                .in('id', chunk),
            )
          : Promise.resolve({ data: [], error: null }),
        labelIds.length
          ? selectByIds<{
              id: string
              slug: string
              name: string
              country: string | null
              founded_year: number | null
              image_url: string | null
              is_active: boolean | null
            }>(labelIds, (chunk) =>
              sb
                .from('labels')
                .select('id, slug, name, country, founded_year, image_url, is_active')
                .in('id', chunk),
            )
          : Promise.resolve({ data: [], error: null }),
        eventIds.length
          ? selectByIds<{
              id: string
              slug: string
              name: string
              date_start: string | null
              city: string | null
              country: string | null
              venue: string | null
              event_type: string | null
              image_url: string | null
            }>(eventIds, (chunk) =>
              sb
                .from('events')
                .select('id, slug, name, date_start, city, country, venue, event_type, image_url')
                .in('id', chunk),
            )
          : Promise.resolve({ data: [], error: null }),
      ])

      const artistsMap = new Map(
        ((artistsRes.data || []) as Array<{ id: string }>).map((r) => [r.id, r]),
      )
      const labelsMap = new Map(
        ((labelsRes.data || []) as Array<{ id: string }>).map((r) => [r.id, r]),
      )
      const eventsMap = new Map(
        ((eventsRes.data || []) as Array<{ id: string }>).map((r) => [r.id, r]),
      )

      const artists = favArtistsRes.data
        .map((row) => {
          const a = artistsMap.get(row.artist_id) as
            | {
                id: string
                slug: string
                name: string
                name_display: string | null
                country: string | null
                image_url: string | null
                styles: string[] | null
                era: string | null
              }
            | undefined
          if (!a) return null
          return { ...a, saved_at: row.created_at }
        })
        .filter(Boolean)

      const labels = favLabelsRes.data
        .map((row) => {
          const l = labelsMap.get(row.label_id) as
            | {
                id: string
                slug: string
                name: string
                country: string | null
                founded_year: number | null
                image_url: string | null
                is_active: boolean | null
              }
            | undefined
          if (!l) return null
          return { ...l, saved_at: row.created_at }
        })
        .filter(Boolean)

      const events = favEventsRes.data
        .map((row) => {
          const e = eventsMap.get(row.event_id) as
            | {
                id: string
                slug: string
                name: string
                date_start: string | null
                city: string | null
                country: string | null
                venue: string | null
                event_type: string | null
                image_url: string | null
              }
            | undefined
          if (!e) return null
          return { ...e, saved_at: row.created_at }
        })
        .filter(Boolean)

      return NextResponse.json({
        type,
        counts: {
          artists: artists.length,
          labels: labels.length,
          events: events.length,
          total: artists.length + labels.length + events.length,
        },
        artists,
        labels,
        events,
      })
    }

    if (type === 'mixes') {
      const { data: savedRows, error: savedErr } = await fetchAllRows<{ mix_id: string; created_at: string | null }>(
        (from, to) =>
          sb
            .from('saved_mixes')
            .select('mix_id, created_at')
            .eq('user_id', id)
            .order('created_at', { ascending: false })
            .order('mix_id', { ascending: true })
            .range(from, to),
      )
      if (savedErr) {
        return NextResponse.json({ error: savedErr.message }, { status: 500 })
      }
      const mixIds = savedRows.map((r) => r.mix_id)
      const { data: mixRows, error: mixErr } = mixIds.length
        ? await selectByIds<Record<string, unknown> & { id: string }>(mixIds, (chunk) =>
            sb
              .from('mixes')
              .select(
                'id, slug, title, artist_name, mix_type, image_url, video_url, embed_url, platform, published_at, year, duration_minutes',
              )
              .in('id', chunk),
          )
        : { data: [] as Array<Record<string, unknown> & { id: string }>, error: null }
      if (mixErr) {
        return NextResponse.json({ error: mixErr.message }, { status: 500 })
      }
      const mixMap = new Map(
        ((mixRows || []) as Array<{ id: string }>).map((r) => [r.id, r]),
      )
      const mixes = (savedRows || [])
        .map((r) => {
          const row = r as { mix_id: string; created_at: string | null }
          const m = mixMap.get(row.mix_id) as
            | Record<string, unknown>
            | undefined
          if (!m) return null
          return { ...m, saved_at: row.created_at }
        })
        .filter(Boolean)

      return NextResponse.json({ type, counts: { total: mixes.length }, mixes })
    }

    // type === 'tracks' → polimórfico (chart, featured, vinyl, beatport_top)
    type SavedRow = {
      track_source: 'chart' | 'featured' | 'vinyl' | 'beatport_top'
      track_id: string
      canonical_url: string | null
      snapshot: Record<string, unknown> | null
      created_at: string | null
    }
    const { data: savedRows, error: savedErr } = await fetchAllRows<SavedRow>((from, to) =>
      sb
        .from('saved_chart_tracks')
        .select('track_source, track_id, canonical_url, snapshot, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .order('track_id', { ascending: true })
        .range(from, to),
    )
    if (savedErr) {
      return NextResponse.json({ error: savedErr.message }, { status: 500 })
    }
    const saved = savedRows

    const chartIds = saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)
    const featIds = saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)
    const vinylIds = saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)

    const [chartRes, featRes, vinylRes] = await Promise.all([
      chartIds.length
        ? selectByIds<Record<string, unknown> & { id: string }>(chartIds, (chunk) =>
            sb
              .from('chart_tracks')
              .select(
                'id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, beatport_url',
              )
              .in('id', chunk),
          )
        : Promise.resolve({ data: [] as Array<Record<string, unknown> & { id: string }>, error: null }),
      featIds.length
        ? selectByIds<Record<string, unknown> & { id: string }>(featIds, (chunk) =>
            sb
              .from('chart_featured_tracks')
              .select(
                'id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, link_url, link_label, platform',
              )
              .in('id', chunk),
          )
        : Promise.resolve({ data: [] as Array<Record<string, unknown> & { id: string }>, error: null }),
      vinylIds.length
        ? selectByIds<Record<string, unknown> & { id: string }>(vinylIds, (chunk) =>
            sb
              .from('chart_vinyl_tracks')
              .select(
                'id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url',
              )
              .in('id', chunk),
          )
        : Promise.resolve({ data: [] as Array<Record<string, unknown> & { id: string }>, error: null }),
    ])

    const liveChart = new Map(
      ((chartRes.data || []) as Array<{ id: string }>).map((r) => [r.id, r]),
    )
    const liveFeat = new Map(
      ((featRes.data || []) as Array<{ id: string }>).map((r) => [r.id, r]),
    )
    const liveVinyl = new Map(
      ((vinylRes.data || []) as Array<{ id: string }>).map((r) => [r.id, r]),
    )

    // Resolvemos week_date de cada chart_edition implicada para que el drawer
    // construya enlaces internos `/charts?week=...&play=<source>:<id>` en
    // lugar de mandar al admin fuera del sitio (Beatport, Discogs, etc.).
    const editionIdSet = new Set<string>()
    for (const c of chartRes.data) {
      const editionId = c.chart_edition_id
      if (typeof editionId === 'string' && editionId) editionIdSet.add(editionId)
    }
    for (const f of featRes.data) {
      const editionId = f.chart_edition_id
      if (typeof editionId === 'string' && editionId) editionIdSet.add(editionId)
    }
    const editionIds = Array.from(editionIdSet)
    const weekByEdition = new Map<string, string>()
    if (editionIds.length) {
      const { data: editions } = await selectByIds<{ id: string; week_date: string }>(editionIds, (chunk) =>
        sb.from('chart_editions').select('id, week_date').in('id', chunk),
      )
      for (const e of editions) {
        weekByEdition.set(e.id, e.week_date)
      }
    }

    // Saves beatport_top: origin.slug para deep-link interno a la ficha.
    // Si el snapshot trae id pero no slug (saves viejos), lo resolvemos aquí.
    const artistIdsNeedingSlug: string[] = []
    const labelIdsNeedingSlug: string[] = []
    for (const s of saved) {
      if (s.track_source !== 'beatport_top') continue
      const parsed = parseBeatportOrigin((s.snapshot || {}) as Record<string, unknown>)
      if (!parsed || parsed.slug || !parsed.id) continue
      if (parsed.kind === 'artist') artistIdsNeedingSlug.push(parsed.id)
      else labelIdsNeedingSlug.push(parsed.id)
    }
    const slugByArtistId = new Map<string, string>()
    const slugByLabelId = new Map<string, string>()
    if (artistIdsNeedingSlug.length) {
      const { data } = await selectByIds<{ id: string; slug: string }>(
        Array.from(new Set(artistIdsNeedingSlug)),
        (chunk) => sb.from('artists').select('id, slug').in('id', chunk),
      )
      for (const r of data) {
        if (r.slug) slugByArtistId.set(r.id, r.slug)
      }
    }
    if (labelIdsNeedingSlug.length) {
      const { data } = await selectByIds<{ id: string; slug: string }>(
        Array.from(new Set(labelIdsNeedingSlug)),
        (chunk) => sb.from('labels').select('id, slug').in('id', chunk),
      )
      for (const r of data) {
        if (r.slug) slugByLabelId.set(r.id, r.slug)
      }
    }

    const resolvedOrigin = (snap: Record<string, unknown>): { kind: OriginKind; slug: string } | null => {
      const parsed = parseBeatportOrigin(snap)
      if (!parsed) return null
      if (parsed.slug) return { kind: parsed.kind, slug: parsed.slug }
      if (!parsed.id) return null
      const slug =
        parsed.kind === 'artist' ? slugByArtistId.get(parsed.id) : slugByLabelId.get(parsed.id)
      return slug ? { kind: parsed.kind, slug } : null
    }

    const tracks = saved.flatMap((s) => {
      const snap = (s.snapshot || {}) as Record<string, unknown>
      let live: Record<string, unknown> | undefined
      if (s.track_source === 'chart') live = liveChart.get(s.track_id) as Record<string, unknown> | undefined
      else if (s.track_source === 'featured') live = liveFeat.get(s.track_id) as Record<string, unknown> | undefined
      else if (s.track_source === 'vinyl') live = liveVinyl.get(s.track_id) as Record<string, unknown> | undefined
      const base = live || snap || {}

      const uniqKey = uniqueSavedTrackKey({
        track_source: s.track_source,
        track_id: s.track_id,
        canonical_url: s.canonical_url,
        snapshot: snap,
        live: live
          ? {
              title: (live.title as string | null | undefined) ?? null,
              mix_name: (live.mix_name as string | null | undefined) ?? null,
              artists: live.artists,
              beatport_url: (live.beatport_url as string | null | undefined) ?? null,
              link_url: (live.link_url as string | null | undefined) ?? null,
              youtube_url: (live.youtube_url as string | null | undefined) ?? null,
            }
          : null,
      })
      if (!uniqKey) return []

      const title = String((base as Record<string, unknown>).title || snap.title || '—')
      const mix_name =
        ((base as Record<string, unknown>).mix_name as string | null | undefined) ??
        (snap.mix_name as string | null | undefined) ??
        null
      const artistsRaw = (base as Record<string, unknown>).artists ?? snap.artists
      const label = ((base as Record<string, unknown>).label as string | null | undefined) ?? (snap.label as string | null | undefined) ?? null
      const year =
        ((base as Record<string, unknown>).release_year as number | null | undefined) ??
        ((base as Record<string, unknown>).year as number | null | undefined) ??
        (snap.year as number | null | undefined) ??
        null
      const artwork_url =
        ((base as Record<string, unknown>).artwork_url as string | null | undefined) ??
        (snap.artwork_url as string | null | undefined) ??
        null

      let canonical_url: string | null = s.canonical_url
      if (!canonical_url) {
        if (s.track_source === 'chart') canonical_url = ((base as Record<string, unknown>).beatport_url as string | null | undefined) ?? null
        else if (s.track_source === 'featured') canonical_url = ((base as Record<string, unknown>).link_url as string | null | undefined) ?? null
        else if (s.track_source === 'vinyl')
          canonical_url =
            ((base as Record<string, unknown>).discogs_url as string | null | undefined) ??
            ((base as Record<string, unknown>).youtube_url as string | null | undefined) ??
            null
        else if (s.track_source === 'beatport_top')
          canonical_url = (typeof snap.beatport_url === 'string' && snap.beatport_url) || null
      }

      const origin = s.track_source === 'beatport_top' ? resolvedOrigin(snap) : null
      const beatport_url =
        s.track_source === 'beatport_top'
          ? ((typeof snap.beatport_url === 'string' && snap.beatport_url) || canonical_url)
          : null

      let week_date: string | null = null
      if (live && (s.track_source === 'chart' || s.track_source === 'featured')) {
        const eid = (live as Record<string, unknown>).chart_edition_id as string | null | undefined
        if (eid) week_date = weekByEdition.get(eid) || null
      }

      return [{
        _uniq: uniqKey,
        track_source: s.track_source,
        track_id: s.track_id,
        saved_at: s.created_at,
        is_live: Boolean(live),
        title,
        mix_name,
        artists: artistsToString(artistsRaw),
        label,
        year,
        artwork_url,
        canonical_url,
        week_date,
        origin,
        beatport_url,
      }]
    })

    const seenUniq = new Set<string>()
    const uniqueTracks = tracks.flatMap((t) => {
      if (seenUniq.has(t._uniq)) return []
      seenUniq.add(t._uniq)
      const { _uniq, ...rest } = t
      void _uniq
      return [rest]
    })

    const counts = {
      total: uniqueTracks.length,
      chart: uniqueTracks.filter((t) => t.track_source === 'chart').length,
      featured: uniqueTracks.filter((t) => t.track_source === 'featured').length,
      vinyl: uniqueTracks.filter((t) => t.track_source === 'vinyl').length,
      beatport_top: uniqueTracks.filter((t) => t.track_source === 'beatport_top').length,
    }

    return NextResponse.json({ type, counts, tracks: uniqueTracks })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error obteniendo engagement'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
