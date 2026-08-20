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

/** YouTube video id — identidad estable. Discogs NO: un release tiene varios cortes. */
export function vinylYouTubeKey(youtubeUrl) {
  const s = String(youtubeUrl || '').trim()
  if (!s) return ''
  const m = s.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([A-Za-z0-9_-]{11})/i,
  )
  return m ? `yt:${m[1].toLowerCase()}` : ''
}

/**
 * Identidad de fila para no regenerar UUID al re-upsert.
 * 1) YouTube (el mismo vídeo = la misma canción, aunque cambien artistas).
 * 2) Fallback título+mix+artistas (vinilos sin YouTube).
 */
export function vinylIdentityKey(row) {
  const yt = vinylYouTubeKey(row?.youtube_url)
  if (yt) return yt
  return vinylTrackKey(row?.title, row?.mix_name, row?.artists)
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
