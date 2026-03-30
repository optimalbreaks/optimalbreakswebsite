/**
 * UPSERT de organizacion + eventos Hibrida Fest vía Supabase REST (service role).
 * Requiere NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (API; sin Postgres).
 * Debe coincidir con supabase/migrations/014_hibrida_fest_organization.sql
 *
 *   node scripts/push-hibrida-fest.mjs
 *   node scripts/push-hibrida-fest.mjs --verify   → solo comprobar columnas + datos (API)
 */

import { readFileSync, existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')

function loadEnvLocal() {
  const p = join(ROOT, '.env.local')
  if (!existsSync(p)) return
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
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1)
    }
    if (process.env[k] === undefined) process.env[k] = v
  }
}

const ORG = {
  slug: 'hibrida-fest',
  name: 'Híbrida Fest',
  country: 'Spain',
  base_city: 'Córdoba',
  founded_year: 2024,
  description_en:
    'Cultural movement focused on breakbeat and forward electronic music for a young audience. It debuted in Cordoba on 16 March 2024 (I edition), followed by 20 July 2024 (II); the third edition is scheduled for 11 April 2026 within Crazy World Festival, with two stages — retro breakbeat and current sounds — and long-format programming (12h+).',
  description_es:
    'Movimiento cultural de musica electronica de vanguardia y breakbeat pensado para publico joven. Debut en Cordoba el 16 de marzo de 2024 (I edicion), seguida del 20 de julio de 2024 (II); la tercera edicion esta prevista el 11 de abril de 2026 en Crazy World Festival, con dos escenarios (breakbeat retro y actual) y programacion de mas de doce horas.',
  website: 'https://www.hibridafest.com/',
  socials: { tickets: 'https://www.hibridafest.com/#entradas' },
  roles: ['promoter'],
  is_active: true,
  is_featured: true,
}

const LINEUP_2026 = [
  'Rennie Pilgrem',
  'Ragga Twins',
  'Lady Waks',
  'Mark XTC',
  'Altern-8',
  'DJ Karpin',
  'Legend Deejays',
  'The Brainkiller',
  'Tortu',
  'Jan B',
  'Mr.Fli',
  'Rasco',
  'DJ Jonay',
  'Terrie Kynd',
  'Jottafrank',
  'Yo Speed',
  'Guau',
  'Bass & Crash',
  'Kültur',
  'Lore Breaks',
  'Norbak',
  'Perfect Kombo',
  'Seekflow',
  'Ylia',
  'Wally',
  'Flyppin',
  'Obscure Sound',
]

/** PostgREST upsert: omitir NOT NULL JSONB/array suele mandar NULL y rompe la fila. */
const EVENT_JSON_DEFAULTS = {
  stages: [],
  schedule: [],
  socials: {},
  tags: [],
}

