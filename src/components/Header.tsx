// ============================================
// OPTIMAL BREAKS — Header
// ============================================

'use client'

import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { useState } from 'react'
import type { Locale } from '@/lib/i18n-config'

interface HeaderProps {
  dict: any
  lang: Locale
}

export default function Header({ dict, lang }: HeaderProps) {
  const pathname = usePathname()
  const [menuOpen, setMenuOpen] = useState(false)

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

  return (
    <header className="sticky top-0 z-[100] flex items-stretch bg-[var(--paper)] border-b-4 border-[var(--ink)]">
      {/* Logo */}
      <Link
        href={`/${lang}`}
        className="flex items-center gap-1 sm:gap-2 shrink-0 px-2.5 sm:px-[18px] py-2.5 sm:py-3 bg-[var(--red)] text-white whitespace-nowrap no-underline max-[380px]:tracking-tight"
        style={{
          fontFamily: "'Permanent Marker', cursive",
          fontSize: 'clamp(12px, 3.8vw, 22px)',
          textShadow: '1px 1px 0 rgba(0,0,0,0.3)',
        }}
      >
        OPTIMAL//BREAKS
      </Link>

      {/* Desktop nav */}
      <nav className="hidden md:flex ml-auto">
        {navItems.map((item) => (
          <Link
            key={item.key}
            href={item.href}
            className="flex items-center px-4 py-3 no-underline border-l-[3px] border-[var(--ink)] transition-all duration-100 hover:bg-[var(--red)] hover:text-white"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700,
              fontSize: '11px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: pathname === item.href ? 'white' : 'var(--ink)',
              background: pathname === item.href ? 'var(--red)' : 'transparent',
            }}
          >
            {dict.nav[item.key]}
          </Link>
        ))}
        {/* Language switch */}
        <Link
          href={switchPath}
          className="flex items-center px-4 py-3 no-underline border-l-[3px] border-[var(--ink)] transition-all duration-100 hover:bg-[var(--uv)] hover:text-white"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontWeight: 700,
            fontSize: '11px',
            textTransform: 'uppercase',
            letterSpacing: '2px',
            color: 'var(--ink)',
          }}
        >
          {otherLang.toUpperCase()}
        </Link>
      </nav>

      {/* Mobile hamburger */}
      <button
        className="md:hidden ml-auto px-4 py-3 border-l-[3px] border-[var(--ink)] bg-transparent"
        onClick={() => setMenuOpen(!menuOpen)}
        style={{ fontFamily: "'Courier Prime', monospace", fontSize: '18px', fontWeight: 700 }}
      >
        {menuOpen ? '✕' : '☰'}
      </button>

      {/* Mobile menu */}
      {menuOpen && (
        <div className="absolute top-full left-0 right-0 bg-[var(--paper)] border-b-4 border-[var(--ink)] md:hidden z-50">
          {navItems.map((item) => (
            <Link
              key={item.key}
              href={item.href}
              onClick={() => setMenuOpen(false)}
              className="block px-6 py-3 no-underline border-b-2 border-[var(--ink)] hover:bg-[var(--red)] hover:text-white"
              style={{
                fontFamily: "'Courier Prime', monospace",
                fontWeight: 700,
                fontSize: '12px',
                textTransform: 'uppercase',
                letterSpacing: '2px',
                color: 'var(--ink)',
              }}
            >
              {dict.nav[item.key]}
            </Link>
          ))}
          <Link
            href={switchPath}
            onClick={() => setMenuOpen(false)}
            className="block px-6 py-3 no-underline hover:bg-[var(--uv)] hover:text-white"
            style={{
              fontFamily: "'Courier Prime', monospace",
              fontWeight: 700,
              fontSize: '12px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              color: 'var(--uv)',
            }}
          >
            🌐 {otherLang.toUpperCase()}
          </Link>
        </div>
      )}
    </header>
  )
}
