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
  { key: 'artists', label: 'Artistas', icon: '♫', href: '/artists', color: 'from-purple-600 to-purple-800' },
  { key: 'labels', label: 'Sellos', icon: '◈', href: '/labels', color: 'from-blue-600 to-blue-800' },
  { key: 'events', label: 'Eventos', icon: '⚡', href: '/events', color: 'from-amber-600 to-amber-800' },
  { key: 'blog_posts', label: 'Blog', icon: '✎', href: '/blog', color: 'from-green-600 to-green-800' },
  { key: 'scenes', label: 'Escenas', icon: '☰', href: '/scenes', color: 'from-cyan-600 to-cyan-800' },
  { key: 'mixes', label: 'Mixes', icon: '▶', href: '/mixes', color: 'from-pink-600 to-pink-800' },
  { key: 'history_entries', label: 'Historia', icon: '↻', href: '/history', color: 'from-orange-600 to-orange-800' },
  { key: 'users', label: 'Usuarios', icon: '☻', href: '', color: 'from-slate-600 to-slate-800' },
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
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold text-white">Dashboard</h1>
        <div className="flex gap-3">
          <Link
            href={`${base}/artists/new`}
            className="px-4 py-2 text-sm rounded-md bg-purple-700 hover:bg-purple-600 text-white transition-colors"
          >
            + Nuevo artista
          </Link>
          <Link
            href={`${base}/agent`}
            className="px-4 py-2 text-sm rounded-md bg-emerald-700 hover:bg-emerald-600 text-white transition-colors"
          >
            ⚙ Generar bio IA
          </Link>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {CARDS.map((card) => (
          <div
            key={card.key}
            className={`bg-gradient-to-br ${card.color} rounded-xl p-5 shadow-lg`}
          >
            <div className="flex items-center justify-between mb-3">
              <span className="text-2xl">{card.icon}</span>
              {card.href && (
                <Link
                  href={`${base}${card.href}`}
                  className="text-xs text-white/70 hover:text-white underline"
                >
                  Ver todo →
                </Link>
              )}
            </div>
            <div className="text-3xl font-bold text-white">
              {loading ? '…' : stats?.[card.key as keyof Stats] ?? 0}
            </div>
            <div className="text-sm text-white/70 mt-1">{card.label}</div>
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#2a2a4a]">
          <h2 className="text-lg font-semibold text-white mb-4">Accesos rápidos</h2>
          <div className="grid grid-cols-2 gap-3">
            {CARDS.filter(c => c.href).map((card) => (
              <Link
                key={card.key}
                href={`${base}${card.href}`}
                className="flex items-center gap-2 px-4 py-3 rounded-lg bg-[#12121f] hover:bg-[#2a2a4a] transition-colors text-sm"
              >
                <span>{card.icon}</span>
                <span>Gestionar {card.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <div className="bg-[#1a1a2e] rounded-xl p-6 border border-[#2a2a4a]">
          <h2 className="text-lg font-semibold text-white mb-4">Herramientas IA</h2>
          <Link
            href={`${base}/agent`}
            className="flex items-center gap-3 px-4 py-4 rounded-lg bg-[#12121f] hover:bg-[#2a2a4a] transition-colors"
          >
            <span className="text-2xl">⚙</span>
            <div>
              <div className="font-medium text-white">Agente de Biografías</div>
              <div className="text-sm text-gray-400">Genera biografías completas de artistas con IA + investigación web</div>
            </div>
          </Link>
        </div>
      </div>
    </div>
  )
}
