// Pase diario 12:05 hora de Madrid. Vercel cron es UTC: 10:05 en verano y 11:05 en invierno.
// 1. Lanzamientos de los artistas del Top 100 → publicados.
// 2. Lista de Breaks del día → lo que no entró por 1 queda pendiente de validar.
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
    return NextResponse.json({ ok: true, skipped: 'not-1205-madrid' })
  }
  const result = await runBeatportGenreImport({ trigger: 'cron' })
  return NextResponse.json(result)
}
