// ============================================
// OPTIMAL BREAKS — Shared chrome for user area pages
// (dashboard overview + all /mi-cuenta/* subpages)
// ============================================

'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { useEffect, type ReactNode } from 'react'
import { useAuth } from '@/components/AuthProvider'

export type UserSectionKey =
  | 'overview'
  | 'favorites'
  | 'sightings'
  | 'events'
  | 'reviews'
  | 'mixes'
  | 'tracks'
  | 'soulmates'
  | 'profile'

const NAV: Array<{ key: UserSectionKey; href: (lang: string) => string; icon: string; label_en: string; label_es: string }> = [
  { key: 'overview',  href: (l) => `/${l}/dashboard`,                icon: '◉', label_en: 'OVERVIEW',      label_es: 'RESUMEN' },
  { key: 'favorites', href: (l) => `/${l}/mi-cuenta/favoritos`,      icon: '★', label_en: 'FAVORITES',     label_es: 'FAVORITOS' },
  { key: 'sightings', href: (l) => `/${l}/mi-cuenta/vistos-en-vivo`, icon: '♫', label_en: 'SEEN LIVE',     label_es: 'VISTOS EN VIVO' },
  { key: 'events',    href: (l) => `/${l}/mi-cuenta/eventos`,        icon: '📅', label_en: 'EVENTS',       label_es: 'EVENTOS' },
  { key: 'reviews',   href: (l) => `/${l}/mi-cuenta/resenas`,        icon: '📝', label_en: 'REVIEWS',      label_es: 'RESEÑAS' },
  { key: 'mixes',     href: (l) => `/${l}/mi-cuenta/mixes`,          icon: '🎧', label_en: 'SAVED MIXES',  label_es: 'MIXES GUARDADOS' },
  { key: 'tracks',    href: (l) => `/${l}/mi-cuenta/tracks`,         icon: '♪', label_en: 'MY TRACKS',     label_es: 'MIS TRACKS' },
  { key: 'soulmates', href: (l) => `/${l}/mi-cuenta/almas-gemelas`,  icon: '⌬', label_en: 'SOULMATES',     label_es: 'ALMAS GEMELAS' },
  { key: 'profile',   href: (l) => `/${l}/mi-cuenta/perfil`,         icon: '⚙', label_en: 'PROFILE',       label_es: 'PERFIL' },
]

interface Props {
  lang: string
  section: UserSectionKey
  children: ReactNode
}

export default function UserSectionShell({ lang, section, children }: Props) {
  const { user, loading: authLoading } = useAuth()
  const router = useRouter()
  const pathname = usePathname()
  const es = lang === 'es'

  useEffect(() => {
    if (!authLoading && !user) {
      router.push(`/${lang}/login`)
    }
  }, [authLoading, user, lang, router])

  if (authLoading) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <div
          className="w-16 h-16 rounded-full border-4 border-[var(--ink)] border-t-[var(--red)]"
          style={{ animation: 'spin 1s linear infinite' }}
        />
      </div>
    )
  }

  if (!user) return null

  return (
    <div className="min-h-screen">
      {/* Header */}
      <section className="bg-[var(--ink)] text-[var(--paper)] px-4 sm:px-6 py-8 sm:py-12 border-b-8 border-[var(--red)]">
        <div className="sec-tag" style={{ borderColor: 'var(--yellow)', color: 'var(--yellow)' }}>MY BREAKS</div>
        <h1
          className="mt-4"
          style={{
            fontFamily: "'Unbounded', sans-serif",
            fontWeight: 900,
            fontSize: 'clamp(28px, 6vw, 50px)',
            textTransform: 'uppercase',
            lineHeight: 0.9,
          }}
        >
          <span style={{ color: 'var(--yellow)' }}>
            {user.user_metadata?.full_name || user.email?.split('@')[0] || 'BREAKER'}
          </span>
        </h1>
        <p
          className="mt-2"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '12px',
            color: 'rgba(232,220,200,0.5)',
            letterSpacing: '2px',
          }}
        >
          {es ? 'TU APP DEL BREAKBEAT' : 'YOUR BREAKBEAT APP'}
        </p>
      </section>

      {/* Tab navigation (real <Link>s now, not state) */}
      <nav className="flex overflow-x-auto border-b-4 border-[var(--ink)] bg-[var(--paper)]">
        {NAV.map((t) => {
          const href = t.href(lang)
          const isActive = t.key === section || pathname === href
          return (
            <Link
              key={t.key}
              href={href}
              className={`flex items-center gap-1 px-3 sm:px-4 py-3 border-r-[3px] border-[var(--ink)] whitespace-nowrap transition-all no-underline ${
                isActive ? 'bg-[var(--red)] text-white' : 'text-[var(--ink)] hover:bg-[var(--yellow)]'
              }`}
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: '10px',
                letterSpacing: '1px',
                textTransform: 'uppercase',
              }}
            >
              <span>{t.icon}</span>
              <span className="hidden sm:inline">{es ? t.label_es : t.label_en}</span>
            </Link>
          )
        })}
      </nav>

      {/* Page content */}
      <div className="lined px-4 sm:px-6 py-8 sm:py-12">
        {children}
      </div>
    </div>
  )
}
