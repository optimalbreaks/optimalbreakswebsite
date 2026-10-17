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

/** Punto de `object-position` (0–100). 50/50 = el centro, como una carátula llena. */
export type CoverFocus = { x: number; y: number }

const CENTER: CoverFocus = { x: 50, y: 50 }

/**
 * El tercio alto del blog enseña la mitad de una carátula cuadrada.
 * El porcentaje de `object-position` que deja esa mitad encima del motivo
 * es `clamp(2f − 0,5, 0, 1)`, no el centroide: si no, el blanco sigue dentro.
 */
function objectPositionForHalfSlice(fraction: number): number {
  const p = 2 * fraction - 0.5
  return Math.round(Math.min(1, Math.max(0, p)) * 100)
}

/**
 * Dónde está el motivo. Una carátula llena se queda en el centro.
 * Una casi blanca (No Brakes: texto arriba a la izquierda, cara a la derecha)
 * apunta al bloque denso, no a las letras sueltas.
 */
export async function coverFocusFromBuffer(buf: Buffer): Promise<CoverFocus> {
  const { data, info } = await sharp(buf)
    .rotate()
    .resize(48, 48, { fit: 'fill' })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true })
  const w = info.width
  const h = info.height
  const ch = info.channels
  if (!w || !h) return CENTER
  const ink = new Uint8Array(w * h)
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * ch
      const r = data[i] ?? 255
      const g = data[i + 1] ?? 255
      const b = data[i + 2] ?? 255
      ink[y * w + x] = r > 235 && g > 235 && b > 235 ? 0 : 1
    }
  }
  const rad = 3
  let weight = 0
  let sx = 0
  let sy = 0
  let dense = 0
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (!ink[y * w + x]) continue
      let n = 0
      let tot = 0
      for (let dy = -rad; dy <= rad; dy++) {
        for (let dx = -rad; dx <= rad; dx++) {
          const xx = x + dx
          const yy = y + dy
          if (xx < 0 || yy < 0 || xx >= w || yy >= h) continue
          tot++
          n += ink[yy * w + xx] ?? 0
        }
      }
      const dens = tot ? n / tot : 0
      if (dens < 0.45) continue
      dense++
      const wgt = dens * dens
      weight += wgt
      sx += x * wgt
      sy += y * wgt
    }
  }
  if (!weight || dense / (w * h) >= 0.72) return CENTER
  return {
    x: objectPositionForHalfSlice(sx / weight / (w - 1)),
    y: objectPositionForHalfSlice(sy / weight / (h - 1)),
  }
}

/** Recorte equivalente a `object-fit: cover` + `object-position`. */
export function coverWindow(
  imgW: number,
  imgH: number,
  boxW: number,
  boxH: number,
  focus: CoverFocus,
): { left: number; top: number; width: number; height: number } {
  const imgAspect = imgW / imgH
  const boxAspect = boxW / boxH
  let cropW: number
  let cropH: number
  if (imgAspect > boxAspect) {
    cropH = imgH
    cropW = Math.max(1, Math.round(imgH * boxAspect))
  } else {
    cropW = imgW
    cropH = Math.max(1, Math.round(imgW / boxAspect))
  }
  cropW = Math.min(imgW, cropW)
  cropH = Math.min(imgH, cropH)
  const left = Math.min(imgW - cropW, Math.max(0, Math.round((imgW - cropW) * (focus.x / 100))))
  const top = Math.min(imgH - cropH, Math.max(0, Math.round((imgH - cropH) * (focus.y / 100))))
  return { left, top, width: cropW, height: cropH }
}

function sampleUrl(raw: string): string {
  return raw.replace(/\/image_size\/\d+x\d+\//, '/image_size/200x200/')
}

async function coverFocusUncached(raw: string): Promise<CoverFocus> {
  let parsed: URL
  try {
    parsed = new URL(sampleUrl(raw))
  } catch {
    return CENTER
  }
  if (parsed.protocol !== 'https:' || !ALLOWED_HOSTS.has(parsed.hostname)) return CENTER
  const res = await fetch(parsed.toString(), {
    headers: {
      Accept: 'image/jpeg,image/png;q=0.9,*/*;q=0.5',
      'User-Agent': 'OptimalBreaks/1.0',
    },
  })
  if (!res.ok) return CENTER
  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.byteLength < 400) return CENTER
  return coverFocusFromBuffer(buf)
}

function coverFocusOf(url: string): Promise<CoverFocus> {
  return unstable_cache(() => coverFocusUncached(url), ['digest-cover-focus', url], {
    revalidate: 86400,
  })()
}

/** Un punto por cada una de las tres primeras carátulas. No se salta ninguna. */
export async function digestCoverFocuses(covers: unknown, n = 3): Promise<CoverFocus[]> {
  const urls = digestCoverUrls(covers, n)
  return Promise.all(urls.map(async (url) => {
    try {
      return await coverFocusOf(url)
    } catch {
      return CENTER
    }
  }))
}
