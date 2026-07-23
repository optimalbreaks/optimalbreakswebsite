import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import {
  executeChatActions,
  planChatWithOpenAI,
  uploadChatImages,
  type ChatHistoryItem,
} from '@/lib/admin-chat'

export const maxDuration = 300

/**
 * POST /api/admin/agent/chat
 * Chat editorial: texto + imágenes → plan OpenAI → upsert directo (eventos, artistas, mixes, NR, vinyl).
 * multipart/form-data: message, history (JSON), files[] (imágenes)
 * o JSON: { message, history?, image_urls? }
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const contentType = request.headers.get('content-type') || ''
    let message = ''
    let history: ChatHistoryItem[] = []
    const files: File[] = []
    let preUploadedUrls: string[] = []

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      message = String(form.get('message') || '')
      const historyRaw = form.get('history')
      if (typeof historyRaw === 'string' && historyRaw.trim()) {
        try {
          history = JSON.parse(historyRaw) as ChatHistoryItem[]
        } catch {
          history = []
        }
      }
      for (const [key, val] of Array.from(form.entries())) {
        if ((key === 'file' || key === 'files' || key.startsWith('file')) && val instanceof File) {
          files.push(val)
        }
      }
    } else {
      const body = await request.json()
      message = typeof body.message === 'string' ? body.message : ''
      if (Array.isArray(body.history)) history = body.history
      if (Array.isArray(body.image_urls)) {
        preUploadedUrls = body.image_urls.filter(
          (u: unknown) => typeof u === 'string' && String(u).startsWith('https://'),
        )
      }
    }

    if (!message.trim() && files.length === 0 && preUploadedUrls.length === 0) {
      return NextResponse.json({ error: 'Escribe un mensaje o adjunta una imagen.' }, { status: 400 })
    }

    const upload = files.length ? await uploadChatImages(files) : { urls: [] as string[], errors: [] as string[] }
    const attachedPublicUrls = [...preUploadedUrls, ...upload.urls]

    const imageDataUrls: { mime: string; dataUrl: string; publicUrl?: string }[] = []
    for (let i = 0; i < files.length && i < 4; i++) {
      const f = files[i]
      const buf = Buffer.from(await f.arrayBuffer())
      const mime = f.type || 'image/jpeg'
      imageDataUrls.push({
        mime,
        dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
        publicUrl: upload.urls[i],
      })
    }
    // Capturas llegadas por Share Target (solo URL pública): bajar para visión OCR
    if (imageDataUrls.length === 0 && preUploadedUrls.length > 0) {
      for (const url of preUploadedUrls.slice(0, 2)) {
        try {
          const imgRes = await fetch(url)
          if (!imgRes.ok) continue
          const mime = imgRes.headers.get('content-type') || 'image/jpeg'
          if (!mime.startsWith('image/')) continue
          const buf = Buffer.from(await imgRes.arrayBuffer())
          if (buf.length > 12 * 1024 * 1024) continue
          imageDataUrls.push({
            mime,
            dataUrl: `data:${mime};base64,${buf.toString('base64')}`,
            publicUrl: url,
          })
        } catch {
          /* sigue sin esa imagen */
        }
      }
    }

    const plan = await planChatWithOpenAI({
      message,
      history,
      imageDataUrls,
      attachedPublicUrls,
    })

    const results = await executeChatActions(plan.actions, request, attachedPublicUrls)

    const lines = results.map((r) => `${r.ok ? '✓' : '✗'} [${r.type}] ${r.summary}`)
    const assistantMessage = [plan.reply, lines.length ? '\n' + lines.join('\n') : '']
      .join('')
      .trim()

    return NextResponse.json({
      ok: results.every((r) => r.ok) || results.length === 0,
      reply: assistantMessage,
      plan_reply: plan.reply,
      actions: plan.actions,
      results,
      attached_urls: attachedPublicUrls,
      upload_errors: upload.errors,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
