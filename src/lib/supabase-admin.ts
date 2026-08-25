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

/** Tamaño de página PostgREST (máx. por petición). Nunca usarlo como tope de listado. */
export const POSTGREST_PAGE = 1000
/** `.in('id', …)` largo tumba o recorta el GET; trocear UUIDs. */
export const IN_ID_CHUNK = 200

type QueryResult = { data: unknown; error: { message: string } | null }

/** Recorre `range()` hasta agotar la tabla. El callback debe incluir `.order()` estable. */
export async function fetchAllRows<T>(
  run: (from: number, to: number) => PromiseLike<QueryResult>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const out: T[] = []
  for (let from = 0; ; from += POSTGREST_PAGE) {
    const { data, error } = await run(from, from + POSTGREST_PAGE - 1)
    if (error) return { data: out, error }
    const rows = (Array.isArray(data) ? data : []) as T[]
    out.push(...rows)
    if (rows.length < POSTGREST_PAGE) break
  }
  return { data: out, error: null }
}

export async function selectByIds<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<QueryResult>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const unique = Array.from(new Set(ids.filter(Boolean)))
  const out: T[] = []
  for (let i = 0; i < unique.length; i += IN_ID_CHUNK) {
    const { data, error } = await run(unique.slice(i, i + IN_ID_CHUNK))
    if (error) return { data: out, error }
    if (Array.isArray(data) && data.length) out.push(...(data as T[]))
  }
  return { data: out, error: null }
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
