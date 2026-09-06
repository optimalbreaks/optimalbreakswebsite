import { NextRequest, NextResponse } from 'next/server'
import { getRouteUser } from '@/lib/admin-auth'
import {
  ARTIST_NETWORK_MESSAGE_MAX,
  isUuid,
  membersPublicForThreads,
  previewOf,
  requireArtistNetworkAccess,
  shapeThread,
} from '@/lib/artist-network'
import type { ArtistNetworkMemberRow, ArtistNetworkMessageRow, ArtistNetworkThreadRow } from '@/types/database'

export const dynamic = 'force-dynamic'

async function assertMember(
  svc: ReturnType<typeof import('@/lib/supabase-admin').createServiceSupabase>,
  threadId: string,
  userId: string,
) {
  const { data } = await svc
    .from('artist_network_members')
    .select('thread_id, user_id, artist_id, last_read_at, joined_at')
    .eq('thread_id', threadId)
    .eq('user_id', userId)
    .maybeSingle()
  return (data as ArtistNetworkMemberRow | null) ?? null
}

export async function GET(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response
  const gate = await requireArtistNetworkAccess(auth.userId)
  if (!gate.ok) return gate.response

  const { id } = await context.params
  if (!isUuid(id)) return NextResponse.json({ error: 'Hilo no válido.' }, { status: 400 })

  const mine = await assertMember(gate.svc, id, auth.userId)
  if (!mine) return NextResponse.json({ error: 'No estás en este hilo.' }, { status: 403 })

  const { data: thread, error: thErr } = await gate.svc
    .from('artist_network_threads')
    .select('id, kind, title, dm_key, created_by, last_message_at, last_message_preview, last_sender_id, created_at, updated_at')
    .eq('id', id)
    .maybeSingle()
  if (thErr) return NextResponse.json({ error: thErr.message }, { status: 500 })
  const row = thread as ArtistNetworkThreadRow | null
  if (!row) return NextResponse.json({ error: 'Hilo no encontrado.' }, { status: 404 })

  const { data: messages, error: msgErr } = await gate.svc
    .from('artist_network_messages')
    .select('id, thread_id, sender_id, body, created_at')
    .eq('thread_id', id)
    .order('created_at', { ascending: true })
    .limit(400)
  if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

  const now = new Date().toISOString()
  await gate.svc
    .from('artist_network_members')
    .update({ last_read_at: now } as never)
    .eq('thread_id', id)
    .eq('user_id', auth.userId)

  const { byThread } = await membersPublicForThreads(gate.svc, [id])
  const members = byThread.get(id) ?? []
  const senderName = new Map(members.map((m) => [m.user_id, m.name]))

  return NextResponse.json({
    data: {
      thread: shapeThread({ ...row, last_message_at: row.last_message_at }, members, now, auth.userId),
      messages: ((messages ?? []) as ArtistNetworkMessageRow[]).map((m) => ({
        ...m,
        sender_name: senderName.get(m.sender_id) ?? '—',
      })),
    },
  })
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const auth = await getRouteUser()
  if (!auth.ok) return auth.response
  const gate = await requireArtistNetworkAccess(auth.userId)
  if (!gate.ok) return gate.response

  const { id } = await context.params
  if (!isUuid(id)) return NextResponse.json({ error: 'Hilo no válido.' }, { status: 400 })

  const mine = await assertMember(gate.svc, id, auth.userId)
  if (!mine) return NextResponse.json({ error: 'No estás en este hilo.' }, { status: 403 })

  let body: Record<string, unknown>
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const text = String(body.body || '').trim()
  if (!text) return NextResponse.json({ error: 'Escribe un mensaje.' }, { status: 400 })
  if (text.length > ARTIST_NETWORK_MESSAGE_MAX) {
    return NextResponse.json({ error: 'El mensaje es demasiado largo.' }, { status: 400 })
  }

  const now = new Date().toISOString()
  const { data: message, error: insErr } = await gate.svc
    .from('artist_network_messages')
    .insert({ thread_id: id, sender_id: auth.userId, body: text })
    .select('id, thread_id, sender_id, body, created_at')
    .single()
  if (insErr) return NextResponse.json({ error: insErr.message }, { status: 500 })

  await gate.svc
    .from('artist_network_threads')
    .update({
      last_message_at: now,
      last_message_preview: previewOf(text),
      last_sender_id: auth.userId,
    } as never)
    .eq('id', id)

  await gate.svc
    .from('artist_network_members')
    .update({ last_read_at: now } as never)
    .eq('thread_id', id)
    .eq('user_id', auth.userId)

  return NextResponse.json({ data: message })
}
