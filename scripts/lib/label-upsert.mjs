/**
 * UPSERT de filas en public.labels vía API REST de Supabase (service role / secret).
 * Usado por actualizar-sello.mjs y generar-sello-agente.mjs.
 * Sin Postgres directo: mismo criterio que artist-upsert.mjs.
 */

import { createClient } from '@supabase/supabase-js'
import {
  loadEnvLocal,
  supabaseApiCredentials,
  UPSERT_CREDENTIALS_HINT,
} from './artist-upsert.mjs'

const ALL_COLUMNS = [
  'slug',
  'name',
  'country',
  'founded_year',
  'description_en',
  'description_es',
  'image_url',
  'website',
  'key_artists',
  'key_releases',
  'is_active',
  'is_featured',
]

export function validateLabelRow(data) {
  const errors = []
  if (!data.slug || typeof data.slug !== 'string' || !data.slug.trim()) {
    errors.push('Campo requerido "slug" falta o está vacío')
  }
  if (!data.name || typeof data.name !== 'string' || !data.name.trim()) {
    errors.push('Campo requerido "name" falta o está vacío')
  }
  if (data.key_artists && !Array.isArray(data.key_artists)) {
    errors.push('"key_artists" debe ser un array')
  }
  if (data.key_releases && !Array.isArray(data.key_releases)) {
    errors.push('"key_releases" debe ser un array')
  }
  return errors
}

function buildRowPayload(data) {
  const row = {}
  for (const col of ALL_COLUMNS) {
    if (data[col] !== undefined) row[col] = data[col]
  }
  return row
}

async function upsertViaSupabaseApi(data) {
  const creds = supabaseApiCredentials()
  if (!creds) return null
  const supabase = createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const row = buildRowPayload(data)
  const { data: out, error } = await supabase
    .from('labels')
    .upsert(row, { onConflict: 'slug' })
    .select('id, slug, name, created_at')
    .single()
  if (error) {
    throw new Error(`Supabase API: ${error.message}`)
  }
  return out
}

/**
 * @param {Record<string, unknown>} data
 * @returns {Promise<{ id: string, slug: string, name: string, created_at: string }>}
 */
export async function upsertLabel(data) {
  loadEnvLocal()

  const errors = validateLabelRow(data)
  if (errors.length) {
    throw new Error(errors.join('; '))
  }

  const row = await upsertViaSupabaseApi(data)
  if (!row) {
    throw new Error(`No hay credenciales de API para Supabase. ${UPSERT_CREDENTIALS_HINT}`)
  }
  return row
}
