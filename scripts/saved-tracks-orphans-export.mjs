/**
 * OPTIMAL BREAKS — Catalogar saves huérfanos
 *
 * Para los saves cuyo `track_id` ya no existe en su tabla de origen
 * (`chart_tracks` / `chart_featured_tracks` / `chart_vinyl_tracks`) genera
 * dos artefactos de respaldo:
 *
 *   1) `data/orphans/saved-tracks-<email>.csv`
 *      id, user_id, email, track_source, track_id, canonical_url, created_at
 *
 *   2) `data/orphans/saved-tracks-<email>.json`
 *      Mismo contenido en JSON estructurado.
 *
 * Sirven como evidencia y como entrada para futuros rebinds (si en algún
 * momento aparece un backup que conserve los UUIDs antiguos junto con su
 * link_url, basta con cruzar por `track_id` para reenganchar las saves).
 *
 * Uso:
 *   node scripts/saved-tracks-orphans-export.mjs --email contacto@eskaladigital.com
 *   node scripts/saved-tracks-orphans-export.mjs               # todos los usuarios
 */

import { readFileSync, existsSync, mkdirSync, writeFileSync } from 'fs'
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
  for (const [k, v] of Object.entries({ ...base, ...local })) {
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
    throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY/SUPABASE_SECRET_KEY en .env.local')
  }
  return createClient(url, key, { auth: { persistSession: false } })
}

const TABLE_BY_SOURCE = {
  chart: 'chart_tracks',
  featured: 'chart_featured_tracks',
  vinyl: 'chart_vinyl_tracks',
}

function csvEscape(v) {
  if (v == null) return ''
  const s = String(v)
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

async function loadAllSaves(sb, userId) {
  const out = []
  let from = 0
  const pageSize = 1000
  while (true) {
    const q = sb
      .from('saved_chart_tracks')
      .select('id, user_id, track_source, track_id, canonical_url, snapshot, created_at')
      .range(from, from + pageSize - 1)
    if (userId) q.eq('user_id', userId)
    const { data, error } = await q
    if (error) throw new Error(`load saved_chart_tracks: ${error.message}`)
    const rows = data || []
    out.push(...rows)
    if (rows.length < pageSize) break
    from += pageSize
  }
  return out
}

async function loadLiveIds(sb, source, ids) {
  const liveSet = new Set()
  if (!ids.length) return liveSet
  const table = TABLE_BY_SOURCE[source]
  if (!table) return liveSet
  const chunk = 500
  for (let i = 0; i < ids.length; i += chunk) {
    const slice = ids.slice(i, i + chunk)
    const { data, error } = await sb.from(table).select('id').in('id', slice)
    if (error) throw new Error(`load ${table}: ${error.message}`)
    for (const r of data || []) liveSet.add(r.id)
  }
  return liveSet
}

async function findUserByEmail(sb, email) {
  const target = (email || '').trim().toLowerCase()
  if (!target) return null
  const perPage = 1000
  let page = 1
  while (true) {
    const { data, error } = await sb.auth.admin.listUsers({ page, perPage })
    if (error) throw new Error(`auth.admin.listUsers: ${error.message}`)
    const users = data?.users || []
    const hit = users.find((u) => (u.email || '').toLowerCase() === target)
    if (hit) return hit
    if (users.length < perPage) return null
    page += 1
  }
}

async function main() {
  const argv = process.argv.slice(2)
  const emailIdx = argv.indexOf('--email')
  const email = emailIdx >= 0 ? argv[emailIdx + 1] : null

  const sb = requireSupabase()

  let user = null
  if (email) {
    user = await findUserByEmail(sb, email)
    if (!user) {
      console.error(`No se encontró usuario con email=${email}`)
      process.exit(2)
    }
    console.log(`→ Usuario ${user.email} (${user.id})`)
  } else {
    console.log('→ Procesando saves de TODOS los usuarios')
  }

  const saved = await loadAllSaves(sb, user?.id || null)
  console.log(`  · ${saved.length} saves cargados`)

  const orphans = []
  for (const src of ['chart', 'featured', 'vinyl']) {
    const idsForSrc = saved.filter((s) => s.track_source === src).map((s) => s.track_id)
    if (!idsForSrc.length) continue
    const live = await loadLiveIds(sb, src, idsForSrc)
    for (const s of saved) {
      if (s.track_source !== src) continue
      if (!live.has(s.track_id)) orphans.push(s)
    }
  }

  // Si no filtramos por email, necesitamos los emails de todos los user_id
  const userIdToEmail = new Map()
  if (user) {
    userIdToEmail.set(user.id, user.email)
  } else {
    const ids = Array.from(new Set(orphans.map((o) => o.user_id)))
    if (ids.length > 0) {
      // No hay endpoint masivo por id; iteramos.
      let page = 1
      const perPage = 1000
      while (true) {
        const { data, error } = await sb.auth.admin.listUsers({ page, perPage })
        if (error) break
        for (const u of (data?.users || [])) userIdToEmail.set(u.id, u.email)
        if ((data?.users || []).length < perPage) break
        page += 1
      }
    }
  }

  console.log(`  · ${orphans.length} saves huérfanos detectados`)

  const outDir = join(ROOT, 'data', 'orphans')
  mkdirSync(outDir, { recursive: true })

  const slug = email ? email.replace(/[^a-z0-9]+/gi, '-').toLowerCase() : 'all-users'
  const csvPath = join(outDir, `saved-tracks-${slug}.csv`)
  const jsonPath = join(outDir, `saved-tracks-${slug}.json`)

  const orphansSorted = [...orphans].sort(
    (a, b) => (a.created_at || '').localeCompare(b.created_at || ''),
  )

  const header = ['id', 'user_id', 'email', 'track_source', 'track_id', 'canonical_url', 'created_at']
  const lines = [header.join(',')]
  for (const o of orphansSorted) {
    lines.push(
      [
        o.id,
        o.user_id,
        userIdToEmail.get(o.user_id) || '',
        o.track_source,
        o.track_id,
        o.canonical_url || '',
        o.created_at || '',
      ].map(csvEscape).join(','),
    )
  }
  writeFileSync(csvPath, lines.join('\n'), 'utf8')

  const jsonOut = {
    generated_at: new Date().toISOString(),
    scope: email ? { email } : { scope: 'all-users' },
    count: orphansSorted.length,
    orphans: orphansSorted.map((o) => ({
      id: o.id,
      user_id: o.user_id,
      email: userIdToEmail.get(o.user_id) || null,
      track_source: o.track_source,
      track_id: o.track_id,
      canonical_url: o.canonical_url || null,
      snapshot: o.snapshot || null,
      created_at: o.created_at || null,
    })),
  }
  writeFileSync(jsonPath, JSON.stringify(jsonOut, null, 2), 'utf8')

  console.log('')
  console.log(`CSV  → ${csvPath}`)
  console.log(`JSON → ${jsonPath}`)
}

main().catch((e) => {
  console.error(e?.stack || e?.message || e)
  process.exit(1)
})
