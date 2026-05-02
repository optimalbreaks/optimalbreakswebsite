// ============================================
// OPTIMAL BREAKS — JSX para ImageResponse de eventos (1200×630, PNG)
// Layout split: cartel a la izquierda, info + branding a la derecha.
// Funciona con cualquier ratio de cartel (cuadrado, vertical, horizontal)
// y produce un PNG válido para Facebook / WhatsApp / LinkedIn.
// ============================================

import type { Locale } from '@/lib/i18n-config'

const PAPER = '#e8dcc8'
const INK = '#1a1a1a'
const RED = '#d62828'
const YELLOW = '#f4c430'

const COPY: Record<Locale, { kicker: string; url: string; tba: string }> = {
  en: { kicker: 'EVENT', url: 'www.optimalbreaks.com', tba: 'Date TBA' },
  es: { kicker: 'EVENTO', url: 'www.optimalbreaks.com', tba: 'Fecha por anunciar' },
}

export type EventOgImageProps = {
  lang: Locale
  name: string
  posterDataUrl?: string | null
  dateLabel?: string | null
  locationLabel?: string | null
}

export function EventOgImage({ lang, name, posterDataUrl, dateLabel, locationLabel }: EventOgImageProps) {
  const safe: Locale = lang === 'es' ? 'es' : 'en'
  const t = COPY[safe]
  const finalDate = dateLabel?.trim() || t.tba
  const finalLocation = locationLabel?.trim() || ''

  const trimmedName = name.trim()
  const nameSize = trimmedName.length > 36 ? 56 : trimmedName.length > 22 ? 70 : 86

  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        backgroundColor: INK,
        color: PAPER,
        fontFamily:
          'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
      }}
    >
      <div
        style={{
          width: 600,
          height: 630,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000',
          overflow: 'hidden',
          position: 'relative',
        }}
      >
        {posterDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={posterDataUrl}
            alt=""
            width={600}
            height={630}
            style={{ width: '100%', height: '100%', objectFit: 'cover' }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: '100%',
              height: '100%',
              fontSize: 120,
              fontWeight: 900,
              letterSpacing: -4,
              color: RED,
            }}
          >
            OB
          </div>
        )}
      </div>
      <div
        style={{
          flex: 1,
          height: 630,
          display: 'flex',
          flexDirection: 'column',
          justifyContent: 'space-between',
          padding: '56px 56px 48px 56px',
          borderLeft: `8px solid ${RED}`,
          boxSizing: 'border-box',
        }}
      >
        <div style={{ display: 'flex', flexDirection: 'column' }}>
          <div
            style={{
              fontSize: 28,
              fontWeight: 800,
              letterSpacing: 6,
              color: YELLOW,
              textTransform: 'uppercase',
              marginBottom: 24,
            }}
          >
            {t.kicker}
          </div>
          <div
            style={{
              fontSize: nameSize,
              fontWeight: 900,
              lineHeight: 1.0,
              letterSpacing: -2,
              color: PAPER,
              textTransform: 'uppercase',
              display: 'flex',
            }}
          >
            {trimmedName}
          </div>
          <div
            style={{
              marginTop: 32,
              fontSize: 28,
              fontWeight: 700,
              color: RED,
              letterSpacing: 1,
              display: 'flex',
            }}
          >
            {finalDate}
          </div>
          {finalLocation ? (
            <div
              style={{
                marginTop: 12,
                fontSize: 24,
                fontWeight: 500,
                color: PAPER,
                opacity: 0.8,
                letterSpacing: 0.5,
                display: 'flex',
              }}
            >
              {finalLocation}
            </div>
          ) : null}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            borderTop: `2px solid ${PAPER}33`,
            paddingTop: 20,
          }}
        >
          <div
            style={{
              fontSize: 22,
              fontWeight: 800,
              letterSpacing: 4,
              color: PAPER,
              textTransform: 'uppercase',
              fontFamily: 'ui-monospace, "Cascadia Code", "Courier New", monospace',
            }}
          >
            {t.url}
          </div>
          <div
            style={{
              display: 'flex',
              flexDirection: 'row',
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 2,
              color: YELLOW,
              textTransform: 'uppercase',
            }}
          >
            OPTIMAL <span style={{ color: RED }}>BREAKS</span>
          </div>
        </div>
      </div>
    </div>
  )
}
