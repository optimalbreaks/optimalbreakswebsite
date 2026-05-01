import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_\\]/g, '').trim().slice(0, 80)
}

type CountMap = Record<string, number>

async function tallyByUserId(
  sb: ReturnType<typeof createServiceSupabase>,
  table: 'favorite_artists' | 'favorite_labels' | 'favorite_events' | 'saved_chart_tracks' | 'saved_mixes',
  userIds: string[],
): Promise<CountMap> {
  if (userIds.length === 0) return {}
  const { data, error } = await sb.from(table).select('user_id').in('user_id', userIds)
  if (error || !data) return {}
  const out: CountMap = {}
  for (const row of data as Array<{ user_id: string }>) {
    out[row.user_id] = (out[row.user_id] ?? 0) + 1
  }
  return out
}

async function buildEngagementCounts(
  sb: ReturnType<typeof createServiceSupabase>,
  userIds: string[],
): Promise<Record<string, { favorites: number; mixes: number; tracks: number }>> {
  if (userIds.length === 0) return {}
  const [favA, favL, favE, mixes, tracks] = await Promise.all([
    tallyByUserId(sb, 'favorite_artists', userIds),
    tallyByUserId(sb, 'favorite_labels', userIds),
    tallyByUserId(sb, 'favorite_events', userIds),
    tallyByUserId(sb, 'saved_mixes', userIds),
    tallyByUserId(sb, 'saved_chart_tracks', userIds),
  ])
  const out: Record<string, { favorites: number; mixes: number; tracks: number }> = {}
  for (const id of userIds) {
    out[id] = {
      favorites: (favA[id] ?? 0) + (favL[id] ?? 0) + (favE[id] ?? 0),
      mixes: mixes[id] ?? 0,
      tracks: tracks[id] ?? 0,
    }
  }
  return out
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const searchRaw = url.searchParams.get('search')?.trim() || ''
  const search = sanitizeSearch(searchRaw)

  const sb = createServiceSupabase()

  try {
    if (search) {
      const from = (page - 1) * limit
      const to = from + limit - 1
      const { data: profs, error: pe, count } = await sb
        .from('profiles')
        .select('id, display_name, username, role, created_at', { count: 'exact' })
        .or(`display_name.ilike.%${search}%,username.ilike.%${search}%`)
        .order('created_at', { ascending: false })
        .range(from, to)

      if (pe) {
        return NextResponse.json({ error: pe.message }, { status: 500 })
      }

      const rows = await Promise.all(
        (profs || []).map(async (p) => {
          const { data: udata } = await sb.auth.admin.getUserById(p.id)
          const u = udata?.user
          return {
            id: p.id,
            email: u?.email ?? '—',
            display_name: p.display_name,
            username: p.username,
            role: p.role,
            created_at: p.created_at,
            last_sign_in_at: u?.last_sign_in_at ?? null,
          }
        }),
      )

      const counts = await buildEngagementCounts(sb, rows.map((r) => r.id))
      const rowsWithCounts = rows.map((r) => ({
        ...r,
        favorites_count: counts[r.id]?.favorites ?? 0,
        mixes_count: counts[r.id]?.mixes ?? 0,
        tracks_count: counts[r.id]?.tracks ?? 0,
      }))

      return NextResponse.json({ data: rowsWithCounts, count: count ?? 0, page, limit })
    }

    const { data: listPayload, error: listErr } = await sb.auth.admin.listUsers({ page, perPage: limit })
    if (listErr) {
      return NextResponse.json({ error: listErr.message }, { status: 500 })
    }

    const authUsers = listPayload.users
    if (authUsers.length === 0) {
      const { count: pc } = await sb.from('profiles').select('*', { count: 'exact', head: true })
      return NextResponse.json({ data: [], count: pc ?? 0, page, limit })
    }
    const ids = authUsers.map((u) => u.id)
    const headerTotal =
      typeof (listPayload as { total?: number }).total === 'number'
        ? (listPayload as { total: number }).total
        : 0
    const { count: profileCount } = await sb.from('profiles').select('*', { count: 'exact', head: true })
    const total = headerTotal > 0 ? headerTotal : (profileCount ?? authUsers.length)

    const { data: profiles } = await sb.from('profiles').select('id, display_name, username, role, created_at').in('id', ids)

    const map = new Map((profiles || []).map((p) => [p.id, p]))

    const rows = authUsers.map((u) => {
      const p = map.get(u.id)
      return {
        id: u.id,
        email: u.email ?? '—',
        display_name: p?.display_name ?? null,
        username: p?.username ?? null,
        role: (p?.role as 'user' | 'admin') ?? 'user',
        created_at: p?.created_at ?? u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }
    })

    const counts = await buildEngagementCounts(sb, rows.map((r) => r.id))
    const rowsWithCounts = rows.map((r) => ({
      ...r,
      favorites_count: counts[r.id]?.favorites ?? 0,
      mixes_count: counts[r.id]?.mixes ?? 0,
      tracks_count: counts[r.id]?.tracks ?? 0,
    }))

    return NextResponse.json({ data: rowsWithCounts, count: total, page, limit })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error listando usuarios'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
