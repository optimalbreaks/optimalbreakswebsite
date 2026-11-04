import { NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { GIFT_PROOF_BUCKET } from '@/lib/gift-download'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function mimeOf(path: string): string {
  if (path.endsWith('.png')) return 'image/png'
  if (path.endsWith('.webp')) return 'image/webp'
  return 'image/jpeg'
}

/** La captura no tiene URL pública. Solo la ve un admin, por esta ruta. */
export async function GET(request: Request) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const url = new URL(request.url)
  const id = url.searchParams.get('id') || ''
  const which = url.searchParams.get('which')
  if (!UUID_RE.test(id) || (which !== 'site' && which !== 'artist')) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }

  const svc = createServiceSupabase()
  const { data: row, error } = await svc
    .from('gift_download_requests')
    .select('shot_site_path, shot_artist_path')
    .eq('id', id)
    .maybeSingle()
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const objectPath = which === 'site' ? row?.shot_site_path : row?.shot_artist_path
  if (!objectPath) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const downloaded = await svc.storage.from(GIFT_PROOF_BUCKET).download(objectPath)
  if (downloaded.error || !downloaded.data) {
    return NextResponse.json({ error: 'not found' }, { status: 404 })
  }
  const buf = Buffer.from(await downloaded.data.arrayBuffer())
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      'Content-Type': mimeOf(objectPath),
      'Cache-Control': 'private, no-store',
    },
  })
}
