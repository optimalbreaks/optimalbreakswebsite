// ============================================
// OPTIMAL BREAKS — JSX para ImageResponse de eventos (1200×630, PNG)
// La OG/Twitter card de cada evento es directamente su cartel: imagen
// completa con `object-fit: contain` sobre fondo INK, así se respeta el
// aspect ratio original (vertical, cuadrado u horizontal) sin recortes.
// ============================================

const INK = '#1a1a1a'
const RED = '#d62828'

export type EventOgImageProps = {
  posterDataUrl?: string | null
}

export function EventOgImage({ posterDataUrl }: EventOgImageProps) {
  return (
    <div
      style={{
        display: 'flex',
        width: '100%',
        height: '100%',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: INK,
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
    </div>
  )
}
