'use client'

import { useCallback, useEffect, useState } from 'react'

type Member = { id: string; name: string; slug: string; image: string | null; user_id: string }

type Thread = {
  id: string
  kind: 'dm' | 'group'
  title: string | null
  last_message_at: string | null
  last_message_preview: string
  created_at: string
  updated_at: string
  members: Member[]
}

type Message = {
  id: string
  sender_id: string
  sender_name: string
  body: string
  created_at: string
}

const MONO = { fontFamily: "'Courier Prime', monospace" } as const

function when(iso: string | null) {
  if (!iso) return '—'
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return '—'
  return d.toLocaleString('es-ES', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

function threadTitle(t: Thread) {
  if (t.kind === 'group' && t.title) return t.title
  return t.members.map((m) => m.name).join(' · ') || 'DM'
}

export default function AdminArtistNetworkPage() {
  const [threads, setThreads] = useState<Thread[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [members, setMembers] = useState<Member[]>([])
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [loadingThread, setLoadingThread] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const openThread = useCallback(async (id: string) => {
    setActive(id)
    setLoadingThread(true)
    setError(null)
    try {
      const res = await fetch(`/api/admin/artist-network?thread_id=${id}`)
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'Error')
      setMembers(json.data.members || [])
      setMessages(json.data.messages || [])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Error')
    } finally {
      setLoadingThread(false)
    }
  }, [])

  useEffect(() => {
    let cancelled = false
    fetch('/api/admin/artist-network')
      .then(async (res) => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Error')
        return json
      })
      .then((json) => {
        if (cancelled) return
        setThreads(json.data || [])
      })
      .catch((e: Error) => {
        if (!cancelled) setError(e.message)
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })
    return () => { cancelled = true }
  }, [])

  return (
    <div>
      <h1 className="admin-page-title">Red de artistas</h1>
      <p className="admin-muted mb-4 max-w-2xl">
        Mensajes entre fichas reclamadas (1:1 y grupos). Lectura para moderación y tendencias.
        El artista no ve este panel; entre ellos el hilo es privado.
      </p>

      {error ? <p className="mb-4 text-[var(--red)]" style={MONO}>{error}</p> : null}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          {loading ? (
            <p className="admin-muted">Cargando…</p>
          ) : threads.length === 0 ? (
            <p className="admin-muted">Aún no hay hilos.</p>
          ) : (
            <div className="space-y-2">
              {threads.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => openThread(t.id)}
                  className={`w-full text-left border-[3px] border-[var(--ink)] p-3 ${active === t.id ? 'bg-[var(--yellow)]' : 'bg-[var(--paper)]'}`}
                >
                  <div className="flex items-center justify-between gap-2 mb-1">
                    <span style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '14px' }}>
                      {threadTitle(t)}
                    </span>
                    <span className="px-2 py-0.5 border-2 border-[var(--ink)]" style={{ ...MONO, fontSize: '10px', textTransform: 'uppercase' }}>
                      {t.kind === 'group' ? 'grupo' : '1:1'}
                    </span>
                  </div>
                  <div style={{ ...MONO, fontSize: '11px', color: 'var(--dim)' }}>
                    {t.members.map((m) => m.name).join(' · ')}
                  </div>
                  <div className="mt-1 truncate" style={{ ...MONO, fontSize: '12px' }}>
                    {t.last_message_preview || 'Sin mensajes'}
                  </div>
                  <div style={{ ...MONO, fontSize: '10px', color: 'var(--dim)' }}>{when(t.last_message_at || t.updated_at)}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        <div>
          {!active ? (
            <p className="admin-muted">Elige un hilo.</p>
          ) : loadingThread ? (
            <p className="admin-muted">Cargando conversación…</p>
          ) : (
            <div className="border-[3px] border-[var(--ink)] p-4 bg-[var(--paper)]">
              <p className="mb-3" style={{ ...MONO, fontSize: '11px', color: 'var(--dim)' }}>
                {members.map((m) => m.name).join(' · ') || 'Sin miembros'}
              </p>
              {messages.length === 0 ? (
                <p className="admin-muted">Sin mensajes.</p>
              ) : (
                <div className="space-y-3 max-h-[70vh] overflow-y-auto">
                  {messages.map((m) => (
                    <div key={m.id} className="border-b border-[var(--ink)]/15 pb-2">
                      <div style={{ ...MONO, fontSize: '10px', color: 'var(--dim)' }}>
                        {m.sender_name} · {when(m.created_at)}
                      </div>
                      <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '14px', lineHeight: 1.5, whiteSpace: 'pre-wrap' }}>
                        {m.body}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
