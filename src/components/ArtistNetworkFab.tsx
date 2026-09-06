'use client'

import { Suspense, useCallback, useEffect, useMemo, useRef, useState, type CSSProperties } from 'react'
import { createPortal } from 'react-dom'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useAuth } from '@/components/AuthProvider'
import { OB_CHART_PLAYALL_BAR_EVENT, useOptionalDeckAudio } from '@/components/DeckAudioProvider'
import { useViewportBottomOffset } from '@/hooks/useViewportBottomOffset'
import { i18n } from '@/lib/i18n-config'

const MESSAGE_MAX = 4000
const TITLE_MAX = 80
const MONO = { fontFamily: "'Courier Prime', monospace" } as const

type DirectoryArtist = {
  id: string
  name: string
  slug: string
  image: string | null
}

type ThreadMember = DirectoryArtist & { user_id: string }

type ThreadListItem = {
  id: string
  kind: 'dm' | 'group'
  title: string | null
  last_message_at: string | null
  last_message_preview: string
  last_sender_id: string | null
  unread: boolean
  members: ThreadMember[]
  created_at: string
  updated_at: string
}

type ChatMessage = {
  id: string
  thread_id: string
  sender_id: string
  body: string
  created_at: string
  sender_name: string
}

type Tab = 'agenda' | 'hilos'
type VvBox = { top: number; height: number; offsetLeft: number; width: number }

function threadLabel(t: ThreadListItem, myUserId: string, es: boolean) {
  if (t.kind === 'group' && t.title) return t.title
  const others = t.members.filter((m) => m.user_id !== myUserId)
  if (others.length === 0) return es ? 'Conversación' : 'Conversation'
  return others.map((m) => m.name).join(', ')
}

function formatWhen(iso: string | null, lang: string) {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  return d.toLocaleString(lang === 'es' ? 'es-ES' : 'en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  })
}

function Avatar({ name, image, size = 36 }: { name: string; image: string | null; size?: number }) {
  const letter = (name.trim()[0] || '?').toUpperCase()
  return (
    <span
      className="shrink-0 overflow-hidden border-2 border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] flex items-center justify-center font-black"
      style={{ width: size, height: size, fontFamily: "'Unbounded', sans-serif", fontSize: size < 32 ? 11 : 14 }}
    >
      {image ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={image} alt="" className="w-full h-full object-cover" />
      ) : (
        letter
      )}
    </span>
  )
}

