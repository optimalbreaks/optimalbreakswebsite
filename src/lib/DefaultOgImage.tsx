// ============================================
// OPTIMAL BREAKS — JSX para ImageResponse (OG / Twitter)
// ============================================

import type { Locale } from '@/lib/i18n-config'

const PAPER = '#e8dcc8'
const INK = '#1a1a1a'
const RED = '#d62828'

const COPY: Record<
  Locale,
  { kicker: string; line: string; url: string }
> = {
  en: {
    kicker: 'THE BREAKBEAT BIBLE',
    line: 'Archive · history · culture · EN / ES',
    url: 'www.optimalbreaks.com',
  },
  es: {
    kicker: 'LA BIBLIA DEL BREAKBEAT',
    line: 'Archivo · historia · cultura · EN / ES',
    url: 'www.optimalbreaks.com',
  },
}

export function DefaultOgImage({ lang }: { lang: Locale }) {
  const safe: Locale = lang === 'es' ? 'es' : 'en'
  const t = COPY[safe]

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        justifyContent: 'center',
        backgroundColor: PAPER,
        padding: 56,
        border: `14px solid ${INK}`,
        boxSizing: 'border-box',
      }}
    >
      <div
        style={{
          fontSize: 34,
          fontWeight: 800,
          letterSpacing: 6,
          color: RED,
          textTransform: 'uppercase',
          marginBottom: 20,
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        {t.kicker}
      </div>
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          fontSize: 86,
          fontWeight: 900,
          lineHeight: 0.95,
          letterSpacing: -3,
          color: INK,
          textTransform: 'uppercase',
          fontFamily:
            'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
        }}
      >
        <span style={{ color: INK }}>OPTIMAL</span>
        <span>{' '}</span>
        <span style={{ color: RED }}>BREAKS</span>
      </div>
      <div
        style={{
          marginTop: 36,
          fontSize: 28,
          fontWeight: 600,
          color: INK,
          opacity: 0.85,
          letterSpacing: 1,
          fontFamily: 'ui-monospace, "Cascadia Code", "Courier New", monospace',
        }}
      >
        {t.line}
      </div>
      <div
        style={{
          position: 'absolute',
          bottom: 48,
          left: 56,
          fontSize: 22,
          fontWeight: 700,
          letterSpacing: 4,
          color: INK,
          textTransform: 'uppercase',
          fontFamily: 'ui-monospace, "Cascadia Code", "Courier New", monospace',
        }}
      >
        {t.url}
      </div>
    </div>
  )
}
