/**
 * Temporary script: search Beatport for artists that don't have beatport_id yet.
 * Filters by likely-active era (2010s+), fetches Beatport search, extracts ID.
 * Then runs beatport-top-tracks logic for each found artist.
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

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
const sleep = (ms) => new Promise(r => setTimeout(r, ms))

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data: artists, error } = await sb.from('artists').select('slug, name, category, era, beatport_id').order('slug')
if (error) { console.error(error); process.exit(1) }

const SKIP_CATEGORIES = ['pioneer']
const SKIP_ERA_PATTERNS = [/^1[0-9]{3}/, /early-1990s$/, /^late-19[0-7]/, /^1960/, /^1970/, /^1980/]

function isLikelyActive(a) {
  if (a.beatport_id) return false
  const era = (a.era || '').toLowerCase()
  if (!era || era === '-') return false
  if (era.includes('present')) {
    if (era.match(/20[12]\ds?-present/)) return true
    if (era.match(/late-20[01]\ds?-present/)) return true
    if (era.includes('2000s-present') || era.includes('mid-2000s-present')) return true
    if (era.includes('late-1990s-present') || era.includes('1990s-present')) return true
  }
  if (era.includes('2020') || era.includes('2010')) return true
  return false
}

const candidates = artists.filter(isLikelyActive)
console.log(`\n  Candidatos activos sin beatport_id: ${candidates.length}\n`)

const dryRun = process.argv.includes('--dry-run')
const limit = process.argv.find(a => a.startsWith('--limit='))
const maxCount = limit ? parseInt(limit.split('=')[1], 10) : candidates.length

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function searchBeatport(name) {
  const q = encodeURIComponent(name)
  const searchUrl = `https://www.beatport.com/search?q=${q}`
  try {
    const res = await fetch(searchUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    })
    if (!res.ok) return null
    const html = await res.text()

    const marker = '__NEXT_DATA__'
    const idx = html.indexOf(marker)
    if (idx === -1) return null
    const start = html.indexOf('>', idx) + 1
    const end = html.indexOf('</script>', start)
    const nd = JSON.parse(html.slice(start, end).trim())
    const queries = nd?.props?.pageProps?.dehydratedState?.queries || []

    const targetLower = name.toLowerCase().trim()

    for (const query of queries) {
      const artistsArr = query?.state?.data?.artists?.data || []
      for (const r of artistsArr) {
        const rName = (r.artist_name || r.name || '').toLowerCase().trim()
        const rId = r.artist_id || r.id
        if (rName === targetLower && rId) {
          return { slug: toSlug(r.artist_name || r.name), id: rId, name: r.artist_name || r.name }
        }
      }
      const genericResults = query?.state?.data?.results || []
      for (const r of genericResults) {
        if (r.slug && r.id && typeof r.id === 'number') {
          const rName = (r.name || '').toLowerCase().trim()
          if (rName === targetLower) {
            return { slug: r.slug, id: r.id, name: r.name }
          }
        }
      }
    }

    const artistPattern = /\/artist\/([a-z0-9-]+)\/(\d+)/g
    let match
    const seen = new Set()
    while ((match = artistPattern.exec(html)) !== null) {
      const [, aSlug, aId] = match
      if (seen.has(aSlug)) continue
      seen.add(aSlug)
      const cleanSlug = aSlug.replace(/-/g, ' ').toLowerCase()
      const targetClean = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
      if (cleanSlug === targetClean || cleanSlug.includes(targetClean) || targetClean.includes(cleanSlug)) {
        return { slug: aSlug, id: parseInt(aId, 10), name }
      }
    }

    return null
  } catch {
    return null
  }
}

async function scrapeAndUpsert(slug, bpSlug, bpId) {
  const bpUrl = `https://www.beatport.com/artist/${bpSlug}/${bpId}`
  try {
    const res = await fetch(bpUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    })
    if (!res.ok) return 0
    const html = await res.text()

    const marker = '__NEXT_DATA__'
    const idx = html.indexOf(marker)
    if (idx === -1) return 0
    const start = html.indexOf('>', idx) + 1
    const end = html.indexOf('</script>', start)
    const nd = JSON.parse(html.slice(start, end).trim())
    const queries = nd?.props?.pageProps?.dehydratedState?.queries || []

    const topQuery = queries.find(q => {
      const k = Array.isArray(q.queryKey) ? q.queryKey[0] : String(q.queryKey ?? '')
      return k.includes(`artist-${bpId}-top-10-tracks`)
    })

    if (!topQuery) return 0

    const results = topQuery.state?.data?.results || []
    const tracks = results.map((t, i) => {
      const artworkUrl = (img) => {
        if (!img) return null
        if (img.dynamic_uri) return String(img.dynamic_uri).replace(/\{w\}/g, '250').replace(/\{h\}/g, '250')
        if (img.uri) return String(img.uri)
        return null
      }
      return {
        position: i + 1,
        title: (t.name || '').trim(),
        mix_name: (t.mix_name || '').trim(),
        artists: (t.artists || []).map(a => ({ name: a.name, beatport_url: `https://www.beatport.com/artist/${a.slug}/${a.id}` })),
        label: (t.release?.label || t.label)?.name || '',
        bpm: t.bpm || null,
        key: t.key?.name || '',
        beatport_url: `https://www.beatport.com/track/${t.slug}/${t.id}`,
        artwork_url: artworkUrl(t.release?.image) || artworkUrl(t.image),
        sample_url: t.sample_url || null,
        release_year: (() => { const raw = t.publish_date || t.new_release_date; if (!raw) return null; const m = String(raw).match(/^(\d{4})/); return m ? parseInt(m[1], 10) : null })(),
      }
    })

    if (tracks.length === 0) return 0

    if (!dryRun) {
      const { error: upErr } = await sb.from('artists').update({
        beatport_url: bpUrl,
        beatport_id: bpId,
        beatport_top_tracks: tracks,
        beatport_top_tracks_updated_at: new Date().toISOString(),
      }).eq('slug', slug)
      if (upErr) { console.error(`    ✗ DB error: ${upErr.message}`); return 0 }
    }
    return tracks.length
  } catch (e) {
    console.error(`    ✗ Scrape error: ${e.message}`)
    return 0
  }
}

let found = 0
let notFound = 0
let processed = 0

for (const a of candidates.slice(0, maxCount)) {
  processed++
  process.stdout.write(`  [${processed}/${Math.min(maxCount, candidates.length)}] ${a.name} (${a.slug})...`)

  const bp = await searchBeatport(a.name)
  if (!bp) {
    console.log(' ✗ not found on Beatport')
    notFound++
    await sleep(800)
    continue
  }

  console.log(` → ${bp.slug}/${bp.id}`)

  const count = await scrapeAndUpsert(a.slug, bp.slug, bp.id)
  if (count > 0) {
    console.log(`    ✓ ${count} tracks ${dryRun ? '[dry-run]' : 'saved'}`)
    found++
  } else {
    console.log(`    ○ found on BP but 0 top tracks`)
    if (!dryRun) {
      await sb.from('artists').update({ beatport_id: bp.id, beatport_url: `https://www.beatport.com/artist/${bp.slug}/${bp.id}` }).eq('slug', a.slug)
    }
    found++
  }

  await sleep(1200)
}

console.log(`\n  === RESUMEN ===`)
console.log(`  Procesados: ${processed}`)
console.log(`  Encontrados en Beatport: ${found}`)
console.log(`  No encontrados: ${notFound}`)
if (dryRun) console.log(`  [modo dry-run, nada escrito en BD]`)
console.log()
