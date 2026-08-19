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
  | 'artist'
  | 'profile'

type NavIcon = (props: { className?: string }) => ReactNode

function IconOverview({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="3" />
      <circle cx="12" cy="12" r="9" />
    </svg>
  )
}

function IconFavorites({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2" />
    </svg>
  )
}

function IconSightings({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  )
}

function IconEvents({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <rect x="3" y="5" width="18" height="16" rx="1" />
      <path d="M3 10h18M8 3v4M16 3v4" />
    </svg>
  )
}

function IconReviews({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M4 5h12a2 2 0 0 1 2 2v14l-4-3H6a2 2 0 0 1-2-2V5z" />
      <path d="M8 9h6M8 13h4" />
    </svg>
  )
}

function IconMixes({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M3 14v-3a9 9 0 0 1 18 0v3" />
      <path d="M21 16a2 2 0 0 1-2 2h-1v-6h1a2 2 0 0 1 2 2v2z" />
      <path d="M3 16a2 2 0 0 0 2 2h1v-6H5a2 2 0 0 0-2 2v2z" />
    </svg>
  )
}

function IconTracks({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M9 18V5l12-2v13" />
      <circle cx="6" cy="18" r="3" />
      <circle cx="18" cy="16" r="3" />
    </svg>
  )
}

function IconSoulmates({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M16 11a4 4 0 1 0-8 0" />
      <path d="M4 20a6 6 0 0 1 16 0" />
      <path d="M19 8a3 3 0 1 0-2-5.2" />
      <path d="M21.5 14.5A4.5 4.5 0 0 0 18 11" />
    </svg>
  )
}

function IconProfile({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="8" r="3.5" />
      <path d="M5 20a7 7 0 0 1 14 0" />
    </svg>
  )
}

function IconArtist({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 2v14" />
      <circle cx="8" cy="18" r="3" />
      <path d="M12 6l8-2v10" />
      <circle cx="17" cy="16" r="3" />
    </svg>
  )
}

const NAV: Array<{
  key: UserSectionKey
  href: (lang: string) => string
  Icon: NavIcon
  label_en: string
  label_es: string
  short_en: string
  short_es: string
}> = [
  { key: 'overview',  href: (l) => `/${l}/dashboard`,                Icon: IconOverview,  label_en: 'OVERVIEW',      label_es: 'RESUMEN',         short_en: 'HOME',   short_es: 'INICIO' },
  { key: 'favorites', href: (l) => `/${l}/mi-cuenta/favoritos`,      Icon: IconFavorites, label_en: 'FAVORITES',     label_es: 'FAVORITOS',       short_en: 'FAVS',   short_es: 'FAVS' },
  { key: 'sightings', href: (l) => `/${l}/mi-cuenta/vistos-en-vivo`, Icon: IconSightings, label_en: 'SEEN LIVE',     label_es: 'VISTOS EN VIVO',  short_en: 'LIVE',   short_es: 'VIVO' },
  { key: 'events',    href: (l) => `/${l}/mi-cuenta/eventos`,        Icon: IconEvents,    label_en: 'EVENTS',        label_es: 'EVENTOS',         short_en: 'EVENTS', short_es: 'EVENTOS' },
  { key: 'reviews',   href: (l) => `/${l}/mi-cuenta/resenas`,        Icon: IconReviews,   label_en: 'REVIEWS',       label_es: 'RESEÑAS',         short_en: 'REVIEWS',short_es: 'RESEÑAS' },
  { key: 'mixes',     href: (l) => `/${l}/mi-cuenta/mixes`,          Icon: IconMixes,     label_en: 'SAVED MIXES',   label_es: 'MIXES GUARDADOS', short_en: 'MIXES',  short_es: 'MIXES' },
  { key: 'tracks',    href: (l) => `/${l}/mi-cuenta/tracks`,         Icon: IconTracks,    label_en: 'MY TRACKS',     label_es: 'MIS TRACKS',      short_en: 'TRACKS', short_es: 'TRACKS' },
  { key: 'soulmates', href: (l) => `/${l}/mi-cuenta/almas-gemelas`,  Icon: IconSoulmates, label_en: 'SOULMATES',     label_es: 'ALMAS GEMELAS',   short_en: 'SOUL',   short_es: 'ALMAS' },
  { key: 'artist',    href: (l) => `/${l}/mi-cuenta/artista`,        Icon: IconArtist,    label_en: 'ARTIST',        label_es: 'ARTISTA',         short_en: 'ARTIST', short_es: 'ARTISTA' },
  { key: 'profile',   href: (l) => `/${l}/mi-cuenta/perfil`,         Icon: IconProfile,   label_en: 'PROFILE',       label_es: 'PERFIL',          short_en: 'PROFILE',short_es: 'PERFIL' },
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

  // Onboarding de artista: si el usuario marcó "Soy artista" al registrarse,
  // al llegar por primera vez a su panel lo llevamos a la sección Artista.
  useEffect(() => {
    if (authLoading || !user || section !== 'overview') return
    try {
      if (localStorage.getItem('ob_artist_intent') === '1') {
        localStorage.removeItem('ob_artist_intent')
        router.replace(`/${lang}/mi-cuenta/artista`)
      }
    } catch {
      /* localStorage no disponible */
    }
  }, [authLoading, user, section, lang, router])

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

      {/* Tab navigation — SVG icons + short labels on mobile, full labels from sm */}
      <nav
        className="flex overflow-x-auto overscroll-x-contain border-b-4 border-[var(--ink)] bg-[var(--paper)] [-webkit-overflow-scrolling:touch] [scrollbar-width:thin]"
        aria-label={es ? 'Secciones de Mi cuenta' : 'My account sections'}
      >
        {NAV.map((t) => {
          const href = t.href(lang)
          const isActive = t.key === section || pathname === href
          const Icon = t.Icon
          const fullLabel = es ? t.label_es : t.label_en
          const shortLabel = es ? t.short_es : t.short_en
          return (
            <Link
              key={t.key}
              href={href}
              aria-current={isActive ? 'page' : undefined}
              title={fullLabel}
              className={`group flex shrink-0 flex-col items-center justify-center gap-1 min-w-[4.25rem] sm:min-w-0 sm:flex-row sm:gap-2 px-2.5 sm:px-4 py-2.5 sm:py-3 border-r-[3px] border-[var(--ink)] no-underline transition-colors ${
                isActive
                  ? 'bg-[var(--red)] text-white'
                  : 'text-[var(--ink)] hover:bg-[var(--yellow)]'
              }`}
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                letterSpacing: '0.5px',
                textTransform: 'uppercase',
              }}
            >
              <Icon
                className={`w-5 h-5 sm:w-[1.125rem] sm:h-[1.125rem] shrink-0 ${
                  isActive ? 'opacity-100' : 'opacity-90 group-hover:opacity-100'
                }`}
              />
              <span className="sm:hidden text-[9px] leading-none tracking-wide text-center">
                {shortLabel}
              </span>
              <span className="hidden sm:inline text-[10px] leading-none tracking-wide">
                {fullLabel}
              </span>
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
