// ============================================
// OPTIMAL BREAKS — Footer (navegación, legal, redes)
// ============================================

import Link from 'next/link'
import type { Locale } from '@/lib/i18n-config'
import React from 'react'
import ManageConsentButton from './ManageConsentButton'

type FooterDict = {
  nav: Record<string, string>
  footer: {
    copy?: string
    funding?: string
    site_title?: string
    legal_title?: string
    social_title?: string
    social?: { label: string; href: string }[]
  }
}

interface FooterProps {
  dict: FooterDict
  lang?: Locale
}

const SITE_KEYS = [
  'home',
  'history',
  'artists',
  'labels',
  'events',
  'scenes',
  'blog',
  'mixes',
  'about',
] as const

// Iconos SVG simples para redes sociales
const SocialIcons: Record<string, React.ReactNode> = {
  Instagram: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="2" y="2" width="20" height="20" rx="5" ry="5" />
      <path d="M16 11.37A4 4 0 1 1 12.63 8 4 4 0 0 1 16 11.37z" />
      <line x1="17.5" y1="6.5" x2="17.51" y2="6.5" />
    </svg>
  ),
  YouTube: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M22.54 6.42a2.78 2.78 0 0 0-1.94-2C18.88 4 12 4 12 4s-6.88 0-8.6.46a2.78 2.78 0 0 0-1.94 2A29 29 0 0 0 1 11.75a29 29 0 0 0 .46 5.33 2.78 2.78 0 0 0 1.94 2c1.72.46 8.6.46 8.6.46s6.88 0 8.6-.46a2.78 2.78 0 0 0 1.94-2 29 29 0 0 0 .46-5.33 29 29 0 0 0-.46-5.33z" />
      <polygon points="9.75 15.02 15.5 11.75 9.75 8.48 9.75 15.02" />
    </svg>
  ),
  X: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M4 4l11.73 16h5L9 4z" />
      <path d="M4 20l6.76-6.76" />
      <path d="M20 4l-6.76 6.76" />
    </svg>
  ),
  SoundCloud: (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <path d="M10 11v6M14 10v8M18 9v9M6 12v3" />
      <path d="M21 15a2 2 0 0 0-2-2h-1c0-3.87-3.13-7-7-7a6.97 6.97 0 0 0-5.44 2.65C3.82 9.04 2 10.74 2 13a4 4 0 0 0 4 4h13a4 4 0 0 0 2-4z" />
    </svg>
  ),
}

const FallbackIcon = (
  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
    <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71" />
    <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71" />
  </svg>
)

export default function Footer({ dict, lang = 'en' }: FooterProps) {
  const f = dict.footer ?? {}
  const social = Array.isArray(f.social) ? f.social : []
  const linkClass =
    'text-[15px] font-medium text-[var(--ink)] no-underline decoration-[var(--red)] underline-offset-2 hover:underline hover:text-[var(--red)] transition-colors'
  const headingClass =
    'mb-4 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--text-muted)]'

  return (
    <footer className="relative z-[1] border-t-4 border-[var(--ink)] bg-[var(--paper)]">
      <div className="mx-auto w-full max-w-[1400px] px-5 py-10 sm:px-8">
        <div className="grid grid-cols-2 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-5 lg:gap-10">
          
          {/* Col 1: Marca y copy (Ocupa 2 cols en móvil y tablet, 2 cols en desktop) */}
          <div className="col-span-2 lg:col-span-2">
            <Link
              href={`/${lang}`}
              className="inline-block text-lg font-black uppercase tracking-tight text-[var(--red)] no-underline hover:opacity-90"
              style={{ fontFamily: "'Unbounded', sans-serif" }}
            >
              Optimal Breaks
            </Link>
            {f.copy ? (
              <p
                className="mt-3 max-w-sm text-sm font-medium leading-relaxed text-[var(--text-muted)]"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                {f.copy}
              </p>
            ) : null}
          </div>

          {/* Col 2: Site (1 col) */}
          <nav aria-label={f.site_title ?? 'Site'} className="col-span-1">
            <h2 className={headingClass}>{f.site_title ?? 'Site'}</h2>
            <ul className="flex flex-col gap-3" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {SITE_KEYS.map((key) => (
                <li key={key}>
                  <Link
                    href={key === 'home' ? `/${lang}` : `/${lang}/${key}`}
                    className={linkClass}
                  >
                    {dict.nav[key]}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Col 3: Legal (1 col) */}
          <nav aria-label={f.legal_title ?? 'Legal'} className="col-span-1">
            <h2 className={headingClass}>{f.legal_title ?? 'Legal'}</h2>
            <ul className="flex flex-col gap-3" style={{ fontFamily: "'Courier Prime', monospace" }}>
              <li>
                <Link href={`/${lang}/privacy`} className={linkClass}>
                  {lang === 'es' ? 'Privacidad' : 'Privacy'}
                </Link>
              </li>
              <li>
                <Link href={`/${lang}/terms`} className={linkClass}>
                  {lang === 'es' ? 'Términos' : 'Terms'}
                </Link>
              </li>
              <li>
                <Link href={`/${lang}/cookies`} className={linkClass}>
                  Cookies
                </Link>
              </li>
              <li>
                <ManageConsentButton
                  label={lang === 'es' ? 'Configurar cookies' : 'Manage cookies'}
                  className={linkClass}
                />
              </li>
            </ul>
          </nav>

          {/* Col 4: Redes (2 cols en móvil, 1 col en desktop) */}
          <div className="col-span-2 lg:col-span-1">
            <h2 className={headingClass}>{f.social_title ?? 'Social'}</h2>
            {social.length === 0 ? (
              <span className="text-sm text-[var(--text-muted)]" style={{ fontFamily: "'Courier Prime', monospace" }}>—</span>
            ) : (
              <ul className="flex flex-row flex-wrap gap-4">
                {social.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center justify-center p-2 rounded-full text-[var(--ink)] bg-[var(--ink)]/5 hover:bg-[var(--red)] hover:text-white transition-colors"
                      aria-label={item.label}
                      title={item.label}
                    >
                      {SocialIcons[item.label] || FallbackIcon}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* Bloque inferior: Financiación y Copyright */}
        <div className="mt-12 space-y-5 border-t-2 border-[var(--ink)]/25 pt-8">
          {f.funding ? (
            <p
              role="note"
              className="rounded-sm border-2 border-[var(--ink)] bg-[var(--ink)] px-4 py-3 text-center text-[15px] font-bold leading-snug text-[var(--paper)] shadow-[2px_2px_0_0_var(--red)] sm:text-left"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {f.funding}
            </p>
          ) : null}
          <p
            className="text-center text-xs font-medium text-[var(--text-muted)] sm:text-left"
            style={{ fontFamily: "'Courier Prime', monospace", letterSpacing: '0.06em' }}
          >
            © {new Date().getFullYear()} Optimal Breaks
          </p>
        </div>
      </div>
    </footer>
  )
}