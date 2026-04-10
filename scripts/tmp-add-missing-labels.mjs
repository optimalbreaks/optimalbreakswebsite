/**
 * Temporary script: add 28 missing labels to the database + create JSON files.
 * Then search Beatport for their IDs and scrape Top 10 tracks.
 */

import { readFileSync, writeFileSync, existsSync } from 'fs'
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
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim(),
  { auth: { persistSession: false } }
)

const dryRun = process.argv.includes('--dry-run')

const NEW_LABELS = [
  { slug: 'banana-club', name: 'Banana Club', country: 'ES', key_artists: ['TOMY', 'Bowser', 'FM-3', 'PAVANE', 'Fran Break', 'RULER', 'Le Duke'] },
  { slug: 'punks', name: 'Punks', country: 'US', key_artists: ['Mafia Kiss', 'Wes Smith', 'Wizard', '601', 'Left/Right', 'UFO Project'] },
  { slug: 'funktasty-crew-records', name: 'Funktasty Crew Records', country: 'RU', key_artists: ['Bad Legs', 'SevenG', 'Coofu', 'KL2', 'SeekFlow', 'Perfect Kombo'] },
  { slug: 'electrobreakz', name: 'ElectroBreakz', country: null, key_artists: ['Geon', 'Inner Realms', 'Lady Waks', 'Coofu', 'Godino', 'Anuschka'] },
  { slug: 'lowering-the-tone', name: 'Lowering The Tone', country: 'UK', key_artists: ['Elite Force', 'Kid Blue', 'Dylan Rhymes', 'VENT', 'Peter Paul', 'Meat Katie'] },
  { slug: 'jungle-cakes', name: 'Jungle Cakes', country: 'UK', key_artists: ['Ed Solo', 'Deekline', 'Specimen A', 'Beat Assassins', 'Dub Pistols', 'Lady Waks'] },
  { slug: '13monkeys-records', name: '13monkeys Records', country: null, key_artists: ['Elite Force', 'Colombo', 'Jordi Slate', 'Terrie Kynd', 'Sekret Chadow'] },
  { slug: 'most-valuable-records', name: 'Most Valuable Records', country: 'UK', key_artists: ['Krafty Kuts', 'MVPZ', 'Johanna Phraze', 'Amp Live', 'The Gaff'] },
  { slug: 'dirty-kitchen-rave', name: 'DIRTY KITCHEN RAVE', country: null, key_artists: ['Specimen A', 'Inner Realms', 'Vazteria X', 'Godino', 'Afghan Headspin'] },
  { slug: 'space-pizza-records', name: 'SPACE PIZZA Records', country: null, key_artists: ['Bad Legs', 'SevenG', 'Fran Break', 'Coofu', 'Terrie Kynd', 'JN CRUZ'] },
  { slug: 'br8kn-records', name: 'Br8kn Records', country: null, key_artists: ['AndrewFx', 'SeekFlow', 'Montylla', 'MIAU', 'Devis Hard'] },
  { slug: 'bombstrikes', name: 'Bombstrikes', country: 'UK', key_artists: ['WBBL', 'Fort Knox Five', 'A.Skillz', 'Featurecast', 'Nick Thayer', 'The Gaff'] },
  { slug: 'rough-division', name: 'Rough Division', country: 'ES', key_artists: ['Fran Break', 'DJ Quest', 'SeekFlow', 'Anuschka', 'DJ Karpin', 'Zerostailaz'] },
  { slug: 'guachinche-records', name: 'Guachinche Records', country: 'ES', key_artists: ['Fran Break', 'Mutantbreakz', 'Anuschka', 'Manu Twister', 'Xwile', 'Norbak'] },
  { slug: 'old-skool-records', name: 'Old Skool Records', country: null, key_artists: ['AndrewFx', 'DJ Genesis', 'Digital Base', 'Loopcrashing', 'Devis Hard'] },
  { slug: 'jalapeno-records', name: 'Jalapeno Records', country: 'UK', key_artists: ['Featurecast', 'Skeewiff', 'Basement Freaks', 'Fort Knox Five'] },
  { slug: 'crosspoint-records', name: 'CrossPoint Records', country: null, key_artists: ['Quadrat Beat', 'Shockillaz', 'Under This'] },
  { slug: 'cyberfunk-music', name: 'Cyberfunk Music', country: 'UK', key_artists: ['DJ Quest', 'The Breakfastaz', 'Deep Impact', 'Baobinga'] },
  { slug: 'etiqueta-negra', name: 'Etiqueta Negra', country: 'ES', key_artists: ['TOMY', 'Le Duke', 'Lototskiy'] },
  { slug: 'pata-negra-records', name: 'Pata Negra Records', country: 'ES', key_artists: ['Vazteria X', 'Anuschka', 'Sekret Chadow', 'Cerbero'] },
  { slug: 'westwood-recordings', name: 'Westwood Recordings', country: 'CA', key_artists: ['Father Funk', 'A.Skillz', 'Featurecast', 'The Gaff', 'Slynk'] },
  { slug: 'breakbeat-paradise-recordings', name: 'Breakbeat Paradise Recordings', country: 'DK', key_artists: ['BadboE', 'All Good Funk Alliance', 'Basement Freaks'] },
  { slug: 'bass-win', name: 'Bass=Win', country: null, key_artists: ['BreaksMafia', 'Rico Tubbs', 'Atomic Hooligan'] },
  { slug: 'cyclone-records', name: 'Cyclone Records', country: 'UK', key_artists: ['Dub Pistols', 'Freestylers', 'Barry Ashworth'] },
  { slug: 'rebel-bass', name: 'Rebel Bass', country: null, key_artists: ['Borez', 'Jem Haynes'] },
  { slug: 'more-time-records', name: 'More Time Records', country: 'UK', key_artists: ['Arthi', 'Sam Interface', 'Stush'] },
  { slug: 'architektur-records', name: 'Architektur Records', country: null, key_artists: ['Dubaxface', 'AndrewFx', 'Inner Realms'] },
  { slug: 'frequency-fusion-records', name: 'Frequency Fusion Records', country: null, key_artists: ['Coofu', 'Godino', 'Drumback', 'Sellrude'] },
]

