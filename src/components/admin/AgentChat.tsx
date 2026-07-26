'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { consumeShareInbox } from '@/lib/share-inbox'

type ChatRole = 'user' | 'assistant'

type PendingOp = {
  kind: string
  summary: string
  [key: string]: unknown
}

type UiMessage = {
  id: string
  role: ChatRole
  content: string
  previews?: string[]
  pendingOps?: PendingOp[]
  toolTrace?: { name: string; ok: boolean; detail: string }[]
}

type Props = {
  lang: string
  /**
   * - `widget`: panel flotante (chatbot)
   * - `capture`: página /administrator/chat (Share Target / fullscreen)
   * - `embedded`: pestaña en centro de agentes
   */
  mode?: 'embedded' | 'capture' | 'widget'
  /** Query de Share Target cuando el padre ya lee useSearchParams */
  shareQuery?: { get: (name: string) => string | null } | null
}

type ChatIntent = 'event' | 'new_release' | 'vinyl' | 'mix' | 'artist' | 'label'

const INTENT_OPTIONS: {
  id: ChatIntent
  label: string
  hint: string
  placeholder: string
}[] = [
  {
    id: 'event',
    label: 'Evento',
    hint: 'Modo evento. Manda la captura del cartel o un link de entradas.',
    placeholder: 'Nota u opcional link del evento…',
  },
  {
    id: 'label',
    label: 'Sello',
    hint: 'Modo sello (record label). Escribe el nombre o pega Beatport /label/…',
    placeholder: 'Nombre del sello o beatport.com/…/label/…',
  },
  {
    id: 'artist',
    label: 'Artista',
    hint: 'Modo artista. Escribe el nombre (y notas o link Beatport si tienes).',
    placeholder: 'Nombre del artista…',
  },
  {
    id: 'new_release',
    label: 'New Release',
    hint: 'Modo New Release. Pega el link de Beatport (/track o /release).',
    placeholder: 'https://www.beatport.com/track/…',
  },
  {
    id: 'vinyl',
    label: 'Vinyl pick',
    hint: 'Modo vinyl pick. Pega Discogs y/o YouTube (y nota si quieres).',
    placeholder: 'Discogs / YouTube del vinilo…',
  },
  {
    id: 'mix',
    label: 'Mix',
    hint: 'Modo mix. Pega YouTube o SoundCloud del set.',
    placeholder: 'https://youtube.com/… o SoundCloud…',
  },
]

const WELCOME_CAPTURE =
  'Chat editorial (agente).\nElige un atajo si quieres, escribe o manda una captura. Preparo los cambios y tú confirmas antes de guardar en la BD.'

const WELCOME_EMBEDDED =
  'Agente editorial: conversamos, leo la BD y preparo altas (evento, sello, artista, NR, vinyl, mix). Nada se guarda hasta que confirmes.'

const WELCOME_WIDGET =
  'Hola. Soy el agente editorial.\nEscribe, pega un link o manda una captura. Preparo los cambios y tú confirmas antes de guardar.'

const PENDING_KEY = 'ob-admin-chat-pending'
const THREAD_KEY = 'ob-admin-chat-thread'

/** Etapas orientativas mientras el agente responde (un request, sin stream). */
const PROGRESS_STEPS = [
  { id: 'upload', label: 'Enviando mensaje', atMs: 0, pct: 12 },
  { id: 'read', label: 'Agente pensando / tools', atMs: 4_000, pct: 48 },
  { id: 'save', label: 'Preparando operaciones', atMs: 18_000, pct: 78 },
  { id: 'done', label: 'Casi listo…', atMs: 35_000, pct: 92 },
] as const

function looksLikeConfirmText(text: string) {
  return /^(sí|si|ok|vale|confirmo|confirma|confirmar|adelante|hazlo|guarda|guardar|yes)\b/i.test(
    text.trim(),
  )
}