function eventsPayload(orgId) {
  return [
    {
      ...EVENT_JSON_DEFAULTS,
      slug: 'hibrida-fest-2024-i-edicion',
      name: 'Híbrida Fest 2024 — I Edición (16 marzo)',
      description_en:
        'First edition on 16 March 2024 in Cordoba. Official page documents lineup section, aftermovies (breakbeat / hard techno) and photo gallery.',
      description_es:
        'Primera edicion el 16 de marzo de 2024 en Cordoba. La pagina oficial incluye seccion de lineup, aftermovies (breakbeat / hard techno) y galeria de fotos.',
      event_type: 'past_iconic',
      date_start: '2024-03-16',
      date_end: null,
      location: 'Córdoba, Spain',
      city: 'Córdoba',
      country: 'Spain',
      venue: 'Córdoba',
      website: 'https://www.hibridafest.com/edicion-16-marzo-2024/',
      lineup: [],
      is_featured: false,
      promoter_organization_id: orgId,
    },
    {
      ...EVENT_JSON_DEFAULTS,
      slug: 'hibrida-fest-2024-ii-edicion',
      name: 'Híbrida Fest 2024 — II Edición (20 julio)',
      description_en:
        'Second edition on 20 July 2024 in Cordoba. Official page includes lineup, aftermovie and photo gallery.',
      description_es:
        'Segunda edicion el 20 de julio de 2024 en Cordoba. La pagina oficial incluye lineup, aftermovie y galeria de fotos.',
      event_type: 'past_iconic',
      date_start: '2024-07-20',
      date_end: null,
      location: 'Córdoba, Spain',
      city: 'Córdoba',
      country: 'Spain',
      venue: 'Córdoba',
      website: 'https://www.hibridafest.com/ii-edicion-20-julio-2024/',
      lineup: [],
      is_featured: false,
      promoter_organization_id: orgId,
    },
    {
      ...EVENT_JSON_DEFAULTS,
      slug: 'hibrida-fest-2026',
      name: 'Híbrida Fest 2026',
      description_en:
        'Third edition on 11 April 2026 in Córdoba as a dedicated stage within Crazy World Festival: two stages (retro breakbeat and current), 12+ hours. Lineup reported in specialist press includes Rennie Pilgrem, Ragga Twins, Lady Waks, Mark XTC, Altern-8 and a strong Spanish breaks bill (e.g. DJ Karpin, Norbak, Guau).',
      description_es:
        'Tercera edicion el 11 de abril de 2026 en Cordoba con escenario propio en Crazy World Festival: dos escenarios (breakbeat retro y actual), mas de doce horas. Cartel difundido en prensa especializada incluye Rennie Pilgrem, Ragga Twins, Lady Waks, Mark XTC, Altern-8 y fuerte columna nacional de breaks (DJ Karpin, Norbak, Guau, entre otros).',
      event_type: 'upcoming',
      date_start: '2026-04-11',
      date_end: null,
      location: 'Recinto Ferial El Arenal, Córdoba, Spain',
      city: 'Córdoba',
      country: 'Spain',
      venue: 'Recinto Ferial El Arenal (Crazy World Festival)',
      website: 'https://www.hibridafest.com/',
      lineup: LINEUP_2026,
      is_featured: true,
      promoter_organization_id: orgId,
    },
  ]
}

