// ============================================
// OPTIMAL BREAKS — Event Detail (placeholder)
// ============================================

import type { Locale } from '@/lib/i18n-config'

export default async function EventDetailPage({ params }: { params: { lang: Locale; slug: string } }) {
  const { lang, slug } = await params

  return (
    <div className="lined min-h-screen px-6 py-20">
      <div className="sec-tag">EVENT</div>
      <h1 className="sec-title">
        <span className="hl">{slug.replace(/-/g, ' ').toUpperCase()}</span>
      </h1>
      <p style={{ fontFamily: "'Special Elite', monospace", fontSize: '17px', color: 'var(--dim)' }}>
        {lang === 'es' ? 'Detalle del evento próximamente.' : 'Event details coming soon.'}
      </p>
    </div>
  )
}
