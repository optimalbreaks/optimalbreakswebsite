/**
 * OPTIMAL BREAKS — Picks «New releases» por semana (chart_featured_tracks)
 *
 * Solo lee el JSON que pases: no consulta Beatport, Bandcamp ni ninguna otra fuente.
 *
 *   node scripts/chart-featured-upsert.mjs data/charts/picks/2026-03-30.json
 *
 * Formato JSON:
 * {
 *   "week_date": "2026-03-30",
 *   "picks": [
 *     {
 *       "sort_order": 1,
 *       "title": "Título del tema o release",
 *       "artists": [{ "name": "Artista", "url": "https://…" }],
 *       "label": "Sello",
 *       "platform": "beatport",
 *       "link_url": "https://…",
 *       "link_label": "",
 *       "artwork_url": "https://…",
 *       "release_year": 2026,
 *       "note_en": "",
 *       "note_es": ""
 *     }
 *   ]
 * }
 *
 * platform: beatport | bandcamp | soundcloud | other (solo afecta al texto del botón si link_label vacío)
 *
 * Requiere .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * La edición chart_editions.week_date debe existir ya (publicar antes el chart semanal si aplica).
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

loadEnv()

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

async function main() {
  const rel = process.argv[2]
  if (!rel) {
    console.error('Uso: node scripts/chart-featured-upsert.mjs <ruta-desde-raíz-repo.json>')
    console.error('  Ej: node scripts/chart-featured-upsert.mjs data/charts/picks/2026-03-30.json')
    process.exit(1)
  }

  const path = resolve(ROOT, rel)
  if (!existsSync(path)) {
    console.error('No existe:', path)
    process.exit(1)
  }

  let data
  try {
    data = JSON.parse(readFileSync(path, 'utf8'))
  } catch (e) {
    console.error('JSON inválido:', e.message)
    process.exit(1)
  }

  const weekDate = data.week_date
  if (!weekDate || typeof weekDate !== 'string') {
    console.error('Falta week_date (YYYY-MM-DD)')
    process.exit(1)
  }

  const picks = Array.isArray(data.picks) ? data.picks : []
  const supabase = requireSupabase()

  const { data: edition, error: edErr } = await supabase
    .from('chart_editions')
    .select('id')
    .eq('week_date', weekDate)
    .maybeSingle()

  if (edErr) throw new Error(`chart_editions: ${edErr.message}`)
  if (!edition?.id) {
    console.error(`No hay chart_editions con week_date=${weekDate}. Crea/publica primero esa semana.`)
    process.exit(1)
  }

  const editionId = edition.id

  const { error: delErr } = await supabase
    .from('chart_featured_tracks')
    .delete()
    .eq('chart_edition_id', editionId)
  if (delErr) throw new Error(`delete chart_featured_tracks: ${delErr.message}`)

  if (picks.length === 0) {
    console.log(`  ↳ Semana ${weekDate}: lista vacía (picks borrados).`)
    return
  }

  const rows = picks.map((p, i) => {
    const sort = Number(p.sort_order)
    if (!Number.isFinite(sort) || sort < 1) {
      throw new Error(`pick #${i + 1}: sort_order inválido`)
    }
    const title = (p.title || '').trim()
    if (!title) throw new Error(`pick sort_order=${sort}: falta title`)
    const link_url = (p.link_url || '').trim()
    if (!link_url) throw new Error(`pick "${title}": falta link_url`)

    return {
      chart_edition_id: editionId,
      sort_order: sort,
      title,
      artists: Array.isArray(p.artists) ? p.artists : [],
      label: (p.label || '').trim(),
      platform: (p.platform || 'other').trim().toLowerCase() || 'other',
      link_url,
      link_label: (p.link_label || '').trim(),
      artwork_url: (p.artwork_url || '').trim() || null,
      release_year:
        p.release_year != null && Number.isFinite(Number(p.release_year))
          ? Number(p.release_year)
          : null,
      note_en: (p.note_en || '').trim(),
      note_es: (p.note_es || '').trim(),
    }
  })

  const { error: insErr } = await supabase.from('chart_featured_tracks').insert(rows)
  if (insErr) throw new Error(`insert chart_featured_tracks: ${insErr.message}`)

  console.log(`  ↳ Semana ${weekDate}: ${rows.length} picks guardados.`)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
