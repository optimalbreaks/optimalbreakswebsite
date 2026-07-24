'use client'

import { Suspense, useCallback, useEffect, useRef, useState } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { consumeShareInbox } from '@/lib/share-inbox'

type ChatRole = 'user' | 'assistant'

type UiMessage = {
  id: string
  role: ChatRole
  content: string
  previews?: string[]
}

type Props = {
  lang: string
  /** Pantalla completa PWA (página /administrator/chat) */
  mode?: 'embedded' | 'capture'
}

const WELCOME_CAPTURE =
  'Manda una captura del cartel (Facebook, Instagram, entradas…). La IA la lee, busca el evento en la web, rellena ficha/lineup y lo guarda en la BD. También vale pegar un link.'

const WELCOME_EMBEDDED =
  'Chat editorial: capturas de cartel, links o texto → la IA lee, busca y hace upsert (eventos, artistas, mixes, NR, vinyl).'

type CoreProps = Props & {
  shareQuery?: URLSearchParams | null
}

function AgentChatCore({ lang, mode = 'embedded', shareQuery = null }: CoreProps) {
  const capture = mode === 'capture'
  const router = useRouter()
  const searchParams = shareQuery
  const [messages, setMessages] = useState<UiMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: capture ? WELCOME_CAPTURE : WELCOME_EMBEDDED,
    },
  ])
  const [input, setInput] = useState('')
  const [files, setFiles] = useState<File[]>([])
  const [previews, setPreviews] = useState<string[]>([])
  const [remoteImageUrls, setRemoteImageUrls] = useState<string[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [vvOffset, setVvOffset] = useState(0)
  const bottomRef = useRef<HTMLDivElement>(null)
  const galleryRef = useRef<HTMLInputElement>(null)
  const cameraRef = useRef<HTMLInputElement>(null)
  const textareaRef = useRef<HTMLTextAreaElement>(null)
  const bootstrapped = useRef(false)
  const filesRef = useRef<File[]>([])
  const remoteRef = useRef<string[]>([])
  const inputRef = useRef('')

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
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages, loading])

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
        `${compressed.length} captura${compressed.length > 1 ? 's' : ''} lista${compressed.length > 1 ? 's' : ''} — Enviar para leer y guardar`,
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

  const send = useCallback(
    async (opts?: { text?: string; files?: File[]; remoteUrls?: string[] }) => {
      const text = (opts?.text ?? inputRef.current).trim()
      const sendFiles = opts?.files ?? filesRef.current
      const remotes = opts?.remoteUrls ?? remoteRef.current
      if ((!text && sendFiles.length === 0 && remotes.length === 0) || loading) return

      setError(null)
      setStatus(null)
      setLoading(true)

      const userMsgId = `u-${Date.now()}`
      // data: URLs (no blob) para que la miniatura no se rompa al limpiar el composer
      let previewUrls: string[] = remotes.slice()
      if (sendFiles.length > 0) {
        try {
          previewUrls = await Promise.all(sendFiles.map((f) => fileToDataUrl(f)))
        } catch {
          previewUrls = previews.slice()
        }
      }

      const userMsg: UiMessage = {
        id: userMsgId,
        role: 'user',
        content: text || '(captura / imagen)',
        previews: previewUrls,
      }
      setMessages((m) => [...m, userMsg])
      setInput('')
      inputRef.current = ''

      const history = [...messages, userMsg]
        .filter((m) => m.role === 'user' || m.role === 'assistant')
        .filter((m) => m.id !== 'welcome')
        .slice(-10)
        .map((m) => ({ role: m.role, content: m.content }))

      try {
        let res: Response
        if (sendFiles.length > 0) {
          const form = new FormData()
          form.set('message', text)
          form.set('history', JSON.stringify(history.slice(0, -1)))
          for (const f of sendFiles) form.append('files', f)
          res = await fetch('/api/admin/agent/chat', { method: 'POST', body: form })
        } else {
          res = await fetch('/api/admin/agent/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              message: text,
              history: history.slice(0, -1),
              image_urls: remotes,
            }),
          })
        }
        const data = (await res.json()) as {
          error?: string
          reply?: string
          ok?: boolean
          results?: { ok: boolean; type: string; summary: string }[]
          attached_urls?: string[]
        }
        if (!res.ok) throw new Error(data.error || res.statusText)

        // Sustituir preview local por URL pública de Storage (permanente)
        if (data.attached_urls?.length) {
          setMessages((m) =>
            m.map((msg) =>
              msg.id === userMsgId ? { ...msg, previews: data.attached_urls } : msg,
            ),
          )
        }

        setMessages((m) => [
          ...m,
          {
            id: `a-${Date.now()}`,
            role: 'assistant',
            content: data.reply || (data.ok ? 'Guardado.' : 'No se guardó nada.'),
          },
        ])
        clearFiles()
        const anySaved = data.ok === true || (data.results || []).some((r) => r.ok)
        setStatus(anySaved ? 'Guardado en BD' : 'No se guardó — mira el mensaje')
        if (!anySaved) {
          setError('La captura no llegó a la base de datos')
        }
      } catch (e) {
        const msg = e instanceof Error ? e.message : 'Error desconocido'
        setError(msg)
        setMessages((m) => [
          ...m,
          { id: `e-${Date.now()}`, role: 'assistant', content: `Error: ${msg}` },
        ])
      } finally {
        setLoading(false)
      }
    },
    [clearFiles, fileToDataUrl, loading, messages, previews],
  )

  // Share Target / query params / inbox SW
  useEffect(() => {
    if (bootstrapped.current) return
    bootstrapped.current = true

    const run = async () => {
      const fromShare = searchParams?.get('share') === '1'
      const needLogin = searchParams?.get('need_login') === '1'
      const qText = searchParams?.get('text') || ''
      const qImages = (searchParams?.get('images') || '')
        .split('|')
        .map((s) => s.trim())
        .filter((s) => s.startsWith('https://'))

      if (needLogin) {
        setError('Inicia sesión admin y vuelve a compartir desde Facebook/Fotos.')
      }

      let text = qText
      let nextFiles: File[] = []
      let nextRemotes = qImages

      if (fromShare || capture) {
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

      // Limpiar query (evita re-envíos al refrescar)
      if (fromShare || qText || qImages.length) {
        router.replace(`/${lang}/administrator/chat`, { scroll: false })
      }

      const canAuto =
        fromShare && (nextFiles.length > 0 || nextRemotes.length > 0 || /https?:\/\//i.test(text))
      if (canAuto) {
        setStatus('Recibido del compartir — guardando…')
        window.setTimeout(() => {
          void send({ text, files: nextFiles, remoteUrls: nextRemotes })
        }, 350)
      } else if (fromShare && text) {
        setStatus('Link recibido — pulsa Enviar o añade captura')
      }
    }

    void run()
    // solo al montar
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

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
        capture
          ? 'ob-capture flex flex-col bg-[var(--paper)] text-[var(--ink)]'
          : 'space-y-4'
      }
      style={
        capture
          ? {
              height: '100%',
              minHeight: 0,
              paddingBottom: vvOffset ? vvOffset : undefined,
            }
          : undefined
      }
    >
      {!capture ? (
        <div className="admin-panel relative border-[3px] border-[var(--ink)] bg-[var(--yellow)]/20 shadow-[8px_8px_0_var(--ink)] space-y-2 hidden sm:block">
          <h2
            className="text-[11px] font-bold uppercase tracking-wider border-b-[3px] border-[var(--ink)] pb-2"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            Upsert directo · móvil: usa Captura
          </h2>
          <p className="text-sm" style={{ fontFamily: "'Special Elite', monospace" }}>
            En el teléfono abre{' '}
            <a href={`/${lang}/administrator/chat`} className="font-bold underline text-[var(--red)]">
              /administrator/chat
            </a>{' '}
            o comparte desde Facebook → Optimal Breaks.
          </p>
        </div>
      ) : (
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
      )}

      <div
        className={
          capture
            ? 'flex-1 min-h-0 flex flex-col'
            : 'admin-panel !p-0 overflow-hidden flex flex-col min-h-[420px] max-h-[min(70vh,720px)]'
        }
      >
        <div
          className={`flex-1 min-h-0 overflow-y-auto overscroll-contain space-y-3 ${
            capture ? 'px-3 py-3' : 'p-4'
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
            </div>
          ))}
          {loading ? (
            <p
              className="text-xs uppercase tracking-wider text-[var(--ink)]/60 animate-pulse"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              Leyendo captura → buscando evento → guardando en BD…
            </p>
          ) : null}
          <div ref={bottomRef} />
        </div>

        <div
          className={`shrink-0 border-t-[3px] border-[var(--ink)] bg-[var(--paper)] space-y-2 ${
            capture ? 'ob-capture__composer px-3 pt-2' : 'p-3'
          }`}
          style={
            capture
              ? { paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }
              : undefined
          }
        >
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
            rows={capture ? 2 : 3}
            enterKeyHint="send"
            placeholder={
              capture
                ? 'Opcional: nota o link… (con solo la captura basta)'
                : 'Captura, link o texto…'
            }
            className="admin-input !text-base !leading-snug resize-none"
            style={{ minHeight: capture ? '3.25rem' : '4.5rem', fontSize: '16px' }}
            disabled={loading}
          />

          <div className={`grid gap-2 ${capture ? 'grid-cols-2' : 'flex flex-wrap'}`}>
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
              className="admin-btn admin-btn--ghost min-h-12 !text-[12px]"
              disabled={loading}
              onClick={() => galleryRef.current?.click()}
            >
              Galería
            </button>
            <button
              type="button"
              className="admin-btn admin-btn--ghost min-h-12 !text-[12px]"
              disabled={loading}
              onClick={() => cameraRef.current?.click()}
            >
              Cámara
            </button>
            {capture ? (
              <button
                type="button"
                className="admin-btn admin-btn--yellow col-span-2 min-h-14 !text-[14px] !tracking-wide"
                disabled={
                  loading || (!input.trim() && files.length === 0 && remoteImageUrls.length === 0)
                }
                onClick={() => void send()}
              >
                {loading ? 'Guardando…' : 'Enviar y guardar'}
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
                {loading ? 'Guardando…' : 'Enviar'}
              </button>
            )}
          </div>
          {error ? (
            <p className="text-xs font-bold uppercase tracking-wide text-[var(--red)]">{error}</p>
          ) : null}
          {!capture && status ? <p className="text-xs admin-muted">{status}</p> : null}
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

export default function AgentChat({ lang, mode = 'embedded' }: Props) {
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
