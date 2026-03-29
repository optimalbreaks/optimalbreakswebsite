/**
 * Ejecuta migraciones SQL contra Postgres (Supabase) usando DATABASE_URL.
 *
 * Uso:
 *   npm run db:seed              → solo 002_seed_data.sql (requiere esquema ya aplicado)
 *   npm run db:migrate           → todos los *.sql en supabase/migrations (orden alfabético)
 *   node scripts/seed-supabase.mjs --files 010_....sql 011_....sql  → solo esos archivos (BD ya existente)
 *   npm run db:verify            → cuenta filas vía API (NEXT_PUBLIC_* + anon; no usa Postgres directo)
 *
 * URI de Postgres, en este orden:
 *   1) DATABASE_URL, SUPABASE_DB_URL, POSTGRES_URL, SUPABASE_POSTGRES_URL, POSTGRES_PRISMA_URL
 *   2) Si no hay URI: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_DB_PASSWORD (o POSTGRES_PASSWORD)
 *      → conexión directa db.<ref>.supabase.co:5432 (usuario postgres).
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')

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

const DB_URI_KEYS = [
  'DATABASE_URL',
  'SUPABASE_DB_URL',
  'POSTGRES_URL',
  'SUPABASE_POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
]

/** Ref del proyecto desde https://xxxx.supabase.co (no sirve con dominio custom). */
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
  const ref = supabaseRefFromPublicUrl(
    process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  )
  if (!password || !ref) return ''
  const enc = encodeURIComponent(password)
  return `postgresql://postgres:${enc}@db.${ref}.supabase.co:5432/postgres`
}

function connectionOptions() {
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
  if (!connectionString) {
    console.error(
      'No hay forma de conectar a Postgres. Elige UNA de estas opciones en .env.local:\n\n' +
        'A) Pega la URI del panel (línea sin # al inicio):\n' +
        '   DATABASE_URL=postgresql://...\n' +
        '   (Supabase → Project Settings → Database → Connection string → URI)\n\n' +
        'B) Solo la contraseña de la base de datos (la del proyecto, no anon/service_role):\n' +
        '   SUPABASE_DB_PASSWORD=...\n' +
        '   (y mantén NEXT_PUBLIC_SUPABASE_URL=https://TU_REF.supabase.co)\n\n' +
        'Otros nombres para la URI completa: ' +
        DB_URI_KEYS.join(', ') +
        '.'
    )
    process.exit(1)
  }
  const hostMatch = connectionString.match(/@([^:/]+)/)
  const host = hostMatch ? hostMatch[1] : ''
  const needsSupabaseSsl =
    host.includes('supabase.co') || host.includes('supabase.com')
  const sslOff = process.env.DATABASE_SSL === '0'
  const ssl =
    sslOff ? false : needsSupabaseSsl ? { rejectUnauthorized: false } : undefined
  return { connectionString, ssl }
}

/** Nombres de archivo tras --files (solo basenames en supabase/migrations). */
function listMigrationFilesFromArgs(argv) {
  const i = argv.indexOf('--files')
  if (i === -1) return null
  const names = []
  for (let j = i + 1; j < argv.length; j++) {
    if (argv[j].startsWith('--')) break
    names.push(argv[j])
  }
  if (names.length === 0) {
    console.error(
      'Uso: node scripts/seed-supabase.mjs --files 010_uno.sql 011_otro.sql',
    )
    process.exit(1)
  }
  if (!existsSync(MIGRATIONS_DIR)) {
    console.error('No existe:', MIGRATIONS_DIR)
    process.exit(1)
  }
  for (const name of names) {
    if (
      name.includes('..') ||
      name.includes('/') ||
      name.includes('\\') ||
      !name.endsWith('.sql')
    ) {
      console.error('Nombre de migración no válido:', name)
      process.exit(1)
    }
    const full = join(MIGRATIONS_DIR, name)
    if (!existsSync(full)) {
      console.error('No existe el archivo en migrations:', name)
      process.exit(1)
    }
  }
  return names
}

function listMigrationFiles(all) {
  if (!existsSync(MIGRATIONS_DIR)) {
    console.error('No existe:', MIGRATIONS_DIR)
    process.exit(1)
  }
  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith('.sql'))
    .sort()
  if (!all) {
    const seed = files.find((f) => f === '002_seed_data.sql')
    if (!seed) {
      console.error('No se encontró 002_seed_data.sql en', MIGRATIONS_DIR)
      process.exit(1)
    }
    return [seed]
  }
  if (files.length === 0) {
    console.error('No hay archivos .sql en', MIGRATIONS_DIR)
    process.exit(1)
  }
  return files
}

const EXPECTED_COUNTS = {
  artists: 12,
  labels: 8,
  events: 6,
  scenes: 6,
  blog_posts: 3,
  mixes: 6,
  history_entries: 7,
}

async function verifyViaAnonApi() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  if (!url || !key) {
    console.error(
      'db:verify necesita NEXT_PUBLIC_SUPABASE_URL y (NEXT_PUBLIC_SUPABASE_ANON_KEY o NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY) en .env.local'
    )
    process.exit(1)
  }
  const { createClient } = await import('@supabase/supabase-js')
  const sb = createClient(url, key)
  let ok = true
  for (const [table, expected] of Object.entries(EXPECTED_COUNTS)) {
    const { count, error } = await sb
      .from(table)
      .select('*', { count: 'exact', head: true })
    if (error) {
      console.log(`${table}: ERROR — ${error.message}`)
      ok = false
      continue
    }
    const match = count === expected
    console.log(
      `${table}: ${count} filas` +
        (match ? ' ✓' : ` (esperado ${expected}) ✗`)
    )
    if (!match) ok = false
  }
  const { data: chem, error: e2 } = await sb
    .from('artists')
    .select('slug')
    .eq('slug', 'the-chemical-brothers')
    .maybeSingle()
  if (e2) {
    console.log('slug the-chemical-brothers: ERROR —', e2.message)
    ok = false
  } else if (chem) {
    console.log('slug the-chemical-brothers: presente ✓')
  } else {
    console.log('slug the-chemical-brothers: no encontrado ✗')
    ok = false
  }
  process.exit(ok ? 0 : 1)
}

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  if (args.includes('--verify')) {
    await verifyViaAnonApi()
    return
  }
  const explicitFiles = listMigrationFilesFromArgs(args)
  const runAll = args.includes('--all') || args.includes('--migrate')

  if (explicitFiles) {
    console.log('Modo --files: ejecutando solo', explicitFiles.join(', '))
  } else if (runAll) {
    console.warn(
      'Modo --all: re-ejecutar 001/003 puede fallar si el esquema ya existe. Úsalo en proyectos nuevos o a sabiendas.',
    )
  }

  const files = explicitFiles || listMigrationFiles(runAll)
  const { connectionString, ssl } = connectionOptions()
  const client = new pg.Client({ connectionString, ssl })

  await client.connect()
  try {
    for (const name of files) {
      const path = join(MIGRATIONS_DIR, name)
      const sql = readFileSync(path, 'utf8')
      console.log('Ejecutando:', name)
      await client.query(sql)
      console.log('  OK')
    }
    console.log('Listo.')
  } finally {
    await client.end()
  }
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
