import { unstable_cache } from 'next/cache'
import sharp from 'sharp'
import { digestCoverUrls } from '@/lib/blog-spotlight'

const ALLOWED_HOSTS = new Set([
  'geo-media.beatport.com',
  'i.discogs.com',
  'i.ytimg.com',
  'img.youtube.com',
  'f4.bcbits.com',
])

/** Muestra pequeña: basta para ver si el centro (lo que enseña el tercio) está vacío. */
function sampleUrl(raw: string): string {
  return raw.replace(/\/image_size\/\d+x\d+\//, '/image_size/200x200/')
}

/**
 * El recorte del tercio es el centro de la carátula. *No Brakes* (Yo Speed)
 * es blanca con el motivo en las esquinas: en el blog ese tercio sale un bloque vacío.
 */
async function coverCenterIsBlank(raw: string): Promise<boolean> {
  let parsed: URL
  try {
    parsed = new URL(sampleUrl(raw))
  } catch {
    return false
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) return false
  const res = await fetch(parsed.toString(), {
    headers: {
      Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.5',
      'User-Agent': 'OptimalBreaks/1.0',
    },
  })
  if (!res.ok) return false
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength < 400) return true
  const meta = await sharp(buf).metadata()
  const width = meta.width || 0
  const height = meta.height || 0
  if (width < 8 || height < 8) return false
  const left = Math.round(width * 0.25)
  const cropW = Math.max(1, Math.round(width * 0.5))
  const { data, info } = await sharp(buf)
    .extract({ left, top: 0, width: Math.min(cropW, width - left), height })
    .resize(40, 80, { fit: 'cover' })
    .raw()
    .toBuffer({ resolveWithObject: true })
  const pixels = info.width * info.height
  if (!pixels) return false
  let white = 0
  for (let i = 0; i < data.length; i += info.channels) {
    if (data[i] > 235 && data[i + 1] > 235 && data[i + 2] > 235) white++
  }
  return white / pixels >= 0.72
}

function coverIsBlank(url: string): Promise<boolean> {
  return unstable_cache(() => coverCenterIsBlank(url), ['digest-cover-blank', url], {
    revalidate: 86400,
  })()
}

/** Tres carátulas para el tríptico. Se salta las que en el centro son casi blancas. */
export async function visibleDigestCovers(covers: unknown, n = 3): Promise<string[]> {
  const all = digestCoverUrls(covers, 12)
  if (all.length === 0) return []
  const picked: string[] = []
  for (const url of all) {
    let blank = false
    try {
      blank = await coverIsBlank(url)
    } catch {
      blank = false
    }
    if (blank) continue
    picked.push(url)
    if (picked.length >= n) break
  }
  return picked.length >= 2 ? picked : digestCoverUrls(covers, n)
}
