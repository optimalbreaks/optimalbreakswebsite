// ============================================
// OPTIMAL BREAKS — 404 Not Found
// ============================================

import type { Metadata } from 'next'
import { headers } from 'next/headers'
import Link from 'next/link'
import { i18n } from '@/lib/i18n-config'

export const metadata: Metadata = {
  title: '404 — Track not found',
  description: 'This page does not exist on Optimal Breaks.',
  robots: { index: false, follow: true },
}

export default async function NotFound() {
  const headersList = await headers()
  const referer = headersList.get('referer') ?? ''
  const url = headersList.get('x-url') ?? headersList.get('x-invoke-path') ?? ''

  let lang = i18n.defaultLocale
  for (const source of [url, referer]) {
    const match = source.match(/\/([a-z]{2})(?:\/|$)/)
    if (match && i18n.locales.includes(match[1] as any)) {
      lang = match[1]
      break
    }
  }

  const es = lang === 'es'

  return (
    <html lang={lang}>
      <body style={{ fontFamily: "'Special Elite', monospace", background: '#e8dcc8', color: '#1a1a1a', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(80px, 20vw, 200px)', lineHeight: 0.9, color: '#d62828' }}>
            404
          </div>
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(20px, 4vw, 36px)', marginTop: '20px' }}>
            {es ? 'PISTA NO ENCONTRADA' : 'TRACK NOT FOUND'}
          </div>
          <p style={{ marginTop: '15px', fontSize: '16px', color: '#888', maxWidth: '400px' }}>
            {es
              ? 'El break que buscas no existe. Quizá era un white label que nunca se prensó.'
              : "The break you're looking for doesn't exist. Maybe it was a white label that never got pressed."}
          </p>
          <Link
            href={`/${lang}`}
            style={{
              display: 'inline-block',
              marginTop: '30px',
              padding: '12px 40px',
              background: '#d62828',
              color: 'white',
              border: '4px solid #d62828',
              fontFamily: "'Unbounded', sans-serif",
              fontWeight: 900,
              fontSize: '14px',
              textTransform: 'uppercase',
              letterSpacing: '2px',
              textDecoration: 'none',
            }}
          >
            {es ? 'VOLVER AL INICIO →' : 'BACK TO HOME →'}
          </Link>
        </div>
      </body>
    </html>
  )
}
