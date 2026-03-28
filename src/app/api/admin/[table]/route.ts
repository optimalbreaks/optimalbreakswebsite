import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

const ALLOWED_TABLES = [
  'artists', 'labels', 'events', 'blog_posts', 'scenes', 'mixes', 'history_entries',
] as const
type AllowedTable = (typeof ALLOWED_TABLES)[number]

const SEARCH_COLUMNS: Record<AllowedTable, string> = {
  artists: 'name',
  labels: 'name',
  events: 'name',
  blog_posts: 'title_en',
  scenes: 'name_en',
  mixes: 'title',
  history_entries: 'title_en',
}

function validateTable(raw: string): raw is AllowedTable {
  return (ALLOWED_TABLES as readonly string[]).includes(raw)
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { table } = await params
  if (!validateTable(table)) {
    return NextResponse.json({ error: `Tabla no permitida: ${table}` }, { status: 400 })
  }

  const url = new URL(request.url)
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1)
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 50))
  const search = url.searchParams.get('search')?.trim() || ''
  const order = url.searchParams.get('order') || 'created_at'
  const dir = url.searchParams.get('dir') === 'asc' ? true : false
  const from = (page - 1) * limit
  const to = from + limit - 1

  const sb = createServiceSupabase()
  let query = sb.from(table).select('*', { count: 'exact' })

  if (search) {
    query = query.ilike(SEARCH_COLUMNS[table], `%${search}%`)
  }
  query = query.order(order, { ascending: dir }).range(from, to)

  const { data, error, count } = await query
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ data, count, page, limit })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { table } = await params
  if (!validateTable(table)) {
    return NextResponse.json({ error: `Tabla no permitida: ${table}` }, { status: 400 })
  }

  const body = await request.json()
  const sb = createServiceSupabase()
  const { data, error } = await sb.from(table).insert(body).select().single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data, { status: 201 })
}

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { table } = await params
  if (!validateTable(table)) {
    return NextResponse.json({ error: `Tabla no permitida: ${table}` }, { status: 400 })
  }

  const body = await request.json()
  const { id, ...fields } = body
  if (!id) {
    return NextResponse.json({ error: 'Se requiere el campo id' }, { status: 400 })
  }

  const sb = createServiceSupabase()
  const { data, error } = await sb.from(table).update(fields).eq('id', id).select().single()

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json(data)
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ table: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { table } = await params
  if (!validateTable(table)) {
    return NextResponse.json({ error: `Tabla no permitida: ${table}` }, { status: 400 })
  }

  const url = new URL(request.url)
  const id = url.searchParams.get('id')
  if (!id) {
    return NextResponse.json({ error: 'Se requiere ?id=uuid' }, { status: 400 })
  }

  const sb = createServiceSupabase()
  const { error } = await sb.from(table).delete().eq('id', id)

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
  return NextResponse.json({ ok: true })
}
