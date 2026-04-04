import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { translateSceneRowEsToEn } from '@/lib/translate-es-en-openai'

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let body: { id?: string; slug?: string; force?: boolean }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const id = typeof body.id === 'string' ? body.id.trim() : ''
  const slug = typeof body.slug === 'string' ? body.slug.trim() : ''
  if (!id && !slug) {
    return NextResponse.json({ error: 'Se requiere id o slug' }, { status: 400 })
  }

  const force = Boolean(body.force)
  const sb = createServiceSupabase()

  let query = sb.from('scenes').select('id, slug, name_es, name_en, description_es, description_en').limit(1)
  query = id ? query.eq('id', id) : query.eq('slug', slug)

  const { data: row, error: fetchErr } = await query.single()
  if (fetchErr || !row) {
    return NextResponse.json({ error: fetchErr?.message || 'Escena no encontrada' }, { status: 404 })
  }

  const nameEs = (row.name_es ?? '').trim()
  const descEs = (row.description_es ?? '').trim()
  if (!nameEs && !descEs) {
    return NextResponse.json({ error: 'No hay texto en español para traducir' }, { status: 400 })
  }

  if (!force) {
    const needName = nameEs && !(row.name_en ?? '').trim()
    const needDesc = descEs && !(row.description_en ?? '').trim()
    if (!needName && !needDesc) {
      return NextResponse.json(
        {
          error:
            'El inglés ya está relleno para todo el contenido en español. Usa forzar para regenerar o vacía un campo EN.',
          code: 'ALREADY_FILLED',
        },
        { status: 409 },
      )
    }
  }

  try {
    const { name_en, description_en } = await translateSceneRowEsToEn({
      name_es: nameEs,
      description_es: descEs,
    })

    const patch: { name_en?: string; description_en?: string } = {}
    if (force || !(row.name_en ?? '').trim()) patch.name_en = name_en
    if (force || !(row.description_en ?? '').trim()) patch.description_en = description_en

    if (Object.keys(patch).length === 0) {
      return NextResponse.json({ error: 'Nada que actualizar' }, { status: 400 })
    }

    const { data: updated, error: upErr } = await sb
      .from('scenes')
      .update(patch)
      .eq('id', row.id)
      .select()
      .single()

    if (upErr) {
      return NextResponse.json({ error: upErr.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, row: updated })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 502 })
  }
}
