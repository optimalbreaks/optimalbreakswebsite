// Server-only Supabase client (uses next/headers — do not import from client components)

import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { createClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { cookies } from 'next/headers'
import { getSupabaseEnv } from './supabase'

/**
 * Cliente para LECTURAS PÚBLICAS con caché (catálogo: charts, artists, labels…).
 * No usa cookies, y cada GET a PostgREST se guarda en la Data Cache de
 * Next/Vercel durante `revalidateSeconds`. Así el tráfico público (incluidos
 * bots) no golpea Supabase en cada página vista — protege el Disk IO Budget
 * de la instancia. NO usar para datos por-usuario ni para escrituras.
 */
export function createCachedSupabase(revalidateSeconds = 300) {
  const { url, key } = getSupabaseEnv()
  return createClient<Database>(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: {
      fetch: (input: RequestInfo | URL, init?: RequestInit) =>
        fetch(input, {
          ...init,
          next: { revalidate: revalidateSeconds },
        } as RequestInit),
    },
  })
}

export function createServerSupabase() {
  const { url, key } = getSupabaseEnv()
  return createServerClient<Database>(url, key, {
    cookies: {
      async getAll() {
        const store = await cookies()
        return store.getAll()
      },
      async setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          const store = await cookies()
          cookiesToSet.forEach(({ name, value, options }) =>
            store.set(name, value, options)
          )
        } catch {
          // Can't set cookies in Server Components (only in Actions/Routes)
        }
      },
    },
  })
}
