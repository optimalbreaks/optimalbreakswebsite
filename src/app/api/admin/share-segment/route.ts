// ============================================
// OPTIMAL BREAKS — Fragmento de audio elegido (IG / R / F), solo admins
//
// GET ?keys=a,b → { starts: { [key]: segundos } }
// POST { key, start } → guarda el arranque elegido en el selector.
// Así el iPhone y el PC generan el mismo vídeo con el mismo trozo de cada tema.
// Ver `share-audio.ts` y `supabase/migrations/109_share_segment_starts.sql`.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

export const runtime = 'nodejs'

const MAX_KEYS = 20
const MAX_KEY_LEN = 400

function table() {
  return createServiceSupabase().from('share_segment_starts')
}

function decodeKey(raw: string): string {
  try {
    return decodeURIComponent(raw).trim()
  } catch {
    return raw.trim()
  }
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  const keys = (request.nextUrl.searchParams.get('keys') || '')
    .split(',')
    .map(decodeKey)
    .filter((k) => k && k.length <= MAX_KEY_LEN)
    .slice(0, MAX_KEYS)
  if (!keys.length) return NextResponse.json({ starts: {} })
  const { data, error } = await table().select('key, start_sec').in('key', keys)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const starts = Object.fromEntries((data ?? []).map((r) => [r.key, Number(r.start_sec)]))
  return NextResponse.json({ starts }, { headers: { 'Cache-Control': 'no-store' } })
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response
  let body: { key?: unknown; start?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const key = typeof body.key === 'string' ? body.key.trim() : ''
  const start = Number(body.start)
  if (!key || key.length > MAX_KEY_LEN || !Number.isFinite(start) || start < 0) {
    return NextResponse.json({ error: 'key o start no válidos' }, { status: 400 })
  }
  const { error } = await table().upsert(
    { key, start_sec: Math.round(start * 100) / 100, updated_by: auth.userId, updated_at: new Date().toISOString() },
    { onConflict: 'key' },
  )
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