function AgentChatCore({ lang, mode = 'embedded', shareQuery = null }: Props) {
  const capture = mode === 'capture'
  const widget = mode === 'widget'
  const compact = capture || widget
  const router = useRouter()
  const searchParams = shareQuery
  const welcome = widget ? WELCOME_WIDGET : capture ? WELCOME_CAPTURE : WELCOME_EMBEDDED
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: welcome,
    },
  ])
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [remoteImageUrls, setRemoteImageUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [progressPct, setProgressPct] = useState(0)
  const [progressLabel, setProgressLabel] = useState('')
  const [intent, setIntent] = useState<ChatIntent | null>(null)
  const [pendingOps, setPendingOps] = useState<PendingOp[]>([])
  const [threadId, setThreadId] = useState<string | null>(null)
  const [vvOffset, setVvOffset] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bootstrapped = useRef(false)
  const shareIngestedKey = useRef<string>('')
  const filesRef = useRef<File[]>([])
  const remoteRef = useRef<string[]>([])
  const inputRef = useRef('')
  const intentRef = useRef<ChatIntent | null>(null)
  const pendingRef = useRef<PendingOp[]>([])
  const threadRef = useRef<string | null>(null)
  const progressTimers = useRef<ReturnType<typeof setTimeout>[]>([])
  const sendRef = useRef<
    (opts?: {
      text?: string
      files?: File[]
      remoteUrls?: string[]
      confirmOps?: PendingOp[]
      cancelOps?: boolean
    }) => void
  >(() => {})

  useEffect(() => {
    filesRef.current = files
  }, [files])
  useEffect(() => {
    remoteRef.current = remoteImageUrls
  }, [remoteImageUrls])
  useEffect(() => {
    inputRef.current = input
  }, [input])
  useEffect(() => {
    intentRef.current = intent
  }, [intent])
  useEffect(() => {
    pendingRef.current = pendingOps
    try {
      if (pendingOps.length) sessionStorage.setItem(PENDING_KEY, JSON.stringify(pendingOps))
      else sessionStorage.removeItem(PENDING_KEY)
    } catch {
      /* ignore */
    }
  }, [pendingOps])
  useEffect(() => {
    threadRef.current = threadId
    try {
      if (threadId) sessionStorage.setItem(THREAD_KEY, threadId)
    } catch {
      /* ignore */
    }
  }, [threadId])

  const activeIntent = INTENT_OPTIONS.find((o) => o.id === intent) || null

  const pickIntent = useCallback((next: ChatIntent) => {
    setIntent(next)
    intentRef.current = next
    const opt = INTENT_OPTIONS.find((o) => o.id === next)
    if (!opt) return
    setMessages((m) => {
      const last = m[m.length - 1]
      if (last?.role === 'assistant' && last.id.startsWith('intent-')) {
        return [...m.slice(0, -1), { id: `intent-${next}`, role: 'assistant', content: opt.hint }]
      }
      return [...m, { id: `intent-${next}`, role: 'assistant', content: opt.hint }]
    })
    setError(null)
    window.setTimeout(() => textareaRef.current?.focus(), 50)
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading, progressLabel])

  const clearProgressTimers = useCallback(() => {
    for (const t of progressTimers.current) clearTimeout(t)
    progressTimers.current = []
  }, [])

  const startProgress = useCallback(() => {
    clearProgressTimers()
    setProgressPct(PROGRESS_STEPS[0].pct)
    setProgressLabel(PROGRESS_STEPS[0].label)
    setStatus(PROGRESS_STEPS[0].label)
    for (const step of PROGRESS_STEPS.slice(1)) {
      progressTimers.current.push(
        setTimeout(() => {
          setProgressPct(step.pct)
          setProgressLabel(step.label)
          setStatus(step.label)
        }, step.atMs),
      )
    }
  }, [clearProgressTimers])

  const finishProgress = useCallback(
    (ok: boolean) => {
      clearProgressTimers()
      setProgressPct(100)
      setProgressLabel(ok ? 'Listo' : 'Error')
      const t = setTimeout(() => {
        setProgressPct(0)
        setProgressLabel('')
      }, 900)
      progressTimers.current.push(t)
    },
    [clearProgressTimers],
  )

  useEffect(() => () => clearProgressTimers(), [clearProgressTimers])

  // Miniaturas del composer como data URLs: los blob: se revocaban al recomprimir
  // (doble setFiles) y quedaban rotos en iOS/Android.
  useEffect(() => {
    if (!files.length) {
      setPreviews([])
      return
    }
    let cancelled = false
    Promise.all(
      files.map(
        (f) =>
          new Promise<string>((resolve) => {
            const reader = new FileReader()
            reader.onload = () => resolve(String(reader.result || ''))
            reader.onerror = () => resolve('')
            reader.readAsDataURL(f)
          }),
      ),
    ).then((urls) => {
      if (!cancelled) setPreviews(urls.filter(Boolean))
    })
    return () => {
      cancelled = true
    }
  }, [files])

  // Teclado móvil: evita que el composer quede tapado (visualViewport)
  useEffect(() => {
    if (!capture || typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    const sync = () => {
      const gap = Math.max(0, window.innerHeight - vv.height - vv.offsetTop)
      setVvOffset(gap)
    }
    sync()
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    return () => {
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
    }
  }, [capture])

  /** Comprime capturas grandes (PNG de móvil) a JPEG para subirlas y que la visión las lea bien. */
  const compressImage = useCallback(async (file: File): Promise<File> => {
    if (!file.type.startsWith('image/')) return file
    if (file.size < 1.2 * 1024 * 1024 && file.type === 'image/jpeg') return file
    try {
      const bitmap = await createImageBitmap(file)
      const maxW = 1800
      const scale = bitmap.width > maxW ? maxW / bitmap.width : 1
      const w = Math.max(1, Math.round(bitmap.width * scale))
      const h = Math.max(1, Math.round(bitmap.height * scale))
      const canvas = document.createElement('canvas')
      canvas.width = w
      canvas.height = h
      const ctx = canvas.getContext('2d')
      if (!ctx) return file
      ctx.drawImage(bitmap, 0, 0, w, h)
      bitmap.close()
      const blob = await new Promise<Blob | null>((resolve) =>
        canvas.toBlob((b) => resolve(b), 'image/jpeg', 0.88),
      )
      if (!blob) return file
      const name = file.name.replace(/\.\w+$/, '') + '.jpg'
      return new File([blob], name, { type: 'image/jpeg' })
    } catch {
      return file
    }
  }, [])

  const addFiles = useCallback(
    async (list: FileList | File[] | null) => {
      if (!list) return
      const arr = Array.from(list).filter((f) => f.type.startsWith('image/'))
      if (!arr.length) return
      // Preview inmediata (antes de comprimir)
      setFiles((prev) => [...prev, ...arr].slice(0, 4))
      setStatus('Preparando captura…')
      const compressed = await Promise.all(arr.map((f) => compressImage(f)))
      setFiles((prev) => {
        // Sustituir solo las que acabamos de añadir (mismas posiciones finales)
        const kept = prev.slice(0, Math.max(0, prev.length - arr.length))
        return [...kept, ...compressed].slice(0, 4)
      })
      setStatus(
        `${compressed.length} captura${compressed.length > 1 ? 's' : ''} lista${compressed.length > 1 ? 's' : ''} — Enviar al agente`,
      )
    },
    [compressImage],
  )

  const clearFiles = useCallback(() => {
    setFiles([])
    setRemoteImageUrls([])
    setPreviews([])
    if (galleryRef.current) galleryRef.current.value = ''
    if (cameraRef.current) cameraRef.current.value = ''
  }, [])

  const fileToDataUrl = useCallback((file: File) => {
    return new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => resolve(String(reader.result || ''))
      reader.onerror = () => reject(reader.error || new Error('FileReader'))
      reader.readAsDataURL(file)
    })
  }, [])

  const applyPendingFromResponse = useCallback((ops: PendingOp[] | undefined) => {
    const next = Array.isArray(ops) ? ops : []
    setPendingOps(next)
    pendingRef.current = next
  }, [])

  const send = useCallback(
    async (opts?: {
      text?: string
      files?: File[]
      remoteUrls?: string[]
      confirmOps?: PendingOp[] | null
      cancelOps?: boolean
    }) => {
      const text = (opts?.text ?? inputRef.current).trim()
      const sendFiles = opts?.files ?? filesRef.current
      const remotes = opts?.remoteUrls ?? remoteRef.current
      const confirmOps = opts?.confirmOps
      const cancelOps = Boolean(opts?.cancelOps)

      const confirming = Array.isArray(confirmOps) && confirmOps.length > 0
      if (
        !confirming &&
        !cancelOps &&
        !text &&
        sendFiles.length === 0 &&
        remotes.length === 0
      ) {
        return
      }
      if (loading) return

      // «sí» con ops pendientes → confirmar
      let opsToConfirm = confirmOps
      if (
        !opsToConfirm?.length &&
        !cancelOps &&
        looksLikeConfirmText(text) &&
        pendingRef.current.length
      ) {
        opsToConfirm = pendingRef.current
      }

      setError(null)
      setStatus(null)
      setLoading(true)
      startProgress()

      const userMsgId = `u-${Date.now()}`
      let previewUrls: string[] = remotes.slice()
      if (sendFiles.length > 0) {
        try {
          previewUrls = await Promise.all(sendFiles.map((f) => fileToDataUrl(f)))
        } catch {
          previewUrls = previews.slice()
        }
      }

      const userContent =
        cancelOps
          ? text || 'Cancelar'
          : opsToConfirm?.length
            ? text || 'Confirmar'
            : text || '(captura / imagen)'

      const userMsg: UiMessage = {
        id: userMsgId,
        role: 'user',
        content: userContent,
        previews: previewUrls.length ? previewUrls : undefined,
      }
      setMessages((m) => [...m, userMsg])
      setInput('')
      inputRef.current = ''

      const history = [...messages, userMsg]
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => m.id !== 'welcome' && !m.id.startsWith('intent-'))
        .slice(-20)
        .map((m) => ({ role: m.role, content: m.content }))

      const currentIntent = intentRef.current
      const tid = threadRef.current

      try {
        let res: Response
        if (sendFiles.length > 0 && !opsToConfirm?.length && !cancelOps) {
          const form = new FormData()
          form.set('message', text)
          form.set('history', JSON.stringify(history.slice(0, -1)))
          if (currentIntent) form.set('intent', currentIntent)
          if (tid) form.set('thread_id', tid)
          for (const f of sendFiles) form.append('files', f)
          res = await fetch('/api/admin/agent/chat', { method: 'POST', body: form })
        } else {
          res = await fetch('/api/admin/agent/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: userContent,
              history: history.slice(0, -1),
              image_urls: remotes,
              intent: currentIntent,
              thread_id: tid,
              confirm_ops: opsToConfirm?.length ? opsToConfirm : undefined,
              cancel_ops: cancelOps || undefined,
            }),
          })
        }
        const data = (await res.json()) as {
          error?: string
          reply?: string
          ok?: boolean
          pending_ops?: PendingOp[]
          tool_trace?: { name: string; ok: boolean; detail: string }[]
          attached_urls?: string[]
          thread_id?: string
          results?: { ok: boolean; type: string; summary: string }[]
          needs_confirm?: boolean
        }
        if (!res.ok) throw new Error(data.error || res.statusText)

        if (data.thread_id) {
          setThreadId(data.thread_id)
          threadRef.current = data.thread_id
        }

        if (data.attached_urls?.length) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === userMsgId ? { ...msg, previews: data.attached_urls } : msg,
            ),
          )
        }

        const nextPending = opsToConfirm?.length || cancelOps ? [] : data.pending_ops || []
        applyPendingFromResponse(nextPending)

        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: data.reply || 'Listo.',
            pendingOps: nextPending.length ? nextPending : undefined,
            toolTrace: data.tool_trace,
          },
        ])
        clearFiles()
        finishProgress(true)
        if (opsToConfirm?.length) {
          const anySaved = data.ok === true || (data.results || []).some((r) => r.ok)
          setStatus(anySaved ? 'Guardado en BD' : 'Error al guardar — mira el mensaje')
          if (!anySaved) setError('No se completó el guardado')
        } else if (nextPending.length) {
          setStatus('Pendiente de confirmar')
        } else {
          setStatus('Respuesta del agente')
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido'
        finishProgress(false)
        setError(msg)
        setMessages((m) => [
          ...m,
          {
            id: `e-${Date.now()}`,
            role: 'assistant',
            content: `Error: ${msg}`,
          },
        ])
      } finally {
        setLoading(false)
      }
    },
    [
      applyPendingFromResponse,
      clearFiles,
      fileToDataUrl,
      finishProgress,
      loading,
      messages,
      previews,
      startProgress,
    ],
  )

  sendRef.current = (opts) => {
    void send(opts)
  }

  const confirmPending = useCallback(() => {
    if (!pendingRef.current.length || loading) return
    void send({ text: 'Confirmar', confirmOps: pendingRef.current })
  }, [loading, send])

  const cancelPending = useCallback(() => {
    if (loading) return
    void send({ text: 'Cancelar', cancelOps: true })
  }, [loading, send])

  const ingestSharePayload = useCallback(async () => {
    const fromShare = searchParams?.get('share') === '1'
    const needLogin = searchParams?.get('need_login') === '1'
    const qText = searchParams?.get('text') || ''
    const qImages = (searchParams?.get('images') || '')
      .split('|')
      .map((s) => s.trim())
      .filter((s) => s.startsWith('https://'))

    const shareKey = `${fromShare ? 1 : 0}|${qText}|${qImages.join('|')}|${needLogin ? 1 : 0}`
    const hasShareBits = fromShare || Boolean(qText) || qImages.length > 0 || needLogin
    if (!hasShareBits) return
    if (shareIngestedKey.current === shareKey) return
    shareIngestedKey.current = shareKey

    if (needLogin) {
      setError('Inicia sesión admin y vuelve a compartir desde Facebook/Fotos.')
    }

    let text = qText
    let nextFiles: File[] = []
    let nextRemotes = qImages

    if (fromShare || capture || widget) {
      const inbox = await consumeShareInbox()
      if (inbox) {
        const parts = [inbox.title, inbox.text, inbox.url].filter(Boolean)
        if (parts.length) text = [text, ...parts].filter(Boolean).join('\n').trim()
        if (inbox.files.length) nextFiles = inbox.files
      }
    }

    if (text) {
      setInput(text)
      inputRef.current = text
    }
    if (nextFiles.length) {
      setFiles(nextFiles)
      filesRef.current = nextFiles
    }
    if (nextRemotes.length) {
      setRemoteImageUrls(nextRemotes)
      remoteRef.current = nextRemotes
    }

    if (fromShare || qText || qImages.length) {
      router.replace(`/${lang}/administrator/chat`, { scroll: false })
    }

    const canAuto =
      fromShare && (nextFiles.length > 0 || nextRemotes.length > 0 || /https?:\/\//i.test(text))
    if (canAuto) {
      setStatus('Recibido del compartir — el agente preparará el alta…')
      window.setTimeout(() => {
        sendRef.current({ text, files: nextFiles, remoteUrls: nextRemotes })
      }, 350)
    } else if (fromShare && text) {
      setStatus('Link recibido — pulsa Enviar o añade captura')
    }
  }, [capture, lang, router, searchParams, widget])

  // Share Target / query params / inbox SW + restaurar hilo
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    const run = async () => {
      try {
        const savedPending = sessionStorage.getItem(PENDING_KEY)
        if (savedPending) {
          const ops = JSON.parse(savedPending) as PendingOp[]
          if (Array.isArray(ops) && ops.length) {
            setPendingOps(ops)
            pendingRef.current = ops
          }
        }
        const savedThread = sessionStorage.getItem(THREAD_KEY)
        if (savedThread) {
          setThreadId(savedThread)
          threadRef.current = savedThread
          const res = await fetch(`/api/admin/agent/chat?thread_id=${encodeURIComponent(savedThread)}`)
          if (res.ok) {
            const data = (await res.json()) as {
              messages?: Array<{
                id: string
                role: string
                content: string
                pending_ops?: PendingOp[] | null
                attached_urls?: string[] | null
              }>
            }
            if (data.messages?.length) {
              setMessages([
                {
                  id: 'welcome',
                  role: 'assistant',
                  content: welcome,
                },
                ...data.messages
                  .filter((m) => m.role === 'user' || m.role === 'assistant')
                  .map((m) => ({
                    id: m.id,
                    role: m.role as ChatRole,
                    content: m.content,
                    previews: m.attached_urls || undefined,
                    pendingOps: m.pending_ops || undefined,
                  })),
              ])
              const lastPending = [...data.messages]
                .reverse()
                .find((m) => m.pending_ops && m.pending_ops.length)
              if (lastPending?.pending_ops?.length) {
                setPendingOps(lastPending.pending_ops)
                pendingRef.current = lastPending.pending_ops
              }
            }
          }
        }
      } catch {
        /* ignore */
      }

      await ingestSharePayload()
    }

    void run()
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Nuevo Share Target mientras el widget ya estaba montado
  useEffect(() => {
    if (!bootstrapped.current) return
    void ingestSharePayload()
  }, [ingestSharePayload])

  // Pegar captura desde portapapeles
  useEffect(() => {
    const onPaste = (e: ClipboardEvent) => {
      const items = e.clipboardData?.items
      if (!items) return
      const imgs: File[] = []
      for (const item of Array.from(items)) {
        if (item.type.startsWith('image/')) {
          const f = item.getAsFile()
          if (f) imgs.push(f)
        }
      }
        if (imgs.length) {
        e.preventDefault()
        void addFiles(imgs)
      }
    }
    window.addEventListener('paste', onPaste)
    return () => window.removeEventListener('paste', onPaste)
  }, [addFiles])

  const allPreviews = previews.length
    ? previews
    : remoteImageUrls

  const shell = (
    <div
      className={
        compact
          ? 'ob-capture flex flex-col bg-[var(--paper)] text-[var(--ink)] h-full min-h-0'
          : 'space-y-4'
      }
      style={
        capture
          ? {
              height: '100%',
              minHeight: 0,
              paddingBottom: vvOffset ? vvOffset : undefined,
            }
          : widget
            ? { height: '100%', minHeight: 0 }
            : undefined
      }
    >
      {!compact ? (
        <div className="admin-panel relative border-[3px] border-[var(--ink)] bg-[var(--yellow)]/20 shadow-[8px_8px_0_var(--ink)] space-y-2 hidden sm:block">
          <h2
            className="text-[11px] font-bold uppercase tracking-wider border-b-[3px] border-[var(--ink)] pb-2"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            Chat flotante
          </h2>
          <p className="text-sm" style={{ fontFamily: "'Special Elite', monospace" }}>
            Usa el botón 💬 abajo a la izquierda en cualquier página (también al compartir desde el
            móvil → Optimal Breaks).
          </p>
        </div>
      ) : capture ? (
        <header className="ob-capture__bar shrink-0 flex items-center gap-2 px-3 border-b-[3px] border-[var(--ink)] bg-[var(--red)] text-white">
          <span
            className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wider"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            Captura → BD
          </span>
          {status ? (
            <span className="max-w-[45%] truncate text-[10px] font-bold uppercase opacity-90">
              {status}
            </span>
          ) : null}
        </header>
      ) : widget && status ? (
        <p
          className="shrink-0 px-3 py-1.5 text-[10px] font-bold uppercase tracking-wide border-b-[2px] border-[var(--ink)]/20 bg-[var(--yellow)]/25"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          {status}
        </p>
      ) : null}

      <div
        className={
          compact
            ? 'flex-1 min-h-0 flex flex-col'
            : 'admin-panel !p-0 overflow-hidden flex flex-col min-h-[420px] max-h-[min(70vh,720px)]'
        }
      >
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 ${
            compact ? 'ob-capture__messages px-3 py-3' : 'p-4'
          }`}
        >
          {messages.map((m) => (
            <div
              key={m.id}
              className={`max-w-[94%] border-[2px] border-[var(--ink)] px-3 py-2.5 text-[15px] leading-snug whitespace-pre-wrap ${
                m.role === 'user' ? 'ml-auto bg-[var(--uv)]/15' : 'mr-auto bg-white'
              }`}
              style={{ fontFamily: "'Special Elite', monospace" }}
            >
              {m.previews?.length ? (
                <div className="flex flex-wrap gap-2 mb-2">
                  {m.previews.map((src, i) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      key={`${m.id}-p-${i}`}
                      src={src}
                      alt="Captura adjunta"
                      className="h-28 w-28 sm:h-20 sm:w-20 object-cover border-[2px] border-[var(--ink)] bg-[var(--paper-dark)]"
                    />
                  ))}
                </div>
              ) : null}
              {m.content}
              {m.toolTrace?.length ? (
                <details className="mt-2 text-[10px] uppercase tracking-wide text-[var(--ink)]/55">
                  <summary className="cursor-pointer font-bold">Tools usadas</summary>
                  <ul className="mt-1 space-y-0.5 normal-case tracking-normal">
                    {m.toolTrace.map((t, i) => (
                      <li key={`${m.id}-t-${i}`}>
                        {t.ok ? '✓' : '✗'} {t.name}
                        {t.detail ? ` — ${t.detail}` : ''}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </div>
          ))}
          {pendingOps.length > 0 && !loading ? (
            <div
              className="mr-auto w-full max-w-[94%] border-[3px] border-[var(--ink)] bg-[var(--yellow)]/30 px-3 py-3 space-y-2"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              <p className="text-[11px] font-bold uppercase tracking-wider">
                Pendiente de confirmar ({pendingOps.length})
              </p>
              <ol className="text-[13px] space-y-1 list-decimal pl-4">
                {pendingOps.map((op, i) => (
                  <li key={`pend-${i}`}>{op.summary || op.kind}</li>
                ))}
              </ol>
              <div className="flex flex-wrap gap-2 pt-1">
                <button
                  type="button"
                  className="admin-btn admin-btn--yellow min-h-11"
                  onClick={() => confirmPending()}
                >
                  Confirmar y guardar
                </button>
                <button
                  type="button"
                  className="admin-btn admin-btn--ghost min-h-11"
                  onClick={() => cancelPending()}
                >
                  Cancelar
                </button>
              </div>
            </div>
          ) : null}
          {loading || progressPct > 0 ? (
            <div
              className="mr-auto w-full max-w-[94%] border-[2px] border-[var(--ink)] bg-white px-3 py-2.5 space-y-2"
              role="status"
              aria-live="polite"
              aria-busy={loading}
            >
              <div className="flex items-center justify-between gap-2">
                <p
                  className="text-[11px] uppercase tracking-wider font-bold text-[var(--ink)]"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  {progressLabel || 'Procesando…'}
                </p>
                <span
                  className="text-[11px] tabular-nums text-[var(--ink)]/70"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  {Math.min(100, Math.round(progressPct))}%
                </span>
              </div>
              <div className="h-2.5 w-full border-[2px] border-[var(--ink)] bg-[var(--paper-dark)] overflow-hidden">
                <div
                  className="h-full bg-[var(--red)] transition-[width] duration-500 ease-out"
                  style={{ width: `${Math.min(100, progressPct)}%` }}
                />
              </div>
              <ol
                className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] uppercase tracking-wide text-[var(--ink)]/55"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                {PROGRESS_STEPS.filter((s) => s.id !== 'done').map((s) => {
                  const active = progressLabel === s.label
                  const done = progressPct > s.pct || (!loading && progressPct === 100)
                  return (
                    <li
                      key={s.id}
                      className={
                        active ? 'text-[var(--red)] font-bold' : done ? 'text-[var(--ink)]' : ''
                      }
                    >
                      {done && !active ? '✓ ' : active ? '→ ' : '· '}
                      {s.label}
                    </li>
                  )
                })}
              </ol>
            </div>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div
          className={`shrink-0 border-t-[3px] border-[var(--ink)] bg-[var(--paper)] space-y-2 ${
            compact ? 'ob-capture__composer px-3 pt-2' : 'p-3'
          }`}
        >
          <div className="space-y-1.5">
            <p
              className="text-[10px] font-bold uppercase tracking-wider text-[var(--ink)]/60"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {intent ? `Modo: ${activeIntent?.label}` : '¿Qué quieres hacer?'}
            </p>
            <div className="flex flex-nowrap gap-1.5 overflow-x-auto overscroll-x-contain touch-pan-x pb-0.5 -mx-0.5 px-0.5">
              {INTENT_OPTIONS.map((opt) => {
                const selected = intent === opt.id
                return (
                  <button
                    key={opt.id}
                    type="button"
                    disabled={loading}
                    onClick={() => pickIntent(opt.id)}
                    className={`shrink-0 min-h-11 px-2.5 border-[2px] border-[var(--ink)] text-[11px] font-bold uppercase tracking-wide touch-manipulation ${
                      selected
                        ? 'bg-[var(--yellow)] text-[var(--ink)]'
                        : 'bg-white text-[var(--ink)] hover:bg-[var(--paper-dark)]'
                    } disabled:opacity-50`}
                    style={{ fontFamily: "'Courier Prime', monospace" }}
                  >
                    {opt.label}
                  </button>
                )
              })}
            </div>
          </div>
          {allPreviews.length > 0 ? (
            <div className="flex flex-wrap items-center gap-2">
              {allPreviews.map((src) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  key={src}
                  src={src}
                  alt=""
                  className="h-16 w-16 object-cover border-[2px] border-[var(--ink)]"
                />
              ))}
              <button
                type="button"
                className="admin-btn admin-btn--ghost admin-btn--sm min-h-11"
                onClick={clearFiles}
              >
                Quitar
              </button>
            </div>
          ) : null}

          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            rows={compact ? 2 : 3}
            enterKeyHint="send"
            autoComplete="off"
            autoCorrect="on"
            spellCheck
            placeholder={
              activeIntent?.placeholder ||
              (compact
                ? 'Link, nota o captura…'
                : 'Elige modo: evento, NR, vinyl, mix, artista…')
            }
            className="admin-input !text-base !leading-snug resize-none"
            style={{
              minHeight: compact ? '3.25rem' : '4.5rem',
              fontSize: '16px', // iOS: <16px dispara zoom al enfocar
            }}
            disabled={loading}
            onFocus={() => {
              // Tras abrir teclado en PWA, asegurar que el composer queda visible
              window.setTimeout(() => {
                textareaRef.current?.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
                bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })
              }, 320)
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                if (!loading && (input.trim() || files.length || remoteImageUrls.length)) {
                  void send()
                }
              }
            }}
          />

          <div className={`grid gap-2 ${compact ? 'grid-cols-2' : 'flex flex-wrap'}`}>
            <input
              ref={galleryRef}
              type="file"
              accept="image/*"
              multiple
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <input
              ref={cameraRef}
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                void addFiles(e.target.files)
                e.target.value = ''
              }}
            />
            <button
              type="button"
              className="admin-btn admin-btn--ghost min-h-12 !text-[12px] touch-manipulation"
              disabled={loading}
              onClick={() => galleryRef.current?.click()}
            >
              Galería
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--ghost min-h-12 !text-[12px] touch-manipulation"
              disabled={loading}
              onClick={() => cameraRef.current?.click()}
            >
              Cámara
            </button>
            {compact ? (
              <button
                type="button"
                className="admin-btn admin-btn--yellow col-span-2 min-h-12 !text-[14px] !tracking-wide"
                disabled={
                  loading || (!input.trim() && files.length === 0 && remoteImageUrls.length === 0)
                }
                onClick={() => void send()}
              >
                {loading ? progressLabel || 'Pensando…' : widget ? 'Enviar' : 'Enviar al agente'}
              </button>
            ) : (
              <button
                type="button"
                className="admin-btn admin-btn--yellow ml-auto min-h-12"
                disabled={
                  loading || (!input.trim() && files.length === 0 && remoteImageUrls.length === 0)
                }
                onClick={() => void send()}
              >
                {loading ? progressLabel || 'Pensando…' : 'Enviar'}
              </button>
            )}
          </div>
          {error ? (
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--red)]">{error}</p>
          ) : null}
          {!compact && status ? <p className="text-xs admin-muted">{status}</p> : null}
        </div>
      </div>
    </div>
  )

  return shell
}

function AgentChatCapture({ lang }: { lang: string }) {
  const sp = useSearchParams()
  return <AgentChatCore lang={lang} mode="capture" shareQuery={sp} />
}

export default function AgentChat({ lang, mode = 'embedded', shareQuery = null }: Props) {
  if (mode === 'widget') {
    return <AgentChatCore lang={lang} mode="widget" shareQuery={shareQuery} />
  }
  if (mode === 'capture') {
    return (
      <Suspense
        fallback={
          <div
            className="p-4 text-sm uppercase tracking-wider"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            Abriendo captura…
          </div>
        }
      >
        <AgentChatCapture lang={lang} />
      </Suspense>
    )
  }
  return <AgentChatCore lang={lang} mode="embedded" />
}
