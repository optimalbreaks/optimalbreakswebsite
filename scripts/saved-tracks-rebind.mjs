/**
 * OPTIMAL BREAKS — Rebind de saved_chart_tracks huérfanos
 *
 * Problema: el upsert de `chart_featured_tracks` (y antes el de
 * `chart_tracks`) borraba e insertaba filas, generando UUIDs nuevos. Los saves
 * del usuario en `saved_chart_tracks` quedaban apuntando a UUIDs viejos →
 * orfanados. La columna `canonical_url` (link_url para featured, beatport_url
 * para chart, youtube_url para vinyl) sí se conserva en cada save: la usamos
 * para reengancharlos con la fila vigente.
 *
 * Uso:
 *   node scripts/saved-tracks-rebind.mjs                # todos los usuarios
 *   node scripts/saved-tracks-rebind.mjs --email <x>    # solo ese usuario
 *   node scripts/saved-tracks-rebind.mjs --dry-run      # no modifica nada
 *
 * Requiere SERVICE_ROLE en .env.local (NEXT_PUBLIC_SUPABASE_URL +
 * SUPABASE_SERVICE_ROLE_KEY o SUPABASE_SECRET_KEY).
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

/**
 * Normalización de URLs igual que en `useSavedChartTracks.normalizeCanonicalUrl`
 * (cliente). Para YouTube colapsamos por videoId; para el resto, host+path.
 */
