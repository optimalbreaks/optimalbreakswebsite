/**
 * Temporary: fetch Beatport label images for labels that still have no image_url.
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
const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim(),
  { auth: { persistSession: false } }
)

const SLUGS = [
  'most-valuable-records',
]

for (const slug of SLUGS) {
  const { data: label } = await sb.from('labels').select('slug, name, beatport_id, beatport_url, image_url').eq('slug', slug).single()
  if (!label) { console.log(`  ${slug}: not in DB`); continue }
  if (label.image_url && label.image_url.startsWith('http')) { console.log(`  ${slug}: already has image`); continue }
  if (!label.beatport_id) { console.log(`  ${slug}: no beatport_id`); continue }

  const parsed = label.beatport_url?.match(/\/label\/([a-z0-9-]+)\/(\d+)/)
  const bpSlug = parsed ? parsed[1] : slug
  const bpId = label.beatport_id

  const url = `https://www.beatport.com/label/${bpSlug}/${bpId}`
  process.stdout.write(`  ${slug} (${url})...`)

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': UA, Accept: 'text/html', 'Accept-Language': 'en-US,en;q=0.9' },
    })
    if (!res.ok) { console.log(` ✗ HTTP ${res.status}`); continue }
    const html = await res.text()
    const marker = '__NEXT_DATA__'
    const idx = html.indexOf(marker)
    if (idx === -1) { console.log(' ✗ no __NEXT_DATA__'); continue }
    const start = html.indexOf('>', idx) + 1
    const end = html.indexOf('</script>', start)
    const nd = JSON.parse(html.slice(start, end).trim())
    const queries = nd?.props?.pageProps?.dehydratedState?.queries || []

    const profileQuery = queries.find(q => {
      const k = Array.isArray(q.queryKey) ? q.queryKey[0] : String(q.queryKey ?? '')
      return k === `label-${bpId}`
    })

    const img = profileQuery?.state?.data?.image
    if (!img) { console.log(' ✗ no image in profile'); continue }

    let imgUrl = null
    if (img.dynamic_uri) imgUrl = String(img.dynamic_uri).replace(/\{w\}/g, '500').replace(/\{h\}/g, '500')
    else if (img.uri) imgUrl = String(img.uri)

    if (!imgUrl) { console.log(' ✗ no usable image URL'); continue }

    const { error } = await sb.from('labels').update({ image_url: imgUrl }).eq('slug', slug)
    if (error) { console.log(` ✗ DB: ${error.message}`); continue }
    console.log(` ✓ ${imgUrl.slice(0, 70)}...`)
  } catch (e) {
    console.log(` ✗ ${e.message}`)
  }
}

console.log('\n  Done.\n')
