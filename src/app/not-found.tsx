// ============================================
// OPTIMAL BREAKS — 404 Not Found
// ============================================

import type { Metadata } from 'next'
import Link from 'next/link'

export const metadata: Metadata = {
  title: '404 — Track not found',
  description: 'This page does not exist on Optimal Breaks.',
  robots: { index: false, follow: true },
}

export default function NotFound() {
  return (
    <html lang="en">
      <body style={{ fontFamily: "'Special Elite', monospace", background: '#e8dcc8', color: '#1a1a1a', margin: 0 }}>
        <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '40px 20px', textAlign: 'center' }}>
          <div style={{ fontFamily: "'Unbounded', sans-serif", fontWeight: 900, fontSize: 'clamp(80px, 20vw, 200px)', lineHeight: 0.9, color: '#d62828' }}>
            404
          </div>
          <div style={{ fontFamily: "'Darker Grotesque', sans-serif", fontWeight: 900, fontSize: 'clamp(20px, 4vw, 36px)', marginTop: '20px' }}>
            TRACK NOT FOUND
          </div>
          <p style={{ marginTop: '15px', fontSize: '16px', color: '#888', maxWidth: '400px' }}>
            The break you&apos;re looking for doesn&apos;t exist. Maybe it was a white label that never got pressed.
          </p>
          <Link
            href="/en"
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
            BACK TO HOME →
          </Link>
        </div>
      </body>
    </html>
  )
}
