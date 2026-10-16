// ============================================
// OPTIMAL BREAKS — Vídeos R/F de página (Top 100, New Releases, artículo del blog)
//
// Solo admins. Mismo motor que los reels de temas (`encodeCanvasVideo` en
// `reel-renderer.ts`): Canvas 2D + WebCodecs, todo en el navegador, sin audio.
// El diseño y la animación están en `page-reel-design.ts`.
//
// Las carátulas llegan como URL de origen (Beatport, Supabase…) y el canvas no
// puede leerlas sin CORS, así que se piden ya recortadas como data URL a
// `/api/admin/share-reel-images` (una sola llamada por vídeo, con caché para
// que R y F seguidos no las descarguen dos veces).
// ============================================

import { animBlog, animFortnight, animTop, animWeek, blogHighlightFrom, DUR, FORTNIGHT_DUR, type Img } from './page-reel-design'
import { encodeCanvasVideo, type ReelFormat, type ReelResult } from './reel-renderer'

export type PageReelKind = 'top100' | 'week' | 'blog'

export type PageReelInput =
  | {
      kind: 'top100'
      rows: { pos: number; title: string; artists: string; label: string; saves: number; artwork: string | null }[]
    }
  | {
      kind: 'week'
      /** YYYY-MM-DD (lunes de la edición). */
      weekDate: string
      count: number
      tracks: { title: string; artists: string; label: string; artwork: string | null }[]
    }
  | {
      kind: 'blog'
      title: string
      /** ISO de publicación. */
      date: string | null
      tags: string[]
      artwork: string | null
      tracks: { title: string; meta: string; artists?: string }[]
      artist: string
      label: string
      excerpt: string
      /** Artículo quincenal: vídeo de datos (`animFortnight`) en vez del de artículo. */
      fortnight?: FortnightReelInput
    }

type FortnightReelTrack = { title: string; artists: string; value: number; artwork: string | null }
export type FortnightReelInput = {
  from: string
  until: string
  totals: { tracks: number; artists: number; labels: number; releases: number; prev: number }
  covers: string[]
  played: FortnightReelTrack[]
  voted: FortnightReelTrack[]
  artists: { name: string; tracks: number; releases: number }[]
  stars: { rank: number; name: string; track: string; image: string | null }[]
  labels: { name: string; tracks: number }[]
  bpm: number | null
  prevBpm: number | null
  bands: { band: string; count: number }[]
  key: string | null
  debutTotal: number
  debut: string[]
}

const imageCache = new Map<string, Promise<Img | null>>()

function loadImg(src: string): Promise<Img | null> {
  return new Promise((resolve) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => resolve(null)
    im.src = src
  })
}

/** Carátulas como imágenes listas para el canvas (null si no se pudo). */
async function loadArtworks(urls: (string | null)[]): Promise<(Img | null)[]> {
  const pending = [...new Set(urls.filter((u): u is string => !!u && !imageCache.has(u)))]
  // La API corta a 16 URLs por petición (MAX_URLS en share-reel-images).
  for (let start = 0; start < pending.length; start += 16) {
    const batch = pending.slice(start, start + 16)
    const req = fetch('/api/admin/share-reel-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ urls: batch }),
    })
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((j: { images?: (string | null)[] }) => j.images || [])
      .catch(() => [] as (string | null)[])
    batch.forEach((u, i) => {
      imageCache.set(
        u,
        req.then((list) => (list[i] ? loadImg(list[i] as string) : null)),
      )
    })
  }
  return Promise.all(urls.map((u) => (u ? imageCache.get(u) || Promise.resolve(null) : Promise.resolve(null))))
}

async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.all([
    document.fonts.load("900 60px Unbounded"),
    document.fonts.load("700 30px 'Courier Prime'"),
    document.fonts.load("400 30px 'Courier Prime'"),
  ]).catch(() => undefined)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** «12 Oct 2026» (los vídeos van en inglés, como los de los temas). */
export function reelDateLabel(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return ''
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

/** Un lanzamiento con varios remixes ocupa una sola portada en la estantería. */
function dedupeReleases<T extends { title: string; label: string }>(tracks: T[]): T[] {
  const seen = new Set<string>()
  return tracks.filter((t) => {
    const k = `${t.label}|${t.title.replace(/\s*\(.*\)\s*$/, '')}`.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

export async function renderPageReel(
  input: PageReelInput,
  format: ReelFormat,
  onProgress?: (ratio: number) => void,
): Promise<ReelResult> {
  const W = format === 'horizontal' ? 1920 : 1080
  const H = format === 'horizontal' ? 1080 : 1920
  await loadFonts()
  let draw: (c: CanvasRenderingContext2D, t: number) => void

  if (input.kind === 'top100') {
    const rows = input.rows.slice(0, 10)
    const imgs = await loadArtworks(rows.map((r) => r.artwork))
    const data = rows.map((r, i) => ({ ...r, img: imgs[i] }))
    draw = (c, t) => animTop(c, W, H, data, t)
  } else if (input.kind === 'week') {
    // Estantería (9) + «up next»: primeras portadas distintas, en el orden de la web.
    const uniq = dedupeReleases(input.tracks).slice(0, 11)
    const imgs = await loadArtworks(uniq.map((t) => t.artwork))
    const tracks = uniq.map((t, i) => ({ title: t.title, artists: t.artists, label: t.label, img: imgs[i] }))
    const week = reelDateLabel(input.weekDate)
    draw = (c, t) => animWeek(c, W, H, { week, count: input.count, tracks }, t)
  } else if (input.fortnight) {
    const f = input.fortnight
    const urls = [
      ...f.covers,
      ...f.played.map((r) => r.artwork),
      ...f.voted.map((r) => r.artwork),
      ...f.stars.map((s) => s.image),
    ]
    const imgs = await loadArtworks(urls)
    let k = 0
    const next = () => imgs[k++] ?? null
    const covers = f.covers.map(next)
    const track = (r: FortnightReelTrack) => ({ title: r.title, artists: r.artists, value: r.value, img: next() })
    const played = f.played.map(track)
    const voted = f.voted.map(track)
    const stars = f.stars.map((s) => ({ rank: s.rank, name: s.name, track: s.track, img: next() }))
    const short = (iso: string) => reelDateLabel(iso).replace(/ \d{4}$/, '').toUpperCase()
    const data = { ...f, range: `${short(f.from)} — ${short(f.until)}`, covers, played, voted, stars }
    const draw = (c: CanvasRenderingContext2D, t: number) => animFortnight(c, W, H, data, t)
    return encodeCanvasVideo(W, H, FORTNIGHT_DUR, 30, draw, onProgress)
  } else {
    const [img] = await loadArtworks([input.artwork])
    const data = {
      title: input.title,
      highlightFrom: blogHighlightFrom(input.title),
      date: reelDateLabel(input.date),
      tags: input.tags.map((t) => t.toUpperCase()),
      img,
      tracks: input.tracks,
      artist: input.artist,
      label: input.label,
      excerpt: input.excerpt,
    }
    draw = (c, t) => animBlog(c, W, H, data, t)
  }

  return encodeCanvasVideo(W, H, DUR, 30, draw, onProgress)
}
