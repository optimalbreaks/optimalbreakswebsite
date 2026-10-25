/**
 * «Congela los tops» / «descongela el top» (25 oct 2026, migración 097).
 *
 *   node scripts/top-freeze.mjs status
 *   node scripts/top-freeze.mjs freeze [--hours=72] [--note="reel Top 100 artistas"] [--no-warm]
 *   node scripts/top-freeze.mjs unfreeze
 *
 * freeze: abre una fila en `top_freezes` (72 h por defecto). Pasados 65 s (la
 * web cachea el estado 60 s) pide las páginas para que la foto se haga ya, no
 * con la primera visita. Congela Top 100 de temas, artistas y países
 * (/topalltimes), Top 10 de la home, quincena de la home, tarjetas de
 * /topreleases y los números de las fichas de artista.
 * unfreeze: cierra la congelación ahora (`ended_at`) y borra sus fotos. La web
 * vuelve a vivo en ≤ 1 min (≤ 5 min el Top 10 de la home, caché de CDN).
 * Sin unfreeze, se descongela sola al llegar `until`.
 * Las 72 h de cada artículo de quincena/trimestre van solas: no pasan por aquí.
 */
import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const SITE = 'https://www.optimalbreaks.com'

for (const file of ['.env', '.env.local']) {
  const p = join(ROOT, file)
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1)
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
const key = (process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || '').trim()
if (!url || !key) {
  console.error('Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY en .env.local')
  process.exit(1)
}
const sb = createClient(url, key, { auth: { persistSession: false } })

const [cmd = 'status', ...rest] = process.argv.slice(2)
const flag = (name) => rest.find((a) => a.startsWith(`--${name}=`))?.split('=').slice(1).join('=')
const madrid = (iso) =>
  new Date(iso).toLocaleString('es-ES', { timeZone: 'Europe/Madrid', dateStyle: 'medium', timeStyle: 'short' })

async function openFreezes() {
  const { data, error } = await sb
    .from('top_freezes')
    .select('id, frozen_at, until, note')
    .is('ended_at', null)
    .gt('until', new Date().toISOString())
    .order('frozen_at', { ascending: false })
  if (error) throw new Error(error.message)
  return data ?? []
}

async function snapshots(freezeKey) {
  const { data, error } = await sb
    .from('public_freeze_snapshots')
    .select('item_key, captured_at')
    .eq('freeze_key', freezeKey)
    .order('item_key')
  if (error) throw new Error(error.message)
  return data ?? []
}

async function status() {
  const open = await openFreezes()
  if (!open.length) {
    console.log('Tops en directo: no hay ninguna congelación abierta.')
    return
  }
  for (const f of open) {
    console.log(`CONGELADO #${f.id} desde ${madrid(f.frozen_at)} hasta ${madrid(f.until)}${f.note ? ` · ${f.note}` : ''}`)
    const snaps = await snapshots(`page:${f.id}`)
    for (const s of snaps) console.log(`  foto ${s.item_key} · ${madrid(s.captured_at)}`)
    if (!snaps.length) console.log('  (sin fotos aún: se hacen con la primera visita)')
  }
}

async function warm() {
  const paths = [
    '/api/public/charts/community-monthly?limit=100',
    '/es',
    '/es/topreleases',
    '/es/topalltimes',
  ]
  const { data: artist } = await sb.from('artists').select('slug').not('slug', 'is', null).limit(1)
  if (artist?.[0]?.slug) paths.push(`/es/artists/${artist[0].slug}`)
  for (const p of paths) {
    try {
      const res = await fetch(`${SITE}${p}`, { headers: { 'cache-control': 'no-cache' } })
      console.log(`  ${res.status} ${p}`)
    } catch (err) {
      console.log(`  ✗ ${p}: ${err instanceof Error ? err.message : err}`)
    }
  }
}

async function freeze() {
  const open = await openFreezes()
  if (open.length) {
    console.log(`Ya hay una congelación abierta (#${open[0].id}, hasta ${madrid(open[0].until)}). Para rehacer la foto: unfreeze y freeze.`)
    return
  }
  const hours = Number(flag('hours') || 72)
  if (!Number.isFinite(hours) || hours <= 0 || hours > 24 * 14) throw new Error('--hours entre 1 y 336')
  const now = new Date()
  const until = new Date(now.getTime() + hours * 3600 * 1000)
  const { data, error } = await sb
    .from('top_freezes')
    .insert({ frozen_at: now.toISOString(), until: until.toISOString(), note: flag('note') || null })
    .select('id')
    .single()
  if (error) throw new Error(error.message)
  console.log(`Congelado #${data.id}: ${madrid(now.toISOString())} → ${madrid(until.toISOString())} (${hours} h).`)
  if (rest.includes('--no-warm')) return
  console.log('Espero 65 s a que la web vea la congelación y hago las fotos…')
  await new Promise((r) => setTimeout(r, 65_000))
  await warm()
  await status()
}

async function unfreeze() {
  const open = await openFreezes()
  if (!open.length) {
    console.log('No había ninguna congelación abierta: los tops ya están en directo.')
    return
  }
  const ids = open.map((f) => f.id)
  const { error } = await sb.from('top_freezes').update({ ended_at: new Date().toISOString() }).in('id', ids)
  if (error) throw new Error(error.message)
  const { error: delErr } = await sb
    .from('public_freeze_snapshots')
    .delete()
    .in('freeze_key', ids.map((id) => `page:${id}`))
  if (delErr) throw new Error(delErr.message)
  console.log(`Descongelado ${ids.map((id) => `#${id}`).join(', ')}. La web vuelve a directo en ≤ 1 min (Top 10 de la home ≤ 5 min).`)
}

const run = { status, freeze, unfreeze }[cmd]
if (!run) {
  console.error('Uso: node scripts/top-freeze.mjs status | freeze [--hours=72] [--note=…] [--no-warm] | unfreeze')
  process.exit(1)
}
run().catch((err) => {
  console.error(err instanceof Error ? err.message : err)
  process.exit(1)
})
