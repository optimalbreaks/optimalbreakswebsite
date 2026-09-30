// ============================================
// OPTIMAL BREAKS — Descarga de una sesión con URL propia
// GET /descargar/<slug-del-mix>.mp3 → 302 al asset de `mixes.download_url`
// (release `sesiones-descarga` de GitHub). El MP3 no pasa por Vercel.
// ============================================

import { NextResponse } from 'next/server'
import { createCachedSupabase } from '@/lib/supabase-server'

export async function GET(_req: Request, { params }: { params: Promise<{ file: string }> }) {
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

  return NextResponse.redirect(target, {
    status: 302,
    headers: { 'Cache-Control': 'public, max-age=300, s-maxage=300' },
  })
}
