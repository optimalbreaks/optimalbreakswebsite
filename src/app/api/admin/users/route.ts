import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { buildLastActivityAtByUserId } from '@/lib/admin-user-last-activity'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { uniqueSavedTrackKey } from '@/lib/track-canonical-key'
import type { ChartTrackSource } from '@/types/database'

function sanitizeSearch(raw: string): string {
  return raw.replace(/[%_\\]/g, '').trim().slice(0, 80)
}

const SORT_KEYS = [
  'email',
  'display_name',
  'username',
  'role',
  'favorites_count',
  'mixes_count',
  'tracks_count',
  'last_activity_at',
] as const

type SortKey = (typeof SORT_KEYS)[number]
type ServiceClient = ReturnType<typeof createServiceSupabase>
type CountMap = Record<string, number>
type ProfileLite = {
  id: string
  display_name: string | null
  username: string | null
  role: 'user' | 'admin'
  created_at: string
}
type BaseRow = {
  id: string
  email: string
  display_name: string | null
  username: string | null
  role: 'user' | 'admin'
  created_at: string
  last_sign_in_at: string | null
}

function parseSortKey(raw: string | null): SortKey | null {
  if (!raw) return null
  return (SORT_KEYS as readonly string[]).includes(raw) ? (raw as SortKey) : null
}

function isProfileSort(key: SortKey): key is 'display_name' | 'username' | 'role' {
  return key === 'display_name' || key === 'username' || key === 'role'
}

function isCountSort(key: SortKey): key is 'favorites_count' | 'mixes_count' | 'tracks_count' {
  return key === 'favorites_count' || key === 'mixes_count' || key === 'tracks_count'
}

function cmpStr(a: string | null | undefined, b: string | null | undefined, asc: boolean): number {
  const emptyA = !a || a === '—'
  const emptyB = !b || b === '—'
  if (emptyA && emptyB) return 0
  if (emptyA) return 1
  if (emptyB) return -1
  const r = a.localeCompare(b, 'es', { sensitivity: 'base' })
  return asc ? r : -r
}

function cmpNum(a: number, b: number, asc: boolean): number {
  return asc ? a - b : b - a
}

function cmpDate(a: string | null | undefined, b: string | null | undefined, asc: boolean): number {
  if (!a && !b) return 0
  if (!a) return 1
  if (!b) return -1
  const r = Date.parse(a) - Date.parse(b)
  return Number.isNaN(r) ? 0 : asc ? r : -r
}

