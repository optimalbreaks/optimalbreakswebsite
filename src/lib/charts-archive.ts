/**
 * Corte editorial de /charts: New Releases empieza en 2026 (nacimiento de la web).
 * Lo anterior (cualquier formato) va a Selecciones de archivo, agrupado por año.
 */

export const CHARTS_EDITORIAL_START = '2026-01-01'

export function isArchiveFeaturedTrack(pick: {
  release_date?: string | null
  release_year?: number | null
}): boolean {
  const day = (pick.release_date || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day < CHARTS_EDITORIAL_START
  const year = pick.release_year
  if (typeof year === 'number' && Number.isFinite(year)) return year < 2026
  return false
}

export function featuredArchiveYearKey(pick: {
  release_date?: string | null
  release_year?: number | null
}): string {
  const day = (pick.release_date || '').trim().slice(0, 10)
  if (/^\d{4}-\d{2}-\d{2}$/.test(day)) return day.slice(0, 4)
  if (typeof pick.release_year === 'number' && Number.isFinite(pick.release_year)) {
    return String(pick.release_year)
  }
  return '__unknown_year__'
}
