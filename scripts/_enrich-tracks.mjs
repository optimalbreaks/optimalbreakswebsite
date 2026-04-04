import { readFileSync, writeFileSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'

function parseNextData(html) {
  const idx = html.indexOf('__NEXT_DATA__')
  if (idx === -1) return null
  const start = html.indexOf('>', idx) + 1
  const end = html.indexOf('</script>', start)
  try { return JSON.parse(html.slice(start, end).trim()) } catch { return null }
}

async function enrichFromRelease(releaseUrl) {
  console.log('  Fetching:', releaseUrl)
  const res = await fetch(releaseUrl, { headers: { 'User-Agent': UA, Accept: 'text/html' } })
  if (!res.ok) return null
  const nd = parseNextData(await res.text())
  if (!nd) return null

  const queries = nd?.props?.pageProps?.dehydratedState?.queries || []
  for (const q of queries) {
    const d = q?.state?.data
    if (d && d.results && Array.isArray(d.results) && d.results.length > 0 && d.results[0].bpm !== undefined) {
      const t = d.results[0]
      const pickImg = (img) => {
        if (!img) return ''
        if (img.dynamic_uri) return String(img.dynamic_uri).replace(/\{w\}/g, '250').replace(/\{h\}/g, '250')
        return img.uri || ''
      }
      return {
        slug: t.slug, id: t.id,
        bpm: t.bpm || null,
        key: t.key?.name || '',
        sample_url: t.sample_url || '',
        mix_name: t.mix_name || '',
        title: t.name || '',
        artists: (t.artists || []).map(a => ({ name: a.name })),
        label: t.release?.label?.name || '',
        artwork: pickImg(t.release?.image) || pickImg(t.image),
        year: (() => {
          const raw = t.publish_date || t.new_release_date
          if (!raw) return null
          const m = String(raw).match(/^(\d{4})/)
          return m ? parseInt(m[1], 10) : null
        })(),
      }
    }
  }
  return null
}

async function main() {
  const jsonPath = join(ROOT, 'data', 'charts', 'picks', '2026-03-30.json')
  const data = JSON.parse(readFileSync(jsonPath, 'utf8'))
  let updated = 0

  for (const pick of data.picks) {
    if (pick.platform !== 'beatport') { console.log('  Skip (not beatport):', pick.title); continue }

    const details = await enrichFromRelease(pick.link_url)
    if (!details) { console.log('    No track data found'); continue }

    if (details.bpm) pick.bpm = details.bpm
    if (details.key) pick.music_key = details.key
    if (details.sample_url) pick.sample_url = details.sample_url
    if (details.mix_name) pick.mix_name = details.mix_name
    if (details.title) pick.title = details.title
    if (details.artists?.length) pick.artists = details.artists
    if (details.label) pick.label = details.label
    if (details.artwork) pick.artwork_url = details.artwork
    if (details.year) pick.release_year = details.year
    if (details.slug && details.id) pick.link_url = `https://www.beatport.com/track/${details.slug}/${details.id}`

    console.log('    OK:', pick.title, '|', details.bpm, 'BPM |', details.key, '| sample:', details.sample_url ? 'YES' : 'no')
    updated++
  }

  writeFileSync(jsonPath, JSON.stringify(data, null, 2) + '\n')
  console.log(`\nActualizado: ${jsonPath} (${updated} picks enriquecidos)`)
}

main().catch(e => { console.error(e); process.exit(1) })
