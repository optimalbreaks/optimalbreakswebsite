import { NextRequest, NextResponse } from 'next/server'
import { revalidatePublicCharts } from '@/lib/revalidate-public'

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

/**
 * Invalidación on-demand de la Data Cache pública (p. ej. tras UPSERT NR local).
 * POST /api/revalidate  body: { secret }  (o ?secret=)
 * Acepta REVALIDATE_SECRET o la service role (los scripts locales ya la tienen).
 */
export async function POST(request: NextRequest) {
  const expected = acceptedSecrets()
  const secret = await providedSecret(request)
  if (!secret || !expected.includes(secret)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  revalidatePublicCharts()

  return NextResponse.json({
    ok: true,
    revalidated: ['public-charts'],
  })
}
