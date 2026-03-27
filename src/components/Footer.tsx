// ============================================
// OPTIMAL BREAKS — Footer with legal links
// ============================================

import Link from 'next/link'

interface FooterProps {
  dict: any
  lang?: string
}

export default function Footer({ dict, lang = 'en' }: FooterProps) {
  return (
    <footer className="border-t-4 border-[var(--ink)]">
      {/* Legal links row */}
      <div className="flex flex-wrap justify-center gap-1 px-4 py-3 border-b-2 border-dashed border-[var(--ink)]/10">
        <Link href={`/${lang}/privacy`} className="cutout outline no-underline text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors" style={{ fontSize: '8px', padding: '2px 8px' }}>
          {lang === 'es' ? 'PRIVACIDAD' : 'PRIVACY'}
        </Link>
        <Link href={`/${lang}/terms`} className="cutout outline no-underline text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors" style={{ fontSize: '8px', padding: '2px 8px' }}>
          {lang === 'es' ? 'TÉRMINOS' : 'TERMS'}
        </Link>
        <Link href={`/${lang}/cookies`} className="cutout outline no-underline text-[var(--ink)] hover:bg-[var(--ink)] hover:text-[var(--paper)] transition-colors" style={{ fontSize: '8px', padding: '2px 8px' }}>
          COOKIES
        </Link>
      </div>

      {/* Main footer */}
      <div className="flex flex-col sm:flex-row justify-between items-center px-4 sm:px-6 py-4 sm:py-5 gap-2">
        <div
          className="text-[var(--red)]"
          style={{ fontFamily: "'Permanent Marker', cursive", fontSize: '16px' }}
        >
          OPTIMAL//BREAKS
        </div>
        <span
          className="text-center"
          style={{
            fontFamily: "'Courier Prime', monospace",
            fontSize: '10px',
            letterSpacing: '2px',
            color: 'var(--dim)',
          }}
        >
          © 2026 — {dict.footer?.copy || 'MADE WITH BREAKS & NOISE'}
        </span>
      </div>
    </footer>
  )
}
