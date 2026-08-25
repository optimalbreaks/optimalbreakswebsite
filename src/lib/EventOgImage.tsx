// ============================================
// OPTIMAL BREAKS — JSX para ImageResponse de eventos (1200×630, PNG)
// La OG/Twitter card de cada evento es directamente su cartel: imagen
// completa con `object-fit: contain` sobre fondo INK, así se respeta el
// aspect ratio original (vertical, cuadrado u horizontal) sin recortes.
// ============================================

const INK = '#1a1a1a'
const RED = '#d62828'
const PAPER = '#f4efe6'

export type EventOgImageProps = {
  posterDataUrl?: string | null
  /** Sello diagonal sobre el cartel original (compartir en redes). */
  cancelled?: boolean
  cancelledLabel?: string
}

export function EventOgImage({
  posterDataUrl,
  cancelled = false,
  cancelledLabel = 'CANCELADO',
}: EventOgImageProps) {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: INK,
        position: 'relative',
      }}
    >
      {posterDataUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={posterDataUrl}
          alt=""
          width={1200}
          height={630}
          style={{ width: '100%', height: '100%', objectFit: 'contain' }}
        />
      ) : (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: '100%',
            height: '100%',
            fontSize: 240,
            fontWeight: 900,
            letterSpacing: -8,
            color: RED,
            fontFamily:
              'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
          }}
        >
          OB
        </div>
      )}
      {cancelled ? (
        <div
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            backgroundColor: 'rgba(26,26,26,0.32)',
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 1500,
              transform: 'rotate(-13deg)',
              backgroundColor: RED,
              borderTopWidth: 8,
              borderBottomWidth: 8,
              borderTopStyle: 'solid',
              borderBottomStyle: 'solid',
              borderTopColor: INK,
              borderBottomColor: INK,
              paddingTop: 22,
              paddingBottom: 22,
              paddingLeft: 48,
              paddingRight: 48,
            }}
          >
            <div
              style={{
                display: 'flex',
                color: PAPER,
                fontSize: 92,
                fontWeight: 900,
                letterSpacing: 10,
                lineHeight: 1,
                textTransform: 'uppercase',
                fontFamily:
                  'ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif',
              }}
            >
              {cancelledLabel}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
