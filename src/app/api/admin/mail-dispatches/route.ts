import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase, selectByIds } from '@/lib/supabase-admin'
import type { MailDispatchKind, MailDispatchRow, MailDispatchStatus } from '@/types/database'

export const dynamic = 'force-dynamic'

const KINDS: MailDispatchKind[] = ['claim_approved', 'booking_new']
const STATUSES: MailDispatchStatus[] = ['sent', 'failed', 'skipped']

function isKind(value: string): value is MailDispatchKind {
  return (KINDS as string[]).includes(value)
}

function isStatus(value: string): value is MailDispatchStatus {
  return (STATUSES as string[]).includes(value)
}

// GET /api/admin/mail-dispatches?kind=&status=&limit=
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const params = new URL(request.url).searchParams
  const kind = params.get('kind') || ''
  const status = params.get('status') || ''
  const limitRaw = Number(params.get('limit') || 200)
  const limit = Number.isFinite(limitRaw) ? Math.min(Math.max(limitRaw, 1), 500) : 200

  const svc = createServiceSupabase()
  let query = svc.from('mail_dispatches').select('*').order('sent_at', { ascending: false }).limit(limit)
  if (kind && isKind(kind)) query = query.eq('kind', kind)
  if (status && isStatus(status)) query = query.eq('status', status)

  const { data, error } = await query
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const rows = (data as MailDispatchRow[]) || []
  const artistIds = Array.from(new Set(rows.map((r) => r.artist_id).filter((v): v is string => !!v)))
  const artistById: Record<string, { name: string; slug: string }> = {}
  if (artistIds.length) {
    const { data: arts } = await selectByIds<{ id: string; name: string; slug: string }>(artistIds, (chunk) =>
      svc.from('artists').select('id, name, slug').in('id', chunk),
    )
    for (const a of arts || []) artistById[a.id] = { name: a.name, slug: a.slug }
  }

  return NextResponse.json({
    data: rows.map((r) => ({
      ...r,
      artist_name: r.artist_id ? artistById[r.artist_id]?.name ?? null : null,
      artist_slug: r.artist_id ? artistById[r.artist_id]?.slug ?? null : null,
    })),
  })
}
