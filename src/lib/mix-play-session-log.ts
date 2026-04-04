/**
 * Registra una reproducción de mix en Supabase (mix_play_events) como máximo
 * una vez por pestaña del navegador y mix, cuando el usuario da play en un
 * embed (YouTube / SoundCloud) en /mixes. El reproductor integrado (DeckAudio)
 * sigue usando su propia lógica.
 */
const STORAGE_KEY = 'ob_mix_embed_plays_v1'
const inFlight = new Set<string>()

export function logMixPlayOncePerBrowserSession(mixId: string): void {
  if (typeof window === 'undefined' || !mixId) return
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const arr: string[] = raw ? JSON.parse(raw) : []
    if (arr.includes(mixId)) return
  } catch {
    return
  }
  if (inFlight.has(mixId)) return
  inFlight.add(mixId)

  void fetch('/api/mix-play', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ mixId }),
  })
    .then((r) => {
      if (!r.ok) return
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        const arr: string[] = raw ? JSON.parse(raw) : []
        if (!arr.includes(mixId)) {
          arr.push(mixId)
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
        }
      } catch {
        /* ignore */
      }
    })
    .catch(() => {})
    .finally(() => {
      inFlight.delete(mixId)
    })
}

let youtubeApiPromise: Promise<void> | null = null

export function loadYouTubeIframeAPI(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  const w = window as Window & { YT?: { Player: new (...args: unknown[]) => unknown; PlayerState: { PLAYING: number } } }
  if (w.YT?.Player) return Promise.resolve()
  if (youtubeApiPromise) return youtubeApiPromise

  youtubeApiPromise = new Promise((resolve) => {
    const prev = (w as unknown as { onYouTubeIframeAPIReady?: () => void }).onYouTubeIframeAPIReady
    ;(w as unknown as { onYouTubeIframeAPIReady: () => void }).onYouTubeIframeAPIReady = () => {
      prev?.()
      resolve()
    }
    const s = document.createElement('script')
    s.src = 'https://www.youtube.com/iframe_api'
    s.async = true
    document.head.appendChild(s)
  })
  return youtubeApiPromise
}

let soundcloudApiPromise: Promise<void> | null = null

function scReady(): boolean {
  return Boolean((window as unknown as { SC?: { Widget?: unknown } }).SC?.Widget)
}

export function loadSoundCloudWidgetAPI(): Promise<void> {
  if (typeof window === 'undefined') return Promise.resolve()
  if (scReady()) return Promise.resolve()
  if (soundcloudApiPromise) return soundcloudApiPromise

  soundcloudApiPromise = new Promise((resolve, reject) => {
    const finish = () => resolve()
    if (document.querySelector('script[data-ob-sc-api="1"]')) {
      const start = Date.now()
      const iv = window.setInterval(() => {
        if (scReady()) {
          window.clearInterval(iv)
          finish()
        } else if (Date.now() - start > 8000) {
          window.clearInterval(iv)
          finish()
        }
      }, 50)
      return
    }
    const s = document.createElement('script')
    s.src = 'https://w.soundcloud.com/player/api.js'
    s.async = true
    s.dataset.obScApi = '1'
    s.onload = () => finish()
    s.onerror = () => {
      soundcloudApiPromise = null
      reject(new Error('SC api load failed'))
    }
    document.head.appendChild(s)
  })
  return soundcloudApiPromise
}
