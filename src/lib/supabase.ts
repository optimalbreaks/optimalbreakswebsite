// ============================================
// OPTIMAL BREAKS — Supabase Clients
// Browser client (with auth) + Server client
// ============================================

import { createBrowserClient } from '@supabase/ssr'
import { createClient, SupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

const PLACEHOLDER_URL = 'https://placeholder.supabase.co'
const PLACEHOLDER_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZS1kZW1vIiwicm9sZSI6ImFub24iLCJleHAiOjE5ODM4MTI5OTZ9.CRXP1A7WOeoJeXxjNni43kdQwgnWNReilDMblYTn_I0'

/** Clave pública: JWT `anon` (legacy) o `sb_publishable_*` (Supabase nuevo). */
export function getSupabasePublishableKey(): string {
  return (
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim() ||
    ''
  )
}

/** Used by browser helpers and by `supabase-server` (keep `next/headers` out of this file). */
export function getSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = getSupabasePublishableKey()
  if (url && key) {
    try { new URL(url); return { url, key } } catch { /* invalid */ }
  }
  return { url: PLACEHOLDER_URL, key: PLACEHOLDER_KEY }
}

// ========== BROWSER CLIENT (for client components) ==========
// Uses @supabase/ssr for proper cookie-based auth
export function createBrowserSupabase() {
  const { url, key } = getSupabaseEnv()
  return createBrowserClient<Database>(url, key)
}

// ========== SIMPLE CLIENT (for public reads without auth) ==========
export function createSimpleSupabase(): SupabaseClient<Database> {
  const { url, key } = getSupabaseEnv()
  return createClient<Database>(url, key, {
    auth: { persistSession: false },
  })
}

// ========== HELPER ==========
export async function safeQuery<T>(
  query: (client: SupabaseClient<Database>) => Promise<{ data: T | null; error: any }>
): Promise<T | null> {
  const client = createSimpleSupabase()
  try {
    const { data, error } = await query(client)
    if (error) { console.error('[OB] Query error:', error.message); return null }
    return data
  } catch (e) { console.error('[OB] Connection error:', e); return null }
}
