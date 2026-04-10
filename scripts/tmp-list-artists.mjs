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

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim()
const sb = createClient(url, key, { auth: { persistSession: false } })

const { data, error } = await sb.from('artists').select('slug, name, category, era, beatport_id').order('slug')
if (error) { console.error(error); process.exit(1) }

const already = data.filter(a => a.beatport_id)
const candidates = data.filter(a => !a.beatport_id)

console.log(`=== YA TIENEN BEATPORT_ID (${already.length}) ===`)
already.forEach(a => console.log(`  ${a.slug} (${a.beatport_id})`))

console.log(`\n=== SIN BEATPORT_ID (${candidates.length}) ===`)
candidates.forEach(a => console.log(`${a.slug} | ${a.name} | ${a.category || '-'} | ${a.era || '-'}`))