// --- STEP 1: Create JSON files and UPSERT ---
console.log('\n  === PASO 1: Crear JSONs y UPSERT en Supabase ===\n')

for (const label of NEW_LABELS) {
  const jsonPath = join(ROOT, 'data', 'labels', `${label.slug}.json`)
  const jsonData = {
    slug: label.slug,
    name: label.name,
    country: label.country || '-',
    founded_year: null,
    description_en: `${label.name} is an active record label in the breaks and bass music scene.`,
    description_es: `${label.name} es un sello activo en la escena del breaks y la música bass.`,
    image_url: null,
    website: null,
    key_artists: label.key_artists,
    key_releases: [],
    is_active: true,
    is_featured: false,
  }

  if (!dryRun) writeFileSync(jsonPath, JSON.stringify(jsonData, null, 2) + '\n')
  process.stdout.write(`  [JSON] ${label.slug}`)

  if (!dryRun) {
    const { error } = await sb.from('labels').upsert(jsonData, { onConflict: 'slug' })
    if (error) {
      console.log(` ✗ DB: ${error.message}`)
    } else {
      console.log(' ✓')
    }
  } else {
    console.log(' [dry-run]')
  }
}

// --- STEP 2: Search Beatport for IDs + Top 10 ---
console.log('\n  === PASO 2: Buscar en Beatport + Top 10 ===\n')

function toSlug(name) {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')
}

