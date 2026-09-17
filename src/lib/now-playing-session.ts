/**
 * Pantalla de bloqueo / «Reproduciendo ahora» (iOS, Android, auriculares).
 *
 * iOS (Safari y PWA) ignora `MediaMetadata` si la carátula es cross-origin
 * sin CORS, o si se asigna antes de que el `<audio>` esté en `playing`.
 * Cuando eso pasa, la lockscreen enseña `document.title` — p. ej.
 * «Mis tracks | Optimal Breaks» — en vez del tema. Este módulo:
 *
 *  1. Pone título, artista, álbum (sello) y mix en `MediaMetadata`.
 *  2. Sirve la carátula en same-origin (`/api/og/image-proxy`) para que
 *     el SO pueda pintarla.
 *  3. Espeja el now-playing en `document.title` (respaldo si el SO tira
 *     la sesión) y lo re-aplica al bloquear la pantalla.
 */

export type NowPlayingInfo = {
  title: string
  artist?: string | null
  /** Sello u otro contexto corto. Tercera línea en Android; album en iOS. */
  album?: string | null
  /** Versión (Original Mix, remixer…). Se pliega al título si no está ya. */
  mixName?: string | null
  artworkUrl?: string | null
}

const FALLBACK_ARTIST = 'Optimal Breaks'
const FALLBACK_ARTWORK_PATH = '/icon-512.png'
const PROXY_HOSTS =
  /geo-media\.beatport\.com|i\.discogs\.com|i\.ytimg\.com|img\.youtube\.com/i

let generation = 0
let lastInfo: NowPlayingInfo | null = null
let savedDocumentTitle: string | null = null
let titleOwned = false
let titleObserver: MutationObserver | null = null

export function catalogLockScreenFields(
  mixName?: string | null,
  label?: string | null,
): { mixName?: string; album?: string } {
  const mix = (mixName || '').trim()
  const album = (label || '').trim()
  const out: { mixName?: string; album?: string } = {}
  if (mix) out.mixName = mix
  if (album) out.album = album
  return out
}

export function formatNowPlayingTitle(title: string, mixName?: string | null): string {
  const t = (title || '').trim()
  const mix = (mixName || '').trim()
  if (!t) return mix || FALLBACK_ARTIST
  if (!mix) return t
  const tl = t.toLowerCase()
  const ml = mix.toLowerCase()
  if (tl.includes(ml)) return t
  return `${t} (${mix})`
}

function pageOrigin(): string {
  return typeof window === 'undefined' ? '' : window.location.origin
}

function expectedDocumentTitle(info: NowPlayingInfo): string {
  const title = formatNowPlayingTitle(info.title, info.mixName)
  const artist = (info.artist || '').trim() || FALLBACK_ARTIST
  return `${title} · ${artist}`
}

function absoluteArtwork(raw?: string | null): { src: string; type: string } {
  const orig = pageOrigin()
  const fallback = { src: `${orig}${FALLBACK_ARTWORK_PATH}`, type: 'image/png' }
  const u = (raw || '').trim()
  if (!u || !orig) return fallback

  try {
    const abs = u.startsWith('/') ? new URL(u, orig) : new URL(u)
    if (PROXY_HOSTS.test(abs.hostname)) {
      return {
        src: `${orig}/api/og/image-proxy?${new URLSearchParams({ src: abs.toString() })}`,
        type: 'image/jpeg',
      }
    }
    if (abs.pathname.startsWith('/api/og/image-proxy')) {
      return {
        src: abs.origin === orig ? `${orig}${abs.pathname}${abs.search}` : abs.toString(),
        type: 'image/jpeg',
      }
    }
    const path = abs.pathname
    const type = /\.png$/i.test(path)
      ? 'image/png'
      : /\.webp$/i.test(path)
        ? 'image/webp'
        : 'image/jpeg'
    if (abs.origin === orig || u.startsWith('/')) {
      return { src: `${orig}${abs.pathname}${abs.search}`, type }
    }
    return { src: abs.toString(), type }
  } catch {
    return fallback
  }
}

function artworkList(raw?: string | null): MediaImage[] {
  const { src, type } = absoluteArtwork(raw)
  const orig = pageOrigin()
  const fallback = `${orig}${FALLBACK_ARTWORK_PATH}`
  const sizes = ['96x96', '128x128', '192x192', '256x256', '384x384', '512x512']
  const list: MediaImage[] = sizes.map((s) => ({ src, sizes: s, type }))
  if (src !== fallback) {
    list.push({ src: fallback, sizes: '512x512', type: 'image/png' })
  }
  return list
}

function applyDocumentTitle(info: NowPlayingInfo) {
  if (typeof document === 'undefined') return
  if (!titleOwned) {
    savedDocumentTitle = document.title
    titleOwned = true
  }
  document.title = expectedDocumentTitle(info)
  ensureTitleObserver()
}

function restoreDocumentTitle() {
  if (typeof document === 'undefined') return
  stopTitleObserver()
  if (titleOwned && savedDocumentTitle != null) {
    document.title = savedDocumentTitle
  }
  titleOwned = false
  savedDocumentTitle = null
}

function ensureTitleObserver() {
  if (titleObserver || typeof document === 'undefined' || typeof MutationObserver === 'undefined') return
  const el = document.querySelector('title')
  if (!el) return
  titleObserver = new MutationObserver(() => {
    if (!lastInfo || !titleOwned) return
    const expected = expectedDocumentTitle(lastInfo)
    if (document.title !== expected) document.title = expected
  })
  titleObserver.observe(el, { childList: true, characterData: true, subtree: true })
}

function stopTitleObserver() {
  titleObserver?.disconnect()
  titleObserver = null
}

function writeMediaSession(info: NowPlayingInfo) {
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  const title = formatNowPlayingTitle(info.title, info.mixName)
  const artist = (info.artist || '').trim() || FALLBACK_ARTIST
  const album = (info.album || '').trim()
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title,
      artist,
      album,
      artwork: artworkList(info.artworkUrl),
    })
  } catch {
    /* MediaMetadata puede tirar con URLs raras */
  }
}

export function applyNowPlaying(info: NowPlayingInfo): number {
  generation += 1
  lastInfo = info
  applyDocumentTitle(info)
  writeMediaSession(info)
  return generation
}

export function refreshNowPlaying(): void {
  if (!lastInfo) return
  applyDocumentTitle(lastInfo)
  writeMediaSession(lastInfo)
}

export function clearNowPlaying(gen?: number): void {
  if (gen != null && gen !== generation) return
  lastInfo = null
  restoreDocumentTitle()
  if (typeof navigator === 'undefined' || !('mediaSession' in navigator)) return
  try {
    navigator.mediaSession.metadata = null
  } catch {
    /* no-op */
  }
}

function onLockOrHide() {
  if (typeof document !== 'undefined' && document.hidden && lastInfo) {
    refreshNowPlaying()
  }
}

if (typeof document !== 'undefined') {
  document.addEventListener('visibilitychange', onLockOrHide)
}
if (typeof window !== 'undefined') {
  window.addEventListener('pageshow', () => {
    if (lastInfo) refreshNowPlaying()
  })
}
