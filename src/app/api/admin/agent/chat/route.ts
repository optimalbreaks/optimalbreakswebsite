import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import {
  eventActionFromScreenshotFacts,
  executeChatActions,
  planChatWithOpenAI,
  uploadChatImages,
  type ChatHistoryItem,
} from '@/lib/admin-chat'

export const maxDuration = 300

/**
 * POST /api/admin/agent/chat
 * Chat editorial: texto + imágenes → plan OpenAI → upsert directo.
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

    const upload = files.length
      ? await uploadChatImages(files.slice(0, 4))
      : { urls: [] as string[], errors: [] as string[], dataUrls: [] as { mime: string; dataUrl: string; publicUrl?: string }[] }

    const attachedPublicUrls = [...preUploadedUrls, ...upload.urls]
    const imageDataUrls = [...upload.dataUrls]

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
          /* ignore */
        }
      }
    }

    if (files.length > 0 && upload.urls.length === 0 && upload.errors.length) {
      return NextResponse.json(
        {
          error: `No se pudieron subir las imágenes: ${upload.errors.join('; ')}`,
          upload_errors: upload.errors,
        },
        { status: 502 },
      )
    }

    const { plan, facts } = await planChatWithOpenAI({
      message,
      history,
      imageDataUrls,
      attachedPublicUrls,
    })

    // Segundo fallback por si el plan vino vacío tras un OCR útil
    if (!plan.actions.some((a) => a.type === 'event') && facts?.event_name) {
      const fb = eventActionFromScreenshotFacts(facts)
      if (fb) {
        plan.actions.unshift(fb)
        plan.reply = `He leído «${fb.name}» en la captura y lo guardo ahora.`
      }
    }

    if (
      (files.length > 0 || preUploadedUrls.length > 0) &&
      plan.actions.length === 0
    ) {
      return NextResponse.json({
        ok: false,
        reply:
          (plan.reply ? `${plan.reply}\n\n` : '') +
          'No pude crear ninguna ficha: la IA no devolvió acciones y el OCR no identificó un nombre de evento. Prueba con una captura más nítida del cartel o añade el nombre del evento en el texto.',
        plan_reply: plan.reply,
        actions: [],
        results: [],
        facts,
        attached_urls: attachedPublicUrls,
        upload_errors: upload.errors,
      })
    }

    const results = await executeChatActions(plan.actions, request, attachedPublicUrls)
    const savedOk = results.some((r) => r.ok)
    const lines = results.map((r) => `${r.ok ? '✓' : '✗'} [${r.type}] ${r.summary}`)
    const assistantMessage = [plan.reply, lines.length ? '\n' + lines.join('\n') : '']
      .join('')
      .trim()

    return NextResponse.json({
      ok: savedOk,
      reply: savedOk
        ? assistantMessage
        : `${assistantMessage}\n\nNo se guardó nada en la BD. Revisa los errores ✗ arriba.`,
      plan_reply: plan.reply,
      actions: plan.actions,
      results,
      facts,
      attached_urls: attachedPublicUrls,
      upload_errors: upload.errors,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