async function searchBeatportLabel(name) {
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
      const labelsArr = query?.state?.data?.labels?.data || []
      for (const r of labelsArr) {
        const rName = (r.label_name || r.name || '').toLowerCase().trim()
        const rId = r.label_id || r.id
        if (rName === targetLower && rId) {
          return { slug: toSlug(r.label_name || r.name), id: rId, name: r.label_name || r.name }
        }
      }
      const genericResults = query?.state?.data?.results || []
      for (const r of genericResults) {
        if (r.slug && r.id && typeof r.id === 'number') {
          const rName = (r.name || '').toLowerCase().trim()
          if (rName === targetLower) return { slug: r.slug, id: r.id, name: r.name }
        }
      }
    }

    const labelPattern = /\/label\/([a-z0-9-]+)\/(\d+)/g
    let match
    const seen = new Set()
    while ((match = labelPattern.exec(html)) !== null) {
      const [, lSlug, lId] = match
      if (seen.has(lSlug)) continue
      seen.add(lSlug)
      const cleanSlug = lSlug.replace(/-/g, ' ').toLowerCase()
      const targetClean = name.toLowerCase().replace(/[^a-z0-9 ]/g, '').trim()
      if (cleanSlug === targetClean || cleanSlug.includes(targetClean) || targetClean.includes(cleanSlug)) {
        return { slug: lSlug, id: parseInt(lId, 10), name }
      }
    }
    return null
  } catch { return null }
}

async function scrapeTopTracks(bpSlug, bpId) {
  const bpUrl = `https://www.beatport.com/label/${bpSlug}/${bpId}`
  try {
    const res = await fetch(bpUrl, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    })
    if (!res.ok) return []
    const html = await res.text()
    const marker = '__NEXT_DATA__'
    const idx = html.indexOf(marker)
    if (idx === -1) return []
    const start = html.indexOf('>', idx) + 1
    const end = html.indexOf('</script>', start)
    const nd = JSON.parse(html.slice(start, end).trim())
    const queries = nd?.props?.pageProps?.dehydratedState?.queries || []

    const topQuery = queries.find(q => {
      const k = Array.isArray(q.queryKey) ? q.queryKey[0] : String(q.queryKey ?? '')
      return k.includes(`label-${bpId}-top-10-tracks`)
    })
    if (!topQuery) return []

    return (topQuery.state?.data?.results || []).map((t, i) => {
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
  } catch { return [] }
}

let found = 0, notFound = 0
for (let i = 0; i < NEW_LABELS.length; i++) {
  const label = NEW_LABELS[i]
  process.stdout.write(`  [${i + 1}/${NEW_LABELS.length}] ${label.name} (${label.slug})...`)

  const bp = await searchBeatportLabel(label.name)
  if (!bp) {
    console.log(' ✗ not found on Beatport')
    notFound++
    await sleep(800)
    continue
  }

  console.log(` → ${bp.slug}/${bp.id}`)
  const tracks = await scrapeTopTracks(bp.slug, bp.id)

  if (!dryRun) {
    const updatePayload = {
      beatport_id: bp.id,
      beatport_url: `https://www.beatport.com/label/${bp.slug}/${bp.id}`,
    }
    if (tracks.length > 0) {
      updatePayload.beatport_top_tracks = tracks
      updatePayload.beatport_top_tracks_updated_at = new Date().toISOString()
    }
    const { error } = await sb.from('labels').update(updatePayload).eq('slug', label.slug)
    if (error) {
      console.log(`    ✗ DB: ${error.message}`)
    } else {
      console.log(`    ✓ ${tracks.length} tracks saved`)
    }
  } else {
    console.log(`    ✓ ${tracks.length} tracks [dry-run]`)
  }

  found++
  await sleep(1200)
}

console.log(`\n  === RESUMEN ===`)
console.log(`  Sellos creados: ${NEW_LABELS.length}`)
console.log(`  Encontrados en Beatport: ${found}`)
console.log(`  No encontrados: ${notFound}`)
if (dryRun) console.log(`  [modo dry-run]`)
console.log()
