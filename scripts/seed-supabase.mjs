/**
 * Ejecuta migraciones SQL contra Postgres (Supabase) usando DATABASE_URL.
 *
 * Índice agente: scripts/guia-base-datos.mjs → run seed | run migrate | run verify | run migrate-files …
 *
 * Uso:
 *   npm run db:seed              → solo 002_seed_data.sql (requiere esquema ya aplicado)
 *   npm run db:migrate           → todos los *.sql en supabase/migrations (orden alfabético)
 *   node scripts/seed-supabase.mjs --files 010_....sql 011_....sql  → solo esos archivos (BD ya existente)
 *   npm run db:verify            → cuenta filas vía API (NEXT_PUBLIC_* + anon; no usa Postgres directo)
 *   node scripts/seed-supabase.mjs --check-user-events → Postgres: tablas favorite_events / event_attendance + RPC conteo
 *
 * URI de Postgres, en este orden (primera no vacía gana):
 *   1) DATABASE_URL, DIRECT_URL (Prisma), SUPABASE_DB_URL, POSTGRES_URL, POSTGRES_URL_NON_POOLING,
 *      SUPABASE_POSTGRES_URL, POSTGRES_PRISMA_URL, SUPABASE_DATABASE_URL
 *   2) Si no hay URI: NEXT_PUBLIC_SUPABASE_URL + contraseña de la base (no es la anon/service_role):
 *      SUPABASE_DB_PASSWORD, POSTGRES_PASSWORD, PGPASSWORD, DATABASE_PASSWORD
 *      → postgresql://postgres:...@db.<ref>.supabase.co:5432/postgres
 *
 * Variables: se fusionan .env y .env.local (local gana; no pisan variables ya definidas en el shell).
 *
 * Nota: SUPABASE_SERVICE_ROLE_KEY / SUPABASE_SECRET_KEY sirven para la API REST (otros scripts),
 * pero no pueden abrir una sesión libpq/pg; para migraciones .sql hace falta URI o contraseña de BD.
 */

