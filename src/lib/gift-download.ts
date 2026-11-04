/** Un solo regalo descargable. El resto de exclusivas se oyen y no se bajan. */

export const GIFT_SLUG = 'woter-gone-gone-gone'
export const GIFT_BLOG_SLUG = 'woter-regala-gone-gone-gone'
export const GIFT_FILE = 'woter-gone-gone-gone.mp3'
export const GIFT_DOWNLOAD_NAME = 'Gone-Gone-Gone-WoTeR-Breaks-Mix.mp3'
/** La cuenta de la web es @optimal.breaks. @optimalbreaks (sin punto) es otra cuenta. */
export const GIFT_IG_SITE = 'optimal.breaks'
export const GIFT_IG_ARTIST = 'woter_dj'
export const GIFT_PROOF_BUCKET = 'gift-proofs'
export const GIFT_SHOT_MAX_BYTES = 8 * 1024 * 1024

export function giftInstagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`
}

export function giftArticlePath(lang: string): string {
  return `/${lang}/blog/${GIFT_BLOG_SLUG}`
}

/** Solo este corte. El enlace abre el artículo; no sirve el MP3. */
export function isGiftDownloadTrack(fullAudioUrl: string | null | undefined): boolean {
  return (fullAudioUrl || '').includes(GIFT_FILE)
}

/** Audio cedido servido por la web. El proxy de preview (`/api/audio-proxy`) no entra. */
export function isHostedFullAudio(url: string | null | undefined): boolean {
  const u = (url || '').trim()
  return u.startsWith('/api/audio/') && u.includes('.mp3')
}
