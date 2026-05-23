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
import { createServiceSupabase } from '@/lib/supabase-admin'

type EngagementType = 'favorites' | 'mixes' | 'tracks'

function artistsToString(a: unknown): string {
  if (typeof a === 'string') return a
  if (!Array.isArray(a)) return ''
  return a
    .map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x))
    .filter(Boolean)
    .join(', ')
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
        sb
          .from('favorite_artists')
          .select('artist_id, created_at')
          .eq('user_id', id)
          .order('created_at', { ascending: false }),
        sb
          .from('favorite_labels')
          .select('label_id, created_at')
          .eq('user_id', id)
          .order('created_at', { ascending: false }),
        sb
          .from('favorite_events')
          .select('event_id, created_at')
          .eq('user_id', id)
          .order('created_at', { ascending: false }),
      ])

      const artistIds = (favArtistsRes.data || []).map((r) => (r as { artist_id: string }).artist_id)
      const labelIds = (favLabelsRes.data || []).map((r) => (r as { label_id: string }).label_id)
      const eventIds = (favEventsRes.data || []).map((r) => (r as { event_id: string }).event_id)

      const [artistsRes, labelsRes, eventsRes] = await Promise.all([
        artistIds.length
          ? sb
              .from('artists')
              .select('id, slug, name, name_display, country, image_url, styles, era')
              .in('id', artistIds)
          : Promise.resolve({ data: [], error: null }),
        labelIds.length
          ? sb
              .from('labels')
              .select('id, slug, name, country, founded_year, image_url, is_active')
              .in('id', labelIds)
          : Promise.resolve({ data: [], error: null }),
        eventIds.length
          ? sb
              .from('events')
              .select('id, slug, name, date_start, city, country, venue, event_type, image_url')
              .in('id', eventIds)
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

      const artists = (favArtistsRes.data || [])
        .map((r) => {
          const row = r as { artist_id: string; created_at: string | null }
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

      const labels = (favLabelsRes.data || [])
        .map((r) => {
          const row = r as { label_id: string; created_at: string | null }
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

      const events = (favEventsRes.data || [])
        .map((r) => {
          const row = r as { event_id: string; created_at: string | null }
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
      const { data: savedRows, error: savedErr } = await sb
        .from('saved_mixes')
        .select('mix_id, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
      if (savedErr) {
        return NextResponse.json({ error: savedErr.message }, { status: 500 })
      }
      const mixIds = (savedRows || []).map((r) => (r as { mix_id: string }).mix_id)
      const { data: mixRows, error: mixErr } = mixIds.length
        ? await sb
            .from('mixes')
            .select(
              'id, slug, title, artist_name, mix_type, image_url, video_url, embed_url, platform, published_at, year, duration_minutes',
            )
            .in('id', mixIds)
        : { data: [], error: null }
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
    const { data: savedRows, error: savedErr } = await sb
      .from('saved_chart_tracks')
      .select('track_source, track_id, canonical_url, snapshot, created_at')
      .eq('user_id', id)
      .order('created_at', { ascending: false })
    if (savedErr) {
      return NextResponse.json({ error: savedErr.message }, { status: 500 })
    }

    type SavedRow = {
      track_source: 'chart' | 'featured' | 'vinyl' | 'beatport_top'
      track_id: string
      canonical_url: string | null
      snapshot: Record<string, unknown> | null
      created_at: string | null
    }
    const saved = ((savedRows || []) as unknown) as SavedRow[]

    const chartIds = saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)
    const featIds = saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)
    const vinylIds = saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)

    const [chartRes, featRes, vinylRes] = await Promise.all([
      chartIds.length
        ? sb
            .from('chart_tracks')
            .select(
              'id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, beatport_url',
            )
            .in('id', chartIds)
        : Promise.resolve({ data: [], error: null }),
      featIds.length
        ? sb
            .from('chart_featured_tracks')
            .select(
              'id, chart_edition_id, title, mix_name, artists, label, release_year, release_date, bpm, music_key, artwork_url, link_url, link_label, platform',
            )
            .in('id', featIds)
        : Promise.resolve({ data: [], error: null }),
      vinylIds.length
        ? sb
            .from('chart_vinyl_tracks')
            .select(
              'id, title, mix_name, artists, label, year, artwork_url, discogs_url, youtube_url',
            )
            .in('id', vinylIds)
        : Promise.resolve({ data: [], error: null }),
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
    for (const c of (chartRes.data || []) as Array<{ chart_edition_id: string | null }>) {
      if (c.chart_edition_id) editionIdSet.add(c.chart_edition_id)
    }
    for (const f of (featRes.data || []) as Array<{ chart_edition_id: string | null }>) {
      if (f.chart_edition_id) editionIdSet.add(f.chart_edition_id)
    }
    const editionIds = Array.from(editionIdSet)
    const weekByEdition = new Map<string, string>()
    if (editionIds.length) {
      const { data: editions } = await sb
        .from('chart_editions')
        .select('id, week_date')
        .in('id', editionIds)
      for (const e of ((editions || []) as Array<{ id: string; week_date: string }>)) {
        weekByEdition.set(e.id, e.week_date)
      }
    }

    const tracks = saved.map((s) => {
      const snap = (s.snapshot || {}) as Record<string, unknown>
      let live: Record<string, unknown> | undefined
      if (s.track_source === 'chart') live = liveChart.get(s.track_id) as Record<string, unknown> | undefined
      else if (s.track_source === 'featured') live = liveFeat.get(s.track_id) as Record<string, unknown> | undefined
      else if (s.track_source === 'vinyl') live = liveVinyl.get(s.track_id) as Record<string, unknown> | undefined
      const base = live || snap || {}

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
      }

      let week_date: string | null = null
      if (live && (s.track_source === 'chart' || s.track_source === 'featured')) {
        const eid = (live as Record<string, unknown>).chart_edition_id as string | null | undefined
        if (eid) week_date = weekByEdition.get(eid) || null
      }

      return {
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
      }
    })

    const counts = {
      total: tracks.length,
      chart: tracks.filter((t) => t.track_source === 'chart').length,
      featured: tracks.filter((t) => t.track_source === 'featured').length,
      vinyl: tracks.filter((t) => t.track_source === 'vinyl').length,
      beatport_top: tracks.filter((t) => t.track_source === 'beatport_top').length,
    }

    return NextResponse.json({ type, counts, tracks })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error obteniendo engagement'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
