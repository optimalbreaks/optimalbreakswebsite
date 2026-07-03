/**
 * Registra una reproducción de pista (preview Beatport/Bandcamp o YouTube inline)
 * en Supabase (`track_play_events`). Debounce corto por pestaña para no inflar
 * el contador con reintentos del reproductor o doble tap accidental.
 */
const DEBOUNCE_MS = 4000
const lastLoggedAt = new Map<string, number>()
const inFlight = new Set<string>()

export function logTrackPlay(canonicalKey: string): void {
  if (typeof window === 'undefined' || !canonicalKey) return

  const now = Date.now()
  const prev = lastLoggedAt.get(canonicalKey)
  if (prev != null && now - prev < DEBOUNCE_MS) return
  if (inFlight.has(canonicalKey)) return

  inFlight.add(canonicalKey)

  void fetch('/api/track-play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ canonicalKey }),
  })
    .then((r) => {
      if (!r.ok) return
      lastLoggedAt.set(canonicalKey, Date.now())
    })
    .catch(() => {})
    .finally(() => {
      inFlight.delete(canonicalKey)
    })
}
