/**
 * Extrae pistas desde el HTML público de Beatport (script __NEXT_DATA__).
 * Usado por importación admin de New Releases y alineado con scripts/_append-batch-nr-from-releases.mjs
 */

const UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

export type BeatportPickInput = {
  title: string
  mix_name: string
  artists: { name: string }[]
  label: string
  platform: 'beatport'
  link_url: string
  link_label: string
  artwork_url: string
  sample_url: string
  bpm: number | null
  music_key: string
  release_year: number | null
  release_date: string | null
  note_en: string
  note_es: string
}

function artworkUrl(t: Record<string, unknown>): string {
  const pick = (img: { dynamic_uri?: string; uri?: string } | null | undefined) => {
    if (!img) return ''
    if (img.dynamic_uri)
      return String(img.dynamic_uri).replace(/\{w\}/g, '250').replace(/\{h\}/g, '250')
    if (img.uri) return String(img.uri)
    return ''
  }
  const release = t.release as { image?: { dynamic_uri?: string; uri?: string } } | undefined
  return pick(release?.image) || pick(t.image as { dynamic_uri?: string; uri?: string } | undefined) || ''
}

function releaseDateIso(t: Record<string, unknown>): string | null {
  const raw = (t.publish_date || t.new_release_date) as string | undefined
  if (!raw) return null
  const m = String(raw).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  return m ? `${m[1]}-${m[2]}-${m[3]}` : null
}

export function pickFromTrackBlob(t: Record<string, unknown>): BeatportPickInput | null {
  const id = t.id as number | undefined
  const slug = t.slug as string | undefined
  if (!id || !slug) return null
  const artistsRaw = t.artists as { name?: string }[] | undefined
  const artists = (artistsRaw || [])
    .map((a) => ({ name: (a?.name || '').trim() }))
    .filter((x) => x.name)
  const link_url = `https://www.beatport.com/track/${slug}/${id}`
  const rd = releaseDateIso(t)
  const y = rd ? Number.parseInt(rd.slice(0, 4), 10) : NaN
  const key = t.key as { name_short?: string; name?: string } | undefined
  return {
    title: String(t.name || '').trim(),
    mix_name: String(t.mix_name || '').trim(),
    artists: artists.length ? artists : [{ name: 'Unknown' }],
    label: String((t.release as { label?: { name?: string } } | undefined)?.label?.name || '').trim(),
    platform: 'beatport',
    link_url,
    link_label: '',
    artwork_url: artworkUrl(t),
    sample_url: String(t.sample_url || '').trim(),
    bpm: typeof t.bpm === 'number' && t.bpm > 0 ? t.bpm : null,
    music_key: (key?.name_short || key?.name || '').trim(),
    release_year: Number.isFinite(y) && y >= 1970 && y <= 2100 ? y : null,
    release_date: rd,
    note_en: '',
    note_es: '',
  }
}

export function findAllTracksFromNextData(nd: {
  props?: { pageProps?: { dehydratedState?: { queries?: unknown[] } } }
}): BeatportPickInput[] {
  const qs = nd?.props?.pageProps?.dehydratedState?.queries || []
  for (const q of qs) {
    const qrec = q as { queryKey?: unknown[]; state?: { data?: unknown } }
    const key0 = Array.isArray(qrec.queryKey) ? String(qrec.queryKey[0] || '') : ''
    const data = qrec.state?.data as Record<string, unknown> | undefined
    if (!data || typeof data !== 'object') continue
    const results = data.results as Record<string, unknown>[] | undefined
    if (
      (key0 === 'tracks' || /tracks/i.test(key0)) &&
      Array.isArray(results) &&
      results.length &&
      results[0]?.id &&
      results[0]?.slug
    ) {
      const out: BeatportPickInput[] = []
      for (const t of results) {
        const p = pickFromTrackBlob(t as Record<string, unknown>)
        if (p?.title) out.push(p)
      }
      if (out.length) return out
    }
  }
  for (const q of qs) {
    const qrec = q as { queryKey?: unknown[]; state?: { data?: unknown } }
    const key0 = Array.isArray(qrec.queryKey) ? String(qrec.queryKey[0] || '') : ''
    const data = qrec.state?.data as Record<string, unknown> | undefined
    if (typeof key0 === 'string' && /^track-\d+$/.test(key0) && data?.id && data?.slug) {
      const p = pickFromTrackBlob(data)
      if (p?.title) return [p]
    }
  }
  return []
}

