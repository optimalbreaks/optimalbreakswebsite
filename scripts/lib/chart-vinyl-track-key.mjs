/**
 * Clave canónica de un vinilo: artistas + título + mix (sin "The", sin "Original Mix").
 * Misma canción en white label / test pressing / reissue → una sola fila.
 */

export function normVinylText(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '')
    .trim()
}

export function normVinylTitle(title) {
  let n = normVinylText(title)
  if (n.startsWith('the')) n = n.slice(3)
  return n
}

export function normVinylMix(mixName) {
  const n = normVinylText(mixName)
  if (!n || n === 'originalmix' || n === 'original') return ''
  return n
}

export function vinylTrackKey(title, mixName, artists) {
  const a = (artists || [])
    .map((x) => normVinylText(typeof x === 'string' ? x : x?.name || ''))
    .filter(Boolean)
    .sort()
    .join(',')
  return `${a}::${normVinylTitle(title)}::${normVinylMix(mixName)}`
}

/** Preferir fila con carátula, YouTube y edición comercial (no white label). */
export function vinylRowScore(row) {
  let s = 0
  if ((row.artwork_url || '').trim()) s += 8
  if ((row.youtube_url || '').trim()) s += 4
  const fmt = String(row.format || '')
  if (!/whitelabel|testpressing|promo|singlesided|unofficial|reissue/i.test(fmt.replace(/\s+/g, ''))) s += 2
  if ((row.discogs_url || '').trim()) s += 1
  return s
}

export function dedupeVinylRows(rows) {
  const best = new Map()
  for (const row of rows || []) {
    const k = vinylTrackKey(row.title, row.mix_name, row.artists)
    const prev = best.get(k)
    if (!prev || vinylRowScore(row) > vinylRowScore(prev)) best.set(k, row)
  }
  return Array.from(best.values()).map((row, i) => ({ ...row, sort_order: i + 1 }))
}
