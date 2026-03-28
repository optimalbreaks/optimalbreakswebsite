import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import type { Database } from '@/types/database'

export type AdminCheckResult =
  | { ok: true; userId: string }
  | { ok: false; response: NextResponse }

export async function requireAdmin(request: Request): Promise<AdminCheckResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||
    ''
  ).trim()

  if (!url || !key) {
    return { ok: false, response: NextResponse.json({ error: 'Server config' }, { status: 500 }) }
  }

  const cookieStore = await cookies()
  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(c: { name: string; value: string; options: CookieOptions }[]) {
        try { c.forEach(({ name, value, options }) => cookieStore.set(name, value, options)) } catch {}
      },
    },
  })

  const { data: { user }, error } = await supabase.auth.getUser()
  if (error || !user) {
    return { ok: false, response: NextResponse.json({ error: 'No autenticado' }, { status: 401 }) }
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('role')
    .eq('id', user.id)
    .single() as { data: { role: string } | null }

  if (profile?.role !== 'admin') {
    return { ok: false, response: NextResponse.json({ error: 'Sin permisos de administrador' }, { status: 403 }) }
  }

  return { ok: true, userId: user.id }
}
