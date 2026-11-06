// ============================================
// OPTIMAL BREAKS — Descarga de una sesión con URL propia
// GET /descargar/<slug>.mp3 → 302 al asset (el botón de descarga; el archivo no pasa por Vercel).
// GET /descargar/<slug>.mp3?play=1 → el ▶. GitHub lo sirve como descarga y el iPhone no lo reproduce;
// este camino reenvía el trozo con audio/mpeg.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createCachedSupabase } from '@/lib/supabase-server'
import { streamReleaseMp3 } from '@/lib/audio-upstream'

export const maxDuration = 60

export async function GET(req: NextRequest, { params }: { params: Promise<{ file: string }> }) {
  const { file } = await params
  const slug = /^([a-z0-9-]{2,})\.mp3$/i.exec(file)?.[1]?.toLowerCase()
  if (!slug) return new NextResponse('Not found', { status: 404 })

  const { data } = await createCachedSupabase()
    .from('mixes')
    .select('download_url')
    .eq('slug', slug)
    .maybeSingle()
  const target = (data as { download_url?: string | null } | null)?.download_url?.trim()
  if (!target?.startsWith('https://')) return new NextResponse('Not found', { status: 404 })

  // El ▶ (?play=1) no puede seguir el 302: GitHub manda el MP3 como descarga
  // y el iPhone no lo reproduce. El botón de descargar sigue siendo el 302.
  if (req.nextUrl.searchParams.get('play') === '1') {
    return streamReleaseMp3(req, target)
  }

  return NextResponse.redirect(target, {
    status: 302,
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  })
}
