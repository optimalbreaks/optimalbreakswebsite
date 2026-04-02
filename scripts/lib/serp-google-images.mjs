/**
 * SerpAPI Google Imágenes: candidatos normalizados (elegir-foto-artista, sellos, carteles, APIs admin).
 *
 * Estrategia: varias páginas (ijn 0 y 1) y, si sigue pobre, repetir con gl=us.
 * Opcional `alternateQueries`: si tras la primera ronda hay menos de 8 candidatos,
 * se prueban consultas extra (nichos / sin comillas / etc.) sin duplicar URLs.
 * Nota: más peticiones SerpAPI = más créditos; alternativas solo en resultados pobres.
 *
 * @param {string} query
 * @param {string} apiKey
 * @param {number} max
 * @param {{ alternateQueries?: string[] }} [options]
 * @returns {Promise<Array<{ title: string, source: string, link: string, original: string, width: number|null, height: number|null, thumbnail: string }>>}
 */
function appendFromRaw(raw, seen, out, max) {
  if (!Array.isArray(raw)) return
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
}

async function fetchSerpGoogleImagesPage(query, apiKey, { ijn = 0, hl = 'en', gl = 'uk' } = {}) {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_images')
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('hl', hl)
  url.searchParams.set('gl', gl)
  url.searchParams.set('ijn', String(ijn))

  const res = await fetch(url.toString())
  const data = await res.json()
  if (!res.ok) {
    const msg = data.error || data.message || res.statusText
    throw new Error(`SerpAPI ${res.status}: ${msg}`)
  }
  return Array.isArray(data.images_results) ? data.images_results : []
}

/**
 * Una consulta: hasta 3 peticiones SerpAPI (pág. 2 UK, luego US) hasta llenar `max`.
 */
async function fetchOneQueryAdaptive(query, apiKey, max, seen, out) {
  const run = async (ijn, gl) => {
    const raw = await fetchSerpGoogleImagesPage(query, apiKey, { ijn, gl })
    appendFromRaw(raw, seen, out, max)
  }

  await run(0, 'uk')
  if (out.length < Math.min(max, 10)) await run(1, 'uk')
  if (out.length < Math.min(max, 8)) await run(0, 'us')
}

export async function fetchGoogleImageCandidates(query, apiKey, max, options = {}) {
  const alternateQueries = Array.isArray(options.alternateQueries)
    ? options.alternateQueries
        .map((q) => String(q || '').replace(/\s+/g, ' ').trim())
        .filter(Boolean)
    : []

  const seen = new Set()
  const out = []

  await fetchOneQueryAdaptive(query, apiKey, max, seen, out)

  if (out.length < Math.min(max, 8) && alternateQueries.length > 0) {
    for (const q of alternateQueries) {
      if (out.length >= max) break
      if (q === query.replace(/\s+/g, ' ').trim()) continue
      await fetchOneQueryAdaptive(q, apiKey, max, seen, out)
    }
  }

  return out.slice(0, max)
}
