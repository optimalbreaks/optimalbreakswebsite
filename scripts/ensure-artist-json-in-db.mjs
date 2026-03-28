/**
 * Comprueba que la fila en Supabase coincide con un JSON local (bios y real_name).
 * Si no, ejecuta actualizar-artista.mjs (mismo .env.local).
 *
 *   node scripts/ensure-artist-json-in-db.mjs data/artists/deekline.json
 */

import { readFileSync, existsSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { spawnSync } from 'child_process'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function loadEnvLocal() {
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

function supabaseRef(url) {
  const m = String(url || '').match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i)
  return m ? m[1] : '(url no reconocida)'
}

function preview(s, n = 140) {
  if (!s) return '(vacío)'
  const t = String(s).replace(/\s+/g, ' ').trim()
  return t.length <= n ? t : `${t.slice(0, n)}…`
}

async function main() {
  loadEnvLocal()
  const jsonPath = resolve(ROOT, process.argv[2] || '')
  if (!jsonPath || !existsSync(jsonPath)) {
    console.error('Uso: node scripts/ensure-artist-json-in-db.mjs data/artists/<slug>.json')
    process.exit(1)
  }

  const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim()
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim()
  if (!url || !key) {
    console.error(
      'Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY) en .env.local',
    )
    process.exit(1)
  }

  const raw = JSON.parse(readFileSync(jsonPath, 'utf8'))
  const slug = raw.slug
  if (!slug) {
    console.error('El JSON no tiene slug')
    process.exit(1)
  }

  console.log(`[verify] Proyecto Supabase: ${supabaseRef(url)}`)
  console.log(`[verify] Slug: ${slug}`)

  const sb = createClient(url, key, { auth: { persistSession: false } })
  const { data: row, error } = await sb
    .from('artists')
    .select('bio_en, bio_es, real_name, name_display')
    .eq('slug', slug)
    .maybeSingle()

  if (error) {
    console.error('[verify] Error lectura:', error.message)
    process.exit(1)
  }

  if (!row) {
    console.log('[verify] No existe fila; sincronizando…')
    const r = spawnSync(process.execPath, [join(__dirname, 'actualizar-artista.mjs'), jsonPath], {
      cwd: ROOT,
      stdio: 'inherit',
      env: process.env,
    })
    process.exit(r.status ?? 1)
  }

  const sameBioEs = (row.bio_es || '') === (raw.bio_es || '')
  const sameBioEn = (row.bio_en || '') === (raw.bio_en || '')
  const sameReal = (row.real_name || '') === (raw.real_name || '')

  console.log('[verify] BD bio_es (inicio):', preview(row.bio_es))
  console.log('[verify] JSON bio_es (inicio):', preview(raw.bio_es))
  console.log(
    `[verify] Coincide bio_es: ${sameBioEs} | bio_en: ${sameBioEn} | real_name: ${sameReal}`,
  )

  if (sameBioEs && sameBioEn && sameReal) {
    console.log('[verify] OK: la base ya coincide con el JSON.')
    return
  }

  console.log('[verify] Desajuste detectado → ejecutando upsert…')
  const r = spawnSync(process.execPath, [join(__dirname, 'actualizar-artista.mjs'), jsonPath], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  if (r.status !== 0) process.exit(r.status ?? 1)

  const { data: row2, error: e2 } = await sb
    .from('artists')
    .select('bio_es')
    .eq('slug', slug)
    .single()
  if (e2) {
    console.error('[verify] Relectura error:', e2.message)
    process.exit(1)
  }
  const ok = (row2.bio_es || '') === (raw.bio_es || '')
  console.log('[verify] Tras upsert, bio_es coincide:', ok)
  console.log('[verify] BD bio_es (inicio):', preview(row2.bio_es))
  if (!ok) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
