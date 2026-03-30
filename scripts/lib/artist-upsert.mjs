/**
 * UPSERT de filas en public.artists (Postgres directo o API Supabase service role).
 * Compartido por actualizar-artista.mjs, generar-artista-agente.mjs y la API admin.
 *
 * Flujo típico desde el agente: guia-base-datos.mjs → run artist-json <slug>.
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'
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

const DB_URI_KEYS = [
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'POSTGRES_URL',
  'SUPABASE_POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
]

function supabaseRefFromPublicUrl(url) {
  if (!url) return ''
  const m = String(url).trim().match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i)
  return m ? m[1] : ''
}

function connectionStringFromPasswordAndPublicUrl() {
  const password = (
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    ''
  ).trim()
  const ref = supabaseRefFromPublicUrl(process.env.NEXT_PUBLIC_SUPABASE_URL || '')
  if (!password || !ref) return ''
  return `postgresql://postgres:${encodeURIComponent(password)}@db.${ref}.supabase.co:5432/postgres`
}

function getPostgresConnectionString() {
  let connectionString = ''
  for (const key of DB_URI_KEYS) {
    const v = process.env[key]
    if (v && String(v).trim()) {
      connectionString = String(v).trim()
      break
    }
  }
  if (!connectionString) {
    connectionString = connectionStringFromPasswordAndPublicUrl()
  }
  return connectionString
}

export function connectionOptions() {
  const connectionString = getPostgresConnectionString()
  if (!connectionString) {
    return null
  }
  const hostMatch = connectionString.match(/@([^:/]+)/)
  const host = hostMatch ? hostMatch[1] : ''
  const needsSsl = host.includes('supabase.co') || host.includes('supabase.com')
  const sslOff = process.env.DATABASE_SSL === '0'
  const ssl = sslOff ? false : needsSsl ? { rejectUnauthorized: false } : undefined
  return { connectionString, ssl }
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

function buildUpsertQuery(data) {
  const cols = []
  const vals = []
  const placeholders = []
  let idx = 1

  for (const col of ALL_COLUMNS) {
    if (data[col] === undefined) continue
    cols.push(col)

    let value = data[col]
    if (col === 'socials') {
      value = JSON.stringify(value)
    } else if (col === 'key_releases') {
      value = JSON.stringify(value)
    }

    vals.push(value)
    placeholders.push(`$${idx}`)
    idx++
  }

  const updateCols = cols
    .filter((c) => c !== 'slug')
    .map((c) => {
      const i = cols.indexOf(c)
      return `${c} = $${i + 1}`
    })

  const sql = `
    INSERT INTO public.artists (${cols.join(', ')})
    VALUES (${placeholders.join(', ')})
    ON CONFLICT (slug) DO UPDATE SET
      ${updateCols.join(',\n      ')}
    RETURNING id, slug, name, created_at;
  `

  return { sql, vals }
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

export const UPSERT_CREDENTIALS_HINT =
  'Necesitas DATABASE_URL (o SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL) o bien NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY). La clave anon/publishable no escribe en artists.'

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

  const pgOpts = connectionOptions()
  if (pgOpts) {
    const { sql, vals } = buildUpsertQuery(data)
    const client = new pg.Client({ connectionString: pgOpts.connectionString, ssl: pgOpts.ssl })
    try {
      await client.connect()
    } catch (e) {
      const msg = typeof e?.message === 'string' ? e.message : ''
      const dnsFail =
        e?.code === 'ENOTFOUND' || msg.includes('getaddrinfo') || msg.includes('EAI_AGAIN')
      if (dnsFail) {
        console.warn(
          '[artist-upsert] Postgres (host db.*.supabase.co) no alcanzable desde esta red; reintentando vía API REST…',
        )
        const row = await upsertViaSupabaseApi(data)
        if (row) return row
      }
      throw e
    }
    try {
      const result = await client.query(sql, vals)
      return result.rows[0]
    } finally {
      await client.end()
    }
  }

  const row = await upsertViaSupabaseApi(data)
  if (!row) {
    throw new Error(`No hay conexión a la base de datos. ${UPSERT_CREDENTIALS_HINT}`)
  }
  return row
}
