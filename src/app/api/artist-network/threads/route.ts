import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import {
  artistNetworkDmKey,
  ARTIST_NETWORK_TITLE_MAX,
  isUuid,
  loadClaimedByArtistIds,
  membersPublicForThreads,
  networkSeatArtistId,
  requireArtistNetworkAccess,
  shapeThread,
} from '@/lib/artist-network'
import type { ArtistNetworkMemberRow, ArtistNetworkThreadRow } from '@/types/database'

export const dynamic = 'force-dynamic'

async function listThreads(userId: string) {
  const gate = await requireArtistNetworkAccess(userId)
  if (!gate.ok) return gate.response

  const { data: mine, error: memErr } = await gate.svc
    .from('artist_network_members')
    .select('thread_id, last_read_at')
    .eq('user_id', userId)
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
  const memberRows = (mine ?? []) as Pick<ArtistNetworkMemberRow, 'thread_id' | 'last_read_at'>[]
  if (!memberRows.length) return NextResponse.json({ data: [] })

  const ids = memberRows.map((m) => m.thread_id)
  const { data: threads, error: thErr } = await gate.svc
    .from('artist_network_threads')
    .select('id, kind, title, dm_key, created_by, last_message_at, last_message_preview, last_sender_id, created_at, updated_at')
    .in('id', ids)
    .order('updated_at', { ascending: false })
  if (thErr) return NextResponse.json({ error: thErr.message }, { status: 500 })

  const { byThread } = await membersPublicForThreads(gate.svc, ids)
  const lastRead = new Map(memberRows.map((m) => [m.thread_id, m.last_read_at]))
  const data = ((threads ?? []) as ArtistNetworkThreadRow[]).map((row) =>
    shapeThread(row, byThread.get(row.id) ?? [], lastRead.get(row.id) ?? null, userId),
  )
  data.sort((a, b) => Number(b.unread) - Number(a.unread) || b.updated_at.localeCompare(a.updated_at))
  return NextResponse.json({ data })
}

export async function GET() {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response
  return listThreads(auth.userId)
}

// POST { kind:'dm', artist_id } | { kind:'group', title, artist_ids: string[] }
export async function POST(request: NextRequest) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response
  const gate = await requireArtistNetworkAccess(auth.userId)
  if (!gate.ok) return gate.response

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const kind = String(body.kind || '')
  if (kind !== 'dm' && kind !== 'group') {
    return NextResponse.json({ error: 'kind debe ser dm o group.' }, { status: 400 })
  }

  if (kind === 'dm') {
    const artistId = String(body.artist_id || '')
    if (!isUuid(artistId)) return NextResponse.json({ error: 'Falta el artista.' }, { status: 400 })
    const map = await loadClaimedByArtistIds(gate.svc, [artistId])
    const other = map.get(artistId)
    if (!other) return NextResponse.json({ error: 'Esa ficha no está reclamada.' }, { status: 404 })
    if (other.userId === auth.userId) {
      return NextResponse.json({ error: 'No puedes escribirte a ti mismo.' }, { status: 400 })
    }

    const key = artistNetworkDmKey(auth.userId, other.userId)
    const { data: existing } = await gate.svc
      .from('artist_network_threads')
      .select('id')
      .eq('kind', 'dm')
      .eq('dm_key', key)
      .maybeSingle()
    if (existing?.id) {
      return NextResponse.json({ data: { id: existing.id, created: false } })
    }

    const { data: thread, error: insErr } = await gate.svc
      .from('artist_network_threads')
      .insert({
        kind: 'dm',
        title: null,
        dm_key: key,
        created_by: auth.userId,
        last_message_preview: '',
      })
      .select('id')
      .single()
    if (insErr) {
      if (insErr.code === '23505') {
        const { data: again } = await gate.svc
          .from('artist_network_threads')
          .select('id')
          .eq('dm_key', key)
          .maybeSingle()
        if (again?.id) return NextResponse.json({ data: { id: again.id, created: false } })
      }
      return NextResponse.json({ error: insErr.message }, { status: 500 })
    }
    if (!thread) return NextResponse.json({ error: 'No se pudo crear el hilo.' }, { status: 500 })

    const { error: memErr } = await gate.svc.from('artist_network_members').insert([
      { thread_id: thread.id, user_id: auth.userId, artist_id: networkSeatArtistId(gate.isStaff, gate.primary.id), last_read_at: new Date().toISOString() },
      { thread_id: thread.id, user_id: other.userId, artist_id: other.artist.id },
    ])
    if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
    return NextResponse.json({ data: { id: thread.id, created: true } })
  }

  const title = String(body.title || '').trim()
  if (!title) return NextResponse.json({ error: 'El grupo necesita un nombre.' }, { status: 400 })
  if (title.length > ARTIST_NETWORK_TITLE_MAX) {
    return NextResponse.json({ error: `El nombre del grupo es demasiado largo.` }, { status: 400 })
  }

  const rawIds = Array.isArray(body.artist_ids) ? body.artist_ids.map((x) => String(x)) : []
  const artistIds = Array.from(new Set(rawIds.filter(isUuid)))
  if (!artistIds.length) return NextResponse.json({ error: 'Elige al menos un artista.' }, { status: 400 })

  const map = await loadClaimedByArtistIds(gate.svc, artistIds)
  const others: { artist: { id: string; name: string; slug: string; image_url: string | null }; userId: string }[] = []
  for (const id of artistIds) {
    const hit = map.get(id)
    if (hit && hit.userId !== auth.userId) others.push(hit)
  }
  if (!others.length) return NextResponse.json({ error: 'Nadie reclamado a quien añadir.' }, { status: 400 })

  const { data: thread, error: insErr } = await gate.svc
    .from('artist_network_threads')
    .insert({
      kind: 'group',
      title,
      dm_key: null,
      created_by: auth.userId,
      last_message_preview: '',
    })
    .select('id')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })
  if (!thread) return NextResponse.json({ error: 'No se pudo crear el grupo.' }, { status: 500 })

  const seenUsers = new Set<string>([auth.userId])
  const members = [
    { thread_id: thread.id, user_id: auth.userId, artist_id: networkSeatArtistId(gate.isStaff, gate.primary.id), last_read_at: new Date().toISOString() },
  ]
  for (const o of others) {
    if (seenUsers.has(o.userId)) continue
    seenUsers.add(o.userId)
    members.push({ thread_id: thread.id, user_id: o.userId, artist_id: o.artist.id, last_read_at: null as unknown as string })
  }

  const { error: memErr } = await gate.svc.from('artist_network_members').insert(
    members.map((m) => ({
      thread_id: m.thread_id,
      user_id: m.user_id,
      artist_id: m.artist_id,
      ...(m.last_read_at ? { last_read_at: m.last_read_at } : {}),
    })),
  )
  if (memErr) return NextResponse.json({ error: memErr.message }, { status: 500 })
  return NextResponse.json({ data: { id: thread.id, created: true } })
}
