import type { Mix } from '@/types/database'

/** Orden editorial: fecha de publicación en plataforma; si no hay, mitad del año catalogado (no `created_at` de importación). */
export function mixSortTimestamp(m: Pick<Mix, 'published_at' | 'year' | 'created_at'>): number {
  if (m.published_at) {
    const t = new Date(m.published_at).getTime()
    if (!Number.isNaN(t)) return t
  }
  if (m.year != null && Number.isFinite(Number(m.year))) {
    return Date.UTC(Number(m.year), 5, 15)
  }
  const c = new Date(m.created_at).getTime()
  return Number.isNaN(c) ? 0 : c
}

/** Fecha de publicación + duración; incluye plataforma cuando hay `published_at`. */
export function formatMixDateLine(
  m: Pick<Mix, 'published_at' | 'year' | 'duration_minutes' | 'platform'>,
  lang: string,
): string {
  const locale = lang === 'es' ? 'es-ES' : 'en-GB'
  const platformLabel =
    m.platform === 'soundcloud'
      ? 'SoundCloud'
      : m.platform === 'youtube'
        ? 'YouTube'
        : m.platform
          ? m.platform.charAt(0).toUpperCase() + m.platform.slice(1)
          : null
  const published = m.published_at
  const datePart = published
    ? new Date(published).toLocaleDateString(locale, {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      })
    : m.year != null
      ? String(m.year)
      : '—'
  const dur = m.duration_minutes != null ? ` · ${m.duration_minutes} min` : ''
  const prefix = published && platformLabel ? `${platformLabel} · ` : ''
  return `${prefix}${datePart}${dur}`
}

/** Valor para input type="datetime-local" desde ISO guardado en BD. */
export function isoToDatetimeLocal(iso: string | null | undefined): string {
  if (!iso) return ''
  const d = new Date(iso)
  if (Number.isNaN(d.getTime())) return ''
  const pad = (n: number) => String(n).padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
}

/** Vacío → null; cadena de datetime-local → ISO para Supabase. */
export function datetimeLocalToIso(s: string): string | null {
  const t = s.trim()
  if (!t) return null
  const d = new Date(t)
  if (Number.isNaN(d.getTime())) return null
  return d.toISOString()
}