const HIBRIDA_2026_EXTENDED = {
  stages: [
    {
      name: 'Breakbeat Retro',
      description_en: 'Stage dedicated to the golden era of breakbeat: classic rave anthems, oldskool hardcore and retro breaks.',
      description_es: 'Escenario dedicado a la epoca dorada del breakbeat: himnos clasicos del rave, hardcore oldskool y breaks retro.',
      lineup: [
        'Rennie Pilgrem',
        'Ragga Twins',
        'Mark XTC',
        'Altern-8',
        'Legend Deejays',
        'The Brainkiller',
        'Tortu',
      ],
    },
    {
      name: 'Breakbeat Actual',
      description_en: 'Forward-facing breakbeat, nu-school breaks, bass music and contemporary electronic sounds.',
      description_es: 'Breakbeat de vanguardia, nu-school breaks, bass music y sonidos electronicos contemporaneos.',
      lineup: [
        'Lady Waks',
        'DJ Karpin',
        'Yo Speed',
        'Guau',
        'Norbak',
        'Perfect Kombo',
        'Bass & Crash',
        'Kültur',
        'Lore Breaks',
        'Seekflow',
        'Ylia',
        'Wally',
        'Flyppin',
        'Obscure Sound',
      ],
    },
  ],
  schedule: [
    { time: '16:00', artist: 'Doors open', stage: '', note: 'Apertura de puertas' },
    { time: '16:30', artist: 'Obscure Sound', stage: 'Breakbeat Actual', duration_min: 60 },
    { time: '16:30', artist: 'Tortu (Franxis 90 Special Tribute)', stage: 'Breakbeat Retro', duration_min: 60 },
    { time: '17:30', artist: 'Flyppin', stage: 'Breakbeat Actual', duration_min: 60 },
    { time: '17:30', artist: 'Coofu vs Jimmy', stage: 'Breakbeat Retro', duration_min: 60 },
    { time: '18:30', artist: 'Seekflow', stage: 'Breakbeat Actual', duration_min: 60 },
    { time: '18:30', artist: 'Legend Deejays (Killer & Jordi Slate)', stage: 'Breakbeat Retro', duration_min: 60 },
    { time: '19:30', artist: 'Lore Breaks', stage: 'Breakbeat Actual', duration_min: 60 },
    { time: '19:30', artist: 'The Brainkiller (Special Retro Tear Out Set)', stage: 'Breakbeat Retro', duration_min: 60 },
    { time: '20:30', artist: 'Terrie Kynd B2B Jottafrank', stage: 'Breakbeat Actual', duration_min: 60, is_b2b: true },
    { time: '20:30', artist: 'Mark XTC', stage: 'Breakbeat Retro', duration_min: 75 },
    { time: '21:30', artist: 'Rasco B2B DJ Jonay', stage: 'Breakbeat Actual', duration_min: 60, is_b2b: true },
    { time: '21:45', artist: 'Altern-8', stage: 'Breakbeat Retro', duration_min: 75 },
    { time: '22:30', artist: 'Jan B B2B Mr.Fli', stage: 'Breakbeat Actual', duration_min: 60, is_b2b: true },
    { time: '23:00', artist: 'Ragga Twins', stage: 'Breakbeat Retro', duration_min: 75 },
    { time: '23:30', artist: 'Kültur', stage: 'Breakbeat Actual', duration_min: 60 },
    { time: '00:15', artist: 'Rennie Pilgrem', stage: 'Breakbeat Retro', duration_min: 90 },
    { time: '00:30', artist: 'Bass & Crash', stage: 'Breakbeat Actual', duration_min: 60 },
    { time: '01:30', artist: 'DJ Karpin', stage: 'Breakbeat Actual', duration_min: 75 },
    { time: '01:45', artist: 'Wally', stage: 'Breakbeat Retro', duration_min: 60 },
    { time: '02:45', artist: 'Perfect Kombo', stage: 'Breakbeat Actual', duration_min: 60 },
    { time: '02:45', artist: 'Ylia', stage: 'Breakbeat Retro', duration_min: 60 },
    { time: '03:45', artist: 'Norbak', stage: 'Breakbeat Actual', duration_min: 60 },
    { time: '03:45', artist: 'Lady Waks', stage: 'Breakbeat Retro', duration_min: 75 },
    { time: '05:00', artist: 'Yo Speed B2B Guau', stage: 'Breakbeat Actual', duration_min: 60, is_b2b: true },
  ],
  tickets_url: 'https://www.hibridafest.com/#entradas',
  socials: {},
  age_restriction: '16+ (menores 16-18 con autorizacion parental)',
  tags: ['breakbeat', 'retro', 'bass', 'festival', 'cordoba', 'andalusia'],
  doors_open: '16:00',
  doors_close: '06:00',
  address: 'Recinto Ferial El Arenal, Córdoba, Spain',
  coords: { lat: 37.8882, lng: -4.7794 },
}

