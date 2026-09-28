// ============================================
// OPTIMAL BREAKS — temas de una semana o un año de /charts
// La página pública solo pinta totales. Esto devuelve las filas al abrir
// el acordeón, o dónde abrir un ?play= / #chart-row- sin cargar el catálogo.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createCachedSupabase } from '@/lib/supabase-server'
import { PUBLIC_CHARTS_CACHE_TAG } from '@/lib/revalidate-public'
import {
  UNKNOWN_ARCHIVE_YEAR,
  loadArchiveYear,
  loadPickWeek,
  locateChartTrack,
} from '@/lib/charts-sections'

export const dynamic = 'force-dynamic'

const WEEK = /^\d{4}-\d{2}-\d{2}$/
const ID = /^[0-9a-f-]{6,}$/i

function client() {
  return createCachedSupabase(300, [PUBLIC_CHARTS_CACHE_TAG])
}

export async function GET(req: NextRequest) {
  const kind = req.nextUrl.searchParams.get('kind') || ''
  try {
    if (kind === 'picks') {
      const week = (req.nextUrl.searchParams.get('week') || '').slice(0, 10)
      if (!WEEK.test(week)) return NextResponse.json({ error: 'week' }, { status: 400 })
      const tracks = await loadPickWeek(client(), week)
      return NextResponse.json({ tracks })
    }
    if (kind === 'archive') {
      const year = req.nextUrl.searchParams.get('year') || ''
      if (year !== UNKNOWN_ARCHIVE_YEAR && !/^\d{4}$/.test(year)) {
        return NextResponse.json({ error: 'year' }, { status: 400 })
      }
      const rows = await loadArchiveYear(client(), year)
      return NextResponse.json({ rows })
    }
    if (kind === 'locate') {
      const id = req.nextUrl.searchParams.get('id') || ''
      if (!ID.test(id)) return NextResponse.json({ error: 'id' }, { status: 400 })
      const target = await locateChartTrack(client(), id)
      return NextResponse.json({ target })
    }
    return NextResponse.json({ error: 'kind' }, { status: 400 })
  } catch (err) {
    console.error('[charts/section]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'failed' }, { status: 500 })
  }
}
