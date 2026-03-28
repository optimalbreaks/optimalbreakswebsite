// ============================================
// OPTIMAL BREAKS — Cliente Supabase con service role (solo servidor)
// No importar desde componentes cliente.
// ============================================

import { createClient, type SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

/** Clave elevada: JWT `service_role` (legacy) o `sb_secret_*` (Supabase nuevo). Solo servidor. */
function getSupabaseSecretKey(): string {
  return (
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ''
  )
}

export function createServiceSupabase(): SupabaseClient<Database> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = getSupabaseSecretKey()
  if (!url || !key) {
    throw new Error(
      'Faltan NEXT_PUBLIC_SUPABASE_URL y una clave de servicio: SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEY.'
    )
  }
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
}
