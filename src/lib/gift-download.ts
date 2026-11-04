/** Un solo regalo descargable. El resto de exclusivas se oyen y no se bajan. */

export const GIFT_SLUG = 'woter-gone-gone-gone'
export const GIFT_BLOG_SLUG = 'woter-regala-gone-gone-gone'
export const GIFT_FILE = 'woter-gone-gone-gone.mp3'
export const GIFT_DOWNLOAD_NAME = 'Gone-Gone-Gone-WoTeR-Breaks-Mix.mp3'
export const GIFT_IG_SITE = 'optimalbreaks'
export const GIFT_IG_ARTIST = 'woter_dj'
export const GIFT_PROOF_BUCKET = 'gift-proofs'
export const GIFT_SHOT_MAX_BYTES = 8 * 1024 * 1024

export function giftInstagramUrl(handle: string): string {
  return `https://www.instagram.com/${handle}/`
}
