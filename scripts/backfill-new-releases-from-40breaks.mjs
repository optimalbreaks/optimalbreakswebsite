/**
 * OPTIMAL BREAKS — Backfill retrospectivo de "New Releases" a partir del 40 Breaks Vitales
 *
 * Toma los chart_tracks ya publicados (universo = 3 ediciones × 40 = 120 pistas aprox.)
 * y, para los que tienen URL de tienda (`beatport_url`: Beatport o Bandcamp) pero aún no tienen
 * release_date en DB, consulta la página del track y rellena chart_tracks.release_date.
 *
 * Beatport: __NEXT_DATA__ (publish_date). Bandcamp: data-tralbum (album_release_date).
 *
 * Para cada track cuya release_date caiga en la ventana (por defecto las últimas 5
 * semanas), calcula el lunes ISO de esa fecha. Si esa semana ya tiene chart_edition
 * publicada, añade el track como pick retrospectivo en chart_featured_tracks. Si esa
 * semana NO tiene edición, **crea una chart_edition nueva** (con is_published=true)
 * solamente para que la sección "New Releases" la muestre: el bloque "40 Breaks Vitales"
 * filtra por tracks.length > 0 y por tanto NO la mostrará (la semana queda invisible
 * en esa sección).
 *
 *   node scripts/backfill-new-releases-from-40breaks.mjs                 # dry-run
 *   node scripts/backfill-new-releases-from-40breaks.mjs --confirm        # escribe DB
 *   node scripts/backfill-new-releases-from-40breaks.mjs --weeks=6        # ventana en semanas
 *   node scripts/backfill-new-releases-from-40breaks.mjs --no-enrich      # saltar fetch tiendas
 *   node scripts/backfill-new-releases-from-40breaks.mjs --only-enrich    # solo enriquecer release_date
 *   node scripts/backfill-new-releases-from-40breaks.mjs --no-create-editions
 *                                                                        # no crea semanas que no existan
 *   node scripts/backfill-new-releases-from-40breaks.mjs --limit-fetch=30 # tope de fetches tienda
 *
 * Deduplica por ID numérico de track Beatport:
 *  - Descarta si el track ya está en chart_tracks (top 40) de esa misma semana.
 *  - Descarta si el track ya está en chart_featured_tracks de esa misma semana.
 *
 * NO borra nada. NO toca los tops (chart_tracks) salvo para rellenar release_date en NULL.
 * Solo INSERTA en chart_editions (semanas nuevas para New Releases) y chart_featured_tracks.
 *
 * Requiere .env.local: NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY.
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

// ---------------------------------------------------------------------------
// Env + Supabase
// ---------------------------------------------------------------------------

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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
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

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lunes ISO (YYYY-MM-DD) de la semana que contiene la fecha dada. */
function mondayOfWeek(dateStr) {
  const d = new Date(`${dateStr}T00:00:00Z`)
  if (Number.isNaN(d.getTime())) return null
  const day = d.getUTCDay()
  const diff = day === 0 ? 6 : day - 1
  d.setUTCDate(d.getUTCDate() - diff)
  return d.toISOString().slice(0, 10)
}

/** Fecha ISO (YYYY-MM-DD) de hoy (UTC) menos N días. */
function isoDaysAgo(days) {
  const d = new Date()
  d.setUTCDate(d.getUTCDate() - days)
  return d.toISOString().slice(0, 10)
}

/** Lista de lunes ISO (YYYY-MM-DD) en orden ascendente desde el lunes de `sinceIso` hasta el lunes de hoy. */
function mondaysBetween(sinceIso, untilIso) {
  const out = []
  const start = mondayOfWeek(sinceIso)
  const end = mondayOfWeek(untilIso)
  if (!start || !end) return out
  const cur = new Date(`${start}T00:00:00Z`)
  const last = new Date(`${end}T00:00:00Z`)
  while (cur.getTime() <= last.getTime()) {
    out.push(cur.toISOString().slice(0, 10))
    cur.setUTCDate(cur.getUTCDate() + 7)
  }
  return out
}

