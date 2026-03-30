/**
 * UPSERT de sellos (public.labels) vía Supabase REST (service role).
 * Mismas credenciales que actualizar-artista / guia-base-datos.
 *
 *   node scripts/push-labels-batch.mjs
 */

import { createClient } from '@supabase/supabase-js'
import { loadEnvLocal, supabaseApiCredentials } from './lib/artist-upsert.mjs'

/** Nombres canónicos tal como deben mostrarse en web */
const LABEL_NAMES = [
  'Lot49',
  'Against The Grain',
  'Functional Breaks',
  'Super Charged',
  "Distinct'ive Breaks",
  'Westway Records',
  'Bombtraxx Records',
  'Potty Mouth Music',
  'Control Breaks Recordings',
  'Diablo Loco Records',
  'Dead Famous',
  '12 Gauge Records',
  'Never Enough Records',
  'Rag & Bone Records',
  'System Recordings',
  'Tricksta Recordings',
  'Horizontal Records',
  'Generation Recordings',
  'En:Vision Recordings',
  'Menu Music',
]

function slugify(name) {
  return name
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/&/g, 'and')
    .replace(/[''`´]/g, '')
    .replace(/:/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
}

async function main() {
  loadEnvLocal()
  const creds = supabaseApiCredentials()
  if (!creds) {
    console.error(
      'Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY) en .env.local',
    )
    process.exit(1)
  }

  const supabase = createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })

  const rows = LABEL_NAMES.map((name) => ({
    slug: slugify(name),
    name,
    country: '',
    founded_year: null,
    description_en: '',
    description_es: '',
    image_url: null,
    website: null,
    key_artists: [],
    key_releases: [],
    is_active: true,
    is_featured: false,
  }))

  const { data, error } = await supabase
    .from('labels')
    .upsert(rows, { onConflict: 'slug' })
    .select('slug, name')

  if (error) {
    console.error('Supabase:', error.message)
    process.exit(1)
  }

  console.log(`UPSERT OK: ${data.length} sellos`)
  for (const r of data) console.log(`  ${r.slug} → ${r.name}`)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
