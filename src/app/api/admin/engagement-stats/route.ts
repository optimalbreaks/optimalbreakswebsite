import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

const DEFAULT_LIMIT = 30

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const raw = request.nextUrl.searchParams.get('limit')
  const parsed = raw ? parseInt(raw, 10) : DEFAULT_LIMIT
  const pLimit = Number.isFinite(parsed) ? Math.min(100, Math.max(5, parsed)) : DEFAULT_LIMIT

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  const { data, error } = await sb.rpc('admin_engagement_stats', { p_limit: pLimit })

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Error al cargar estadísticas' },
      { status: 500 },
    )
  }

  return NextResponse.json(data ?? {})
}
