/**
 * Quita todos los picks de New Releases (`chart_featured_tracks`) de unas **`chart_editions.week_date`**.
 *
 * NO toca **`chart_tracks`** (los 40 de «40 Breaks Vitales») ni otros bloques sobre la misma edición:
 * mismo `chart_edition_id` que el chart semanal: solo borra filas donde `featured` vive junto al 40.
 *
 * Si, tras borrar NR, esa edición no tiene **`chart_tracks`** ni **`chart_vinyl_tracks`**, opcionalmente
 * borra la fila **`chart_editions`** huérfana (`--also-drop-empty-editions`, default sí).
 *
 *   node scripts/purge-chart-featured-by-week-date.mjs 2026-02-02 2026-02-09 …
 *   node scripts/purge-chart-featured-by-week-date.mjs 2026-02-02 --dry-run
 *
 * Red corporativa TLS: igual que otros scripts Supabase desde Node —
 * `node --use-system-ca scripts/purge-chart-featured-by-week-date.mjs …`
 * Credenciales: `.env.local` (`NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`/`SUPABASE_SECRET_KEY`).
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

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

function loadEnv() {
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

async function editionChildCount(supabase, editionId, table) {
  const { error, count } = await supabase
    .from(table)
    .select('id', { count: 'exact', head: true })
    .eq('chart_edition_id', editionId)
  if (error) throw new Error(`${table}: ${error.message}`)
  return count ?? 0
}

async function main() {
  loadEnv()

  const dry = process.argv.includes('--dry-run')
  const AlsoDropEdition = !process.argv.includes('--keep-empty-editions')
  const weekDates = [...new Set(process.argv.slice(2).filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)))].sort()

  if (!weekDates.length) {
    console.error(
      'Uso: node scripts/purge-chart-featured-by-week-date.mjs YYYY-MM-DD […] [--dry-run] [--keep-empty-editions]',
    )
    process.exit(2)
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL y service/secret Supabase.')

  const supabase = createClient(url, key, { auth: { persistSession: false } })

  console.log(`${dry ? 'DRY-RUN ' : ''}Purgando New Releases (${weekDates.length} lunes):`)
  for (const wd of weekDates) console.log(`  · ${wd}`)

  for (const wd of weekDates) {
    const { data: edition, error: e0 } = await supabase
      .from('chart_editions')
      .select('id, week_date, title')
      .eq('week_date', wd)
      .maybeSingle()

    if (e0) throw new Error(`chart_editions(${wd}): ${e0.message}`)
    if (!edition?.id) {
      console.warn(`  ↳ ${wd}: sin fila chart_editions (omitido).`)
      continue
    }

    const { data: doomed, error: eList } = await supabase
      .from('chart_featured_tracks')
      .select('id')
      .eq('chart_edition_id', edition.id)

    if (eList) throw new Error(`list featured ${wd}: ${eList.message}`)
    const nFeatured = doomed?.length ?? 0

    if (dry) {
      console.log(`  ↳ ${wd}: habría borrado ${nFeatured} filas chart_featured_tracks (${edition.title || edition.id}).`)
      continue
    }

    if (nFeatured > 0) {
      const { error: ef } = await supabase
        .from('chart_featured_tracks')
        .delete()
        .eq('chart_edition_id', edition.id)
      if (ef) throw new Error(`delete featured ${wd}: ${ef.message}`)
    }

    console.log(
      `  ↳ ${wd}: borrados ${nFeatured} chart_featured_tracks (${edition.title || edition.id}).`,
    )

    if (!AlsoDropEdition) continue

    const n40 = await editionChildCount(supabase, edition.id, 'chart_tracks')
    const nVinyl = await editionChildCount(supabase, edition.id, 'chart_vinyl_tracks')

    if (n40 > 0 || nVinyl > 0) {
      console.log(
        `     Edición conservada (${n40} en chart_tracks · ${nVinyl} en chart_vinyl_tracks — el 40 y vinilo siguen igual).`,
      )
      continue
    }

    const { error: eDel } = await supabase.from('chart_editions').delete().eq('id', edition.id)
    if (eDel) throw new Error(`delete chart_editions ${wd}: ${eDel.message}`)
    console.log(`     Sin 40 ni vinilo → chart_editions eliminada.`)
  }
}

main().catch((err) => {
  console.error(err.message || err)
  process.exit(1)
})