function ArtistNetworkWidgetInner({
  embedded = false,
  active = true,
}: {
  embedded?: boolean
  active?: boolean
}) {
  const { user, loading: authLoading, isAdmin } = useAuth()
  const pathname = usePathname()
  const { sessionActive, mode } = useOptionalDeckAudio()
  const vvOffset = useViewportBottomOffset()
  const [claimed, setClaimed] = useState(false)
  const [unread, setUnread] = useState(0)
  const [chartPlayAllBar, setChartPlayAllBar] = useState(false)
  const [isSm, setIsSm] = useState(false)
  const [open, setOpen] = useState(false)
  const [domReady, setDomReady] = useState(false)
  const [vvBox, setVvBox] = useState<VvBox | null>(null)

  const [tab, setTab] = useState<Tab>('hilos')
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [directory, setDirectory] = useState<DirectoryArtist[]>([])
  const [threads, setThreads] = useState<ThreadListItem[]>([])
  const [selected, setSelected] = useState<string[]>([])
  const [groupTitle, setGroupTitle] = useState('')
  const [activeId, setActiveId] = useState<string | null>(null)
  const [threadDetail, setThreadDetail] = useState<ThreadListItem | null>(null)
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [addOpen, setAddOpen] = useState(false)
  const listEnd = useRef<HTMLDivElement | null>(null)

  const seg = pathname?.split('/')[1] || ''
  const lang = i18n.locales.includes(seg as 'es' | 'en') ? seg : i18n.defaultLocale
  const es = lang === 'es'
  const myId = user?.id || ''

  useEffect(() => {
    const t = requestAnimationFrame(() => setDomReady(true))
    return () => cancelAnimationFrame(t)
  }, [])

  useEffect(() => {
    if (typeof window === 'undefined' || !window.matchMedia) return
    const mq = window.matchMedia('(min-width: 640px)')
    const sync = () => setIsSm(mq.matches)
    const kick = requestAnimationFrame(sync)
    mq.addEventListener('change', sync)
    return () => {
      cancelAnimationFrame(kick)
      mq.removeEventListener('change', sync)
    }
  }, [])

  useEffect(() => {
    const onChartBar = (e: Event) => {
      const v = (e as CustomEvent<{ visible?: boolean }>).detail?.visible
      if (typeof v === 'boolean') setChartPlayAllBar(v)
    }
    window.addEventListener(OB_CHART_PLAYALL_BAR_EVENT, onChartBar)
    return () => window.removeEventListener(OB_CHART_PLAYALL_BAR_EVENT, onChartBar)
  }, [])

  const refreshUnread = useCallback(async () => {
    if (!user?.id || (isAdmin && !embedded)) {
      setClaimed(false)
      setUnread(0)
      return
    }
    try {
      const res = await fetch('/api/artist-network/unread')
      const json = await res.json()
      setClaimed(Boolean(json.claimed))
      setUnread(Number(json.unread) || 0)
    } catch {
      setClaimed(false)
    }
  }, [user?.id, isAdmin, embedded])

  useEffect(() => {
    if (embedded) return
    const kick = window.setTimeout(() => { void refreshUnread() }, 0)
    const ms = open ? 4000 : 30000
    const t = window.setInterval(() => { void refreshUnread() }, ms)
    return () => {
      window.clearTimeout(kick)
      window.clearInterval(t)
    }
  }, [refreshUnread, open, embedded])

  const loadDirectory = useCallback(async (q: string) => {
    const res = await fetch(`/api/artist-network/directory?q=${encodeURIComponent(q)}`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Error')
    setDirectory(json.data || [])
  }, [])

  const loadThreads = useCallback(async () => {
    const res = await fetch('/api/artist-network/threads')
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Error')
    setThreads(json.data || [])
  }, [])

  const loadConversation = useCallback(async (id: string) => {
    const res = await fetch(`/api/artist-network/threads/${id}/messages`)
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Error')
    setThreadDetail(json.data.thread)
    setMessages(json.data.messages || [])
    setUnread((n) => Math.max(0, n - (json.data.thread?.unread ? 1 : 0)))
  }, [])

  useEffect(() => {
    const t = window.setTimeout(() => setDebouncedQuery(query), 250)
    return () => window.clearTimeout(t)
  }, [query])

  useEffect(() => {
    if (embedded && !active) return
    if (!embedded && (!open || !claimed)) return
    const t = window.setTimeout(() => {
      loadThreads().catch((e: Error) => setError(e.message))
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, claimed, loadThreads, embedded, active])

  useEffect(() => {
    if (embedded && !active) return
    if (!embedded && (!open || !claimed)) return
    const t = window.setTimeout(() => {
      loadDirectory(debouncedQuery).catch((e: Error) => setError(e.message))
    }, 0)
    return () => window.clearTimeout(t)
  }, [open, claimed, loadDirectory, debouncedQuery, embedded, active])

  useEffect(() => {
    if (embedded && !active) return
    if (!embedded && !open) return
    if (!activeId) return
    const kick = window.setTimeout(() => {
      loadConversation(activeId).catch((e: Error) => setError(e.message))
    }, 0)
    const t = window.setInterval(() => {
      loadConversation(activeId).catch(() => {})
    }, 4000)
    return () => {
      window.clearTimeout(kick)
      window.clearInterval(t)
    }
  }, [open, activeId, loadConversation, embedded, active])

  useEffect(() => {
    listEnd.current?.scrollIntoView({ block: 'end' })
  }, [messages.length, activeId])

  useEffect(() => {
    if (!open && !embedded) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (activeId) setActiveId(null)
        else if (!embedded) setOpen(false)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, activeId, embedded])

  useEffect(() => {
    if (embedded || !open || typeof window === 'undefined') return
    const vv = window.visualViewport
    const sync = () => {
      if (!vv) {
        setVvBox({ top: 0, height: window.innerHeight, offsetLeft: 0, width: window.innerWidth })
        return
      }
      setVvBox({
        top: Math.max(0, vv.offsetTop),
        height: Math.max(240, vv.height),
        offsetLeft: vv.offsetLeft || 0,
        width: vv.width || window.innerWidth,
      })
    }
    const kick = requestAnimationFrame(sync)
    if (!vv) {
      window.addEventListener('resize', sync)
      return () => {
        cancelAnimationFrame(kick)
        window.removeEventListener('resize', sync)
      }
    }
    vv.addEventListener('resize', sync)
    vv.addEventListener('scroll', sync)
    window.addEventListener('orientationchange', sync)
    return () => {
      cancelAnimationFrame(kick)
      vv.removeEventListener('resize', sync)
      vv.removeEventListener('scroll', sync)
      window.removeEventListener('orientationchange', sync)
    }
  }, [open, embedded])

  useEffect(() => {
    if (embedded || !open || isSm) return
    const scrollY = window.scrollY
    const { style } = document.body
    const prev = {
      position: style.position,
      top: style.top,
      left: style.left,
      right: style.right,
      width: style.width,
      overflow: style.overflow,
    }
    style.position = 'fixed'
    style.top = `-${scrollY}px`
    style.left = '0'
    style.right = '0'
    style.width = '100%'
    style.overflow = 'hidden'
    return () => {
      style.position = prev.position
      style.top = prev.top
      style.left = prev.left
      style.right = prev.right
      style.width = prev.width
      style.overflow = prev.overflow
      window.scrollTo(0, scrollY)
    }
  }, [open, isSm, embedded])

  const startDm = async (artistId: string) => {
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/artist-network/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'dm', artist_id: artistId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      setActiveId(json.data.id)
      await loadThreads()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const startGroup = async () => {
    if (selected.length === 0 || !groupTitle.trim()) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch('/api/artist-network/threads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ kind: 'group', title: groupTitle.trim(), artist_ids: selected }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      setSelected([])
      setGroupTitle('')
      setActiveId(json.data.id)
      await loadThreads()
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const send = async () => {
    if (!activeId || !draft.trim()) return
    setBusy(true)
    setError(null)
    const text = draft.trim()
    setDraft('')
    try {
      const res = await fetch(`/api/artist-network/threads/${activeId}/messages`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ body: text }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      await loadConversation(activeId)
    } catch (e) {
      setDraft(text)
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const addMember = async (artistId: string) => {
    if (!activeId) return
    setBusy(true)
    setError(null)
    try {
      const res = await fetch(`/api/artist-network/threads/${activeId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artist_id: artistId }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      setAddOpen(false)
      await loadConversation(activeId)
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setBusy(false)
    }
  }

  const memberIds = useMemo(
    () => new Set((threadDetail?.members ?? []).map((m) => m.id)),
    [threadDetail],
  )

  const label = es ? 'Red de artistas' : 'Artist network'
  const bottomBarVisible = sessionActive || mode !== 'idle' || chartPlayAllBar
  if (embedded) {
    if (authLoading || !user) return null
  } else if (!domReady || authLoading || !user || isAdmin || !claimed) {
    return null
  }

  const mobileSheet = open && !isSm
  const baseBottom = isSm
    ? bottomBarVisible
      ? 'max(calc(var(--ob-bottom-bar-h, 0px) + 14px), calc(7rem + env(safe-area-inset-bottom, 0px) + 10px))'
      : 'calc(2rem + env(safe-area-inset-bottom, 0px))'
    : bottomBarVisible
      ? 'max(calc(var(--ob-bottom-bar-h, 0px) + 14px), calc(6.75rem + env(safe-area-inset-bottom, 0px) + 10px))'
      : 'calc(1.5rem + env(safe-area-inset-bottom, 0px))'
  const fabBottom = vvOffset ? `calc(${baseBottom} + ${vvOffset}px)` : baseBottom

  const panelStyle: CSSProperties = mobileSheet
    ? {
        top: vvBox?.top ?? 0,
        height: vvBox?.height ?? '100dvh',
        left: 0,
        right: 0,
        bottom: 'auto',
        width: '100%',
      }
    : open && isSm && vvBox
      ? {
          bottom: fabBottom,
          left: 'max(1rem, env(safe-area-inset-left, 0px))',
          maxHeight: Math.max(280, vvBox.height - 24),
          height: 'min(36rem, calc(100dvh - 6.5rem))',
        }
      : {
          bottom: fabBottom,
          left: 'max(1rem, env(safe-area-inset-left, 0px))',
        }

  const ui = (
    <>
      {!embedded && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="ob-admin-chat-fab fixed z-[220] bg-[var(--red)] text-white border-4 border-[var(--ink)] w-14 h-14 flex items-center justify-center transition-all duration-200 hover:bg-[var(--yellow)] hover:text-[var(--ink)] hover:-translate-y-1 shadow-[4px_4px_0_var(--ink)] touch-manipulation"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '22px',
            fontWeight: 900,
            WebkitAppearance: 'none',
            MozAppearance: 'none',
            appearance: 'none',
            bottom: fabBottom,
            left: 'max(1rem, env(safe-area-inset-left, 0px))',
          }}
          aria-label={label}
          aria-expanded={false}
          title={label}
        >
          💬
          {unread > 0 ? (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-[var(--yellow)] text-[var(--ink)] border-2 border-[var(--ink)] text-[10px] leading-[14px] font-black">
              {unread > 9 ? '9+' : unread}
            </span>
          ) : null}
        </button>
      ) : null}

      {!embedded && open ? (
        <button
          type="button"
          className={`ob-admin-chat-backdrop fixed inset-0 z-[219] touch-manipulation ${
            mobileSheet ? 'bg-[var(--ink)]/55' : 'bg-[var(--ink)]/25 sm:bg-transparent sm:pointer-events-none'
          }`}
          aria-label={es ? 'Cerrar chat' : 'Close chat'}
          onClick={() => setOpen(false)}
        />
      ) : null}

      <div
        className={`${embedded ? 'flex-1 min-h-0 flex flex-col bg-[var(--paper)] overflow-hidden' : `ob-admin-chat-panel fixed z-[220] flex flex-col bg-[var(--paper)] overflow-hidden transition-[opacity,transform] duration-200 ease-out ${
          mobileSheet
            ? 'ob-admin-chat-panel--sheet border-0 border-t-4 border-[var(--ink)] shadow-none'
            : 'border-4 border-[var(--ink)] shadow-[8px_8px_0_var(--ink)]'
        } ${open ? 'opacity-100 pointer-events-auto translate-y-0' : 'opacity-0 pointer-events-none translate-y-3'}`}`}
        style={embedded ? undefined : panelStyle}
        role={embedded ? undefined : 'dialog'}
        aria-modal={embedded ? undefined : true}
        aria-label={label}
        data-ob-overlay={embedded ? undefined : true}
        hidden={!embedded && !open}
      >
        {embedded && activeId && threadDetail ? (
          <div className="shrink-0 flex items-center gap-2 px-3 border-b-4 border-[var(--ink)] min-h-12">
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center border-[2px] border-[var(--ink)] bg-transparent hover:bg-[var(--ink)] hover:text-[var(--yellow)] touch-manipulation"
              style={{ ...MONO, fontWeight: 900, fontSize: '18px' }}
              aria-label={es ? 'Volver' : 'Back'}
              onClick={() => { setActiveId(null); setAddOpen(false); loadThreads().catch(() => {}) }}
            >
              ←
            </button>
            <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wider" style={MONO}>
              {threadLabel(threadDetail, myId, es)}
            </span>
          </div>
        ) : null}
        {!embedded ? (
        <header className="ob-admin-chat-panel__bar shrink-0 flex items-center gap-2 px-3 border-b-4 border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)]">
          {activeId ? (
            <button
              type="button"
              className="flex h-11 w-11 shrink-0 items-center justify-center border-[2px] border-[var(--ink)] bg-transparent hover:bg-[var(--ink)] hover:text-[var(--yellow)] touch-manipulation"
              style={{ ...MONO, fontWeight: 900, fontSize: '18px' }}
              aria-label={es ? 'Volver' : 'Back'}
              onClick={() => { setActiveId(null); setAddOpen(false); loadThreads().catch(() => {}) }}
            >
              ←
            </button>
          ) : null}
          <span className="min-w-0 flex-1 truncate text-[11px] font-bold uppercase tracking-wider" style={MONO}>
            {activeId && threadDetail ? threadLabel(threadDetail, myId, es) : label}
          </span>
          <button
            type="button"
            className="flex h-11 w-11 shrink-0 items-center justify-center border-[2px] border-[var(--ink)] bg-transparent hover:bg-[var(--ink)] hover:text-[var(--yellow)] touch-manipulation"
            style={{ ...MONO, fontWeight: 900, fontSize: '18px' }}
            aria-label={es ? 'Minimizar chat' : 'Minimize chat'}
            onClick={() => setOpen(false)}
          >
            −
          </button>
        </header>
        ) : null}

        <div className="ob-admin-chat-panel__body flex-1 min-h-0 flex flex-col">
          {error ? (
            <div className="px-3 py-2 bg-[var(--red)] text-white" style={{ ...MONO, fontSize: '11px' }}>{error}</div>
          ) : null}

          {activeId && threadDetail ? (
            <>
              {threadDetail.kind === 'group' ? (
                <div className="shrink-0 px-3 py-2 border-b-2 border-[var(--ink)]/20 flex items-center justify-between gap-2">
                  <p className="min-w-0 truncate" style={{ ...MONO, fontSize: '10px', color: 'var(--dim)' }}>
                    {threadDetail.members.map((m) => m.name).join(' · ')}
                  </p>
                  <button
                    type="button"
                    className="cutout outline shrink-0"
                    style={{ cursor: 'pointer', fontSize: '9px' }}
                    onClick={() => setAddOpen((v) => !v)}
                  >
                    {es ? 'AÑADIR' : 'ADD'}
                  </button>
                </div>
              ) : null}
              {addOpen ? (
                <div className="shrink-0 max-h-32 overflow-y-auto border-b-2 border-[var(--ink)]/20 px-2 py-2 space-y-1">
                  {directory.filter((a) => !memberIds.has(a.id)).map((a) => (
                    <button
                      key={a.id}
                      type="button"
                      disabled={busy}
                      onClick={() => addMember(a.id)}
                      className="w-full flex items-center gap-2 px-1 py-1 text-left hover:bg-[var(--ink)]/5"
                    >
                      <Avatar name={a.name} image={a.image} size={24} />
                      <span className="font-black" style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '12px' }}>{a.name}</span>
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="flex-1 min-h-0 overflow-y-auto px-3 py-3 space-y-3 ob-capture__messages">
                {messages.length === 0 ? (
                  <p style={{ ...MONO, fontSize: '12px', color: 'var(--dim)' }}>
                    {es ? 'Aún no hay mensajes. Escribe el primero.' : 'No messages yet. Write the first one.'}
                  </p>
                ) : (
                  messages.map((m) => {
                    const mine = m.sender_id === myId
                    return (
                      <div key={m.id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                        <div className={`max-w-[85%] border-2 border-[var(--ink)] px-2 py-1.5 ${mine ? 'bg-[var(--yellow)]' : 'bg-white'}`}>
                          <div style={{ ...MONO, fontSize: '9px', color: 'var(--dim)', marginBottom: 2 }}>
                            {m.sender_name} · {formatWhen(m.created_at, lang)}
                          </div>
                          <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.45, whiteSpace: 'pre-wrap' }}>
                            {m.body}
                          </p>
                        </div>
                      </div>
                    )
                  })
                )}
                <div ref={listEnd} />
              </div>
              <form
                className="shrink-0 border-t-4 border-[var(--ink)] p-2 flex gap-2 ob-capture__composer"
                onSubmit={(e) => { e.preventDefault(); send() }}
              >
                <textarea
                  value={draft}
                  onChange={(e) => setDraft(e.target.value.slice(0, MESSAGE_MAX))}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      send()
                    }
                  }}
                  rows={2}
                  maxLength={MESSAGE_MAX}
                  placeholder={es ? 'Escribe…' : 'Write…'}
                  className="flex-1 min-w-0 px-2 py-1 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none resize-none"
                  style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }}
                />
                <button type="submit" disabled={busy || !draft.trim()} className="cutout red self-end" style={{ cursor: 'pointer' }}>
                  {es ? 'ENVIAR' : 'SEND'}
                </button>
              </form>
            </>
          ) : (
            <>
              <div className="shrink-0 flex border-b-4 border-[var(--ink)]">
                {(['hilos', 'agenda'] as Tab[]).map((k) => (
                  <button
                    key={k}
                    type="button"
                    onClick={() => setTab(k)}
                    className={`flex-1 py-2 text-[11px] font-bold uppercase tracking-wider ${tab === k ? 'bg-[var(--ink)] text-[var(--yellow)]' : 'bg-transparent'}`}
                    style={MONO}
                  >
                    {k === 'hilos' ? (es ? 'Hilos' : 'Chats') : (es ? 'Agenda' : 'Directory')}
                  </button>
                ))}
              </div>
              {tab === 'agenda' ? (
                <div className="flex-1 min-h-0 flex flex-col">
                  <div className="shrink-0 p-2 border-b-2 border-[var(--ink)]/20">
                    <input
                      value={query}
                      onChange={(e) => setQuery(e.target.value)}
                      placeholder={es ? 'Busca un artista…' : 'Search an artist…'}
                      className="w-full px-2 py-2 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none"
                      style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px' }}
                    />
                  </div>
                  {selected.length > 0 ? (
                    <div className="shrink-0 p-2 border-b-2 border-[var(--ink)]/20 flex gap-2">
                      <input
                        value={groupTitle}
                        onChange={(e) => setGroupTitle(e.target.value.slice(0, TITLE_MAX))}
                        placeholder={es ? 'Nombre del grupo' : 'Group name'}
                        className="flex-1 min-w-0 px-2 py-1 border-[3px] border-[var(--ink)] bg-[var(--paper)] outline-none"
                        style={{ fontFamily: "'Special Elite', monospace", fontSize: '13px' }}
                      />
                      <button
                        type="button"
                        disabled={busy || !groupTitle.trim()}
                        onClick={startGroup}
                        className="cutout red"
                        style={{ cursor: 'pointer', fontSize: '10px' }}
                      >
                        {es ? 'GRUPO' : 'GROUP'}
                      </button>
                    </div>
                  ) : null}
                  <div className="flex-1 min-h-0 overflow-y-auto">
                    {directory.length === 0 ? (
                      <p className="p-3" style={{ ...MONO, fontSize: '12px', color: 'var(--dim)' }}>
                        {es ? 'Aún no hay más artistas verificados.' : 'No other verified artists yet.'}
                      </p>
                    ) : (
                      directory.map((a) => {
                        const on = selected.includes(a.id)
                        return (
                          <div key={a.id} className="flex items-center gap-2 px-2 py-2 border-b border-[var(--ink)]/15">
                            <input
                              type="checkbox"
                              checked={on}
                              onChange={() => setSelected((prev) => on ? prev.filter((id) => id !== a.id) : [...prev, a.id])}
                              className="w-4 h-4 accent-[var(--red)]"
                              aria-label={es ? `Seleccionar ${a.name} para grupo` : `Select ${a.name} for group`}
                            />
                            <Avatar name={a.name} image={a.image} />
                            <div className="min-w-0 flex-1">
                              <Link
                                href={`/${lang}/artists/${a.slug}`}
                                className="font-black no-underline text-[var(--ink)] hover:text-[var(--red)]"
                                style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '13px' }}
                              >
                                {a.name}
                              </Link>
                            </div>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => startDm(a.id)}
                              className="cutout red"
                              style={{ cursor: 'pointer', fontSize: '9px' }}
                            >
                              {es ? 'ESCRIBIR' : 'WRITE'}
                            </button>
                          </div>
                        )
                      })
                    )}
                  </div>
                </div>
              ) : (
                <div className="flex-1 min-h-0 overflow-y-auto">
                  {threads.length === 0 ? (
                    <p className="p-3" style={{ ...MONO, fontSize: '12px', color: 'var(--dim)' }}>
                      {es ? 'Sin conversaciones. Ábrelas desde la agenda.' : 'No chats yet. Start one from the directory.'}
                    </p>
                  ) : (
                    threads.map((t) => (
                      <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveId(t.id)}
                        className="w-full text-left flex items-center gap-2 px-3 py-3 border-b border-[var(--ink)]/15 hover:bg-[var(--ink)]/5"
                      >
                        <Avatar
                          name={threadLabel(t, myId, es)}
                          image={t.members.find((m) => m.user_id !== myId)?.image ?? t.members[0]?.image ?? null}
                        />
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-2">
                            <span className="font-black truncate" style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '13px' }}>
                              {threadLabel(t, myId, es)}
                            </span>
                            {t.unread ? <span className="w-2 h-2 rounded-full bg-[var(--red)] shrink-0" /> : null}
                          </div>
                          <div className="truncate" style={{ ...MONO, fontSize: '11px', color: 'var(--dim)' }}>
                            {t.last_message_preview || (es ? 'Sin mensajes' : 'No messages')}
                          </div>
                        </div>
                        <span className="shrink-0" style={{ ...MONO, fontSize: '9px', color: 'var(--dim)' }}>
                          {formatWhen(t.last_message_at || t.updated_at, lang)}
                        </span>
                      </button>
                    ))
                  )}
                </div>
              )}
            </>
          )}
          <p className="shrink-0 px-3 py-1.5 border-t-2 border-[var(--ink)]/20" style={{ ...MONO, fontSize: '9px', color: 'var(--dim)' }}>
            {es
              ? 'Los mensajes se quedan en Optimal Breaks. No es un chat secreto.'
              : 'Messages stay on Optimal Breaks. This is not a secret chat.'}
          </p>
        </div>
      </div>
    </>
  )

  return embedded ? ui : createPortal(ui, document.body)
}

export function ArtistNetworkPanel({ active = true }: { active?: boolean }) {
  return <ArtistNetworkWidgetInner embedded active={active} />
}

export default function ArtistNetworkFab() {
  return (
    <Suspense fallback={null}>
      <ArtistNetworkWidgetInner />
    </Suspense>
  )
}
