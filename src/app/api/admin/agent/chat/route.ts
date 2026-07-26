import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import {
  inferChatIntent,
  normalizeChatIntent,
  uploadChatImages,
  type ChatHistoryItem,
  type ChatIntent,
} from '@/lib/admin-chat'
import {
  appendChatMessages,
  ensureChatThread,
  executePendingOps,
  listChatThreads,
  loadChatThread,
  loadLatestPendingOps,
  looksLikeCancel,
  looksLikeConfirm,
  pendingOpsSummary,
  runAdminChatAgent,
  type PendingOp,
} from '@/lib/admin-chat-agent'

export const maxDuration = 300

/**
 * GET /api/admin/agent/chat
 * ?threads=1 → lista hilos
 * ?thread_id=uuid → mensajes del hilo
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  try {
    const url = request.nextUrl
    if (url.searchParams.get('threads') === '1') {
      const threads = await listChatThreads(auth.userId)
      return NextResponse.json({ threads })
    }
    const threadId = url.searchParams.get('thread_id')
    if (threadId) {
      const data = await loadChatThread({ userId: auth.userId, threadId })
      if (!data) return NextResponse.json({ error: 'Hilo no encontrado' }, { status: 404 })
      return NextResponse.json(data)
    }
    return NextResponse.json(
      { error: 'Usa ?threads=1 o ?thread_id=' },
      { status: 400 },
    )
  } catch (e) {
    return NextResponse.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    )
  }
}

/**
 * POST /api/admin/agent/chat
 * Agente conversacional con tools. Escrituras solo tras confirm_ops / «sí».
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
    let intent: ChatIntent | null = null
    let threadId: string | null = null
    let confirmOps: PendingOp[] | null = null
    let cancelOps = false

    if (contentType.includes('multipart/form-data')) {
      const form = await request.formData()
      message = String(form.get('message') || '')
      intent = normalizeChatIntent(form.get('intent'))
      threadId = form.get('thread_id') ? String(form.get('thread_id')) : null
      cancelOps = String(form.get('cancel_ops') || '') === '1'
      const confirmRaw = form.get('confirm_ops')
      if (typeof confirmRaw === 'string' && confirmRaw.trim()) {
        try {
          confirmOps = JSON.parse(confirmRaw) as PendingOp[]
        } catch {
          confirmOps = null
        }
      }
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
      intent = normalizeChatIntent(body.intent)
      if (Array.isArray(body.history)) history = body.history
      if (Array.isArray(body.image_urls)) {
        preUploadedUrls = body.image_urls.filter(
          (u: unknown) => typeof u === 'string' && String(u).startsWith('https://'),
        )
      }
      if (typeof body.thread_id === 'string') threadId = body.thread_id
      if (Array.isArray(body.confirm_ops)) confirmOps = body.confirm_ops as PendingOp[]
      cancelOps = Boolean(body.cancel_ops)
    }

    // Recuperar pending_ops del hilo si el cliente dijo «sí»/«cancelar» sin adjuntarlas.
    // Si no hay ops en el hilo, el mensaje sigue al agente (memoria conversacional:
    // «¿lo añado?» → «sí» → stage_* → tarjeta Confirmar).
    if (
      threadId &&
      ((!(confirmOps && confirmOps.length) && looksLikeConfirm(message)) ||
        (!cancelOps && looksLikeCancel(message)))
    ) {
      try {
        const recovered = await loadLatestPendingOps({
          userId: auth.userId,
          threadId,
        })
        if (recovered.length) {
          if (looksLikeConfirm(message) && (!confirmOps || !confirmOps.length)) {
            confirmOps = recovered
          }
          if (looksLikeCancel(message)) cancelOps = true
        }
      } catch {
        /* sin migración / hilo: el agente conversa igual */
      }
    }

    // Descartar ops (botón Cancelar, o «cancelar» con ops en cliente/hilo)
    if (cancelOps) {
      const reply = 'Operaciones descartadas. No se ha escrito nada en la BD.'
      try {
        const tid = await ensureChatThread({
          userId: auth.userId,
          threadId,
          intent,
        })
        await appendChatMessages({
          threadId: tid,
          messages: [
            { role: 'user', content: message || '(cancelar)' },
            { role: 'assistant', content: reply, pending_ops: [] },
          ],
        })
        return NextResponse.json({ ok: true, reply, pending_ops: [], thread_id: tid })
      } catch {
        return NextResponse.json({ ok: true, reply, pending_ops: [] })
      }
    }

    // Confirmar (botón, «sí» con ops en cliente, o «sí» recuperado del hilo)
    if (Array.isArray(confirmOps) && confirmOps.length > 0) {
      const results = await executePendingOps(confirmOps, request)
      const savedOk = results.some((r) => r.ok)
      const lines = results.map((r) => `${r.ok ? '✓' : '✗'} [${r.type}] ${r.summary}`)
      const reply = savedOk
        ? `Hecho. Guardado en la BD:\n${lines.join('\n')}`
        : `No se completó el guardado:\n${lines.join('\n')}`

      let tid = threadId
      try {
        tid = await ensureChatThread({ userId: auth.userId, threadId, intent })
        await appendChatMessages({
          threadId: tid,
          messages: [
            { role: 'user', content: message || 'Confirmar' },
            { role: 'assistant', content: reply, pending_ops: [] },
          ],
        })
      } catch {
        /* persistencia opcional si la migración aún no corre */
      }

      return NextResponse.json({
        ok: savedOk,
        reply,
        results,
        pending_ops: [],
        thread_id: tid,
      })
    }

    if (!message.trim() && files.length === 0 && preUploadedUrls.length === 0) {
      return NextResponse.json({ error: 'Escribe un mensaje o adjunta una imagen.' }, { status: 400 })
    }

    if (!intent) intent = inferChatIntent(message)

    const upload = files.length
      ? await uploadChatImages(files.slice(0, 4))
      : {
          urls: [] as string[],
          errors: [] as string[],
          dataUrls: [] as { mime: string; dataUrl: string; publicUrl?: string }[],
        }

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

    // Memoria: preferir historial del hilo en BD (más fiable que el del cliente)
    let historyForAgent = history
    if (threadId) {
      try {
        const thread = await loadChatThread({ userId: auth.userId, threadId })
        if (thread?.messages?.length) {
          const fromDb = thread.messages
            .filter((m) => m.role === 'user' || m.role === 'assistant')
            .map((m) => ({
              role: m.role as 'user' | 'assistant',
              content: m.content,
            }))
            .slice(-16)
          if (fromDb.length) historyForAgent = fromDb
        }
      } catch {
        /* usa history del cliente */
      }
    }

    const agent = await runAdminChatAgent({
      message,
      history: historyForAgent,
      intent,
      imageDataUrls,
      attachedPublicUrls,
      originRequest: request,
    })

    // «sí»/«ok» sin ops previas: si el agente acaba de hacer stage_* en este turno,
    // aplicar ya (evita el limbo «¿lo añado?» → «sí» → otra vez Confirmar).
    let reply = agent.reply
    let pendingOut = agent.pending_ops
    let execResults: Awaited<ReturnType<typeof executePendingOps>> = []
    let savedOk = false
    if (looksLikeConfirm(message) && agent.pending_ops.length > 0) {
      execResults = await executePendingOps(agent.pending_ops, request)
      savedOk = execResults.some((r) => r.ok)
      const lines = execResults.map((r) => `${r.ok ? '✓' : '✗'} [${r.type}] ${r.summary}`)
      reply = savedOk
        ? `Hecho. Guardado en la BD:\n${lines.join('\n')}`
        : `No se completó el guardado:\n${lines.join('\n')}`
      pendingOut = []
    }

    let tid = threadId
    try {
      tid = await ensureChatThread({
        userId: auth.userId,
        threadId,
        title: message.slice(0, 80) || 'Chat editorial',
        intent,
      })
      await appendChatMessages({
        threadId: tid,
        messages: [
          {
            role: 'user',
            content: message || '(captura / imagen)',
            attached_urls: attachedPublicUrls.length ? attachedPublicUrls : null,
          },
          {
            role: 'assistant',
            content: reply,
            pending_ops: pendingOut.length ? pendingOut : null,
            tool_trace: agent.tool_trace.length ? agent.tool_trace : null,
          },
        ],
      })
    } catch {
      /* tablas 062 pueden no existir aún en el entorno */
    }

    return NextResponse.json({
      ok: execResults.length ? savedOk : true,
      reply,
      pending_ops: pendingOut,
      pending_summary: pendingOpsSummary(pendingOut),
      tool_trace: agent.tool_trace,
      attached_urls: attachedPublicUrls,
      upload_errors: upload.errors,
      thread_id: tid,
      results: execResults,
      saved: savedOk,
      needs_confirm: pendingOut.length > 0,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
