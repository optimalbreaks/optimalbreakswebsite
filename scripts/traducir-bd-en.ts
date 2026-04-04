/**
 * OPTIMAL BREAKS — Traducir contenido ES → EN (inglés neutro) vía OpenAI.
 *
 *   npx tsx scripts/traducir-bd-en.ts scenes [--slug SLUG] [--force] [--dry-run] [--limit N]
 *
 * Credenciales: OPENAI_API_KEY, NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { translateSceneRowEsToEn } from '../src/lib/translate-es-en-openai'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function parseEnvText(text: string) {
  const out: Record<string, string> = {}
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

function loadEnv() {
  const base = existsSync(join(ROOT, '.env')) ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8')) : {}
  const local = existsSync(join(ROOT, '.env.local'))
    ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8'))
    : {}
  const merged = { ...base, ...local }
  for (const [k, v] of Object.entries(merged)) {
    if (process.env[k] === undefined) process.env[k] = v
  }
}

function requireSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
  const key = (
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim()
  if (!url || !key) {
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

type Row = {
  id: string
  slug: string
  name_es: string | null
  name_en: string | null
  description_es: string | null
  description_en: string | null
}

function parseArgs(argv: string[]) {
  const out = {
    table: 'scenes' as const,
    slug: null as string | null,
    force: false,
    dryRun: false,
    limit: null as number | null,
  }
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]
    if (a === 'scenes') out.table = 'scenes'
    else if (a === '--force') out.force = true
    else if (a === '--dry-run') out.dryRun = true
    else if (a === '--slug' && argv[i + 1]) {
      out.slug = argv[++i].trim()
    } else if (a === '--limit' && argv[i + 1]) {
      out.limit = Math.max(1, parseInt(argv[++i], 10) || 0)
    }
  }
  return out
}

function needsTranslation(row: Row, force: boolean) {
  if (force) return true
  const nameEs = (row.name_es ?? '').trim()
  const descEs = (row.description_es ?? '').trim()
  if (!nameEs && !descEs) return false
  const nameEn = (row.name_en ?? '').trim()
  const descEn = (row.description_en ?? '').trim()
  const nameMissing = Boolean(nameEs && !nameEn)
  const descMissing = Boolean(descEs && !descEn)
  return nameMissing || descMissing
}

async function runScenes(
  sb: ReturnType<typeof requireSupabase>,
  opts: ReturnType<typeof parseArgs>,
) {
  let q = sb.from('scenes').select('id, slug, name_es, name_en, description_es, description_en').order('slug')
  if (opts.slug) q = q.eq('slug', opts.slug)
  const { data: rows, error } = await q
  if (error) throw new Error(error.message)
  let list = (rows ?? []) as Row[]
  if (opts.limit) list = list.slice(0, opts.limit)

  let done = 0
  let skipped = 0

  for (const row of list) {
    if (!needsTranslation(row, opts.force)) {
      console.log(`[skip] ${row.slug} — EN ya relleno (usa --force para sobrescribir)`)
      skipped++
      continue
    }

    const nameEs = (row.name_es ?? '').trim()
    const descEs = (row.description_es ?? '').trim()
    if (!nameEs && !descEs) {
      console.log(`[skip] ${row.slug} — sin texto ES`)
      skipped++
      continue
    }

    console.log(`[…] ${row.slug} — traduciendo…`)
    const { name_en, description_en } = await translateSceneRowEsToEn({
      name_es: nameEs,
      description_es: descEs,
    })

    if (opts.dryRun) {
      console.log(
        `[dry-run] ${row.slug}\n  name_en: ${name_en.slice(0, 120)}${name_en.length > 120 ? '…' : ''}\n  description_en: ${description_en.length} chars`,
      )
      done++
      continue
    }

    const patch: { name_en?: string; description_en?: string } = {}
    if (opts.force || !(row.name_en ?? '').trim()) patch.name_en = name_en
    if (opts.force || !(row.description_en ?? '').trim()) patch.description_en = description_en

    const { error: upErr } = await sb.from('scenes').update(patch).eq('id', row.id)
    if (upErr) {
      console.error(`[error] ${row.slug}:`, upErr.message)
      continue
    }
    console.log(`[ok] ${row.slug}`)
    done++
  }

  console.log(`\nListo: ${done} procesadas, ${skipped} omitidas (sin necesidad o vacías).`)
}

async function main() {
  loadEnv()
  const argv = process.argv.slice(2)
  if (argv.includes('-h') || argv.includes('--help') || argv.length === 0) {
    console.log(`
Uso:
  npx tsx scripts/traducir-bd-en.ts scenes [--slug SLUG] [--force] [--dry-run] [--limit N]

  --force      Sobrescribe name_en / description_en aunque ya existan
  --dry-run    Solo muestra resultado por consola (no escribe en Supabase)
  --limit N    Máximo N filas (orden por slug)

Ejemplos:
  npx tsx scripts/traducir-bd-en.ts scenes --dry-run --limit 1
  npx tsx scripts/traducir-bd-en.ts scenes --slug andalusian-breakbeat
  npm run db:translate:scenes -- --force
`)
    process.exit(0)
  }

  const opts = parseArgs(argv)
  if (opts.table !== 'scenes') {
    console.error('Solo "scenes" está implementado por ahora.')
    process.exit(1)
  }

  const sb = requireSupabase()
  await runScenes(sb, opts)
}

main().catch((e: unknown) => {
  console.error(e instanceof Error ? e.message : e)
  process.exit(1)
})
