'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useParams } from 'next/navigation'

interface Stats {
  artists: number
  labels: number
  events: number
  blog_posts: number
  scenes: number
  mixes: number
  history_entries: number
  users: number
}

const CARDS = [
  { key: 'artists', label: 'Artistas', icon: '♫', href: '/artists', bg: 'var(--red)', fg: '#fff' },
  { key: 'labels', label: 'Sellos', icon: '◈', href: '/labels', bg: 'var(--uv)', fg: '#fff' },
  { key: 'events', label: 'Eventos', icon: '⚡', href: '/events', bg: 'var(--orange)', fg: '#fff' },
  { key: 'blog_posts', label: 'Blog', icon: '✎', href: '/blog', bg: 'var(--acid)', fg: 'var(--ink)' },
  { key: 'scenes', label: 'Escenas', icon: '☰', href: '/scenes', bg: 'var(--cyan)', fg: '#fff' },
  { key: 'mixes', label: 'Mixes', icon: '▶', href: '/mixes', bg: 'var(--pink)', fg: '#fff' },
  { key: 'history_entries', label: 'Historia', icon: '↻', href: '/history', bg: 'var(--yellow)', fg: 'var(--ink)' },
  { key: 'users', label: 'Usuarios', icon: '☻', href: '/users', bg: 'var(--paper-dark)', fg: 'var(--ink)' },
] as const

export default function AdminDashboard() {
  const { lang } = useParams<{ lang: string }>()
  const base = `/${lang}/administrator`
  const [stats, setStats] = useState<Stats | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetch('/api/admin/stats')
      .then((r) => r.json())
      .then(setStats)
      .catch(() => {})
      .finally(() => setLoading(false))
  }, [])

  return (
    <div>
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-8">
        <div>
          <span className="sec-tag">Backstage</span>
          <h1 className="sec-title !mb-0">Dashboard</h1>
        </div>
        <div className="flex flex-wrap gap-3">
          <Link href={`${base}/artists/new`} className="admin-btn admin-btn--yellow no-underline">
            + Nuevo artista
          </Link>
          <Link href={`${base}/agent`} className="admin-btn no-underline">
            ⚙ Bio IA
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {CARDS.map((card) => (
          <div
            key={card.key}
            className="admin-panel !p-5 border-[3px] border-[var(--ink)] flex flex-col gap-3"
            style={{ background: card.bg, color: card.fg, boxShadow: '8px 8px 0 var(--ink)' }}
          >
            <div className="flex items-center justify-between gap-2">
              <span className="text-2xl leading-none">{card.icon}</span>
              {card.href && (
                <Link
                  href={`${base}${card.href}`}
                  className="text-[10px] font-bold uppercase tracking-wider underline underline-offset-2 opacity-90 hover:opacity-100"
                  style={{
                    fontFamily: "'Courier Prime', monospace",
                    color: card.fg,
                  }}
                >
                  Ver todo →
                </Link>
              )}
            </div>
            <div
              className="text-4xl font-black leading-none"
              style={{ fontFamily: "'Unbounded', sans-serif" }}
            >
              {loading ? '…' : stats?.[card.key as keyof Stats] ?? 0}
            </div>
            <div
              className="text-xs font-bold uppercase tracking-wider opacity-90"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {card.label}
            </div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="admin-panel">
          <h2
            className="text-base font-black uppercase mb-4 pb-2 border-b-[3px] border-[var(--ink)]"
            style={{ fontFamily: "'Unbounded', sans-serif" }}
          >
            Accesos rápidos
          </h2>
          <div className="grid grid-cols-2 gap-3">
            {CARDS.filter((c) => c.href).map((card) => (
              <Link
                key={card.key}
                href={`${base}${card.href}`}
                className="flex items-center gap-2 px-3 py-3 no-underline border-[3px] border-[var(--ink)] bg-[var(--paper)] text-[var(--ink)] hover:bg-[var(--yellow)] transition-colors"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  fontWeight: 700,
                  fontSize: '11px',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                }}
              >
                <span>{card.icon}</span>
                <span>Gestionar {card.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="admin-panel relative tape">
          <h2
            className="text-base font-black uppercase mb-4 pb-2 border-b-[3px] border-[var(--ink)]"
            style={{ fontFamily: "'Unbounded', sans-serif" }}
          >
            Herramientas IA
          </h2>
          <Link
            href={`${base}/agent`}
            className="flex items-center gap-4 p-4 no-underline border-[3px] border-[var(--ink)] bg-[#fffef6] hover:bg-[var(--acid)]/25 transition-colors"
          >
            <span className="text-3xl">⚙</span>
            <div>
              <div
                className="font-black uppercase text-[var(--ink)]"
                style={{ fontFamily: "'Unbounded', sans-serif", fontSize: '15px' }}
              >
                Agente de biografías
              </div>
              <p className="admin-muted !mt-1 !mb-0 normal-case">
                IA + investigación web para fichas de artistas.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
