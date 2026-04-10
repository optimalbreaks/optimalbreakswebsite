/**
 * Temporary script: cross-reference labels mentioned in artists' beatport_top_tracks
 * with existing labels in the database, to find popular labels we're missing.
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function loadEnv() {
  for (const f of ['.env', '.env.local']) {
    const p = join(ROOT, f)
    if (!existsSync(p)) continue
    let text = readFileSync(p, 'utf8')
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
    for (const line of text.split('\n')) {
      let t = line.trim()
      if (t.startsWith('export ')) t = t.slice(7).trim()
      if (!t || t.startsWith('#')) continue
      const eq = t.indexOf('=')
      if (eq === -1) continue
      const k = t.slice(0, eq).trim()
      let v = t.slice(eq + 1).trim()
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
        v = v.slice(1, -1)
      if (process.env[k] === undefined) process.env[k] = v
    }
  }
}

loadEnv()

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim(),
  { auth: { persistSession: false } }
)

// 1. Get existing labels
const { data: labels } = await sb.from('labels').select('slug, name')
const existingNames = new Set(labels.map(l => l.name.toLowerCase().trim()))
const existingSlugs = new Set(labels.map(l => l.slug))

// 2. Get all artists with beatport_top_tracks
const { data: artists } = await sb.from('artists').select('slug, name, beatport_top_tracks')

// 3. Count label mentions from top tracks
const labelCounts = new Map() // label_name -> { count, artists: Set, years: Set }

for (const a of artists) {
  const tracks = a.beatport_top_tracks || []
  for (const t of tracks) {
    const lbl = (t.label || '').trim()
    if (!lbl) continue
    if (!labelCounts.has(lbl)) {
      labelCounts.set(lbl, { count: 0, artists: new Set(), years: new Set() })
    }
    const entry = labelCounts.get(lbl)
    entry.count++
    entry.artists.add(a.name)
    if (t.release_year) entry.years.add(t.release_year)
  }
}

// 4. Filter labels NOT in our database and sort by frequency
const missing = []
for (const [name, data] of labelCounts) {
  const nameLower = name.toLowerCase().trim()
  if (existingNames.has(nameLower)) continue
  // Also check fuzzy: slug-ify the name
  const slug = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
  if (existingSlugs.has(slug)) continue
  
  const maxYear = Math.max(...data.years)
  const minYear = Math.min(...data.years)
  missing.push({
    name,
    count: data.count,
    artistCount: data.artists.size,
    artists: [...data.artists].slice(0, 6),
    yearRange: `${minYear}-${maxYear}`,
    maxYear,
  })
}

missing.sort((a, b) => b.count - a.count)

// 5. Print results
console.log(`\n  Sellos en nuestra BD: ${labels.length}`)
console.log(`  Sellos distintos mencionados en top tracks: ${labelCounts.size}`)
console.log(`  Sellos que NO tenemos: ${missing.length}`)
console.log(`\n  === TOP 50 SELLOS QUE NOS FALTAN (por frecuencia en top tracks) ===\n`)
console.log(`  ${'#'.padStart(3)} | ${'Sello'.padEnd(40)} | Tracks | Artists | Years   | Algunos artistas`)
console.log(`  ${'-'.repeat(3)} | ${'-'.repeat(40)} | ${'-'.repeat(6)} | ${'-'.repeat(7)} | ${'-'.repeat(7)} | ${'-'.repeat(40)}`)

for (const l of missing.slice(0, 50)) {
  const idx = missing.indexOf(l) + 1
  console.log(`  ${String(idx).padStart(3)} | ${l.name.padEnd(40).slice(0,40)} | ${String(l.count).padStart(6)} | ${String(l.artistCount).padStart(7)} | ${l.yearRange.padEnd(7)} | ${l.artists.join(', ').slice(0,60)}`)
}

// 6. Show recent ones (maxYear >= 2022)
const recentMissing = missing.filter(l => l.maxYear >= 2022)
console.log(`\n  === SELLOS RECIENTES QUE NOS FALTAN (activos 2022+, con >=2 tracks) ===\n`)
const recentFiltered = recentMissing.filter(l => l.count >= 2)
console.log(`  ${'#'.padStart(3)} | ${'Sello'.padEnd(40)} | Tracks | Artists | Years   | Algunos artistas`)
console.log(`  ${'-'.repeat(3)} | ${'-'.repeat(40)} | ${'-'.repeat(6)} | ${'-'.repeat(7)} | ${'-'.repeat(7)} | ${'-'.repeat(40)}`)
for (const l of recentFiltered.slice(0, 40)) {
  const idx = recentFiltered.indexOf(l) + 1
  console.log(`  ${String(idx).padStart(3)} | ${l.name.padEnd(40).slice(0,40)} | ${String(l.count).padStart(6)} | ${String(l.artistCount).padStart(7)} | ${l.yearRange.padEnd(7)} | ${l.artists.join(', ').slice(0,60)}`)
}

console.log()
