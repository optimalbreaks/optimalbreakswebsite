/**
 * Temporary script: for artists (and labels) that have beatport_id but no image_url,
 * fetch the artist/label image from Beatport's __NEXT_DATA__ and update Supabase.
 *
 * Usage:
 *   node scripts/tmp-fill-bp-photos.mjs --dry-run
 *   node scripts/tmp-fill-bp-photos.mjs
 *   node scripts/tmp-fill-bp-photos.mjs --labels           # labels too
 *   node scripts/tmp-fill-bp-photos.mjs --labels --dry-run
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

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim()
const sb = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })

const dryRun = process.argv.includes('--dry-run')
const doLabels = process.argv.includes('--labels')

const PHOTO_SIZE = '500x500'

async function fetchBeatportImage(type, bpSlug, bpId) {
  const url = `https://www.beatport.com/${type}/${bpSlug}/${bpId}`
  try {
    const res = await fetch(url, {
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

    const profileQuery = queries.find(q => {
      const k = Array.isArray(q.queryKey) ? q.queryKey[0] : String(q.queryKey ?? '')
      return k === `${type}-${bpId}` || k === `${type === 'artist' ? 'artist' : 'label'}-${bpId}`
    })

    if (!profileQuery) return null
    const img = profileQuery.state?.data?.image
    if (!img) return null

    if (img.dynamic_uri) {
      return String(img.dynamic_uri).replace(/\{w\}/g, '500').replace(/\{h\}/g, '500')
    }
    if (img.uri) return String(img.uri)
    return null
  } catch {
    return null
  }
}

function slugFromUrl(url) {
  if (!url) return null
  const m = url.match(/\/(artist|label)\/([a-z0-9-]+)\/(\d+)/)
  return m ? { type: m[1], slug: m[2], id: parseInt(m[3], 10) } : null
}

// --- Artists ---
console.log('\n  === ARTISTAS ===')
const { data: artists, error: aErr } = await sb.from('artists').select('slug, name, image_url, beatport_id, beatport_url').order('slug')
if (aErr) { console.error(aErr); process.exit(1) }

const artistCandidates = artists.filter(a => (!a.image_url || a.image_url.trim() === '') && a.beatport_id)
console.log(`  Total artistas: ${artists.length}`)
console.log(`  Sin foto + con beatport_id: ${artistCandidates.length}\n`)

let aUpdated = 0, aFailed = 0
for (const a of artistCandidates) {
  const parsed = slugFromUrl(a.beatport_url) || { type: 'artist', slug: a.slug, id: a.beatport_id }
  process.stdout.write(`  [${aUpdated + aFailed + 1}/${artistCandidates.length}] ${a.name} (${a.slug})...`)

  const imgUrl = await fetchBeatportImage('artist', parsed.slug, parsed.id)
  if (!imgUrl) {
    console.log(' ✗ no image on Beatport')
    aFailed++
    await sleep(600)
    continue
  }

  if (dryRun) {
    console.log(` ✓ [dry-run] ${imgUrl.slice(0, 80)}...`)
  } else {
    const { error: upErr } = await sb.from('artists').update({ image_url: imgUrl }).eq('slug', a.slug)
    if (upErr) {
      console.log(` ✗ DB error: ${upErr.message}`)
      aFailed++
    } else {
      console.log(` ✓ saved`)
      aUpdated++
    }
  }
  await sleep(800)
}
console.log(`\n  Artistas actualizados: ${dryRun ? `${aUpdated + artistCandidates.length - aFailed} [dry-run]` : aUpdated}`)
console.log(`  Sin imagen en Beatport: ${aFailed}`)

// --- Labels (optional) ---
if (doLabels) {
  console.log('\n  === SELLOS ===')
  const { data: labels, error: lErr } = await sb.from('labels').select('slug, name, image_url, beatport_id, beatport_url').order('slug')
  if (lErr) { console.error(lErr); process.exit(1) }

  const labelCandidates = labels.filter(l => (!l.image_url || l.image_url.trim() === '') && l.beatport_id)
  console.log(`  Total sellos: ${labels.length}`)
  console.log(`  Sin foto + con beatport_id: ${labelCandidates.length}\n`)

  let lUpdated = 0, lFailed = 0
  for (const l of labelCandidates) {
    const parsed = slugFromUrl(l.beatport_url) || { type: 'label', slug: l.slug, id: l.beatport_id }
    process.stdout.write(`  [${lUpdated + lFailed + 1}/${labelCandidates.length}] ${l.name} (${l.slug})...`)

    const imgUrl = await fetchBeatportImage('label', parsed.slug, parsed.id)
    if (!imgUrl) {
      console.log(' ✗ no image on Beatport')
      lFailed++
      await sleep(600)
      continue
    }

    if (dryRun) {
      console.log(` ✓ [dry-run] ${imgUrl.slice(0, 80)}...`)
    } else {
      const { error: upErr } = await sb.from('labels').update({ image_url: imgUrl }).eq('slug', l.slug)
      if (upErr) {
        console.log(` ✗ DB error: ${upErr.message}`)
        lFailed++
      } else {
        console.log(` ✓ saved`)
        lUpdated++
      }
    }
    await sleep(800)
  }
  console.log(`\n  Sellos actualizados: ${dryRun ? `${lUpdated + labelCandidates.length - lFailed} [dry-run]` : lUpdated}`)
  console.log(`  Sin imagen en Beatport: ${lFailed}`)
}

console.log('\n  Done.\n')
