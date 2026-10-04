import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { loadAwardsBoard, type AwardsAxis, type AwardsMode } from '@/lib/awards-board'
import { createServiceSupabase } from '@/lib/supabase-admin'

export const dynamic = 'force-dynamic'
export const maxDuration = 60

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const yearRaw = (url.searchParams.get('year') || '').trim()
  let year: number | null = null
  if (yearRaw && yearRaw !== 'all') {
    const n = Number(yearRaw)
    if (!Number.isInteger(n) || n < 1950 || n > 2100) {
      return NextResponse.json({ error: 'Año no válido' }, { status: 400 })
    }
    year = n
  }

  const axis: AwardsAxis = url.searchParams.get('axis') === 'save' ? 'save' : 'release'
  const mode: AwardsMode = url.searchParams.get('mode') === 'raw' ? 'raw' : 'public'

  try {
    const board = await loadAwardsBoard(createServiceSupabase(), { year, axis, mode })
    return NextResponse.json(board)
  } catch (e) {
    const message = e instanceof Error ? e.message : 'No se pudo calcular'
    const status = message.includes('Faltan NEXT_PUBLIC') ? 503 : 500
    return NextResponse.json({ error: message }, { status })
  }
}
