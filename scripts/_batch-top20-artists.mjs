/**
 * Lote editorial: Top 20 artistas sin ficha (contacto + Karmic Waves saves)
 * node scripts/_batch-top20-artists.mjs [--agents-only|--post-only] [--revise]
 */
import { spawnSync } from 'child_process'
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'fs'
import { dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { upsertArtist, loadEnvLocal } from './lib/artist-upsert.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = join(__dirname, '..')
const NOTES_DIR = join(ROOT, 'scripts', '_notes', 'top20-artists')
const ARTISTS_DIR = join(ROOT, 'data', 'artists')

const ARTISTS = [
  { slug: 'k5', name: 'K5', beatport_id: 36761, country: 'US', category: 'us_artist', sort: 120, hint: 'Kevin Shiver; Florida breaks clásico. Editorial saves: Passion.' },
  { slug: 'four-motion', name: 'Four Motion', beatport_id: 138396, country: 'ES', category: 'current', sort: 121, hint: 'Productor español breaks; Paranoia, Bad Vip, Fizzy, Criminal, Skywalker.' },
  { slug: 'mizzo', name: 'Mizzo', beatport_id: 605037, country: 'US', category: 'us_artist', sort: 122, hint: 'USA (North Carolina); JNCO, It\'s A Vibe, How I Do Dat; Florida/booty breaks orbit.' },
  { slug: 'citybox', name: 'Citybox', beatport_id: 503314, country: 'UA', category: 'current', sort: 123, hint: 'Dúo Eugene + Alex (Mechanical Pressure); ucraniano; Got To Have It, Oud, Badman, No Limits.' },
  { slug: 'killbeat-sp', name: 'KillBeat (SP)', beatport_id: 445682, country: 'ES', category: 'current', sort: 124, hint: 'España; no confundir con killbeat/701157; You Win, Juice, Code 69, Square.' },
  { slug: 'mume', name: 'Müme', beatport_id: 946754, country: 'ES', category: 'current', sort: 125, hint: 'Beatport Müme; Flexen, Cyclone, The Technique, Origen; escena española.' },
  { slug: 'deejay-shaolin', name: 'Deejay Shaolin', beatport_id: 262767, country: 'US', category: 'us_artist', sort: 126, hint: 'Texas/USA; The Spice Must Flow, Passion, Electro Booty; booty breaks.' },
  { slug: 'neuroziz', name: 'NeuroziZ', beatport_id: 441407, country: 'US', category: 'us_artist', sort: 127, hint: 'Miami FL; Places, Runnin, I\'m just fallin, Stay in Place!, Loose Control; con G$Montana y alias GN.' },
  { slug: 'gmontana', name: 'G$Montana', beatport_id: 513861, country: 'US', category: 'us_artist', sort: 128, hint: 'Miami FL; mismo pack Places/Runnin con NeuroziZ; GN es alias del dúo.' },
  { slug: 'gn', name: 'GN', beatport_id: 594465, country: 'US', category: 'crew', sort: 129, hint: 'Alias Beatport del dúo G$Montana + NeuroziZ; créditos conjuntos Miami booty/breaks.' },
  { slug: 'mosky', name: 'Mosky', beatport_id: 916270, country: 'ES', category: 'current', sort: 130, hint: 'Huelva; Fogo, Bomba, Heartbeat.' },
  { slug: 'welder-b', name: 'Welder B', beatport_id: 1212957, country: 'ES', category: 'current', sort: 131, hint: 'Beatport Welder B; charts como WelderB; Broken Control, AFFRICAN, Radar, Obsidian Flow.' },
  { slug: 'playbass', name: 'Playbass', beatport_id: 543065, country: 'ES', category: 'current', sort: 132, hint: 'Wrap, Blood Oath, Mysterious Tides, Sugar D.' },
  { slug: 'beatloud', name: 'Beatloud', beatport_id: 827594, country: 'ES', category: 'current', sort: 133, hint: 'Huelva; All Day, Deep Hit, Gimme More.' },
  { slug: 'k-gune', name: 'K-Gune', beatport_id: 1218623, country: 'ES', category: 'current', sort: 134, hint: 'Steve End, Limit, Get It.' },
  { slug: 'bnm-sp', name: 'BNM (SP)', beatport_id: 442717, country: 'ES', category: 'current', sort: 135, hint: 'Break Nunca Muere; Pussy Music, Little Bass, Remember Darks; no confundir con bnm/24810.' },
  { slug: 'dj-justin-johnson', name: 'DJ Justin Johnson', beatport_id: 29480, country: 'US', category: 'us_artist', sort: 136, hint: 'West Coast USA; Good Time, The System.' },
  { slug: 'the-push', name: 'The Push', beatport_id: 57581, country: 'UK', category: 'uk_legend', sort: 137, hint: 'UK breaks; Ca$h, Take Off, Here We Go.' },
  { slug: 'swarov', name: 'Swarov', beatport_id: 915641, country: 'SK', category: 'current', sort: 138, hint: 'Breaks.sk Eslovaquia; Ping Pong, Guardians Of Space, Mathematical.' },
  { slug: 'alrodant', name: 'Alrodant', beatport_id: 2415608, country: 'ES', category: 'current', sort: 139, hint: 'España/Br8kn; Set You Free, Me Pone, Alrodant-24 7Love.' },
]

const mode = process.argv.includes('--post-only') ? 'post' : process.argv.includes('--agents-only') ? 'agents' : 'all'
const revise = process.argv.includes('--revise')

function runNode(script, args, label) {
  console.log(`\n>>> ${label}`)
  const r = spawnSync(process.execPath, [join('scripts', script), ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: {
      ...process.env,
      NODE_TLS_REJECT_UNAUTHORIZED: '0',
      OB_NO_SYSTEM_CA: '1',
    },
  })
  if (r.status !== 0) throw new Error(`${label} falló (exit ${r.status})`)
}

function beatportUrl(slug, id) {
  return `https://www.beatport.com/artist/${slug}/${id}`
}

function patchJson(meta) {
  const p = join(ARTISTS_DIR, `${meta.slug}.json`)
  if (!existsSync(p)) throw new Error(`Falta JSON: ${p}`)
  const data = JSON.parse(readFileSync(p, 'utf8'))
  data.beatport_id = meta.beatport_id
  data.beatport_url = beatportUrl(meta.slug, meta.beatport_id)
  data.country = meta.country
  if (meta.category) data.category = meta.category
  data.sort_order = meta.sort
  if (meta.slug === 'welder-b') {
    data.name = 'Welder B'
    data.name_display = 'WELDER B'
  }
  if (meta.slug === 'gn') {
    data.name_display = data.name_display || 'GN'
  }
  writeFileSync(p, `${JSON.stringify(data, null, 2)}\n`)
  return data
}

mkdirSync(NOTES_DIR, { recursive: true })
loadEnvLocal()

const failed = []

if (mode === 'all' || mode === 'agents') {
  for (const meta of ARTISTS) {
    const notePath = join(NOTES_DIR, `${meta.slug}.txt`)
    writeFileSync(
      notePath,
      `Beatport artist page: ${beatportUrl(meta.slug, meta.beatport_id)} (id ${meta.beatport_id}).\n${meta.hint}\nPaís editorial: ${meta.country}. Categoría sugerida: ${meta.category}.\nNo mencionar Optimal Breaks ni el chart en las bios.`,
      'utf8',
    )
    try {
      runNode(
        'generar-artista-agente.mjs',
        [
          meta.slug,
          meta.name,
          '--save-json',
          ...(revise ? ['--revise'] : []),
          '--notes',
          notePath,
        ],
        `agent ${meta.slug}`,
      )
      patchJson(meta)
    } catch (e) {
      console.error(`[FAIL] ${meta.slug}:`, e.message)
      failed.push(meta.slug)
    }
  }
}

if (mode === 'all' || mode === 'post') {
  for (const meta of ARTISTS) {
    if (failed.includes(meta.slug)) continue
    const jsonPath = join(ARTISTS_DIR, `${meta.slug}.json`)
    if (!existsSync(jsonPath)) {
      failed.push(meta.slug)
      continue
    }
    try {
      patchJson(meta)
      runNode('guia-base-datos.mjs', ['run', 'artist-json', meta.slug], `upsert ${meta.slug}`)
      runNode(
        'guia-base-datos.mjs',
        ['run', 'beatport-top', 'artist', meta.slug, String(meta.beatport_id)],
        `beatport-top ${meta.slug}`,
      )
    } catch (e) {
      console.error(`[POST FAIL] ${meta.slug}:`, e.message)
      failed.push(meta.slug)
    }
  }

  const photoSlugs = ARTISTS.map((a) => a.slug).filter((s) => !failed.includes(s))
  if (photoSlugs.length) {
    try {
      runNode('elegir-foto-artista.mjs', photoSlugs, 'fotos lote')
    } catch (e) {
      console.warn('[fotos] parcial:', e.message)
    }
  }

  for (const meta of ARTISTS) {
    if (failed.includes(meta.slug)) continue
    try {
      runNode(
        'spotify-match-charts.mjs',
        [`--service=spotify`, `--table=artists`, `--slug=${meta.slug}`],
        `spotify ${meta.slug}`,
      )
    } catch {
      /* quota / skip */
    }
    try {
      runNode(
        'spotify-match-charts.mjs',
        [`--service=tidal`, `--table=artists`, `--slug=${meta.slug}`],
        `tidal ${meta.slug}`,
      )
    } catch {
      /* skip */
    }
  }
}

console.log('\n=== Resumen ===')
console.log('OK:', ARTISTS.length - failed.length, '/', ARTISTS.length)
if (failed.length) console.log('Fallos:', failed.join(', '))
