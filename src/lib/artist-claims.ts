import type { createServiceSupabase } from '@/lib/supabase-admin'

export const CLAIM_SUPERSEDED_NOTE =
  'Cancelada: la ficha ya está verificada por otra cuenta.'

type ServiceClient = ReturnType<typeof createServiceSupabase>

/** Cierra claims pendientes de una ficha que acaba de verificarse a otra cuenta. */
export async function supersedeCompetingClaims(
  svc: ServiceClient,
  opts: {
    artistId: string
    exceptClaimId?: string
    exceptUserId?: string
    resolvedBy?: string | null
  },
): Promise<{ error: { message: string } | null }> {
  let q = svc
    .from('artist_claims')
    .update({
      status: 'superseded',
      admin_notes: CLAIM_SUPERSEDED_NOTE,
      resolved_at: new Date().toISOString(),
      resolved_by: opts.resolvedBy ?? null,
    } as never)
    .eq('artist_id', opts.artistId)
    .eq('status', 'pending')
  if (opts.exceptClaimId) q = q.neq('id', opts.exceptClaimId)
  if (opts.exceptUserId) q = q.neq('user_id', opts.exceptUserId)
  const { error } = await q
  return { error: error ? { message: error.message } : null }
}