async function verifyHibrida(sb) {
  const extendedSelect =
    'slug, name, stages, schedule, tickets_url, tags, doors_open, doors_close, address, coords, age_restriction, lineup, promoter_organization_id'

  const { data: org, error: orgErr } = await sb
    .from('organizations')
    .select('id, slug, name')
    .eq('slug', 'hibrida-fest')
    .maybeSingle()

  if (orgErr) {
    console.error('organizations:', orgErr.message)
    return false
  }
  if (!org) {
    console.error('Falta organizacion slug=hibrida-fest')
    return false
  }
  console.log('Organizacion:', org.slug, '—', org.name)

  const { count: evCount, error: cntErr } = await sb
    .from('events')
    .select('*', { count: 'exact', head: true })
    .eq('promoter_organization_id', org.id)

  if (cntErr) {
    console.error('conteo eventos:', cntErr.message)
    return false
  }
  console.log('Eventos del promotor:', evCount ?? 0, '(esperado 3)')

  const { data: row, error: evErr } = await sb
    .from('events')
    .select(extendedSelect)
    .eq('slug', 'hibrida-fest-2026')
    .maybeSingle()

  if (evErr) {
    console.error('events hibrida-fest-2026:', evErr.message)
    return false
  }
  if (!row) {
    console.error('Falta evento slug=hibrida-fest-2026')
    return false
  }

  const stages = row.stages
  const schedule = row.schedule
  const tags = row.tags
  const okStages = Array.isArray(stages) && stages.length >= 2
  const okSchedule = Array.isArray(schedule) && schedule.length >= 5
  const okTags = Array.isArray(tags) && tags.length > 0
  const okTickets = typeof row.tickets_url === 'string' && row.tickets_url.startsWith('http')
  const okCoords = row.coords && typeof row.coords === 'object'

  console.log('hibrida-fest-2026:')
  console.log('  stages:', Array.isArray(stages) ? stages.length : 'NO ARRAY', okStages ? 'OK' : 'FALLO')
  console.log('  schedule:', Array.isArray(schedule) ? schedule.length : 'NO ARRAY', okSchedule ? 'OK' : 'FALLO')
  console.log('  tags:', Array.isArray(tags) ? tags.length : 'NO ARRAY', okTags ? 'OK' : 'FALLO')
  console.log('  tickets_url:', okTickets ? 'OK' : 'FALLO')
  console.log('  doors_open / doors_close:', row.doors_open ?? '—', '/', row.doors_close ?? '—')
  console.log('  address:', row.address ? 'OK' : 'FALLO')
  console.log('  coords:', okCoords ? 'OK' : 'FALLO')
  console.log('  lineup (legacy array):', Array.isArray(row.lineup) ? row.lineup.length : 0, 'nombres')

  const allOk = okStages && okSchedule && okTags && okTickets && (evCount ?? 0) >= 3
  if (allOk) {
    console.log('\nVERIFICACION: OK — migracion 015 + datos extendidos visibles por API.')
  } else {
    console.log('\nVERIFICACION: revisar — ejecuta de nuevo: node scripts/push-hibrida-fest.mjs')
  }
  return allOk
}

async function main() {
  loadEnvLocal()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key =
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    process.env.SUPABASE_SECRET_KEY?.trim() ||
    ''
  if (!url || !key) {
    console.error(
      'Falta NEXT_PUBLIC_SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY) en .env.local',
    )
    process.exit(1)
  }

  const sb = createClient(url, key)

  if (process.argv.includes('--verify')) {
    const ok = await verifyHibrida(sb)
    process.exit(ok ? 0 : 1)
  }

  const { data: orgRow, error: orgErr } = await sb
    .from('organizations')
    .upsert(ORG, { onConflict: 'slug' })
    .select('id')
    .single()

  if (orgErr) {
    console.error('organizations:', orgErr.message)
    process.exit(1)
  }

  const orgId = orgRow.id
  const events = eventsPayload(orgId)
  const hibridaIdx = events.findIndex((e) => e.slug === 'hibrida-fest-2026')
  if (hibridaIdx !== -1) {
    Object.assign(events[hibridaIdx], HIBRIDA_2026_EXTENDED)
  }

  const { error: evErr } = await sb
    .from('events')
    .upsert(events, { onConflict: 'slug' })

  if (evErr) {
    console.error('events:', evErr.message)
    process.exit(1)
  }

  await sb.from('events').delete().eq('slug', 'hibrida-fest-2025-ii-edicion')

  console.log('OK — Hibrida Fest: organizacion + 3 eventos (upsert con datos extendidos).')
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
