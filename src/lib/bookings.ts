// ============================================
// OPTIMAL BREAKS — Artistas verificados + Bookings (constantes compartidas)
// Cliente y servidor. Ver docs/GUIA_IMPLEMENTACION_BOOKINGS.md.
// ============================================

import type { BookingRequestStatus, ArtistClaimStatus } from '@/types/database'

/**
 * Categorías de artista NO reclamables (§9.1). Las figuras históricas /
 * leyendas no se reclaman para recibir bookings desde la web.
 */
export const NON_CLAIMABLE_CATEGORIES = ['pioneer', 'uk_legend'] as const

export function isClaimableCategory(category: string | null | undefined): boolean {
  if (!category) return true
  return !NON_CLAIMABLE_CATEGORIES.includes(category as (typeof NON_CLAIMABLE_CATEGORIES)[number])
}

/** Rangos de presupuesto predefinidos (§9.4). El valor `''` = «no especificado». */
export const BUDGET_RANGES = [
  { value: '', label_es: 'Prefiero no indicar', label_en: 'Prefer not to say' },
  { value: '<500', label_es: 'Menos de 500 €', label_en: 'Under €500' },
  { value: '500-1000', label_es: '500 € – 1.000 €', label_en: '€500 – €1,000' },
  { value: '1000-2500', label_es: '1.000 € – 2.500 €', label_en: '€1,000 – €2,500' },
  { value: '2500-5000', label_es: '2.500 € – 5.000 €', label_en: '€2,500 – €5,000' },
  { value: '5000+', label_es: 'Más de 5.000 €', label_en: 'Over €5,000' },
] as const

export function budgetLabel(value: string, es: boolean): string {
  const found = BUDGET_RANGES.find((b) => b.value === value)
  if (!found) return value
  return es ? found.label_es : found.label_en
}

/** Límite anti-abuso: solicitudes de booking que un remitente puede crear al día. */
export const BOOKING_DAILY_LIMIT = 10

export const BOOKING_STATUS_LABELS: Record<BookingRequestStatus, { es: string; en: string }> = {
  new: { es: 'Nueva', en: 'New' },
  read: { es: 'Leída', en: 'Read' },
  replied: { es: 'Respondida', en: 'Replied' },
  accepted: { es: 'Aceptada', en: 'Accepted' },
  declined: { es: 'Rechazada', en: 'Declined' },
  closed: { es: 'Cerrada', en: 'Closed' },
}

/** Estados que el artista puede fijar en una solicitud recibida. */
export const ARTIST_SETTABLE_BOOKING_STATUSES: BookingRequestStatus[] = [
  'read',
  'replied',
  'accepted',
  'declined',
  'closed',
]

export const CLAIM_STATUS_LABELS: Record<ArtistClaimStatus, { es: string; en: string }> = {
  pending: { es: 'Pendiente', en: 'Pending' },
  approved: { es: 'Aprobada', en: 'Approved' },
  rejected: { es: 'Rechazada', en: 'Rejected' },
  cancelled: { es: 'Cancelada', en: 'Cancelled' },
  revoked: { es: 'Revocada', en: 'Revoked' },
}

export function isValidEmail(value: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim())
}
