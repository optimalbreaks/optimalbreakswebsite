import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

const MAX_SIZE = 5 * 1024 * 1024
const ALLOWED_MIMES = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml']

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const formData = await request.formData()
  const file = formData.get('file')
  if (!file || !(file instanceof File)) {
    return NextResponse.json({ error: 'Campo "file" requerido' }, { status: 400 })
  }

  if (!ALLOWED_MIMES.includes(file.type)) {
    return NextResponse.json(
      { error: `Tipo MIME no permitido: ${file.type}` },
      { status: 400 },
    )
  }

  if (file.size > MAX_SIZE) {
    return NextResponse.json(
      { error: `Archivo demasiado grande (máx ${MAX_SIZE / 1024 / 1024}MB)` },
      { status: 400 },
    )
  }

  const customPath = formData.get('path')?.toString().trim()
  const ext = file.name.split('.').pop() || 'bin'
  const storagePath = customPath || `uploads/${Date.now()}_${file.name.replace(/\s+/g, '_')}`

  const buffer = Buffer.from(await file.arrayBuffer())
  const sb = createServiceSupabase()

  const { error } = await sb.storage.from('media').upload(storagePath, buffer, {
    contentType: file.type,
    upsert: true,
  })

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const { data: publicUrl } = sb.storage.from('media').getPublicUrl(storagePath)

  return NextResponse.json({ url: publicUrl.publicUrl })
}
