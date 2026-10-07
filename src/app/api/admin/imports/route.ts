import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { BEATPORT_IMPORT_FROM, decideImport, runBeatportGenreImport } from '@/lib/beatport-genre-import'
import { createServiceSupabase } from '@/lib/supabase-admin'

export const maxDuration = 300

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const sb = createServiceSupabase()
  const [pendingRes, countRes, runRes] = await Promise.all([
    sb
      .from('chart_import_queue')
      .select('id, beatport_track_id, link_url, title, mix_name, artists, label, artwork_url, sample_url, bpm, music_key, release_date, release_year, created_at')
      .eq('status', 'pending')
      .order('release_date', { ascending: false })
      .order('created_at', { ascending: false })
      .limit(200),
    sb.from('chart_import_queue').select('id', { count: 'exact', head: true }).eq('status', 'pending'),
    sb
      .from('chart_import_runs')
      .select('started_at, finished_at, trigger, ok, seen, queued, auto_approved, skipped_known, error')
      .not('finished_at', 'is', null)
      .order('started_at', { ascending: false })
      .limit(1)
      .maybeSingle(),
  ])
  const err = pendingRes.error || countRes.error || runRes.error
  if (err) return NextResponse.json({ error: err.message }, { status: 500 })

  return NextResponse.json({
    import_from: BEATPORT_IMPORT_FROM,
    pending_count: countRes.count ?? 0,
    pending: pendingRes.data ?? [],
    last_run: runRes.data,
  })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let body: { action?: string; id?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  if (body.action === 'run') {
    const result = await runBeatportGenreImport({ trigger: 'manual', userId: auth.userId })
    return NextResponse.json(result)
  }

  if (body.action !== 'approve' && body.action !== 'discard' && body.action !== 'restore') {
    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  }
  if (!body.id) return NextResponse.json({ error: 'Falta el tema' }, { status: 400 })

  const result = await decideImport(body.id, body.action, auth.userId)
  if (!result.ok) return NextResponse.json({ error: result.error }, { status: 400 })
  return NextResponse.json({ ok: true })
}
