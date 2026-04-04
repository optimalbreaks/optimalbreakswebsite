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
  { key: 'artists', label: 'Artistas', icon: '♫', href: '/artists', accent: 'var(--red)' },
  { key: 'labels', label: 'Sellos', icon: '◈', href: '/labels', accent: 'var(--uv)' },
  { key: 'events', label: 'Eventos', icon: '⚡', href: '/events', accent: 'var(--orange)' },
  { key: 'blog_posts', label: 'Blog', icon: '✎', href: '/blog', accent: 'var(--acid)' },
  { key: 'scenes', label: 'Escenas', icon: '☰', href: '/scenes', accent: 'var(--cyan)' },
  { key: 'mixes', label: 'Mixes', icon: '▶', href: '/mixes', accent: 'var(--pink)' },
  { key: 'history_entries', label: 'Historia', icon: '↻', href: '/history', accent: 'var(--yellow)' },
  { key: 'users', label: 'Usuarios', icon: '☻', href: '/users', accent: 'var(--paper-dark)' },
] as const

function CountUp({ target, loading }: { target: number; loading: boolean }) {
  const [value, setValue] = useState(0)
  useEffect(() => {
    if (loading || target === 0) { setValue(target); return }
    let start = 0
    const duration = 600
    const step = Math.max(1, Math.ceil(target / (duration / 16)))
    const id = setInterval(() => {
      start += step
      if (start >= target) { setValue(target); clearInterval(id) }
      else setValue(start)
    }, 16)
    return () => clearInterval(id)
  }, [target, loading])
  if (loading) return <span className="animate-pulse opacity-40">—</span>
  return <>{value}</>
}

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

  const total = stats
    ? stats.artists + stats.labels + stats.events + stats.blog_posts + stats.scenes + stats.mixes + stats.history_entries
    : 0

  return (
    <div className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-10">
        <div>
          <span
            className="inline-block px-2.5 py-1 text-[10px] font-black tracking-[4px] uppercase bg-[var(--red)] text-white border-2 border-[var(--ink)] mb-3"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            Backstage
          </span>
          <h1
            className="text-3xl sm:text-4xl lg:text-5xl font-black leading-[0.95]"
            style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
          >
            Dashboard
          </h1>
          <p
            className="text-sm text-[var(--ink)]/50 mt-2 max-w-xl"
            style={{ fontFamily: "'Courier Prime', monospace" }}
          >
            Panel de control de contenidos de Optimal Breaks.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Link
            href={`${base}/stats`}
            className="admin-btn admin-btn--yellow no-underline"
          >
            📊 Estadísticas
          </Link>
          <Link href={`${base}/artists/new`} className="admin-btn no-underline">
            + Artista
          </Link>
          <Link href={`${base}/agent`} className="admin-btn admin-btn--ghost no-underline">
            ⚙ Bio IA
          </Link>
        </div>
      </div>

      {/* Totals ribbon */}
      {!loading && stats && (
        <div
          className="flex items-center gap-4 px-5 py-3 mb-8 border-[3px] border-[var(--ink)] bg-[var(--ink)] text-[var(--paper)]"
          style={{ fontFamily: "'Courier Prime', monospace" }}
        >
          <span className="text-xs font-black tracking-wider uppercase opacity-70">Total contenidos</span>
          <span className="text-2xl font-black" style={{ fontFamily: "'Unbounded', sans-serif" }}>
            {total}
          </span>
          <span className="text-xs opacity-50 ml-auto">
            {stats.users} usuario{stats.users !== 1 ? 's' : ''} registrado{stats.users !== 1 ? 's' : ''}
          </span>
        </div>
      )}

      {/* Stat cards grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-4 mb-10">
        {CARDS.map((card) => {
          const val = stats?.[card.key as keyof Stats] ?? 0
          return (
            <Link
              key={card.key}
              href={`${base}${card.href}`}
              className="group relative flex flex-col justify-between p-4 sm:p-5 no-underline
                border-[3px] border-[var(--ink)] bg-[#fffef6] overflow-hidden
                hover:translate-x-[-2px] hover:translate-y-[-2px] transition-all duration-150"
              style={{ boxShadow: '4px 4px 0 var(--ink)' }}
            >
              {/* Accent bar top */}
              <div
                className="absolute top-0 left-0 right-0 h-1"
                style={{ background: card.accent }}
              />

              <div className="flex items-center justify-between mb-3">
                <span className="text-2xl leading-none opacity-60 group-hover:opacity-100 transition-opacity">
                  {card.icon}
                </span>
                <span
                  className="text-[9px] font-black tracking-wider uppercase opacity-0 group-hover:opacity-70 transition-opacity"
                  style={{ fontFamily: "'Courier Prime', monospace" }}
                >
                  Ver →
                </span>
              </div>

              <div
                className="text-3xl sm:text-4xl font-black leading-none mb-1"
                style={{ fontFamily: "'Unbounded', sans-serif", color: 'var(--ink)' }}
              >
                <CountUp target={val} loading={loading} />
              </div>
              <div
                className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-[var(--ink)]/60"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                {card.label}
              </div>
            </Link>
          )
        })}
      </div>

      {/* Bottom panels */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Quick actions */}
        <div className="admin-panel !p-5">
          <h2
            className="text-sm font-black uppercase mb-4 pb-2 border-b-[3px] border-[var(--ink)]"
            style={{ fontFamily: "'Unbounded', sans-serif" }}
          >
            Accesos rápidos
          </h2>
          <div className="grid grid-cols-2 gap-2">
            {CARDS.filter((c) => c.href).map((card) => (
              <Link
                key={card.key}
                href={`${base}${card.href}`}
                className="flex items-center gap-2 px-3 py-2.5 no-underline
                  border-2 border-[var(--ink)]/30 bg-[var(--paper)] text-[var(--ink)]
                  hover:border-[var(--ink)] hover:bg-[var(--yellow)]/30 transition-all"
                style={{
                  fontFamily: "'Courier Prime', monospace",
                  fontWeight: 700,
                  fontSize: '10px',
                  letterSpacing: '1px',
                  textTransform: 'uppercase',
                }}
              >
                <span className="text-base leading-none">{card.icon}</span>
                <span>{card.label}</span>
              </Link>
            ))}
          </div>
        </div>

        {/* AI tools */}
        <div className="admin-panel !p-5">
          <h2
            className="text-sm font-black uppercase mb-4 pb-2 border-b-[3px] border-[var(--ink)]"
            style={{ fontFamily: "'Unbounded', sans-serif" }}
          >
            Herramientas IA
          </h2>
          <Link
            href={`${base}/agent`}
            className="flex items-center gap-4 p-4 no-underline border-2 border-[var(--ink)]/30
              bg-[#fffef6] hover:bg-[var(--acid)]/15 hover:border-[var(--ink)] transition-all"
          >
            <span
              className="flex items-center justify-center w-12 h-12 text-xl border-[3px] border-[var(--ink)] bg-[var(--acid)]/30"
            >
              ⚙
            </span>
            <div>
              <div
                className="font-black uppercase text-[var(--ink)] text-sm"
                style={{ fontFamily: "'Unbounded', sans-serif" }}
              >
                Agente de biografías
              </div>
              <p
                className="text-xs text-[var(--ink)]/50 !mt-1 !mb-0"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                IA + investigación web para fichas de artistas.
              </p>
            </div>
          </Link>

          <Link
            href={`${base}/stats`}
            className="flex items-center gap-4 p-4 mt-2 no-underline border-2 border-[var(--ink)]/30
              bg-[#fffef6] hover:bg-[var(--uv)]/10 hover:border-[var(--ink)] transition-all"
          >
            <span
              className="flex items-center justify-center w-12 h-12 text-xl border-[3px] border-[var(--ink)] bg-[var(--uv)]/20"
            >
              📊
            </span>
            <div>
              <div
                className="font-black uppercase text-[var(--ink)] text-sm"
                style={{ fontFamily: "'Unbounded', sans-serif" }}
              >
                Estadísticas de uso
              </div>
              <p
                className="text-xs text-[var(--ink)]/50 !mt-1 !mb-0"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                Engagement, plays, favoritos, valoraciones.
              </p>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
