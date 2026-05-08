/**
 * Borra una fila de public.artists por slug vía REST (service role).
 * Desliga public.mixes.artist_id (FK sin CASCADE en esquema original).
 *
 * Uso: node scripts/delete-artist-by-slug.mjs <slug>
 * Índice: node scripts/guia-base-datos.mjs run delete-artist-slug <slug>
 */
import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'

loadEnvLocal()
const slug = (process.argv[2] || '').trim().replace(/\.json$/i, '')
if (!slug) {
  console.error('Uso: node scripts/delete-artist-by-slug.mjs <slug>')
  process.exit(1)
}

const creds = supabaseApiCredentials()
if (!creds) {
  console.error('Faltan NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SECRET) en .env.local')
  process.exit(1)
}

const sb = createClient(creds.url, creds.key, { auth: { persistSession: false } })

const { data: row, error: eFind } = await sb.from('artists').select('id,slug,name').eq('slug', slug).maybeSingle()
if (eFind) throw eFind
if (!row) {
  console.error(`No existe artista slug=${slug}`)
  process.exit(1)
}

console.log('Borrar:', row.slug, '|', row.name, '| id:', row.id)

const { data: mixes, error: eMixCount } = await sb.from('mixes').select('id,slug').eq('artist_id', row.id)
if (eMixCount) throw eMixCount
if (mixes?.length) {
  console.log(`Desligando mixes (${mixes.length}):`, mixes.map((m) => m.slug).join(', '))
}

const { error: eUm } = await sb.from('mixes').update({ artist_id: null }).eq('artist_id', row.id)
if (eUm) throw eUm

const { error: eDel } = await sb.from('artists').delete().eq('id', row.id)
if (eDel) throw eDel

console.log('OK eliminado de Supabase. (favoritos/avisajes en cascada si aplica)')
process.exit(0)
