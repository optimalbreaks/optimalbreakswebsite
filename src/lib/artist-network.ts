// ============================================
// OPTIMAL BREAKS — Red de artistas reclamados (helpers de servidor)
// Solo API routes. El cliente no lee estas tablas (service role).
// ============================================

import { NextResponse } from 'next/server'
import { displayArtistImageUrl } from '@/lib/artist-public-portrait'
import { createServiceSupabase } from '@/lib/supabase-admin'
import type {
  ArtistNetworkKind,
  ArtistNetworkMemberRow,
  ArtistNetworkMessageRow,
  ArtistNetworkThreadRow,
} from '@/types/database'

export const ARTIST_NETWORK_MESSAGE_MAX = 4000
export const ARTIST_NETWORK_TITLE_MAX = 80

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export function isUuid(value: string): boolean {
  return UUID_RE.test(value)
}

export function artistNetworkDmKey(a: string, b: string): string {
  return a < b ? `${a}:${b}` : `${b}:${a}`
}

export function previewOf(body: string, max = 140): string {
  const t = body.replace(/\s+/g, ' ').trim()
  if (t.length <= max) return t
  return `${t.slice(0, max - 1)}…`
}

export type ClaimedFicha = {
  id: string
  name: string
  slug: string
  image_url: string | null
}

export type DirectoryArtist = ClaimedFicha & { image: string | null }

export function fichaPublic(row: ClaimedFicha): DirectoryArtist {
  return {
    id: row.id,
    name: row.name,
    slug: row.slug,
    image_url: row.image_url,
    image: displayArtistImageUrl(row.slug, row.image_url) ?? null,
  }
}

export const ARTIST_NETWORK_STAFF: ClaimedFicha = {
  id: '',
  name: 'Optimal Breaks',
  slug: '',
  image_url: null,
}

export function networkSeatArtistId(isStaff: boolean, claimedId: string): string | null {
  if (isStaff) return null
  return isUuid(claimedId) ? claimedId : null
}

export async function requireArtistNetworkAccess(userId: string): Promise<
  | { ok: true; fichas: ClaimedFicha[]; primary: ClaimedFicha; svc: ReturnType<typeof createServiceSupabase>; isStaff: boolean }
  | { ok: false; response: NextResponse }
> {
  const svc = createServiceSupabase()
  const [{ data: profile, error: profileErr }, { data, error }] = await Promise.all([
    svc.from('profiles').select('role').eq('id', userId).maybeSingle(),
    svc.from('artists').select('id, name, slug, image_url').eq('claimed_by', userId).order('name'),
  ])
  if (profileErr) {
    return { ok: false, response: NextResponse.json({ error: profileErr.message }, { status: 500 }) }
  }
  if (error) {
    return { ok: false, response: NextResponse.json({ error: error.message }, { status: 500 }) }
  }
  const isStaff = (profile as { role?: string } | null)?.role === 'admin'
  const fichas = (data ?? []) as ClaimedFicha[]
  const claimed = fichas[0]
  if (isStaff) {
    return { ok: true, fichas, primary: ARTIST_NETWORK_STAFF, svc, isStaff: true }
  }
  if (!claimed) {
    return {
      ok: false,
      response: NextResponse.json({ error: 'Solo artistas con ficha verificada.', claimed: false }, { status: 403 }),
    }
  }
  return { ok: true, fichas, primary: claimed, svc, isStaff: false }
}

/** @deprecated usar requireArtistNetworkAccess */
export const requireClaimedArtist = requireArtistNetworkAccess

export async function loadClaimedByArtistIds(
  svc: ReturnType<typeof createServiceSupabase>,
  artistIds: string[],
): Promise<Map<string, { artist: ClaimedFicha; userId: string }>> {
  const unique = Array.from(new Set(artistIds.filter(isUuid)))
  const out = new Map<string, { artist: ClaimedFicha; userId: string }>()
  if (!unique.length) return out
  const { data, error } = await svc
    .from('artists')
    .select('id, name, slug, image_url, claimed_by')
    .in('id', unique)
    .not('claimed_by', 'is', null)
  if (error) throw new Error(error.message)
  for (const row of (data ?? []) as (ClaimedFicha & { claimed_by: string | null })[]) {
    if (!row.claimed_by) continue
    out.set(row.id, {
      artist: { id: row.id, name: row.name, slug: row.slug, image_url: row.image_url },
      userId: row.claimed_by,
    })
  }
  return out
}

export type ThreadMemberPublic = DirectoryArtist & { user_id: string }

export type ThreadListItem = {
  id: string
  kind: ArtistNetworkKind
  title: string | null
  last_message_at: string | null
  last_message_preview: string
  last_sender_id: string | null
  unread: boolean
  members: ThreadMemberPublic[]
  created_at: string
  updated_at: string
}

export async function membersPublicForThreads(
  svc: ReturnType<typeof createServiceSupabase>,
  threadIds: string[],
): Promise<{ byThread: Map<string, ThreadMemberPublic[]>; memberRows: ArtistNetworkMemberRow[] }> {
  const byThread = new Map<string, ThreadMemberPublic[]>()
  if (!threadIds.length) return { byThread, memberRows: [] }

  const { data: memberData, error: memberErr } = await svc
    .from('artist_network_members')
    .select('thread_id, user_id, artist_id, last_read_at, joined_at')
    .in('thread_id', threadIds)
  if (memberErr) throw new Error(memberErr.message)
  const memberRows = (memberData ?? []) as ArtistNetworkMemberRow[]
  const artistIds = Array.from(new Set(memberRows.map((m) => m.artist_id).filter((id): id is string => Boolean(id))))
  const artById = new Map<string, ClaimedFicha>()
  if (artistIds.length) {
    const { data: arts, error: artErr } = await svc
      .from('artists')
      .select('id, name, slug, image_url')
      .in('id', artistIds)
    if (artErr) throw new Error(artErr.message)
    for (const a of (arts ?? []) as ClaimedFicha[]) artById.set(a.id, a)
  }

  for (const m of memberRows) {
    const art = m.artist_id ? artById.get(m.artist_id) : null
    const pub: ThreadMemberPublic = m.artist_id
      ? {
          id: m.artist_id,
          name: art?.name ?? '—',
          slug: art?.slug ?? '',
          image_url: art?.image_url ?? null,
          image: displayArtistImageUrl(art?.slug, art?.image_url) ?? null,
          user_id: m.user_id,
        }
      : {
          id: '__staff__',
          name: ARTIST_NETWORK_STAFF.name,
          slug: '',
          image_url: null,
          image: null,
          user_id: m.user_id,
        }
    const list = byThread.get(m.thread_id) ?? []
    list.push(pub)
    byThread.set(m.thread_id, list)
  }
  return { byThread, memberRows }
}

export function shapeThread(
  row: ArtistNetworkThreadRow,
  members: ThreadMemberPublic[],
  myLastRead: string | null,
  myUserId: string,
): ThreadListItem {
  const lastAt = row.last_message_at
  const unread = Boolean(
    lastAt &&
      row.last_sender_id &&
      row.last_sender_id !== myUserId &&
      (!myLastRead || lastAt > myLastRead),
  )
  return {
    id: row.id,
    kind: row.kind,
    title: row.title,
    last_message_at: row.last_message_at,
    last_message_preview: row.last_message_preview,
    last_sender_id: row.last_sender_id,
    unread,
    members,
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

export type { ArtistNetworkMemberRow, ArtistNetworkMessageRow, ArtistNetworkThreadRow }