import { readFileSync, existsSync, readdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import pg from 'pg'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const MIGRATIONS_DIR = join(ROOT, 'supabase', 'migrations')

/** Parsea KEY=VAL por líneas; devuelve mapa (sin mutar process.env). */
function parseEnvText(text) {
  const out = {}
  let t0 = text
  if (t0.charCodeAt(0) === 0xfeff) t0 = t0.slice(1)
  for (const line of t0.split('\n')) {
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
    out[k] = v
  }
  return out
}

/** Carga .env y .env.local como Next: mismo nombre → gana .env.local; el shell sigue mandando. */
function loadEnvLocal() {
  const base = existsSync(join(ROOT, '.env'))
    ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8'))
    : {}
  const local = existsSync(join(ROOT, '.env.local'))
    ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8'))
    : {}
  const merged = { ...base, ...local }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const DB_URI_KEYS = [
  'DATABASE_URL',
  'DIRECT_URL',
  'SUPABASE_DB_URL',
  'POSTGRES_URL',
  'POSTGRES_URL_NON_POOLING',
  'SUPABASE_POSTGRES_URL',
  'POSTGRES_PRISMA_URL',
  'SUPABASE_DATABASE_URL',
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
    process.env.PGPASSWORD ||
    process.env.DATABASE_PASSWORD ||
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
    const hasUrl = !!supabaseRefFromPublicUrl(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
    )
    const serviceKey = (
      process.env.SUPABASE_SERVICE_ROLE_KEY ||
      process.env.SUPABASE_SECRET_KEY ||
      ''
    )
      .toString()
      .trim()
    const hasService = !!serviceKey
    console.error(
      'No hay forma de conectar a Postgres para ejecutar SQL.\n\n' +
        'A) URI completa (recomendado), en .env o .env.local, sin comentar con #:\n' +
        '   DATABASE_URL=postgresql://postgres.[ref]:[password]@...\n' +
        '   Supabase → Project Settings → Database → Connection string → URI\n' +
        '   Alias reconocidos: ' +
        DB_URI_KEYS.join(', ') +
        '.\n\n' +
        'B) Contraseña de la base de datos (Settings → Database; NO es anon ni service_role):\n' +
        '   SUPABASE_DB_PASSWORD=...   (y NEXT_PUBLIC_SUPABASE_URL=https://TU_REF.supabase.co)\n' +
        '   También: POSTGRES_PASSWORD, PGPASSWORD, DATABASE_PASSWORD.\n\n' +
        (hasService && hasUrl
          ? 'Tienes service_role + URL: eso sirve para scripts vía API (p. ej. actualizar-artista), ' +
            'pero las migraciones .sql usan el cliente Postgres y necesitan A) o B).\n\n'
          : '') +
        'Puedes definir DATABASE_URL solo en .env y el resto en .env.local: ambos se cargan.',
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

/**
 * Postgres directo: tablas favorite_events, event_attendance, RPC event_engaged_user_count.
 * Usa la misma conexión que migrate (.env + .env.local → DATABASE_URL o SUPABASE_DB_PASSWORD + URL).
 * @returns {Promise<number>} 0 si todo OK, 1 si falta algo
 */
async function checkUserEventsSchema() {
  console.log(
    'Comprobación usuario/eventos en Postgres (lee .env + .env.local, sin imprimir secretos)…\n',
  )
  const { connectionString, ssl } = connectionOptions()
  const client = new pg.Client({ connectionString, ssl })
  await client.connect()
  let exitCode = 0
  try {
    const { rows: tables } = await client.query(
      `select table_name from information_schema.tables
       where table_schema = 'public'
         and table_name in ('favorite_events', 'event_attendance', 'event_ratings')
       order by table_name`,
    )
    const have = new Set(tables.map((r) => r.table_name))
    for (const t of ['event_attendance', 'event_ratings', 'favorite_events']) {
      if (have.has(t)) {
        console.log(`Tabla public.${t}: OK`)
      } else {
        console.log(
          `Tabla public.${t}: FALTA — aplica migraciones (003_user_system.sql y 005_favorite_events.sql)`,
        )
        exitCode = 1
      }
    }

    const { rows: cols } = await client.query(
      `select column_name from information_schema.columns
       where table_schema = 'public' and table_name = 'event_attendance'
       order by ordinal_position`,
    )
    if (cols.length) {
      const names = cols.map((c) => c.column_name).join(', ')
      console.log(`Columnas event_attendance: ${names}`)
      if (!cols.some((c) => c.column_name === 'status')) {
        console.log('  Advertencia: falta columna status')
        exitCode = 1
      }
    }

    const { rows: fn } = await client.query(
      `select p.proname from pg_proc p
       join pg_namespace n on p.pronamespace = n.oid
       where n.nspname = 'public' and p.proname = 'event_engaged_user_count'`,
    )
    if (fn.length) {
      console.log('Función public.event_engaged_user_count(uuid): OK')
    } else {
      console.log(
        'Función public.event_engaged_user_count(uuid): FALTA — aplica 005_favorite_events.sql',
      )
      exitCode = 1
    }

    if (have.has('event_attendance')) {
      const { rows } = await client.query(
        'select count(*)::int as n from public.event_attendance',
      )
      console.log(`Filas event_attendance: ${rows[0]?.n ?? 0}`)
    }
    if (have.has('favorite_events')) {
      const { rows } = await client.query(
        'select count(*)::int as n from public.favorite_events',
      )
      console.log(`Filas favorite_events: ${rows[0]?.n ?? 0}`)
    }

    console.log('')
    return exitCode
  } finally {
    await client.end()
  }
}

async function main() {
  loadEnvLocal()
  const args = process.argv.slice(2)
  if (args.includes('--verify')) {
    await verifyViaAnonApi()
    return
  }
  if (args.includes('--check-user-events')) {
    const code = await checkUserEventsSchema()
    process.exit(code)
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
