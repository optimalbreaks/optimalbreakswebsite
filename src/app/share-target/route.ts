import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

/**
 * Fallback del Web Share Target cuando el Service Worker aún no intercepta el POST.
 * Sube imágenes (si hay sesión admin) y redirige al chat de captura.
 */
export async function POST(request: NextRequest) {
  const form = await request.formData()
  const title = String(form.get('title') || '').trim()
  const text = String(form.get('text') || '').trim()
  const sharedUrl = String(form.get('url') || '').trim()
  const parts = [title, text, sharedUrl].filter(Boolean)
  const message = parts.join('\n').slice(0, 4000)

  const lang =
    request.cookies.get('NEXT_LOCALE')?.value ||
    request.headers.get('accept-language')?.split(',')[0]?.slice(0, 2) ||
    'es'
  const locale = lang === 'en' ? 'en' : 'es'

  const auth = await requireAdmin(request)
  const imageUrls: string[] = []

  if (auth.ok) {
    try {
      const sb = createServiceSupabase()
      const media = [
        ...form.getAll('media'),
        ...form.getAll('files'),
        ...form.getAll('images'),
      ].filter((v): v is File => v instanceof File && v.size > 0)

      for (const file of media.slice(0, 4)) {
        if (!file.type.startsWith('image/')) continue
        if (file.size > 5 * 1024 * 1024) continue
        const ext = file.name.split('.').pop() || 'jpg'
        const path = `chat/share_${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
        const buf = Buffer.from(await file.arrayBuffer())
        const { error } = await sb.storage.from('media').upload(path, buf, {
          contentType: file.type,
          upsert: true,
        })
        if (error) continue
        const { data } = sb.storage.from('media').getPublicUrl(path)
        if (data?.publicUrl) imageUrls.push(data.publicUrl)
      }
    } catch {
      /* sigue al chat aunque falle upload */
    }
  }

  const params = new URLSearchParams()
  params.set('share', '1')
  if (message) params.set('text', message)
  if (imageUrls.length) params.set('images', imageUrls.join('|'))
  if (!auth.ok) params.set('need_login', '1')

  const dest = new URL(`/${locale}/administrator/chat?${params.toString()}`, request.url)
  return NextResponse.redirect(dest, 303)
}

export async function GET(request: NextRequest) {
  const url = request.nextUrl
  const params = new URLSearchParams()
  params.set('share', '1')
  const text = [url.searchParams.get('title'), url.searchParams.get('text'), url.searchParams.get('url')]
    .filter(Boolean)
    .join('\n')
  if (text) params.set('text', text.slice(0, 4000))
  const dest = new URL(`/es/administrator/chat?${params.toString()}`, request.url)
  return NextResponse.redirect(dest, 302)
}
