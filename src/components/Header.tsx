// ============================================
// OPTIMAL BREAKS — Header with Auth
// ============================================

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import { useAuth } from '@/components/AuthProvider'
import type { Locale } from '@/lib/i18n-config'

interface HeaderProps {
  dict: any
  lang: Locale
}

function FlagES({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="480" fill="#c60b1e" />
      <rect width="640" height="240" y="120" fill="#ffc400" />
    </svg>
  )
}

function FlagGB({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 640 480" xmlns="http://www.w3.org/2000/svg">
      <rect width="640" height="480" fill="#012169" />
      <path d="M75 0l244 181L562 0h78v62L400 241l240 178v61h-80L320 301 81 480H0v-60l239-178L0 64V0z" fill="#fff" />
      <path d="M424 281l216 159v40L369 281zm-184 20l6 35L54 480H0zM640 0v3L391 191l2-44L590 0zM0 0l239 176h-60L0 42z" fill="#C8102E" />
      <path d="M241 0v480h160V0zM0 160v160h640V160z" fill="#fff" />
      <path d="M0 193v96h640v-96zM273 0v480h96V0z" fill="#C8102E" />
    </svg>
  )
}

export default function Header({ dict, lang }: HeaderProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)
  const { user, loading } = useAuth()

  const navItems = [
    { key: 'history', href: `/${lang}/history` },
    { key: 'artists', href: `/${lang}/artists` },
    { key: 'labels', href: `/${lang}/labels` },
    { key: 'events', href: `/${lang}/events` },
    { key: 'scenes', href: `/${lang}/scenes` },
    { key: 'blog', href: `/${lang}/blog` },
    { key: 'mixes', href: `/${lang}/mixes` },
    { key: 'about', href: `/${lang}/about` },
  ]

  const otherLang = lang === 'es' ? 'en' : 'es'
  const switchPath = pathname.replace(`/${lang}`, `/${otherLang}`)
  const FlagIcon = otherLang === 'es' ? FlagES : FlagGB

  const navLinkStyle = (href: string) => ({
    fontFamily: "'Courier Prime', monospace",
    fontWeight: 700,
    fontSize: '11px',
    textTransform: 'uppercase' as const,
    letterSpacing: '2px',
    color: pathname === href ? 'white' : 'var(--ink)',
    background: pathname === href ? 'var(--red)' : 'transparent',
  })

  return (
    <header className="sticky top-0 z-[100] flex items-stretch bg-[var(--paper)] border-b-4 border-[var(--ink)]">
      {/* Logo */}
      <Link
        href={`/${lang}`}
        className="flex items-center gap-2 px-3 sm:px-[18px] py-3 bg-[var(--red)] text-white whitespace-nowrap no-underline"
        style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: '18px', textShadow: '1px 1px 0 rgba(0,0,0,0.3)' }}
      >
        <span className="hidden sm:inline">OPTIMAL//BREAKS</span>
        <span className="sm:hidden">OB</span>
      </Link>

      {/* Desktop nav */}
      <nav className="hidden lg:flex ml-auto">
        {navItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="flex items-center px-3 xl:px-4 py-3 no-underline border-l-[3px] border-[var(--ink)] transition-all duration-100 hover:bg-[var(--red)] hover:text-white"
            style={navLinkStyle(item.href)}
          >
            {dict.nav[item.key]}
          </Link>
        ))}

        {/* Language switch */}
        <Link
          href={switchPath}
          className="flex items-center gap-1.5 px-3 py-3 no-underline border-l-[3px] border-[var(--ink)] transition-all duration-100 hover:bg-[var(--uv)] hover:text-white"
          style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--ink)' }}
          title={otherLang === 'es' ? 'Cambiar a Español' : 'Switch to English'}
        >
          <FlagIcon className="w-5 h-[14px] rounded-[2px] shadow-sm" />
          {otherLang.toUpperCase()}
        </Link>

        {/* Auth button */}
        {!loading && (
          user ? (
            <Link
              href={`/${lang}/dashboard`}
              className="flex items-center gap-2 px-4 py-3 no-underline border-l-[3px] border-[var(--ink)] transition-all duration-100 hover:bg-[var(--yellow)]"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px' }}
            >
              <span className="w-6 h-6 rounded-full bg-[var(--red)] text-white flex items-center justify-center" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '10px' }}>
                {(user.user_metadata?.full_name || user.email || '?')[0].toUpperCase()}
              </span>
              <span className="hidden xl:inline" style={{ color: 'var(--ink)', textTransform: 'uppercase' }}>
                MY BREAKS
              </span>
            </Link>
          ) : (
            <Link
              href={`/${lang}/login`}
              className="flex items-center px-4 py-3 no-underline border-l-[3px] border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--red)] hover:text-white transition-all duration-100"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '11px', letterSpacing: '2px', textTransform: 'uppercase' }}
            >
              LOGIN
            </Link>
          )
        )}
      </nav>

      {/* Mobile: lang + auth + hamburger */}
      <div className="lg:hidden ml-auto flex items-stretch">
        <Link
          href={switchPath}
          className="flex items-center px-2.5 border-l-[3px] border-[var(--ink)] transition-colors hover:bg-[var(--uv)]"
          title={otherLang === 'es' ? 'Cambiar a Español' : 'Switch to English'}
        >
          <FlagIcon className="w-6 h-[17px] rounded-[2px] shadow-sm" />
        </Link>
        {!loading && (
          user ? (
            <Link
              href={`/${lang}/dashboard`}
              className="flex items-center px-3 border-l-[3px] border-[var(--ink)]"
            >
              <span className="w-7 h-7 rounded-full bg-[var(--red)] text-white flex items-center justify-center" style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: '11px' }}>
                {(user.user_metadata?.full_name || user.email || '?')[0].toUpperCase()}
              </span>
            </Link>
          ) : (
            <Link
              href={`/${lang}/login`}
              className="flex items-center px-3 border-l-[3px] border-[var(--ink)] bg-[var(--yellow)] text-[var(--ink)] hover:bg-[var(--red)] hover:text-white transition-colors"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '10px', letterSpacing: '2px' }}
            >
              LOGIN
            </Link>
          )
        )}
        <button
          className="px-3 py-3 border-l-[3px] border-[var(--ink)] bg-transparent"
          onClick={() => setMenuOpen(!menuOpen)}
          style={{ fontFamily: "'Courier Prime', monospace", fontSize: '18px', fontWeight: 700 }}
          aria-label="Menu"
        >
          {menuOpen ? '✕' : '☰'}
        </button>
      </div>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 bg-[var(--paper)] border-b-4 border-[var(--ink)] lg:hidden z-50">
          {navItems.map((item) => (
            <Link key={item.key} href={item.href} onClick={() => setMenuOpen(false)}
              className="block px-6 py-3 no-underline border-b-2 border-[var(--ink)]/10 hover:bg-[var(--red)] hover:text-white"
              style={{ fontFamily: "'Courier Prime', monospace", fontWeight: 700, fontSize: '12px', textTransform: 'uppercase', letterSpacing: '2px', color: 'var(--ink)' }}>
              {dict.nav[item.key]}
            </Link>
          ))}
        </div>
      )}
    </header>
  )
}
