/**
 * SerpAPI Google Imágenes: candidatos normalizados (misma forma que usa elegir-foto-artista).
 *
 * @param {string} query
 * @param {string} apiKey
 * @param {number} max
 * @returns {Promise<Array<{ title: string, source: string, link: string, original: string, width: number|null, height: number|null, thumbnail: string }>>}
 */
export async function fetchGoogleImageCandidates(query, apiKey, max) {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_images')
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('hl', 'en')
  url.searchParams.set('gl', 'uk')

  const res = await fetch(url.toString())
  const data = await res.json()
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText
    throw new Error(`SerpAPI ${res.status}: ${msg}`)
  }
  const raw = data.images_results
  if (!Array.isArray(raw) || raw.length === 0) {
    return []
  }

  const seen = new Set()
  const out = []
  for (const r of raw) {
    if (out.length >= max) break
    const original = typeof r.original === 'string' ? r.original.trim() : ''
    if (!original.startsWith('https://')) continue
    if (r.is_product === true) continue
    const key = original.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      title: String(r.title || '').slice(0, 200),
      source: String(r.source || '').slice(0, 120),
      link: typeof r.link === 'string' ? r.link.slice(0, 500) : '',
      original,
      width: typeof r.original_width === 'number' ? r.original_width : null,
      height: typeof r.original_height === 'number' ? r.original_height : null,
      thumbnail: typeof r.thumbnail === 'string' ? r.thumbnail : '',
    })
  }
  return out
}