function normalizeCanonicalUrl(u) {
  const s = (u || '').trim().toLowerCase()
  if (!s) return ''
  const ytMatch = s.match(
    /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-z0-9_-]{11})/i,
  )
  if (ytMatch) return `yt:${ytMatch[1]}`
  try {
    const url = new URL(s)
    return `${url.host}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return s.replace(/[?#].*$/, '').replace(/\/$/, '')
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
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY en .env.local')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

const SOURCE_TABLES = {
  chart: { table: 'chart_tracks', urlCol: 'beatport_url' },
  featured: { table: 'chart_featured_tracks', urlCol: 'link_url' },
  vinyl: { table: 'chart_vinyl_tracks', urlCol: 'youtube_url' },
}

async function loadSourceIndex(sb, source) {
  const cfg = SOURCE_TABLES[source]
  if (!cfg) return new Map()
  const all = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await sb
      .from(cfg.table)
      .select(`id, ${cfg.urlCol}`)
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`load ${cfg.table}: ${error.message}`)
    const rows = data || []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  // canonicalKey → id (si dos filas comparten URL, ganamos la primera; raro
  // pero posible cuando un mismo track aparece en varias semanas — en ese
  // caso el rebind elegirá una semana, basta con que apunte a una fila viva).
  const idx = new Map()
  for (const row of all) {
    const url = row[cfg.urlCol]
    if (!url) continue
    const k = normalizeCanonicalUrl(url)
    if (!k) continue
    if (!idx.has(k)) idx.set(k, row.id)
  }
  return idx
}

async function loadSavedRowsForUser(sb, userId) {
  const { data, error } = await sb
    .from('saved_chart_tracks')
    .select('id, user_id, track_source, track_id, canonical_url, snapshot, created_at')
    .eq('user_id', userId)
  if (error) throw new Error(`load saved_chart_tracks: ${error.message}`)
  return data || []
}

async function loadAllSavedRows(sb) {
  const all = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const { data, error } = await sb
      .from('saved_chart_tracks')
      .select('id, user_id, track_source, track_id, canonical_url, snapshot, created_at')
      .range(from, from + pageSize - 1)
    if (error) throw new Error(`load saved_chart_tracks: ${error.message}`)
    const rows = data || []
    all.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return all
}

async function findUserIdByEmail(sb, email) {
  // auth.users via RPC no está expuesto. Usamos admin API.
  const target = (email || '').trim().toLowerCase()
  if (!target) return null
  const perPage = 1000
  let page = 1
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`)
    const users = data?.users || []
    const hit = users.find((u) => (u.email || '').toLowerCase() === target)
    if (hit) return hit.id
    if (users.length < perPage) return null
    page += 1
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const dry = argv.includes('--dry-run')
  const emailIdx = argv.indexOf('--email')
  const email = emailIdx >= 0 ? argv[emailIdx + 1] : null

  const sb = requireSupabase()

  let savedRows = []
  if (email) {
    const userId = await findUserIdByEmail(sb, email)
    if (!userId) {
      console.error(`No se encontró el usuario con email=${email}`)
      process.exit(2)
    }
    console.log(`→ Filtrando por usuario ${email} (id=${userId})`)
    savedRows = await loadSavedRowsForUser(sb, userId)
  } else {
    console.log('→ Procesando saves de TODOS los usuarios')
    savedRows = await loadAllSavedRows(sb)
  }

  console.log(`  · ${savedRows.length} saves leídos`)

  // Solo nos interesan filas con un source mapeado a tabla y con canonical_url
  const candidates = savedRows.filter(
    (r) => SOURCE_TABLES[r.track_source] && r.canonical_url,
  )
  console.log(`  · ${candidates.length} candidatos con source mapeado y canonical_url`)

  // Cargar índices de las tablas source SOLO si hay candidatos de esa fuente
  const sourcesNeeded = Array.from(new Set(candidates.map((r) => r.track_source)))
  const indexes = {}
  for (const src of sourcesNeeded) {
    indexes[src] = await loadSourceIndex(sb, src)
    console.log(`  · índice ${src}: ${indexes[src].size} URLs vivas`)
  }

  let toUpdate = 0
  let toDelete = 0
  let alreadyOk = 0
  let noMatch = 0
  const updates = []
  const deletions = []

  for (const r of candidates) {
    const idx = indexes[r.track_source]
    const k = normalizeCanonicalUrl(r.canonical_url)
    if (!k) continue
    const liveId = idx.get(k)
    if (liveId) {
      if (liveId === r.track_id) {
        alreadyOk += 1
      } else {
        // Posible colisión: si ya existe un save (user_id, source, liveId), no
        // podemos cambiarle el track_id porque rompería el UNIQUE. En ese caso
        // borramos el orfanado para limpiar duplicados.
        const dupHit = savedRows.find(
          (s) =>
            s.user_id === r.user_id &&
            s.track_source === r.track_source &&
            s.track_id === liveId,
        )
        if (dupHit) {
          deletions.push(r.id)
          toDelete += 1
        } else {
          updates.push({ id: r.id, new_track_id: liveId })
          toUpdate += 1
        }
      }
    } else {
      noMatch += 1
    }
  }

  console.log('')
  console.log('Resumen:')
  console.log(`  · Saves que ya apuntaban a la fila viva: ${alreadyOk}`)
  console.log(`  · Saves a REENGANCHAR (track_id viejo → nuevo): ${toUpdate}`)
  console.log(`  · Saves a BORRAR (duplicado tras rebind): ${toDelete}`)
  console.log(`  · Saves SIN match en la BD viva (URL desaparecida): ${noMatch}`)

  if (dry) {
    console.log('')
    console.log('--dry-run: no se han aplicado cambios.')
    return
  }

  if (updates.length === 0 && deletions.length === 0) {
    console.log('')
    console.log('Nada que actualizar.')
    return
  }

  // Aplicamos uno por uno: son pocos por usuario y nos da log fino.
  let okU = 0
  let errU = 0
  for (const u of updates) {
    const { error } = await sb
      .from('saved_chart_tracks')
      .update({ track_id: u.new_track_id })
      .eq('id', u.id)
    if (error) {
      console.warn(`  ⚠ update id=${u.id}: ${error.message}`)
      errU += 1
    } else {
      okU += 1
    }
  }

  let okD = 0
  let errD = 0
  if (deletions.length > 0) {
    // En lotes razonables.
    const chunk = 200
    for (let i = 0; i < deletions.length; i += chunk) {
      const slice = deletions.slice(i, i + chunk)
      const { error } = await sb
        .from('saved_chart_tracks')
        .delete()
        .in('id', slice)
      if (error) {
        console.warn(`  ⚠ delete batch: ${error.message}`)
        errD += slice.length
      } else {
        okD += slice.length
      }
    }
  }

  console.log('')
  console.log(`Updates aplicados:  ${okU} ok, ${errU} con error`)
  console.log(`Deletes aplicados:  ${okD} ok, ${errD} con error`)
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e)
  process.exit(1)
})
