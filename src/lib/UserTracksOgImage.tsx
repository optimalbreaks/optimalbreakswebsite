// ============================================
// OPTIMAL BREAKS — JSX para ImageResponse de listas compartidas
// /:lang/u/:handle/tracks/opengraph-image → PNG 1200×630
// Nombre del usuario + collage de carátulas de sus saves.
// ============================================

import type { Locale } from '@/lib/i18n-config'

const PAPER = '#e8dcc8'
const INK = '#1a1a1a'
const RED = '#d62828'
const YELLOW = '#f4c430'

const FONT =
  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
const MONO = 'ui-monospace, "Cascadia Code", "Courier New", monospace'

export type UserTracksOgImageProps = {
  lang: Locale
  displayName: string
  trackCount: number
  /** Data URLs JPEG/PNG compatibles con Satori (máx. ~6). */
  coverDataUrls: string[]
  avatarDataUrl?: string | null
}

export function UserTracksOgImage({
  lang,
  displayName,
  trackCount,
  coverDataUrls,
  avatarDataUrl,
}: UserTracksOgImageProps) {
  const es = lang === 'es'
  const kicker = es ? 'LISTA COMPARTIDA' : 'SHARED LIST'
  const countLabel =
    trackCount === 1
      ? es
        ? '1 track guardado'
        : '1 saved track'
      : es
        ? `${trackCount} tracks guardados`
        : `${trackCount} saved tracks`
  const footer = es
    ? 'Escucha y añade a tu lista · www.optimalbreaks.com'
    : 'Listen and add to your list · www.optimalbreaks.com'
  const name = (displayName || 'Breaker').trim().slice(0, 42)
  const covers = coverDataUrls.slice(0, 6)

  return (
    <div
      style={{
        position: 'relative',
        width: '100%',
        height: '100%',
        display: 'flex',
        flexDirection: 'column',
        backgroundColor: INK,
        padding: '48px 56px 40px',
        boxSizing: 'border-box',
        border: `14px solid ${PAPER}`,
      }}
    >
      {/* Barra roja superior */}
      <div
        style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          height: 10,
          backgroundColor: RED,
          display: 'flex',
        }}
      />

      {/* Cabecera */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 28,
        }}
      >
        <div
          style={{
            display: 'flex',
            fontSize: 22,
            fontWeight: 800,
            letterSpacing: 5,
            color: YELLOW,
            textTransform: 'uppercase',
            fontFamily: MONO,
          }}
        >
          {kicker}
        </div>
        <div
          style={{
            display: 'flex',
            flexDirection: 'row',
            fontSize: 22,
            fontWeight: 900,
            letterSpacing: 1,
            textTransform: 'uppercase',
            fontFamily: FONT,
          }}
        >
          <span style={{ color: PAPER }}>OPTIMAL</span>
          <span style={{ color: PAPER }}>{' '}</span>
          <span style={{ color: RED }}>BREAKS</span>
        </div>
      </div>

      {/* Identidad */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          alignItems: 'center',
          gap: 28,
          marginBottom: 32,
        }}
      >
        {avatarDataUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarDataUrl}
            alt=""
            width={96}
            height={96}
            style={{
              width: 96,
              height: 96,
              borderRadius: 8,
              objectFit: 'cover',
              border: `3px solid ${YELLOW}`,
            }}
          />
        ) : (
          <div
            style={{
              display: 'flex',
              width: 96,
              height: 96,
              borderRadius: 8,
              backgroundColor: RED,
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 48,
              fontWeight: 900,
              color: PAPER,
              fontFamily: FONT,
              border: `3px solid ${YELLOW}`,
            }}
          >
            {(name[0] || 'B').toUpperCase()}
          </div>
        )}
        <div style={{ display: 'flex', flexDirection: 'column', flex: 1 }}>
          <div
            style={{
              display: 'flex',
              fontSize: name.length > 22 ? 52 : 64,
              fontWeight: 900,
              lineHeight: 1,
              letterSpacing: -2,
              color: YELLOW,
              textTransform: 'uppercase',
              fontFamily: FONT,
            }}
          >
            {name}
          </div>
          <div
            style={{
              display: 'flex',
              marginTop: 12,
              fontSize: 26,
              fontWeight: 700,
              color: PAPER,
              opacity: 0.75,
              letterSpacing: 1,
              fontFamily: MONO,
            }}
          >
            {countLabel}
          </div>
        </div>
      </div>

      {/* Collage de carátulas */}
      <div
        style={{
          display: 'flex',
          flexDirection: 'row',
          gap: 12,
          flex: 1,
          alignItems: 'flex-end',
        }}
      >
        {covers.length > 0 ? (
          covers.map((src, i) => (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              key={i}
              src={src}
              alt=""
              width={160}
              height={160}
              style={{
                width: 160,
                height: 160,
                objectFit: 'cover',
                borderRadius: 4,
                border: `2px solid ${PAPER}`,
              }}
            />
          ))
        ) : (
          <div
            style={{
              display: 'flex',
              flex: 1,
              height: 140,
              alignItems: 'center',
              justifyContent: 'center',
              border: `2px dashed rgba(232,220,200,0.35)`,
              borderRadius: 4,
              color: PAPER,
              opacity: 0.45,
              fontSize: 28,
              fontWeight: 700,
              letterSpacing: 3,
              textTransform: 'uppercase',
              fontFamily: MONO,
            }}
          >
            {es ? 'Sin carátulas aún' : 'No covers yet'}
          </div>
        )}
      </div>

      {/* Pie */}
      <div
        style={{
          display: 'flex',
          marginTop: 24,
          fontSize: 18,
          fontWeight: 600,
          letterSpacing: 2,
          color: PAPER,
          opacity: 0.55,
          textTransform: 'uppercase',
          fontFamily: MONO,
        }}
      >
        {footer}
      </div>
    </div>
  )
}
