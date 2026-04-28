// ============================================
// OPTIMAL BREAKS — Rescate quirúrgico de saves de una sesión
// Re-añade saves a los picks featured de un `week_date` concreto, atribuyendo
// la pérdida a una sesión de saves huérfanos identificada por rango de fechas.
//
// Uso:
//   node scripts/saves-rescue-week-featured.mjs \
//     --email contacto@eskaladigital.com \
//     --week 2026-04-20 \
//     --orphan-from 2026-04-27T19:54:00Z \
//     --orphan-to   2026-04-27T20:11:59Z \
//     [--dry-run] [--keep-orphans]
//
// Pasos:
//  1. Identifica al usuario por email.
//  2. Borra las saves huérfanas (track_id sin fila viva) cuyo created_at cae
//     en [orphan-from, orphan-to]. Salvo --keep-orphans.
//  3. Inserta saves featured para TODOS los picks vivos del week (con
//     canonical_url = link_url) usando upsert para no duplicar los que ya
//     estuviesen guardados.
// ============================================

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function parseEnvText(text) {
  const out = {}; let t0 = text
  if (t0.charCodeAt(0) === 0xfeff) t0 = t0.slice(1)
  for (const line of t0.split('\n')) {
    let t = line.trim()
    if (t.startsWith('export ')) t = t.slice(7).trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('='); if (eq === -1) continue
    const k = t.slice(0, eq).trim(); let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    out[k] = v
  }
  return out
}
function loadEnv() {
  const base = existsSync(join(ROOT, '.env')) ? parseEnvText(readFileSync(join(ROOT, '.env'), 'utf8')) : {}
  const local = existsSync(join(ROOT, '.env.local')) ? parseEnvText(readFileSync(join(ROOT, '.env.local'), 'utf8')) : {}
  for (const [k, v] of Object.entries({ ...base, ...local })) if (process.env[k] === undefined) process.env[k] = v
}
loadEnv()

function arg(name, fallback = null) {
  const idx = process.argv.findIndex((a) => a === `--${name}`)
  if (idx === -1) return fallback
  const next = process.argv[idx + 1]
  if (!next || next.startsWith('--')) return true
  return next
}

const email = arg('email')
const week = arg('week')
const orphFrom = arg('orphan-from')
const orphTo = arg('orphan-to')
const dryRun = !!arg('dry-run', false)
const keepOrphans = !!arg('keep-orphans', false)

if (!email || !week) {
  console.error('Faltan --email y --week. Ejemplo:')
  console.error('  node scripts/saves-rescue-week-featured.mjs --email contacto@eskaladigital.com --week 2026-04-20 --orphan-from 2026-04-27T19:54:00Z --orphan-to 2026-04-27T20:11:59Z')
  process.exit(2)
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY,
  { auth: { persistSession: false } },
)

const { data: usersData, error: usersErr } = await sb.auth.admin.listUsers({ page: 1, perPage: 1000 })
if (usersErr) { console.error(usersErr); process.exit(1) }
const u = (usersData?.users || []).find((x) => (x.email || '').toLowerCase() === email.toLowerCase())
if (!u) { console.error(`Usuario ${email} no encontrado.`); process.exit(1) }
console.log(`Usuario: ${email} (${u.id})`)

const { data: edition } = await sb.from('chart_editions').select('id, week_date').eq('week_date', week).maybeSingle()
if (!edition) { console.error(`No existe chart_editions para week_date=${week}`); process.exit(1) }
console.log(`Edition ${week}: ${edition.id}`)

const { data: featured } = await sb
  .from('chart_featured_tracks')
  .select('id, title, link_url, artists, label, release_year, bpm, music_key, artwork_url, sample_url, platform, link_label, sort_order')
  .eq('chart_edition_id', edition.id)
  .order('sort_order', { ascending: true })
console.log(`Picks featured vivos en ${week}: ${featured.length}`)

if (orphFrom && orphTo && !keepOrphans) {
  const { data: sessionSaves } = await sb
    .from('saved_chart_tracks')
    .select('id, track_source, track_id, canonical_url, created_at')
    .eq('user_id', u.id)
    .gte('created_at', orphFrom)
    .lte('created_at', orphTo)
  console.log(`Saves del usuario en ventana ${orphFrom} → ${orphTo}: ${sessionSaves.length}`)

  const featIds = sessionSaves.filter((s) => s.track_source === 'featured').map((s) => s.track_id)
  const liveSet = new Set()
  if (featIds.length) {
    for (let i = 0; i < featIds.length; i += 200) {
      const slice = featIds.slice(i, i + 200)
      const { data } = await sb.from('chart_featured_tracks').select('id').in('id', slice)
      for (const r of data || []) liveSet.add(r.id)
    }
  }
  const orphans = sessionSaves.filter((s) => s.track_source === 'featured' && !liveSet.has(s.track_id))
  console.log(`Huérfanos de la sesión a borrar: ${orphans.length}`)
  if (orphans.length) {
    if (dryRun) {
      console.log('  [dry-run] no se borra nada')
    } else {
      const { error: delErr } = await sb
        .from('saved_chart_tracks')
        .delete()
        .in('id', orphans.map((o) => o.id))
      if (delErr) { console.error('Error borrando huérfanos:', delErr); process.exit(1) }
      console.log(`  Borradas ${orphans.length} saves huérfanas.`)
    }
  }
}

const rows = featured.map((t) => ({
  user_id: u.id,
  track_source: 'featured',
  track_id: t.id,
  canonical_url: t.link_url,
  snapshot: null,
}))

if (dryRun) {
  console.log(`\n[dry-run] Se insertarían ${rows.length} saves de los picks de ${week}.`)
} else {
  let added = 0, skipped = 0
  for (let i = 0; i < rows.length; i += 100) {
    const slice = rows.slice(i, i + 100)
    const { data, error } = await sb
      .from('saved_chart_tracks')
      .upsert(slice, { onConflict: 'user_id,track_source,track_id', ignoreDuplicates: true })
      .select('id')
    if (error) { console.error('Error en upsert:', error); process.exit(1) }
    added += (data || []).length
    skipped += slice.length - (data || []).length
  }
  console.log(`\nSaves insertadas: ${added}  ·  ya existían (skip): ${skipped}`)
}

const { count: total } = await sb
  .from('saved_chart_tracks')
  .select('id', { head: true, count: 'exact' })
  .eq('user_id', u.id)
console.log(`\nTotal saves del usuario tras el rescate: ${total}`)