function beatportTrackIdFromUrl(url) {
  if (!url || typeof url !== 'string') return null
  const m = url.trim().match(/\/track\/[^/]+\/(\d+)(?:[?#]|$)/)
  return m ? m[1] : null
}

/** Clave canónica para dedupe: el ID numérico Beatport, si existe; si no, la URL en minúsculas. */
function canonicalBeatportKey(url) {
  if (!url || typeof url !== 'string') return ''
  const id = beatportTrackIdFromUrl(url)
  return id ? `bp:${id}` : url.trim().toLowerCase()
}

function parseArgs() {
  const argv = process.argv.slice(2)
  const flags = {
    confirm: argv.includes('--confirm'),
    weeks: 5,
    enrich: !argv.includes('--no-enrich'),
    onlyEnrich: argv.includes('--only-enrich'),
    limitFetch: Infinity,
    verbose: argv.includes('--verbose'),
    createMissingEditions: !argv.includes('--no-create-editions'),
  }
  for (const a of argv) {
    const m = a.match(/^--weeks=(\d+)$/)
    if (m) flags.weeks = Math.max(1, parseInt(m[1], 10))
    const lf = a.match(/^--limit-fetch=(\d+)$/)
    if (lf) flags.limitFetch = Math.max(0, parseInt(lf[1], 10))
  }
  return flags
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

// ---------------------------------------------------------------------------
// Beatport: publish_date desde la página individual del track
// ---------------------------------------------------------------------------

async function fetchBeatportPublishDate(trackUrl) {
  try {
    const res = await fetch(trackUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const html = await res.text()
    const marker = '__NEXT_DATA__'
    const idx = html.indexOf(marker)
    if (idx === -1) return { ok: false, error: 'no __NEXT_DATA__' }
    const start = html.indexOf('>', idx) + 1
    const end = html.indexOf('</script>', start)
    const nextData = JSON.parse(html.slice(start, end).trim())

    // Buscamos publish_date / new_release_date en cualquier query del estado deshidratado.
    const queries = nextData?.props?.pageProps?.dehydratedState?.queries || []
    for (const q of queries) {
      const d = q?.state?.data
      if (!d || typeof d !== 'object') continue
      const candidates = [d, d.track, d.results, d.data]
      for (const c of candidates) {
        if (!c) continue
        const arr = Array.isArray(c) ? c : [c]
        for (const obj of arr) {
          if (!obj || typeof obj !== 'object') continue
          const raw = obj.publish_date || obj.new_release_date
          if (typeof raw === 'string') {
            const m = raw.match(/^(\d{4})-(\d{2})-(\d{2})/)
            if (m) return { ok: true, date: `${m[1]}-${m[2]}-${m[3]}` }
          }
        }
      }
    }
    return { ok: false, error: 'publish_date no encontrado en NEXT_DATA' }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}

async function fetchBandcampReleaseDateFromTrackPage(trackUrl) {
  try {
    let parsed
    try {
      parsed = new URL(trackUrl)
    } catch {
      return { ok: false, error: 'URL inválida' }
    }
    if (!parsed.hostname.toLowerCase().endsWith('.bandcamp.com')) {
      return { ok: false, error: 'no es bandcamp.com' }
    }
    const res = await fetch(trackUrl, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html',
        'Accept-Language': 'en-US,en;q=0.9',
      },
    })
    if (!res.ok) return { ok: false, error: `HTTP ${res.status}` }
    const html = await res.text()
    const tralbum = html.match(/data-tralbum="([^"]*)"/)
    if (!tralbum) return { ok: false, error: 'no data-tralbum' }
    const decoded = tralbum[1].replace(/&quot;/g, '"').replace(/&amp;/g, '&')
    const obj = JSON.parse(decoded)
    const raw = obj.album_release_date || obj.release_date
    if (typeof raw !== 'string' || !raw.trim()) {
      return { ok: false, error: 'sin album_release_date en tralbum' }
    }
    const d = new Date(raw.trim())
    if (Number.isNaN(d.getTime())) return { ok: false, error: 'fecha no parseable' }
    const y = d.getUTCFullYear()
    const mo = String(d.getUTCMonth() + 1).padStart(2, '0')
    const day = String(d.getUTCDate()).padStart(2, '0')
    if (y < 1970 || y > 2100) return { ok: false, error: 'año fuera de rango' }
    return { ok: true, date: `${y}-${mo}-${day}` }
  } catch (err) {
    return { ok: false, error: err.message || String(err) }
  }
}

function isBeatportTrackUrl(u) {
  const s = (u || '').trim().toLowerCase()
  return /beatport\.com\/track\/[^/]+\/\d+/.test(s)
}

function isBandcampTrackUrl(u) {
  const s = (u || '').trim().toLowerCase()
  return /\.bandcamp\.com\/track\//.test(s)
}

async function fetchStoreReleaseDate(storeUrl) {
  let u = (storeUrl || '').trim().replace(/^http:\/\//i, 'https://')
  if (isBeatportTrackUrl(u)) {
    u = u.replace(/^https:\/\/(www\.)?beatport\.com/i, 'https://www.beatport.com')
    return fetchBeatportPublishDate(u)
  }
  if (isBandcampTrackUrl(u)) return fetchBandcampReleaseDateFromTrackPage(u)
  return { ok: false, error: 'URL no es track Beatport ni Bandcamp' }
}

// ---------------------------------------------------------------------------
// Main pipeline
// ---------------------------------------------------------------------------

async function main() {
  const flags = parseArgs()
  const supabase = requireSupabase()

  console.log(`\n▸ Backfill New Releases ← 40 Breaks Vitales`)
  console.log(`  Modo: ${flags.confirm ? 'CONFIRM (escribe DB)' : 'DRY-RUN (solo lee)'}`)
  console.log(`  Ventana: últimas ${flags.weeks} semanas`)
  console.log(`  Enriquecer release_date (Beatport/Bandcamp): ${flags.enrich ? 'sí' : 'no'}`)
  console.log(`  Crear chart_editions faltantes (solo para New Releases): ${flags.createMissingEditions ? 'sí' : 'no'}`)
  if (flags.onlyEnrich) console.log(`  Modo solo-enriquecer activo (no inserta picks)`)

  // 1) Cargamos TODAS las chart_editions publicadas (para saber las existentes y para
  //    leer los tracks del 40 Breaks Vitales, que son el universo de origen de candidatos).
  //    Las ediciones del 40 Breaks son muy pocas (3 en esta fase), así que traemos todo.
  console.log(`\n[1/5] Cargando chart_editions publicadas...`)
  const { data: editionsAll, error: edErr } = await supabase
    .from('chart_editions')
    .select('id, week_date')
    .eq('is_published', true)
    .order('week_date', { ascending: true })

  if (edErr) throw new Error(`chart_editions: ${edErr.message}`)
  const sourceEditions = editionsAll || [] // ediciones del 40 Breaks (existentes)
  console.log(`  ↳ ${sourceEditions.length} ediciones publicadas en DB.`)

  if (sourceEditions.length === 0) {
    console.log(`  ↳ No hay ediciones publicadas. Abortando.`)
    return
  }
  const editionIds = sourceEditions.map((e) => e.id)

  // Ventana de semanas candidatas: lunes ISO desde hoy - N semanas hasta el lunes de hoy.
  const sinceIso = isoDaysAgo(flags.weeks * 7)
  const todayIso = new Date().toISOString().slice(0, 10)
  const targetWeekDates = mondaysBetween(sinceIso, todayIso)
  console.log(
    `  ↳ Ventana de semanas (lunes ISO): ${targetWeekDates.join(', ') || '(ninguna)'}`,
  )

  // 2) Cargamos chart_tracks de TODAS las ediciones existentes (universo del 40 Breaks).
  console.log(`\n[2/5] Cargando chart_tracks del 40 Breaks Vitales...`)
  const { data: tracks, error: trErr } = await supabase
    .from('chart_tracks')
    .select(
      'id, chart_edition_id, position, title, mix_name, artists, label, bpm, music_key, beatport_url, artwork_url, sample_url, release_year, release_date',
    )
    .in('chart_edition_id', editionIds)
  if (trErr) throw new Error(`chart_tracks: ${trErr.message}`)
  if (!tracks) throw new Error('chart_tracks: sin datos')
  console.log(`  ↳ ${tracks.length} tracks cargados.`)

  // 3) Enriquecer release_date en chart_tracks que lo tengan NULL (URLs Beatport o Bandcamp en beatport_url).
  let enrichedCount = 0
  let fetchErrors = 0
  if (flags.enrich) {
    const missing = tracks.filter(
      (t) =>
        !t.release_date &&
        t.beatport_url &&
        typeof t.beatport_url === 'string' &&
        (isBeatportTrackUrl(t.beatport_url) || isBandcampTrackUrl(t.beatport_url)),
    )
    const toFetch = Number.isFinite(flags.limitFetch) ? missing.slice(0, flags.limitFetch) : missing
    console.log(
      `\n[3/5] Enriqueciendo release_date (${toFetch.length}/${missing.length} sin fecha, Beatport o Bandcamp)...`,
    )
    for (let i = 0; i < toFetch.length; i++) {
      const t = toFetch[i]
      const res = await fetchStoreReleaseDate(t.beatport_url)
      if (res.ok) {
        t.release_date = res.date
        enrichedCount++
        if (flags.verbose) {
          console.log(`  ✓ [${i + 1}/${toFetch.length}] ${t.title} → ${res.date}`)
        }
        if (flags.confirm) {
          const { error: updErr } = await supabase
            .from('chart_tracks')
            .update({ release_date: res.date })
            .eq('id', t.id)
          if (updErr) {
            fetchErrors++
            console.log(`  ⚠ update chart_tracks ${t.id}: ${updErr.message}`)
          }
        }
      } else {
        fetchErrors++
        if (flags.verbose) {
          console.log(`  ✗ [${i + 1}/${toFetch.length}] ${t.title}: ${res.error}`)
        }
      }
      await sleep(500)
    }
    console.log(`  ↳ Enriquecidos: ${enrichedCount}. Errores: ${fetchErrors}.`)
    if (!flags.confirm && enrichedCount > 0) {
      console.log(`  ↳ (dry-run: los release_date no se han escrito en DB)`)
    }
  } else {
    console.log(`\n[3/5] Omitiendo enriquecimiento (--no-enrich).`)
  }

  if (flags.onlyEnrich) {
    console.log(`\n✓ Fin (modo --only-enrich).`)
    return
  }

  // 4) Preparar ediciones destino. Primero montamos un mapa de las semanas de la
  //    ventana: las existentes se referencian directamente; para las que no existen,
  //    usamos ediciones "virtuales" para poder calcular candidatos. Solo al final,
  //    y solo si --confirm, crearemos ediciones reales para aquellas semanas virtuales
  //    que realmente hayan acabado con ≥ 1 candidato. Así evitamos crear ediciones
  //    huérfanas sin picks.
  console.log(`\n[4/5] Preparando ediciones destino (temporalmente virtuales las faltantes)...`)
  const editionByMonday = new Map()
  for (const e of sourceEditions) editionByMonday.set(e.week_date, e)

  const missingWeeks = targetWeekDates.filter((w) => !editionByMonday.has(w))
  console.log(
    `  ↳ Semanas con edición ya existente: ${targetWeekDates
      .filter((w) => editionByMonday.has(w))
      .join(', ') || '(ninguna)'}`,
  )
  console.log(
    `  ↳ Semanas sin edición en DB: ${missingWeeks.join(', ') || '(ninguna)'}`,
  )

  if (missingWeeks.length > 0 && flags.createMissingEditions) {
    // Marcamos como virtuales; crearemos solo las que terminen con picks.
    for (const week of missingWeeks) {
      editionByMonday.set(week, { id: `__virtual_${week}__`, week_date: week, _virtual: true })
    }
  } else if (missingWeeks.length > 0 && !flags.createMissingEditions) {
    console.log(`  ℹ --no-create-editions activo: esas semanas se ignorarán.`)
  }

  // Lista final de ediciones dentro de la ventana (existentes + virtuales).
  const windowEditions = targetWeekDates
    .map((w) => editionByMonday.get(w))
    .filter((e) => Boolean(e))
  const windowEditionIds = windowEditions.map((e) => e.id).filter((id) => !String(id).startsWith('__virtual_'))

  // Rango [earliestMonday, latestMonday] dentro de la ventana (para descartar releases fuera).
  const earliestMonday = targetWeekDates[0] || ''
  const latestMonday = targetWeekDates[targetWeekDates.length - 1] || ''

  console.log(`\n[5/5] Calculando inserciones en chart_featured_tracks...`)

  // 5.a) Ya presentes en chart_tracks por (edición, beatport key). Solo sobre ediciones
  //      existentes (las creadas ahora no tienen tracks del top).
  const presentInTopByEdition = new Map() // edId → Set<canonKey>
  for (const t of tracks) {
    if (!t.beatport_url) continue
    const key = canonicalBeatportKey(t.beatport_url)
    if (!key) continue
    if (!presentInTopByEdition.has(t.chart_edition_id)) {
      presentInTopByEdition.set(t.chart_edition_id, new Set())
    }
    presentInTopByEdition.get(t.chart_edition_id).add(key)
  }

  // 5.b) Existentes en chart_featured_tracks para TODAS las ediciones (para dedupe cross-week).
  const { data: existingFeatured, error: fErr } =
    windowEditionIds.length > 0
      ? await supabase
          .from('chart_featured_tracks')
          .select('id, chart_edition_id, sort_order, link_url, platform')
          .in('chart_edition_id', windowEditionIds)
      : { data: [], error: null }
  if (fErr) throw new Error(`chart_featured_tracks: ${fErr.message}`)

  const featuredKeysByEdition = new Map() // edId → Set<canonKey>
  const maxSortByEdition = new Map() // edId → max sort_order
  for (const f of existingFeatured || []) {
    if (!featuredKeysByEdition.has(f.chart_edition_id)) {
      featuredKeysByEdition.set(f.chart_edition_id, new Set())
    }
    const key = canonicalBeatportKey(f.link_url || '')
    if (key) featuredKeysByEdition.get(f.chart_edition_id).add(key)
    const cur = maxSortByEdition.get(f.chart_edition_id) || 0
    if (f.sort_order && f.sort_order > cur) {
      maxSortByEdition.set(f.chart_edition_id, f.sort_order)
    }
  }

  // 4.c) Elegibles: tracks con release_date y su lunes coincide con alguna edición de la ventana.
  const candidates = []
  const skipped = { noDate: 0, outOfWindow: 0, inTop: 0, alreadyFeatured: 0 }
  const dedupeInBatch = new Map() // edId → Set<canonKey>

  for (const t of tracks) {
    if (!t.release_date || !t.beatport_url) {
      skipped.noDate++
      continue
    }
    const monday = mondayOfWeek(t.release_date)
    if (!monday) {
      skipped.noDate++
      continue
    }
    if (monday < earliestMonday || monday > latestMonday) {
      skipped.outOfWindow++
      continue
    }
    const edition = editionByMonday.get(monday)
    if (!edition) {
      skipped.outOfWindow++
      continue
    }
    const key = canonicalBeatportKey(t.beatport_url)
    if (!key) {
      skipped.noDate++
      continue
    }
    if (presentInTopByEdition.get(edition.id)?.has(key)) {
      skipped.inTop++
      continue
    }
    if (featuredKeysByEdition.get(edition.id)?.has(key)) {
      skipped.alreadyFeatured++
      continue
    }
    if (!dedupeInBatch.has(edition.id)) dedupeInBatch.set(edition.id, new Set())
    if (dedupeInBatch.get(edition.id).has(key)) {
      skipped.alreadyFeatured++
      continue
    }
    dedupeInBatch.get(edition.id).add(key)

    candidates.push({ track: t, edition, key })
  }

  // 5.d) Asignar sort_order por edición (sobre el máximo actual).
  const nextSortByEdition = new Map()
  for (const ed of windowEditions) {
    nextSortByEdition.set(ed.id, (maxSortByEdition.get(ed.id) || 0) + 1)
  }

  // Orden estable por (edition.week_date, release_date, title).
  candidates.sort((a, b) => {
    if (a.edition.week_date !== b.edition.week_date)
      return a.edition.week_date.localeCompare(b.edition.week_date)
    if (a.track.release_date !== b.track.release_date)
      return (a.track.release_date || '').localeCompare(b.track.release_date || '')
    return (a.track.title || '').localeCompare(b.track.title || '')
  })

  const rowsByEdition = new Map()
  const rowsToInsert = []
  for (const c of candidates) {
    const edId = c.edition.id
    const sort = nextSortByEdition.get(edId)
    if (sort > 200) {
      continue // límite de la columna (chart_featured_tracks_sort_order_check)
    }
    nextSortByEdition.set(edId, sort + 1)
    const row = {
      chart_edition_id: edId,
      sort_order: sort,
      title: c.track.title || '',
      mix_name: c.track.mix_name || '',
      artists: Array.isArray(c.track.artists) ? c.track.artists : [],
      label: c.track.label || '',
      platform: 'beatport',
      link_url: c.track.beatport_url,
      link_label: '',
      artwork_url: c.track.artwork_url || null,
      sample_url: c.track.sample_url || null,
      bpm: c.track.bpm || null,
      music_key: c.track.music_key || '',
      release_year:
        c.track.release_year != null
          ? c.track.release_year
          : c.track.release_date
            ? parseInt(c.track.release_date.slice(0, 4), 10)
            : null,
      note_en: '',
      note_es: '',
    }
    rowsToInsert.push(row)
    if (!rowsByEdition.has(edId)) rowsByEdition.set(edId, [])
    rowsByEdition.get(edId).push({ ...row, _week: c.edition.week_date, _release: c.track.release_date })
  }

  // 5.e) Resumen por semana (siempre se imprime).
  console.log(`\n  Resumen por semana:`)
  for (const ed of windowEditions) {
    const rows = rowsByEdition.get(ed.id) || []
    const base = maxSortByEdition.get(ed.id) || 0
    const isVirtual = String(ed.id).startsWith('__virtual_')
    const tag = isVirtual ? ' [NUEVA edición]' : ''
    if (rows.length === 0) {
      console.log(`    ${ed.week_date}${tag}: sin candidatos (picks existentes: ${base})`)
      continue
    }
    console.log(`    ${ed.week_date}${tag}: +${rows.length} picks (sort_order ${base + 1}..${base + rows.length})`)
    for (const r of rows) {
      const artists = Array.isArray(r.artists)
        ? r.artists.map((a) => (typeof a === 'string' ? a : a?.name || '')).filter(Boolean).join(', ')
        : ''
      console.log(`       - [${r._release}] ${r.title}${r.mix_name ? ` (${r.mix_name})` : ''} — ${artists}`)
    }
  }

  console.log(
    `\n  Totales:  candidatos=${candidates.length}  a-insertar=${rowsToInsert.length}` +
      `  omitidos(in-top)=${skipped.inTop}  omitidos(ya-featured)=${skipped.alreadyFeatured}` +
      `  omitidos(fuera-ventana)=${skipped.outOfWindow}  omitidos(sin-fecha)=${skipped.noDate}`,
  )

  if (rowsToInsert.length === 0) {
    console.log(`\n  ℹ Nada que insertar.`)
    return
  }

  // Determinar qué semanas virtuales han terminado con ≥ 1 pick (las únicas que se crearán).
  const virtualWithPicks = windowEditions.filter(
    (ed) => ed._virtual && (rowsByEdition.get(ed.id) || []).length > 0,
  )
  const virtualWithoutPicks = windowEditions.filter(
    (ed) => ed._virtual && (rowsByEdition.get(ed.id) || []).length === 0,
  )
  if (virtualWithPicks.length > 0) {
    console.log(
      `\n  Ediciones nuevas a crear (tendrán picks): ${virtualWithPicks
        .map((e) => e.week_date)
        .join(', ')}`,
    )
  }
  if (virtualWithoutPicks.length > 0) {
    console.log(
      `  Ediciones que se descartan (no tendrían picks): ${virtualWithoutPicks
        .map((e) => e.week_date)
        .join(', ')}`,
    )
  }

  if (!flags.confirm) {
    console.log(`\n  ℹ Dry-run. Re-ejecuta con --confirm para escribir en Supabase.`)
    return
  }

  // 5.f) Crear las chart_editions nuevas que efectivamente tendrán ≥ 1 pick.
  if (virtualWithPicks.length > 0) {
    console.log(`\n  ⇢ Creando ${virtualWithPicks.length} chart_editions nuevas...`)
    const virtualIdToReal = new Map()
    for (const ed of virtualWithPicks) {
      const title = `40 Breaks Vitales — ${ed.week_date}`
      const { data: inserted, error: insErr } = await supabase
        .from('chart_editions')
        .insert({
          week_date: ed.week_date,
          title,
          description_en: `Weekly new releases for ${ed.week_date}.`,
          description_es: `Novedades semanales del ${ed.week_date}.`,
          sources: ['beatport'],
          is_published: true,
          published_at: new Date().toISOString(),
        })
        .select('id, week_date')
        .single()
      if (insErr) throw new Error(`insert chart_edition ${ed.week_date}: ${insErr.message}`)
      virtualIdToReal.set(ed.id, inserted.id)
      console.log(`    ✓ ${ed.week_date} (id=${inserted.id})`)
    }
    // Mapear los ids virtuales a reales en rowsToInsert antes del insert de picks.
    for (const row of rowsToInsert) {
      if (virtualIdToReal.has(row.chart_edition_id)) {
        row.chart_edition_id = virtualIdToReal.get(row.chart_edition_id)
      }
    }
  }

  // 5.g) INSERT de picks en lote (sin DELETE previo).
  console.log(`\n  ⇢ Insertando ${rowsToInsert.length} filas en chart_featured_tracks...`)
  const CHUNK = 100
  for (let i = 0; i < rowsToInsert.length; i += CHUNK) {
    const slice = rowsToInsert.slice(i, i + CHUNK)
    const { error: insErr } = await supabase.from('chart_featured_tracks').insert(slice)
    if (insErr) throw new Error(`insert chart_featured_tracks (batch ${i}): ${insErr.message}`)
  }
  console.log(`  ✓ Hecho.`)
}

main().catch((e) => {
  console.error(`\n✗ Error: ${e.message || e}`)
  process.exit(1)
})
