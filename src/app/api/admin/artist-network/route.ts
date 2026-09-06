import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { isUuid, membersPublicForThreads } from '@/lib/artist-network'
import type { ArtistNetworkMessageRow, ArtistNetworkThreadRow } from '@/types/database'

export const dynamic = 'force-dynamic'

// GET /api/admin/artist-network — listado de hilos
// GET /api/admin/artist-network?thread_id= — mensajes de un hilo
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const svc = createServiceSupabase()
  const threadId = new URL(request.url).searchParams.get('thread_id')?.trim() || ''

  if (threadId) {
    if (!isUuid(threadId)) return NextResponse.json({ error: 'Hilo no válido.' }, { status: 400 })
    const { data: thread, error: thErr } = await svc
      .from('artist_network_threads')
      .select('id, kind, title, dm_key, created_by, last_message_at, last_message_preview, last_sender_id, created_at, updated_at')
      .eq('id', threadId)
      .maybeSingle()
    if (thErr) return NextResponse.json({ error: thErr.message }, { status: 500 })
    if (!thread) return NextResponse.json({ error: 'Hilo no encontrado.' }, { status: 404 })

    const { data: messages, error: msgErr } = await svc
      .from('artist_network_messages')
      .select('id, thread_id, sender_id, body, created_at')
      .eq('thread_id', threadId)
      .order('created_at', { ascending: true })
      .limit(800)
    if (msgErr) return NextResponse.json({ error: msgErr.message }, { status: 500 })

    const { byThread } = await membersPublicForThreads(svc, [threadId])
    const members = byThread.get(threadId) ?? []
    const senderName = new Map(members.map((m) => [m.user_id, m.name]))

    return NextResponse.json({
      data: {
        thread,
        members,
        messages: ((messages ?? []) as ArtistNetworkMessageRow[]).map((m) => ({
          ...m,
          sender_name: senderName.get(m.sender_id) ?? '—',
        })),
      },
    })
  }

  const { data: threads, error } = await svc
    .from('artist_network_threads')
    .select('id, kind, title, dm_key, created_by, last_message_at, last_message_preview, last_sender_id, created_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const rows = (threads ?? []) as ArtistNetworkThreadRow[]
  const ids = rows.map((r) => r.id)
  const { byThread } = await membersPublicForThreads(svc, ids)

  return NextResponse.json({
    data: rows.map((row) => ({
      ...row,
      members: byThread.get(row.id) ?? [],
    })),
  })
}
