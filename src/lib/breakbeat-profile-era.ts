/**
 * Normaliza textos de era de artistas (p. ej. "late-1990s-present") a décadas
 * canónicas ("1990s") para agregar estadísticas y el treemap del ADN breakbeatero.
 */
export function normalizeArtistEraToDecade(eraRaw: string): string | null {
  const s = String(eraRaw || '').trim().toLowerCase()
  if (!s) return null
  if (/^(19|20)\d{2}s$/.test(s)) return s

  const decades: string[] = []
  const re = /\b((?:19|20)\d{2})s\b/g
  let m: RegExpExecArray | null
  while ((m = re.exec(s)) !== null) {
    decades.push(`${m[1]}s`)
  }
  if (decades.length > 0) return decades[0]

  const ym = s.match(/\b((?:19|20)\d{2})\b/)
  if (ym) {
    const y = parseInt(ym[1], 10)
    return `${Math.floor(y / 10) * 10}s`
  }
  return null
}

/** Etiqueta corta: "1990s" o texto legacy → año centro de década (p. ej. 1995). */
export function decadeBucketToMidYearLabel(bucket: string): string {
  const canonical = normalizeArtistEraToDecade(bucket)
  if (canonical) {
    const m = canonical.match(/^((?:19|20)\d{2})s$/i)
    if (m) return String(parseInt(m[1], 10) + 5)
  }
  return bucket.length > 12 ? `${bucket.slice(0, 11)}…` : bucket
}
