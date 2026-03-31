import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  const sb = createServiceSupabase()
  const [{ data: udata, error: uerr }, { data: profile, error: perr }] = await Promise.all([
    sb.auth.admin.getUserById(id),
    sb.from('profiles').select('*').eq('id', id).maybeSingle(),
  ])

  if (uerr || !udata?.user) {
    return NextResponse.json({ error: uerr?.message || 'Usuario no encontrado' }, { status: 404 })
  }
  if (perr) {
    return NextResponse.json({ error: perr.message }, { status: 500 })
  }

  const u = udata.user
  return NextResponse.json({
    id: u.id,
    email: u.email ?? '',
    last_sign_in_at: u.last_sign_in_at ?? null,
    created_at: u.created_at,
    profile: profile,
  })
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const { id } = await params
  if (!id) {
    return NextResponse.json({ error: 'Falta id' }, { status: 400 })
  }

  let body: { role?: string }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const role = body.role
  if (role !== 'user' && role !== 'admin') {
    return NextResponse.json({ error: 'role debe ser user o admin' }, { status: 400 })
  }

  const sb = createServiceSupabase()

  if (role === 'user' && auth.userId === id) {
    const { count, error: cErr } = await sb
      .from('profiles')
      .select('*', { count: 'exact', head: true })
      .eq('role', 'admin')
    if (cErr) {
      return NextResponse.json({ error: cErr.message }, { status: 500 })
    }
    if ((count ?? 0) <= 1) {
      return NextResponse.json(
        { error: 'No puedes quitarte el rol admin si eres el único administrador.' },
        { status: 400 },
      )
    }
  }

  const { data, error } = await sb.from('profiles').update({ role }).eq('id', id).select().single()
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json(data)
}
