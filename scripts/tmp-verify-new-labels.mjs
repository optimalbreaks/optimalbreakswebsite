import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
for (const f of ['.env', '.env.local']) {
  const p = join(ROOT, f)
  if (!existsSync(p)) continue
  let t = readFileSync(p, 'utf8')
  if (t.charCodeAt(0) === 0xfeff) t = t.slice(1)
  for (const l of t.split('\n')) {
    let x = l.trim()
    if (x.startsWith('export ')) x = x.slice(7).trim()
    if (!x || x.startsWith('#')) continue
    const eq = x.indexOf('=')
    if (eq === -1) continue
    const k = x.slice(0, eq).trim()
    let v = x.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1)
    if (!process.env[k]) process.env[k] = v
  }
}

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim(),
  { auth: { persistSession: false } }
)

const slugs = [
  'banana-club','punks','funktasty-crew-records','electrobreakz','lowering-the-tone',
  'jungle-cakes','13monkeys-records','most-valuable-records','dirty-kitchen-rave',
  'space-pizza-records','br8kn-records','bombstrikes','rough-division','guachinche-records',
  'old-skool-records','jalapeno-records','crosspoint-records','cyberfunk-music',
  'etiqueta-negra','pata-negra-records','westwood-recordings','breakbeat-paradise-recordings',
  'bass-win','cyclone-records','rebel-bass','more-time-records','architektur-records',
  'frequency-fusion-records',
]

const { data } = await sb.from('labels').select('slug, name, description_en, image_url, beatport_id, beatport_top_tracks').in('slug', slugs)

let ok = 0, noBio = 0, noImg = 0, noTracks = 0

for (const l of data.sort((a, b) => a.slug.localeCompare(b.slug))) {
  const hasBio = l.description_en && l.description_en.length > 100
  const hasImg = !!l.image_url
  const hasTracks = l.beatport_top_tracks && l.beatport_top_tracks.length > 0
  const problems = []
  if (!hasBio) { problems.push('NO-BIO'); noBio++ }
  if (!hasImg) { problems.push('NO-IMG'); noImg++ }
  if (!hasTracks) { problems.push('NO-TRACKS'); noTracks++ }
  if (problems.length === 0) ok++
  const bioLen = (l.description_en || '').length
  const trackCount = (l.beatport_top_tracks || []).length
  console.log(
    `${problems.length ? ' X' : 'OK'} ${l.slug.padEnd(36)} bio:${String(bioLen).padStart(5)}  img:${hasImg ? 'YES' : 'NO '}  bp:${l.beatport_id || '-'}  tracks:${trackCount}${problems.length ? '  [' + problems.join(', ') + ']' : ''}`
  )
}

console.log(`\nCompletos: ${ok} / ${data.length}`)
console.log(`Sin bio larga: ${noBio}`)
console.log(`Sin imagen: ${noImg}`)
console.log(`Sin tracks: ${noTracks}`)