export function extractNextData(html: string): unknown | null {
  const marker = '__NEXT_DATA__'
  const idx = html.indexOf(marker)
  if (idx === -1) return null
  const start = html.indexOf('>', idx) + 1
  const end = html.indexOf('</script>', start)
  if (end === -1) return null
  try {
    return JSON.parse(html.slice(start, end).trim())
  } catch {
    return null
  }
}

/** Clave estable para deduplicar filas Beatport (misma que chart-featured-upsert). */
export function dedupeKeyForFeaturedLink(linkUrl: string): string {
  let u = (linkUrl || '').trim()
  u = u.replace(/^http:\/\//i, 'https://')
  u = u.replace(/^https:\/\/(www\.)?beatport\.com/i, 'https://www.beatport.com')
  u = u.replace(/\/+$/, '')
  const n = u.toLowerCase()
  const m = n.match(/\/track\/[^/]+\/(\d+)$/)
  if (m) return `beatport:${m[1]}`
  return n
}

/** true si la URL es ficha de release o track en beatport.com (con o sin prefijo /es/, /en/, …). */
export function isBeatportTrackOrReleaseUrl(url: string): boolean {
  const u = url.replace(/^http:\/\//i, 'https://').trim()
  return /^https:\/\/(www\.)?beatport\.com\/(?:[a-z]{2}\/)?(?:release|track)\//i.test(u)
}

export async function fetchBeatportPageHtml(url: string): Promise<string> {
  const acceptLang = url.includes('/es/') ? 'es,en-US;q=0.9,en;q=0.8' : 'en-US,en;q=0.9'
  const res = await fetch(url.replace(/^http:\/\//i, 'https://'), {
    headers: {
      'User-Agent': UA,
      Accept: 'text/html',
      'Accept-Language': acceptLang,
    },
  })
  if (!res.ok) {
    throw new Error(`Beatport HTTP ${res.status}`)
  }
  return res.text()
}

/** Lunes de la semana del calendario local para una fecha YYYY-MM-DD (misma regla que chart-40-breaks.mjs → currentWeekMonday). */
export function chartEditionWeekMondayFromPublish(isoYYYYMMDD: string | null | undefined): string | null {
  if (isoYYYYMMDD == null || isoYYYYMMDD === '') return null
  const s = String(isoYYYYMMDD).trim().slice(0, 10)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null
  const d = new Date(s)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getDay()
  const diff = day === 0 ? 6 : day - 1
  d.setDate(d.getDate() - diff)
  return d.toISOString().slice(0, 10)
}

/**
 * Líneas con prefijo `YYYY-MM-DD URL` fuerzan la edición semanal.
 * URLs sueltas: week_date_override = null → el API usa el lunes de la semana del lanzamiento en Beatport.
 */
export function parseBeatportImportLines(text: string): { week_date_override: string | null; url: string }[] {
  const out: { week_date_override: string | null; url: string }[] = []
  const weekRe = /^(\d{4}-\d{2}-\d{2})\s+(https?:\/\/\S+)/i
  for (const line of text.split('\n')) {
    const t = line.trim()
    if (!t || t.startsWith('#')) continue
    const m = t.match(weekRe)
    if (m) {
      out.push({ week_date_override: m[1], url: m[2].replace(/\/+$/, '') })
      continue
    }
    if (/^https?:\/\//i.test(t)) {
      out.push({ week_date_override: null, url: t.replace(/\/+$/, '') })
    }
  }
  return out
}

export function resolveTracksFromBeatportHtml(html: string): BeatportPickInput[] {
  const nd = extractNextData(html)
  if (!nd || typeof nd !== 'object') return []
  return findAllTracksFromNextData(nd as Parameters<typeof findAllTracksFromNextData>[0])
}
