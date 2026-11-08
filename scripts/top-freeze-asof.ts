/**
 * Reconstruye el Top 100 tal como estaba en un instante (votos con created_at
 * anterior) y, con --freeze, lo deja como foto de «congela los tops».
 *   npx tsx scripts/top-freeze-asof.ts --asof=2026-11-07T16:18:18.000Z
 *   npx tsx scripts/top-freeze-asof.ts --asof=... --freeze --until=2026-11-30T22:00:00.000Z --note="..."
 * --dump=archivo.json guarda la foto; --from=archivo.json congela esa foto (p. ej.
 * corregida con lo que se vio en directo si luego alguien quitó «+»).
 * El artículo de octubre no se toca: vive en article_freezes.
 */
import { existsSync, readFileSync, writeFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'

for (const file of ['.env', '.env.local']) {
  if (!existsSync(file)) continue
  let text = readFileSync(file, 'utf8')
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1)
  for (const line of text.split('\n')) {
    let t = line.trim()
    if (t.startsWith('export ')) t = t.slice(7).trim()
    if (!t || t.startsWith('#')) continue
    const eq = t.indexOf('=')
    if (eq === -1) continue
    const k = t.slice(0, eq).trim()
    let v = t.slice(eq + 1).trim()
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const arg = (name: string) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const asof = arg('asof') || ''
if (!Number.isFinite(Date.parse(asof))) {
  console.error('Falta --asof=ISO')
  process.exit(1)
}

async function main() {
const { computeCommunityTop } = await import('../src/app/api/public/charts/community-monthly/route')
const { loadCommunityArtistBoard } = await import('../src/lib/community-top-artists')
const { createServiceSupabase } = await import('../src/lib/supabase-admin')

const fromFile = arg('from')
let top
let board
if (fromFile) {
  ;({ top, board } = JSON.parse(readFileSync(fromFile, 'utf8')))
} else {
  const res = await computeCommunityTop(
    new URL(`http://local/api/public/charts/community-monthly?limit=100&artists=150&asof=${encodeURIComponent(asof)}`),
  )
  if (!res.ok) throw new Error(`HTTP ${res.status}`)
  top = await res.json()
  board = await loadCommunityArtistBoard(createServiceSupabase(), Date.parse(asof))
}
const dumpFile = arg('dump')
if (dumpFile) writeFileSync(dumpFile, JSON.stringify({ top, board }))

const madrid = (iso: string) =>
  new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' })
console.log(`Foto a ${madrid(asof)}`)
console.log('--- ARTISTAS ---')
for (const a of top.top_artists.slice(0, 10)) console.log(`${a.rank} ${a.name} ${a.save_count}`)
console.log('--- TEMAS ---')
for (const n of [1, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
  const t = top.top_tracks[n - 1]
  console.log(`${t.rank} ${t.artists} — ${t.title} (${t.save_count} votos, ${t.unique_users} fans, ${t.play_count} escuchas)`)
}
const want = /nxtu|raving again|ai killer|calypso|maya|infinity|boogeyman|runaway stack|lost in you|boombastic/i
for (const t of top.top_tracks) {
  if (want.test(`${t.title} ${t.artists}`)) {
    console.log(`  #${t.rank} ${t.title} votos=${t.save_count} fans=${t.unique_users} escuchas=${t.play_count}`)
  }
}

if (!process.argv.includes('--freeze')) return

const until = arg('until')
if (!until || !Number.isFinite(Date.parse(until)) || Date.parse(until) <= Date.now()) {
  throw new Error('Falta --until=ISO en el futuro')
}
const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim()
if (!url || !key) throw new Error('Faltan credenciales')
const sb = createClient(url, key, { auth: { persistSession: false } })
const { data: open, error: openErr } = await sb
  .from('top_freezes')
  .select('id, until')
  .is('ended_at', null)
  .gt('until', new Date().toISOString())
if (openErr) throw new Error(openErr.message)
if (open?.length) throw new Error(`Ya hay una congelación de tops abierta (#${open[0].id})`)

const now = new Date().toISOString()
const { data: row, error } = await sb
  .from('top_freezes')
  .insert({ frozen_at: now, until, note: arg('note') || null })
  .select('id')
  .single()
if (error) throw new Error(error.message)
const freezeKey = `page:${row.id}`
const { error: snapErr } = await sb.from('public_freeze_snapshots').upsert(
  [
    { freeze_key: freezeKey, item_key: 'community-top', data: top },
    { freeze_key: freezeKey, item_key: 'artist-board', data: board },
  ],
  { onConflict: 'freeze_key,item_key' },
)
if (snapErr) throw new Error(snapErr.message)
console.log(`CONGELADO #${row.id} hasta ${madrid(until)}. Fotos community-top y artist-board guardadas.`)
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
