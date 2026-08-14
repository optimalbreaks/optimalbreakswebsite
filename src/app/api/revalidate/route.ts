import { NextRequest, NextResponse } from 'next/server'
import { revalidatePublicCharts } from '@/lib/revalidate-public'

/**
 * Invalidación on-demand de la Data Cache pública (p. ej. tras UPSERT NR local).
 * POST /api/revalidate?secret=<REVALIDATE_SECRET>
 */
export async function POST(request: NextRequest) {
  const secret = request.nextUrl.searchParams.get('secret')?.trim()
  const expected = process.env.REVALIDATE_SECRET?.trim()
  if (!expected || secret !== expected) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  revalidatePublicCharts()

  return NextResponse.json({
    ok: true,
    revalidated: ['public-charts'],
  })
}
