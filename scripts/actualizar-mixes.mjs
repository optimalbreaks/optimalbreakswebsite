/**
 * OPTIMAL BREAKS — UPSERT de filas en public.mixes desde JSON (API Supabase, service role).
 *
 * Índice: scripts/guia-base-datos.mjs → run mixes-file <ruta>
 *
 * Uso:
 *   node scripts/actualizar-mixes.mjs data/mixes/lote.json
 *
 * El JSON debe ser un array de objetos mix, o { "mixes": [ … ] }.
 * Credenciales: .env.local — NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SECRET).
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal, supabaseApiCredentials, UPSERT_CREDENTIALS_HINT } from './lib/artist-upsert.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

const MIX_TYPES = new Set([
  'essential_mix',
  'classic_set',
  'radio_show',
  'youtube_session',
  'podcast',
])
const PLATFORMS = new Set(['soundcloud', 'youtube', 'mixcloud', 'other'])

function validateMixRow(m, i) {
  const p = `mix[${i}]`
  const err = []
  if (!m.slug || typeof m.slug !== 'string' || !m.slug.trim()) err.push(`${p}.slug`)
  if (!m.title || typeof m.title !== 'string' || !m.title.trim()) err.push(`${p}.title`)
  if (m.artist_name === undefined || m.artist_name === null) err.push(`${p}.artist_name`)
  if (typeof m.description_en !== 'string') err.push(`${p}.description_en`)
  if (typeof m.description_es !== 'string') err.push(`${p}.description_es`)
  if (!MIX_TYPES.has(m.mix_type)) err.push(`${p}.mix_type inválido`)
  if (!PLATFORMS.has(m.platform)) err.push(`${p}.platform inválido`)
  if (m.video_url && typeof m.video_url === 'string' && !m.video_url.startsWith('https://'))
    err.push(`${p}.video_url`)
  if (m.embed_url && typeof m.embed_url === 'string' && !m.embed_url.startsWith('https://'))
    err.push(`${p}.embed_url`)
  return err
}

function normalizeMix(m) {
  return {
    slug: String(m.slug).trim(),
    title: String(m.title).trim(),
    artist_name: m.artist_name == null ? '' : String(m.artist_name).trim(),
    description_en: String(m.description_en ?? ''),
    description_es: String(m.description_es ?? ''),
    mix_type: m.mix_type,
    year: typeof m.year === 'number' ? m.year : m.year == null ? null : Number(m.year),
    duration_minutes:
      typeof m.duration_minutes === 'number'
        ? m.duration_minutes
        : m.duration_minutes == null
          ? null
          : Number(m.duration_minutes),
    platform: m.platform,
    video_url:
      typeof m.video_url === 'string' && m.video_url.startsWith('https://') ? m.video_url.trim() : null,
    embed_url:
      typeof m.embed_url === 'string' && m.embed_url.startsWith('https://') ? m.embed_url.trim() : null,
    is_featured: Boolean(m.is_featured),
    image_url:
      typeof m.image_url === 'string' && m.image_url.startsWith('https://') ? m.image_url.trim() : null,
  }
}

async function main() {
  loadEnvLocal()
  const jsonPath = process.argv[2]
  if (!jsonPath) {
    console.error('Uso: node scripts/actualizar-mixes.mjs <ruta-al-json>')
    console.error('  Ej: node scripts/actualizar-mixes.mjs data/mixes/raveart-festival-sessions-2024-2025.json')
    process.exit(1)
  }

  const fullPath = resolve(ROOT, jsonPath)
  if (!existsSync(fullPath)) {
    console.error(`Archivo no encontrado: ${fullPath}`)
    process.exit(1)
  }

  let parsed
  try {
    parsed = JSON.parse(readFileSync(fullPath, 'utf8'))
  } catch (e) {
    console.error(`Error parseando JSON: ${e.message}`)
    process.exit(1)
  }

  const rowsRaw = Array.isArray(parsed) ? parsed : parsed?.mixes
  if (!Array.isArray(rowsRaw) || rowsRaw.length === 0) {
    console.error('El JSON debe ser un array de mixes o { "mixes": [ … ] } con al menos un elemento.')
    process.exit(1)
  }

  const rows = rowsRaw.map(normalizeMix)
  const allErr = []
  rows.forEach((m, i) => {
    validateMixRow(m, i).forEach((e) => allErr.push(e))
  })
  if (allErr.length) {
    console.error('Errores de validación:')
    allErr.forEach((e) => console.error(`  - ${e}`))
    process.exit(1)
  }

  const creds = supabaseApiCredentials()
  if (!creds) {
    console.error(UPSERT_CREDENTIALS_HINT)
    process.exit(1)
  }

  const supabase = createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const { data, error } = await supabase.from('mixes').upsert(rows, { onConflict: 'slug' }).select('id, slug, title')

  if (error) {
    console.error(error.message)
    process.exit(1)
  }

  console.log('UPSERT mixes OK:', (data || []).length)
  for (const r of data || []) {
    console.log(`  ${r.slug} → ${r.title}`)
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
