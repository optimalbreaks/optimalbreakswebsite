/**
 * OPTIMAL BREAKS — Retro Vinyl Picks semanal (chart_vinyl_tracks)
 *
 * Solo lee el JSON que pases: no consulta Discogs ni YouTube.
 *
 *   node scripts/chart-vinyl-upsert.mjs data/charts/vinyl/2026-04-06.json
 *   node scripts/chart-vinyl-upsert.mjs data/charts/vinyl/2026-04-20.json --create-edition-if-missing
 *     (crea chart_editions publicada mínima si aún no existe; p. ej. vinilo antes del chart 40)
 *
 * Formato JSON:
 * {
 *   "week_date": "2026-04-06",
 *   "vinyl": [
 *     {
 *       "sort_order": 1,
 *       "title": "Crazy",
 *       "mix_name": "",
 *       "artists": [{ "name": "The Breakfastaz" }],
 *       "label": "Cyberfunk Records",
 *       "catalog_number": "CFUNK012",
 *       "year": 2004,
 *       "format": "12\"",
 *       "discogs_url": "https://www.discogs.com/release/...",
 *       "youtube_url": "https://www.youtube.com/watch?v=...",
 *       "note_en": "",
 *       "note_es": ""
 *     }
 *   ]
 * }
 *
 * Requiere .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * La edición chart_editions.week_date debe existir ya.
 * Cada fila necesita al menos discogs_url o youtube_url (curación manual por enlace YouTube OK).
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import { dedupeVinylRows, vinylIdentityKey } from './lib/chart-vinyl-track-key.mjs'

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
  const createEditionIfMissing = process.argv.includes('--create-edition-if-missing')
  const rel = process.argv[2]
  if (!rel || rel.startsWith('--')) {
    console.error('Uso: node scripts/chart-vinyl-upsert.mjs <ruta-json> [--create-edition-if-missing]')
    console.error('  Ej: node scripts/chart-vinyl-upsert.mjs data/charts/vinyl/2026-04-06.json')
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

  const vinyl = dedupeVinylRows(Array.isArray(data.vinyl) ? data.vinyl : [])
  const supabase = requireSupabase()

  const { data: editionRow, error: edErr } = await supabase
    .from('chart_editions')
    .select('id')
    .eq('week_date', weekDate)
    .maybeSingle()

  if (edErr) throw new Error(`chart_editions: ${edErr.message}`)

  let editionId = editionRow?.id
  if (!editionId) {
    if (!createEditionIfMissing) {
      console.error(`No hay chart_editions con week_date=${weekDate}. Crea/publica primero esa semana.`)
      process.exit(1)
    }
    const title = `40 Breaks Vitales — ${weekDate}`
    const { data: inserted, error: insEdErr } = await supabase
      .from('chart_editions')
      .insert({
        week_date: weekDate,
        title,
        description_en: `The 40 breakbeat tracks defining the week of ${weekDate}.`,
        description_es: `Los 40 temas de breakbeat que definen la semana del ${weekDate}.`,
        sources: [],
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insEdErr) throw new Error(`Insert chart_edition: ${insEdErr.message}`)
    editionId = inserted.id
    console.log(`  ↳ Creada chart_editions para week_date=${weekDate} (edición vacía hasta publicar el 40).`)
  }

  // Sync estable por YouTube (o título si no hay vídeo). NO borrar+insertar
  // la misma canción: eso regenera UUID y orfana saved_chart_tracks.
  const { data: existingRows, error: exErr } = await supabase
    .from('chart_vinyl_tracks')
    .select('id, discogs_url, youtube_url, title, mix_name, artists')
    .eq('chart_edition_id', editionId)
  if (exErr) throw new Error(`load chart_vinyl_tracks: ${exErr.message}`)

  const existingByTrackKey = new Map()
  for (const r of existingRows || []) {
    const k = vinylIdentityKey(r)
    if (k && !existingByTrackKey.has(k)) existingByTrackKey.set(k, r.id)
  }

  if (vinyl.length === 0) {
    if ((existingRows || []).length > 0) {
      const { error: delAllErr } = await supabase
        .from('chart_vinyl_tracks')
        .delete()
        .eq('chart_edition_id', editionId)
      if (delAllErr) throw new Error(`delete chart_vinyl_tracks (semana vacía): ${delAllErr.message}`)
    }
    console.log(`  ↳ Semana ${weekDate}: lista vacía (vinyl borrados).`)
    return
  }

  const rows = vinyl.map((p, i) => {
    const sort = Number(p.sort_order)
    if (!Number.isFinite(sort) || sort < 1) {
      throw new Error(`vinyl #${i + 1}: sort_order inválido`)
    }
    const title = (p.title || '').trim()
    if (!title) throw new Error(`vinyl sort_order=${sort}: falta title`)
    const discogs_url = (p.discogs_url || '').trim()
    const youtube_url = (p.youtube_url || '').trim()
    if (!discogs_url && !youtube_url) {
      throw new Error(`vinyl "${title}": falta discogs_url o youtube_url`)
    }

    return {
      chart_edition_id: editionId,
      sort_order: sort,
      title,
      mix_name: (p.mix_name || '').trim(),
      artists: Array.isArray(p.artists) ? p.artists : [],
      label: (p.label || '').trim(),
      catalog_number: (p.catalog_number || '').trim(),
      year:
        p.year != null && Number.isFinite(Number(p.year))
          ? Number(p.year)
          : null,
      format: (p.format || '').trim(),
      discogs_url: discogs_url || '',
      youtube_url: youtube_url || null,
      artwork_url: (p.artwork_url || '').trim() || null,
      note_en: (p.note_en || '').trim(),
      note_es: (p.note_es || '').trim(),
    }
  })

  const newKeys = new Set()
  const updates = []
  const inserts = []
  const usedLiveIds = new Set()
  for (const row of rows) {
    const k = vinylIdentityKey(row)
    if (k) newKeys.add(k)
    const liveId = k ? existingByTrackKey.get(k) : null
    if (liveId && !usedLiveIds.has(liveId)) {
      usedLiveIds.add(liveId)
      updates.push({ id: liveId, data: row })
    } else {
      inserts.push(row)
    }
  }
  const toDelete = []
  for (const r of existingRows || []) {
    const k = vinylIdentityKey(r)
    if (!k || !newKeys.has(k) || !usedLiveIds.has(r.id)) toDelete.push(r.id)
  }

  if (toDelete.length > 0) {
    const { error: delErr } = await supabase
      .from('chart_vinyl_tracks')
      .delete()
      .in('id', toDelete)
    if (delErr) throw new Error(`delete chart_vinyl_tracks (no presentes): ${delErr.message}`)
  }

  if (updates.length > 0) {
    let bump = 0
    const TEMP_SORT_START = Math.min(32100, 32767 - Math.max(1, updates.length) - 1)
    for (const u of updates) {
      bump++
      const { error } = await supabase
        .from('chart_vinyl_tracks')
        .update({ sort_order: TEMP_SORT_START + bump })
        .eq('id', u.id)
      if (error) throw new Error(`prep sort_order ${u.id}: ${error.message}`)
    }
  }

  for (const u of updates) {
    const { error: upErr } = await supabase
      .from('chart_vinyl_tracks')
      .update(u.data)
      .eq('id', u.id)
    if (upErr) throw new Error(`update vinyl ${u.id}: ${upErr.message}`)
  }
  if (inserts.length > 0) {
    const { error: insErr } = await supabase
      .from('chart_vinyl_tracks')
      .insert(inserts)
    if (insErr) throw new Error(`insert chart_vinyl_tracks: ${insErr.message}`)
  }

  console.log(
    `  ↳ Semana ${weekDate}: ${rows.length} vinilos vigentes ` +
    `(${updates.length} actualizados, ${inserts.length} nuevos, ${toDelete.length} eliminados).`,
  )
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