async function tallyByUserId(
  sb: ServiceClient,
  table: 'favorite_artists' | 'favorite_labels' | 'favorite_events' | 'saved_mixes',
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

type SavedTrackTallyRow = {
  user_id: string
  track_source: ChartTrackSource
  track_id: string
  canonical_url: string | null
  snapshot: Record<string, unknown> | null
}

/** Canciones únicas por usuario (Mis Tracks), no filas crudas de `saved_chart_tracks`. */
async function tallyUniqueTracksByUserId(
  sb: ServiceClient,
  userIds?: string[],
): Promise<CountMap> {
  if (userIds && userIds.length === 0) return {}
  const keysByUser = new Map<string, Set<string>>()
  const pageSize = 1000
  let from = 0
  for (;;) {
    let q = sb
      .from('saved_chart_tracks')
      .select('user_id, track_source, track_id, canonical_url, snapshot')
    if (userIds) q = q.in('user_id', userIds)
    const { data, error } = await q.range(from, from + pageSize - 1)
    if (error || !data?.length) break
    for (const row of data as SavedTrackTallyRow[]) {
      const key = uniqueSavedTrackKey(row)
      if (!key) continue
      let set = keysByUser.get(row.user_id)
      if (!set) {
        set = new Set()
        keysByUser.set(row.user_id, set)
      }
      set.add(key)
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  const out: CountMap = {}
  for (const [id, keys] of keysByUser) out[id] = keys.size
  return out
}

async function tallyAllByUserId(
  sb: ServiceClient,
  table: 'favorite_artists' | 'favorite_labels' | 'favorite_events' | 'saved_mixes',
): Promise<CountMap> {
  const out: CountMap = {}
  const pageSize = 1000
  let from = 0
  for (;;) {
    const { data, error } = await sb.from(table).select('user_id').range(from, from + pageSize - 1)
    if (error || !data?.length) break
    for (const row of data as Array<{ user_id: string }>) {
      out[row.user_id] = (out[row.user_id] ?? 0) + 1
    }
    if (data.length < pageSize) break
    from += pageSize
  }
  return out
}

async function buildEngagementCounts(
  sb: ServiceClient,
  userIds: string[],
  opts: { allRows?: boolean } = {},
): Promise<Record<string, { favorites: number; mixes: number; tracks: number }>> {
  if (userIds.length === 0) return {}
  const tally = opts.allRows
    ? (table: Parameters<typeof tallyAllByUserId>[1]) => tallyAllByUserId(sb, table)
    : (table: Parameters<typeof tallyByUserId>[1]) => tallyByUserId(sb, table, userIds)
  const [favA, favL, favE, mixes, tracks] = await Promise.all([
    tally('favorite_artists'),
    tally('favorite_labels'),
    tally('favorite_events'),
    tally('saved_mixes'),
    tallyUniqueTracksByUserId(sb, opts.allRows ? undefined : userIds),
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

async function attachEngagement(sb: ServiceClient, rows: BaseRow[]) {
  const ids = rows.map((r) => r.id)
  const [counts, lastActivity] = await Promise.all([
    buildEngagementCounts(sb, ids),
    buildLastActivityAtByUserId(
      sb,
      ids,
      Object.fromEntries(rows.map((r) => [r.id, r.last_sign_in_at])),
    ),
  ])
  return rows.map((r) => ({
    ...r,
    favorites_count: counts[r.id]?.favorites ?? 0,
    mixes_count: counts[r.id]?.mixes ?? 0,
    tracks_count: counts[r.id]?.tracks ?? 0,
    last_activity_at: lastActivity[r.id] ?? null,
  }))
}

async function lastActivityInChunks(
  sb: ServiceClient,
  ids: string[],
  signInByUserId: Record<string, string | null | undefined>,
): Promise<Record<string, string | null>> {
  const out: Record<string, string | null> = {}
  const chunkSize = 80
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const part = await buildLastActivityAtByUserId(
      sb,
      chunk,
      Object.fromEntries(chunk.map((id) => [id, signInByUserId[id]])),
    )
    Object.assign(out, part)
  }
  return out
}

type AuthLite = { email: string | null; last_sign_in_at: string | null; created_at: string }

async function authByIds(sb: ServiceClient, ids: string[]): Promise<Map<string, AuthLite>> {
  const map = new Map<string, AuthLite>()
  const chunkSize = 10
  for (let i = 0; i < ids.length; i += chunkSize) {
    const chunk = ids.slice(i, i + chunkSize)
    const results = await Promise.all(chunk.map((id) => sb.auth.admin.getUserById(id)))
    chunk.forEach((id, idx) => {
      const u = results[idx].data?.user
      if (!u) return
      map.set(id, {
        email: u.email ?? null,
        last_sign_in_at: u.last_sign_in_at ?? null,
        created_at: u.created_at,
      })
    })
  }
  return map
}

async function listAllAuthUsers(sb: ServiceClient): Promise<{
  users: Array<{ id: string; email?: string; last_sign_in_at?: string | null; created_at: string }>
  total: number
}> {
  const users: Array<{ id: string; email?: string; last_sign_in_at?: string | null; created_at: string }> = []
  let page = 1
  const perPage = 1000
  let total = 0
  for (;;) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(error.message)
    const batch = data.users ?? []
    if (page === 1) {
      const headerTotal = (data as { total?: number }).total
      total = typeof headerTotal === 'number' ? headerTotal : 0
    }
    users.push(...batch)
    if (batch.length < perPage) break
    page += 1
  }
  return { users, total: total > 0 ? total : users.length }
}

function applySearch<T extends { or: (filter: string) => T }>(query: T, search: string): T {
  if (!search) return query
  return query.or(`display_name.ilike.%${search}%,username.ilike.%${search}%`)
}

async function fetchProfilesPage(
  sb: ServiceClient,
  opts: {
    search: string
    from: number
    to: number
    order: 'display_name' | 'username' | 'role' | 'created_at'
    ascending: boolean
  },
): Promise<{ profiles: ProfileLite[]; count: number; error: string | null }> {
  let query = sb
    .from('profiles')
    .select('id, display_name, username, role, created_at', { count: 'exact' })
  query = applySearch(query, opts.search)
  const { data, error, count } = await query
    .order(opts.order, { ascending: opts.ascending, nullsFirst: false })
    .range(opts.from, opts.to)
  if (error) return { profiles: [], count: 0, error: error.message }
  return { profiles: (data || []) as ProfileLite[], count: count ?? 0, error: null }
}

async function fetchAllMatchingProfiles(
  sb: ServiceClient,
  search: string,
): Promise<{ profiles: ProfileLite[]; count: number; error: string | null }> {
  const pageSize = 1000
  const profiles: ProfileLite[] = []
  let from = 0
  let total = 0
  for (;;) {
    let query = sb
      .from('profiles')
      .select('id, display_name, username, role, created_at', { count: 'exact' })
    query = applySearch(query, search)
    const { data, error, count } = await query.range(from, from + pageSize - 1)
    if (error) return { profiles: [], count: 0, error: error.message }
    if (from === 0) total = count ?? 0
    profiles.push(...((data || []) as ProfileLite[]))
    if (!data || data.length < pageSize) break
    from += pageSize
  }
  return { profiles, count: total, error: null }
}

function rowsFromProfiles(profs: ProfileLite[], authMap: Map<string, AuthLite>): BaseRow[] {
  return profs.map((p) => {
    const u = authMap.get(p.id)
    return {
      id: p.id,
      email: u?.email ?? '—',
      display_name: p.display_name,
      username: p.username,
      role: p.role,
      created_at: p.created_at,
      last_sign_in_at: u?.last_sign_in_at ?? null,
    }
  })
}

function paginate<T>(items: T[], page: number, limit: number): T[] {
  const from = (page - 1) * limit
  return items.slice(from, from + limit)
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const searchRaw = url.searchParams.get('search')?.trim() || ''
  const search = sanitizeSearch(searchRaw)
  const order = parseSortKey(url.searchParams.get('order'))
  const ascending = url.searchParams.get('dir') === 'asc'
  const from = (page - 1) * limit
  const to = from + limit - 1

  const sb = createServiceSupabase()

  try {
    if (order && isProfileSort(order)) {
      const { profiles, count, error } = await fetchProfilesPage(sb, {
        search,
        from,
        to,
        order,
        ascending,
      })
      if (error) return NextResponse.json({ error }, { status: 500 })
      const authMap = await authByIds(sb, profiles.map((p) => p.id))
      const data = await attachEngagement(sb, rowsFromProfiles(profiles, authMap))
      return NextResponse.json({ data, count, page, limit })
    }

    if (order === 'email') {
      if (search) {
        const { profiles, count, error } = await fetchAllMatchingProfiles(sb, search)
        if (error) return NextResponse.json({ error }, { status: 500 })
        const authMap = await authByIds(sb, profiles.map((p) => p.id))
        const sorted = rowsFromProfiles(profiles, authMap).sort((a, b) =>
          cmpStr(a.email, b.email, ascending),
        )
        const data = await attachEngagement(sb, paginate(sorted, page, limit))
        return NextResponse.json({ data, count, page, limit })
      }

      const { users, total } = await listAllAuthUsers(sb)
      const sorted = [...users].sort((a, b) => cmpStr(a.email, b.email, ascending))
      const pageUsers = paginate(sorted, page, limit)
      if (pageUsers.length === 0) {
        return NextResponse.json({ data: [], count: total, page, limit })
      }
      const ids = pageUsers.map((u) => u.id)
      const { data: profiles } = await sb
        .from('profiles')
        .select('id, display_name, username, role, created_at')
        .in('id', ids)
      const map = new Map(((profiles || []) as ProfileLite[]).map((p) => [p.id, p]))
      const rows: BaseRow[] = pageUsers.map((u) => {
        const p = map.get(u.id)
        return {
          id: u.id,
          email: u.email ?? '—',
          display_name: p?.display_name ?? null,
          username: p?.username ?? null,
          role: p?.role ?? 'user',
          created_at: p?.created_at ?? u.created_at,
          last_sign_in_at: u.last_sign_in_at ?? null,
        }
      })
      const data = await attachEngagement(sb, rows)
      return NextResponse.json({ data, count: total, page, limit })
    }

    if (order && isCountSort(order)) {
      const { profiles, count, error } = await fetchAllMatchingProfiles(sb, search)
      if (error) return NextResponse.json({ error }, { status: 500 })
      const ids = profiles.map((p) => p.id)
      const counts = await buildEngagementCounts(sb, ids, {
        allRows: !search && ids.length > 80,
      })
      const countField =
        order === 'favorites_count' ? 'favorites' : order === 'mixes_count' ? 'mixes' : 'tracks'
      const sorted = [...profiles].sort((a, b) =>
        cmpNum(counts[a.id]?.[countField] ?? 0, counts[b.id]?.[countField] ?? 0, ascending),
      )
      const pageProfs = paginate(sorted, page, limit)
      const authMap = await authByIds(sb, pageProfs.map((p) => p.id))
      const rows = rowsFromProfiles(pageProfs, authMap)
      const lastActivity = await buildLastActivityAtByUserId(
        sb,
        rows.map((r) => r.id),
        Object.fromEntries(rows.map((r) => [r.id, r.last_sign_in_at])),
      )
      const data = rows.map((r) => ({
        ...r,
        favorites_count: counts[r.id]?.favorites ?? 0,
        mixes_count: counts[r.id]?.mixes ?? 0,
        tracks_count: counts[r.id]?.tracks ?? 0,
        last_activity_at: lastActivity[r.id] ?? null,
      }))
      return NextResponse.json({ data, count, page, limit })
    }

    if (order === 'last_activity_at') {
      const { profiles, count, error } = await fetchAllMatchingProfiles(sb, search)
      if (error) return NextResponse.json({ error }, { status: 500 })
      const ids = profiles.map((p) => p.id)
      const authMap = new Map<string, AuthLite>()
      if (search) {
        const found = await authByIds(sb, ids)
        found.forEach((v, k) => authMap.set(k, v))
      } else {
        const { users } = await listAllAuthUsers(sb)
        for (const u of users) {
          authMap.set(u.id, {
            email: u.email ?? null,
            last_sign_in_at: u.last_sign_in_at ?? null,
            created_at: u.created_at,
          })
        }
      }
      const signIn = Object.fromEntries(
        ids.map((id) => [id, authMap.get(id)?.last_sign_in_at ?? null]),
      )
      const lastActivity = await lastActivityInChunks(sb, ids, signIn)
      const sorted = [...profiles].sort((a, b) =>
        cmpDate(lastActivity[a.id], lastActivity[b.id], ascending),
      )
      const pageProfs = paginate(sorted, page, limit)
      const pageRows = rowsFromProfiles(pageProfs, authMap)
      const pageCounts = await buildEngagementCounts(
        sb,
        pageRows.map((r) => r.id),
      )
      const data = pageRows.map((r) => ({
        ...r,
        favorites_count: pageCounts[r.id]?.favorites ?? 0,
        mixes_count: pageCounts[r.id]?.mixes ?? 0,
        tracks_count: pageCounts[r.id]?.tracks ?? 0,
        last_activity_at: lastActivity[r.id] ?? null,
      }))
      return NextResponse.json({ data, count, page, limit })
    }

    if (search) {
      const { profiles, count, error } = await fetchProfilesPage(sb, {
        search,
        from,
        to,
        order: 'created_at',
        ascending: false,
      })
      if (error) return NextResponse.json({ error }, { status: 500 })
      const authMap = await authByIds(sb, profiles.map((p) => p.id))
      const data = await attachEngagement(sb, rowsFromProfiles(profiles, authMap))
      return NextResponse.json({ data, count, page, limit })
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

    const { data: profiles } = await sb
      .from('profiles')
      .select('id, display_name, username, role, created_at')
      .in('id', ids)

    const map = new Map(((profiles || []) as ProfileLite[]).map((p) => [p.id, p]))

    const rows: BaseRow[] = authUsers.map((u) => {
      const p = map.get(u.id)
      return {
        id: u.id,
        email: u.email ?? '—',
        display_name: p?.display_name ?? null,
        username: p?.username ?? null,
        role: p?.role ?? 'user',
        created_at: p?.created_at ?? u.created_at,
        last_sign_in_at: u.last_sign_in_at ?? null,
      }
    })

    const data = await attachEngagement(sb, rows)
    return NextResponse.json({ data, count: total, page, limit })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'Error listando usuarios'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
