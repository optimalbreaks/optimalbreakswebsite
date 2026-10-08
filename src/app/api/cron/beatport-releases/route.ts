// Pase diario 12:10 hora de Madrid. Vercel cron es UTC: 10:10 en verano y 11:10 en invierno.
import { NextRequest, NextResponse } from 'next/server'
import { madridHour, runBeatportGenreImport } from '@/lib/beatport-genre-import'

export const maxDuration = 300

function cronAuthorized(request: NextRequest): boolean {
  const secret = process.env.CRON_SECRET?.trim()
  if (!secret) return false
  return request.headers.get('authorization') === `Bearer ${secret}`
}

export async function GET(request: NextRequest) {
  if (!cronAuthorized(request)) {
    return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  }
  if (madridHour() !== 12) {
    return NextResponse.json({ ok: true, skipped: 'not-1210-madrid' })
  }
  const result = await runBeatportGenreImport({ trigger: 'cron' })
  return NextResponse.json(result)
}
