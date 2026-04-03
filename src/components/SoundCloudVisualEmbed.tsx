'use client'

/**
 * Widget SoundCloud modo visual (imagen + barra), alineado con tarjetas tipo YouTube en /mixes.
 * No usar para el deck oculto — ver SoundCloudWidget.tsx.
 */

/** URL de track/lista SoundCloud apta para el parámetro `url` del player (no URLs del propio iframe w.soundcloud.com). */
export function isSoundCloudTrackEmbedUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  const u = url.trim().toLowerCase()
  if (!u.includes('soundcloud.com')) return false
  if (u.includes('w.soundcloud.com')) return false
  return true
}

export function buildSoundCloudVisualPlayerSrc(trackUrl: string): string {
  const q = new URLSearchParams()
  q.set('url', trackUrl.trim())
  q.set('visual', 'true')
  q.set('auto_play', 'false')
  q.set('hide_related', 'false')
  q.set('show_comments', 'false')
  q.set('show_user', 'true')
  q.set('show_reposts', 'false')
  q.set('show_teaser', 'true')
  q.set('color', '#d62828')
  return `https://w.soundcloud.com/player/?${q.toString()}`
}

export default function SoundCloudVisualEmbed({
  trackUrl,
  title,
  height = 300,
  className = '',
}: {
  trackUrl: string
  title: string
  height?: number
  className?: string
}) {
  const src = buildSoundCloudVisualPlayerSrc(trackUrl)
  return (
    <div
      className={`relative w-full shrink-0 overflow-hidden bg-[var(--paper-dark)] ${className}`}
      style={{ height, minHeight: height }}
    >
      <iframe
        title={title}
        src={src}
        allow="autoplay"
        loading="eager"
        referrerPolicy="strict-origin-when-cross-origin"
        className="absolute inset-0 h-full w-full border-0"
      />
    </div>
  )
}
