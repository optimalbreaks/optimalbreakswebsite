/**
 * UPSERT de filas en public.artists vía API REST de Supabase (service role / secret).
 * Compartido por actualizar-artista.mjs, generar-artista-agente.mjs y la API admin.
 *
 * No usa conexión Postgres directa (`pg`): evita host db.*.supabase.co bloqueado en muchas redes.
 * Migraciones SQL: `npm run db:migrate` (seed-supabase.mjs + Postgres) — flujo aparte.
 *
 * Flujo típico desde el agente: guia-base-datos.mjs → run artist-json <slug>.
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..', '..')

export function loadEnvLocal() {
  const p = join(ROOT, '.env.local')
  if (!existsSync(p)) return
  let text = readFileSync(p, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (const line of text.split('\n')) {
    let t = line.trim()
    if (t.startsWith('export ')) t = t.slice(7).trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

export function supabaseApiCredentials() {
  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim()
  if (!url || !key) return null
  return { url, key }
}

const REQUIRED_FIELDS = ['slug', 'name', 'name_display']
const VALID_CATEGORIES = ['pioneer', 'uk_legend', 'us_artist', 'andalusian', 'current', 'crew']

const ALL_COLUMNS = [
  'slug', 'name', 'name_display', 'real_name', 'country',
  'bio_en', 'bio_es', 'category', 'styles', 'era',
  'image_url', 'essential_tracks', 'recommended_mixes',
  'related_artists', 'labels_founded', 'key_releases',
  'website', 'socials', 'is_featured', 'sort_order',
]

export function validateArtistRow(data) {
  const errors = []
  for (const f of REQUIRED_FIELDS) {
    if (!data[f] || typeof data[f] !== 'string' || !data[f].trim()) {
      errors.push(`Campo requerido "${f}" falta o está vacío`)
    }
  }
  if (data.category && !VALID_CATEGORIES.includes(data.category)) {
    errors.push(`category "${data.category}" no válida. Opciones: ${VALID_CATEGORIES.join(', ')}`)
  }
  if (data.styles && !Array.isArray(data.styles)) {
    errors.push('"styles" debe ser un array')
  }
  if (data.key_releases && !Array.isArray(data.key_releases)) {
    errors.push('"key_releases" debe ser un array')
  }
  if (data.essential_tracks && !Array.isArray(data.essential_tracks)) {
    errors.push('"essential_tracks" debe ser un array')
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
    .from('artists')
    .upsert(row, { onConflict: 'slug' })
    .select('id, slug, name, created_at')
    .single()
  if (error) {
    const hint =
      error.message?.includes('column') || error.code === 'PGRST204'
        ? ' ¿Aplicaste la migración 006_artist_extended_fields.sql?'
        : ''
    throw new Error(`Supabase API: ${error.message}${hint}`)
  }
  return out
}

/** Credenciales para escribir artistas/labels/eventos desde scripts (no uses anon). */
export const UPSERT_CREDENTIALS_HINT =
  'Configura NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY). La clave anon/publicable no escribe en tablas protegidas. Postgres/DATABASE_URL no se usa para estos UPSERT.'

/**
 * @param {Record<string, unknown>} data — misma forma que el JSON de artista / salida del agente
 * @returns {Promise<{ id: string, slug: string, name: string, created_at: string }>}
 */
export async function upsertArtist(data) {
  loadEnvLocal()

  const errors = validateArtistRow(data)
  if (errors.length) {
    throw new Error(errors.join('; '))
  }

  const row = await upsertViaSupabaseApi(data)
  if (!row) {
    throw new Error(`No hay credenciales de API para Supabase. ${UPSERT_CREDENTIALS_HINT}`)
  }
  return row
}
