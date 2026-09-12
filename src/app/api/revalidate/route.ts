import { NextRequest, NextResponse } from 'next/server'
import {
  revalidateArtistSlug,
  revalidatePublicCharts,
  revalidatePublicCatalog,
} from '@/lib/revalidate-public'

function acceptedSecrets(): string[] {
  return [
    process.env.REVALIDATE_SECRET,
    process.env.SUPABASE_SERVICE_ROLE_KEY,
    process.env.SUPABASE_SECRET_KEY,
  ]
    .map((v) => v?.trim() || '')
    .filter(Boolean)
}

async function providedSecret(request: NextRequest): Promise<string> {
  const fromQuery = request.nextUrl.searchParams.get('secret')?.trim() || ''
  try {
    const body = (await request.json()) as { secret?: unknown }
    const fromBody = typeof body?.secret === 'string' ? body.secret.trim() : ''
    return fromBody || fromQuery
  } catch {
    return fromQuery
  }
}

type RevalidateBody = {
  secret?: unknown
  artistSlug?: unknown
  slug?: unknown
  catalog?: unknown
}

/**
 * Invalidación on-demand de la Data Cache pública (p. ej. tras UPSERT NR o artista).
 * POST /api/revalidate  body: { secret, artistSlug?, catalog? }  (o ?secret=)
 * Acepta REVALIDATE_SECRET o la service role (los scripts locales ya la tienen).
 */
export async function POST(request: NextRequest) {
  const expected = acceptedSecrets()
  let body: RevalidateBody = {}
  const fromQuery = request.nextUrl.searchParams.get('secret')?.trim() || ''
  try {
    body = (await request.json()) as RevalidateBody
  } catch {
    /* query-only */
  }
  const secret =
    (typeof body?.secret === 'string' ? body.secret.trim() : '') || fromQuery
  if (!secret || !expected.includes(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const revalidated: string[] = []
  revalidatePublicCharts()
  revalidated.push('public-charts')

  const artistSlugRaw =
    typeof body.artistSlug === 'string'
      ? body.artistSlug
      : typeof body.slug === 'string'
        ? body.slug
        : ''
  const artistSlug = artistSlugRaw.trim()
  const catalogOnly =
    body.catalog === true ||
    request.nextUrl.searchParams.get('catalog') === '1'

  if (artistSlug) {
    revalidated.push(...revalidateArtistSlug(artistSlug))
  } else if (catalogOnly) {
    revalidatePublicCatalog()
    revalidated.push('public-catalog')
  }

  return NextResponse.json({
    ok: true,
    revalidated,
  })
}
