// ============================================
// OPTIMAL BREAKS — Footer (navegación, legal, redes)
// ============================================

import Link from 'next/link'
import type { Locale } from '@/lib/i18n-config'

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

export default function Footer({ dict, lang = 'en' }: FooterProps) {
  const f = dict.footer ?? {}
  const social = Array.isArray(f.social) ? f.social : []
  const linkClass =
    'text-sm text-[var(--ink)] no-underline decoration-[var(--red)] underline-offset-2 hover:underline hover:text-[var(--red)] transition-colors'
  const headingClass =
    "mb-3 text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--dim)]"

  return (
    <footer className="border-t-4 border-[var(--ink)] bg-[var(--paper-dark)]">
      <div className="mx-auto max-w-6xl px-4 py-10 sm:px-6">
        <div className="grid gap-10 sm:grid-cols-2 lg:grid-cols-4">
          <div className="sm:col-span-2 lg:col-span-1">
            <Link
              href={`/${lang}`}
              className="inline-block text-lg font-black uppercase tracking-tight text-[var(--red)] no-underline hover:opacity-90"
              style={{ fontFamily: "'Unbounded', sans-serif" }}
            >
              Optimal Breaks
            </Link>
            {f.copy ? (
              <p
                className="mt-3 max-w-xs text-sm leading-relaxed text-[var(--dim)]"
                style={{ fontFamily: "'Courier Prime', monospace" }}
              >
                {f.copy}
              </p>
            ) : null}
          </div>

          <nav aria-label={f.site_title ?? 'Site'}>
            <h2 className={headingClass}>{f.site_title ?? 'Site'}</h2>
            <ul className="flex flex-col gap-2" style={{ fontFamily: "'Courier Prime', monospace" }}>
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

          <nav aria-label={f.legal_title ?? 'Legal'}>
            <h2 className={headingClass}>{f.legal_title ?? 'Legal'}</h2>
            <ul className="flex flex-col gap-2" style={{ fontFamily: "'Courier Prime', monospace" }}>
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
            </ul>
          </nav>

          <div>
            <h2 className={headingClass}>{f.social_title ?? 'Social'}</h2>
            <ul className="flex flex-col gap-2" style={{ fontFamily: "'Courier Prime', monospace" }}>
              {social.length === 0 ? (
                <li className="text-sm text-[var(--dim)]">—</li>
              ) : (
                social.map((item) => (
                  <li key={item.href}>
                    <a
                      href={item.href}
                      target="_blank"
                      rel="noopener noreferrer"
                      className={linkClass}
                    >
                      {item.label}
                    </a>
                  </li>
                ))
              )}
            </ul>
          </div>
        </div>

        <div className="mt-10 border-t border-[var(--ink)]/20 pt-6">
          {f.funding ? (
            <p
              className="mb-4 text-center text-sm text-[var(--ink)] sm:text-left"
              style={{ fontFamily: "'Courier Prime', monospace" }}
            >
              {f.funding}
            </p>
          ) : null}
          <p
            className="text-center text-xs text-[var(--dim)] sm:text-left"
            style={{ fontFamily: "'Courier Prime', monospace", letterSpacing: '0.08em' }}
          >
            © {new Date().getFullYear()} Optimal Breaks
          </p>
        </div>
      </div>
    </footer>
  )
}
