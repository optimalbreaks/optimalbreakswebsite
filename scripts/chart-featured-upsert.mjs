/**
 * OPTIMAL BREAKS — Picks «New releases» por semana (chart_featured_tracks)
 *
 * Solo lee el JSON que pases: no consulta Beatport, Bandcamp ni ninguna otra fuente.
 *
 *   node scripts/chart-featured-upsert.mjs data/charts/picks/2026-03-30.json
 *   node scripts/chart-featured-upsert.mjs data/charts/picks/2026-04-20.json --create-edition
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
 *       "sample_url": "https://geo-samples.beatport.com/…mp3",
 *       "mix_name": "Original Mix",
 *       "bpm": 135,
 *       "music_key": "G Minor",
 *       "release_year": 2026,
 *       "note_en": "",
 *       "note_es": ""
 *     }
 *   ]
 * }
 *
 * platform: beatport | bandcamp | soundcloud | other (solo afecta al texto del botón si link_label vacío)
 *
 * Deduplicación: si repites el mismo link (o el mismo id numérico en URL de track Beatport),
 * se omite la segunda entrada y se avisa por consola. También se avisa si varios picks
 * comparten la misma artwork_url (típico: varios cortes de un EP).
 *
 * Requiere .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY
 * Por defecto la fila chart_editions con ese week_date debe existir. Con --create-edition
 * se inserta una edición publicada mínima (igual que chart-vinyl-upsert) si aún no hay fila.
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

/** URL comparable: host/path en minúsculas, sin barra final. */
function normalizeFeaturedLinkUrl(raw) {
  let u = (raw || '').trim()
  if (!u) return ''
  u = u.replace(/^http:\/\//i, 'https://')
  u = u.replace(/^https:\/\/(www\.)?beatport\.com/i, 'https://www.beatport.com')
  u = u.replace(/\/+$/, '')
  return u.toLowerCase()
}

/**
 * Clave de deduplicación: para /track/.../id de Beatport usamos el id numérico
 * (evita duplicar el mismo tema con variantes de URL).
 */
function dedupeKeyForFeaturedLink(linkUrl) {
  const n = normalizeFeaturedLinkUrl(linkUrl)
  const m = n.match(/\/track\/[^/]+\/(\d+)$/)
  if (m) return `beatport:${m[1]}`
  return n || linkUrl
}

function warnSharedArtworkClusters(rows) {
  const byArt = new Map()
  for (const r of rows) {
    const art = (r.artwork_url || '').trim()
    if (!art) continue
    const list = byArt.get(art) ?? []
    list.push(`${r.title}${r.mix_name ? ` (${r.mix_name})` : ''}`)
    byArt.set(art, list)
  }
  for (const [, titles] of byArt) {
    if (titles.length < 2) continue
    console.warn(
      '  ⚠ Misma carátula en varios picks (suelen ser cortes del mismo EP). Revisa si quieres solo uno:',
      titles.join(' · '),
    )
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

async function main() {
  const argv = process.argv.slice(2)
  const createEditionIfMissing = argv.includes('--create-edition')
  const rel = argv.find((a) => !a.startsWith('--'))
  if (!rel) {
    console.error('Uso: node scripts/chart-featured-upsert.mjs <ruta-desde-raíz-repo.json> [--create-edition]')
    console.error('  Ej: node scripts/chart-featured-upsert.mjs data/charts/picks/2026-03-30.json')
    console.error('  Ej: node scripts/chart-featured-upsert.mjs data/charts/picks/2026-04-20.json --create-edition')
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

  let editionId = edition?.id
  if (!editionId) {
    if (!createEditionIfMissing) {
      console.error(`No hay chart_editions con week_date=${weekDate}.`)
      console.error('  Crea/publica esa semana en Supabase, o re-ejecuta con --create-edition')
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
    console.log(`  ↳ Creada chart_editions week_date=${weekDate} (id=${editionId}). Publica el 40 cuando toque.`)
  }

  const { error: delErr } = await supabase
    .from('chart_featured_tracks')
    .delete()
    .eq('chart_edition_id', editionId)
  if (delErr) throw new Error(`delete chart_featured_tracks: ${delErr.message}`)

  if (picks.length === 0) {
    console.log(`  ↳ Semana ${weekDate}: lista vacía (picks borrados).`)
    return
  }

  const sortedPicks = [...picks].sort(
    (a, b) => Number(a.sort_order) - Number(b.sort_order),
  )
  const seenKeys = new Set()
  const dedupedPicks = []
  for (let i = 0; i < sortedPicks.length; i++) {
    const p = sortedPicks[i]
    const sort = Number(p.sort_order)
    if (!Number.isFinite(sort) || sort < 1) {
      throw new Error(`pick #${i + 1}: sort_order inválido`)
    }
    const title = (p.title || '').trim()
    if (!title) throw new Error(`pick sort_order=${sort}: falta title`)
    const link_url = (p.link_url || '').trim()
    if (!link_url) throw new Error(`pick "${title}": falta link_url`)

    const key = dedupeKeyForFeaturedLink(link_url)
    if (seenKeys.has(key)) {
      console.warn(
        `  ⚠ Omitido duplicado (mismo enlace / mismo id Beatport): «${title}» → ${link_url}`,
      )
      continue
    }
    seenKeys.add(key)
    dedupedPicks.push(p)
  }

  const rows = dedupedPicks.map((p, idx) => {
    const title = (p.title || '').trim()
    const link_url = (p.link_url || '').trim()
    const bpmRaw = p.bpm
    const bpm =
      bpmRaw != null && Number.isFinite(Number(bpmRaw)) && Number(bpmRaw) > 0
        ? Number(bpmRaw)
        : null

    return {
      chart_edition_id: editionId,
      sort_order: idx + 1,
      title,
      mix_name: (p.mix_name || '').trim(),
      artists: Array.isArray(p.artists) ? p.artists : [],
      label: (p.label || '').trim(),
      platform: (p.platform || 'other').trim().toLowerCase() || 'other',
      link_url,
      link_label: (p.link_label || '').trim(),
      artwork_url: (p.artwork_url || '').trim() || null,
      sample_url: (p.sample_url || '').trim() || null,
      bpm,
      music_key: (p.music_key || '').trim(),
      release_year:
        p.release_year != null && Number.isFinite(Number(p.release_year))
          ? Number(p.release_year)
          : null,
      note_en: (p.note_en || '').trim(),
      note_es: (p.note_es || '').trim(),
    }
  })

  warnSharedArtworkClusters(rows)

  const { error: insErr } = await supabase.from('chart_featured_tracks').insert(rows)
  if (insErr) throw new Error(`insert chart_featured_tracks: ${insErr.message}`)

  console.log(`  ↳ Semana ${weekDate}: ${rows.length} picks guardados.`)
}

main().catch((e) => {
  console.error(e.message || e)
  process.exit(1)
})
