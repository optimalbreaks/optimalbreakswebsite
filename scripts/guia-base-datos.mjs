/**
 * OPTIMAL BREAKS — Guía y frontera única para tocar Supabase/Postgres desde el agente
 *
 * Quién ejecuta esto: el asistente (Cursor), no el usuario final. Si alguien pide
 * «actualizar la base de datos», el agente corre los comandos aquí definidos.
 *
 *   node scripts/guia-base-datos.mjs              → ayuda legible
 *   node scripts/guia-base-datos.mjs --json       → catálogo máquina (JSON)
 *   node scripts/guia-base-datos.mjs run <orden> … → delega al script real
 *
 * Ejemplos run:
 *   node scripts/guia-base-datos.mjs run artist-json fatboy-slim
 *   node scripts/guia-base-datos.mjs run artist-file data/artists/deekline.json
 *   node scripts/guia-base-datos.mjs run migrate
 *   node scripts/guia-base-datos.mjs run agent -- krafty-kuts "Krafty Kuts"
 *   node scripts/guia-base-datos.mjs run photo -- fatboy-slim
 */

import { spawnSync } from 'child_process'
import { existsSync } from 'fs'
import { dirname, join, resolve } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const SCRIPTS = join(ROOT, 'scripts')

/** @type {{ id: string, run: string, npm?: string, creds: string, description: string }[]} */
const ACTIONS = [
  {
    id: 'artist-json',
    run: 'node scripts/guia-base-datos.mjs run artist-json <slug>',
    npm: 'npm run db:guia -- run artist-json <slug>',
    creds: 'DATABASE_URL o SUPABASE_DB_PASSWORD+URL o SERVICE_ROLE+NEXT_PUBLIC_SUPABASE_URL',
    description:
      'UPSERT de un artista desde data/artists/<slug>.json (tras editar el JSON en repo).',
  },
  {
    id: 'artist-file',
    run: 'node scripts/guia-base-datos.mjs run artist-file <ruta-desde-raíz>',
    npm: 'npm run db:guia -- run artist-file data/artists/x.json',
    creds: 'Igual que artist-json',
    description: 'UPSERT desde cualquier ruta de JSON relativa al repo.',
  },
  {
    id: 'ensure',
    run: 'node scripts/guia-base-datos.mjs run ensure data/artists/<slug>.json',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SECRET)',
    description: 'Comprueba JSON vs fila en API; si difiere, vuelve a UPSERT el JSON.',
  },
  {
    id: 'agent',
    run: 'node scripts/guia-base-datos.mjs run agent -- <slug> "Nombre" [flags]',
    npm: 'npm run db:artist:agent -- …',
    creds: 'OPENAI_API_KEY; BD como artist-json; opcional SERPAPI_API_KEY',
    description: 'Genera ficha con OpenAI (+ Serp opcional) y UPSERT por defecto.',
  },
  {
    id: 'photo',
    run: 'node scripts/guia-base-datos.mjs run photo -- <slug> [--json-only] …',
    npm: 'npm run db:artist:photo -- …',
    creds: 'OPENAI_API_KEY + SERPAPI_API_KEY + mismas credenciales BD que actualizar-artista',
    description:
      'SerpAPI + modelo eligen imagen; descarga, sube a bucket media (artists/<slug>/portrait.*), image_url = URL Supabase; UPSERT. --json-only: sin Storage ni BD.',
  },
  {
    id: 'seed',
    run: 'node scripts/guia-base-datos.mjs run seed',
    npm: 'npm run db:seed',
    creds: 'Postgres URI (DATABASE_URL o password+ref)',
    description: 'Aplica solo el seed principal (002_seed_data.sql).',
  },
  {
    id: 'migrate',
    run: 'node scripts/guia-base-datos.mjs run migrate',
    npm: 'npm run db:migrate',
    creds: 'Postgres URI',
    description: 'Ejecuta todos los *.sql en supabase/migrations (orden alfabético).',
  },
  {
    id: 'push-hibrida-fest',
    run: 'node scripts/guia-base-datos.mjs run push-hibrida-fest',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SUPABASE_SECRET_KEY)',
    description:
      'UPSERT organizacion hibrida-fest + 3 eventos vía API (sin DATABASE_URL; alinea con 014/015). Añade --verify para comprobar columnas y datos.',
  },
  {
    id: 'events-enrich',
    run: 'node scripts/guia-base-datos.mjs run events-enrich <slug> [--with-poster] [--dry-run] [--force]',
    npm: 'npm run db:events:enrich -- <slug> [--with-poster]',
    creds: 'OPENAI + SERPAPI + URL + SERVICE_ROLE',
    description:
      'Enriquece un evento existente: SerpAPI (web) + OpenAI completan campos vacíos (fecha, lineup, descripción, venue, tags, etc.). --with-poster también busca cartel. --force sobreescribe campos ya rellenos.',
  },
  {
    id: 'events-prune-non-spain',
    run: 'node scripts/guia-base-datos.mjs run events-prune-non-spain [--dry-run]',
    npm: 'npm run db:guia -- run events-prune-non-spain --dry-run',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'DELETE en public.events donde country no es España (Spain/España/ES). --dry-run lista slugs sin borrar. CASCADE en asistencias/valoraciones.',
  },
  {
    id: 'events-patch-raveart-winter-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-raveart-winter-2026',
    npm: 'npm run db:guia -- run events-patch-raveart-winter-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'Pone date_start=2026-03-14 y date_end=null en slug raveart-winter-festival-2026 (cartel oficial).',
  },
  {
    id: 'events-patch-raveart-summer-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-raveart-summer-2026',
    npm: 'npm run db:guia -- run events-patch-raveart-summer-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'Actualiza slug raveart-summer-2026: 4 jul 2026, Hacienda El Chaparrejo (Alcala de Guadaira / Sevilla), textos XXIV aniversario.',
  },
  {
    id: 'events-patch-raveart-rvt-we-love-retro-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-raveart-rvt-we-love-retro-2026',
    npm: 'npm run db:guia -- run events-patch-raveart-rvt-we-love-retro-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT raveart-rvt-we-love-retro-granada-2026: We Love Retro + Freestylers, Sala El Tren 10 abr 2026, cartel local → Storage, entradas MonsterTicket.',
  },
  {
    id: 'events-patch-raveart-rvt-booking-clubbing-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-raveart-rvt-booking-clubbing-2026',
    npm: 'npm run db:guia -- run events-patch-raveart-rvt-booking-clubbing-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT raveart-rvt-booking-clubbing-elysium-2026: RVT + Freestylers, Elysium Sevilla 11 abr 2026, cartel local → Storage, rvtpro.com/entradas.',
  },
  {
    id: 'events-delete-slug',
    run: 'node scripts/guia-base-datos.mjs run events-delete-slug <slug>',
    npm: 'npm run db:guia -- run events-delete-slug slug-duplicado',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'DELETE una fila de public.events por slug (duplicados, pruebas). CASCADE en asistencias/valoraciones.',
  },
  {
    id: 'events-poster',
    run: 'node scripts/guia-base-datos.mjs run events-poster <slug> | --missing-only [--limit N] | --all [--limit N]',
    npm: 'npm run db:events:poster   # sin args = missing-only límite 20 (EVENTS_POSTER_DEFAULT_LIMIT)',
    creds: 'OPENAI + SERPAPI + URL + SERVICE_ROLE (bucket media, ruta events/<slug>/poster.*)',
    description:
      'Google Imágenes (SerpAPI) + OpenAI eligen cartel; sube a Storage y actualiza events.image_url. --json-only = URL externa sin Storage.',
  },
  {
    id: 'migrate-files',
    run: 'node scripts/guia-base-datos.mjs run migrate-files -- 010_x.sql 011_y.sql',
    npm: 'npm run db:migrate:raveart (ejemplo fijo en package.json)',
    creds: 'Postgres URI',
    description: 'Solo los ficheros SQL indicados tras --.',
  },
  {
    id: 'verify',
    run: 'node scripts/guia-base-datos.mjs run verify',
    npm: 'npm run db:verify',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + anon',
    description: 'Verificación ligera vía API (conteos).',
  },
  {
    id: 'timeline',
    run: 'node scripts/guia-base-datos.mjs run timeline [args]',
    npm: 'npm run db:timeline',
    creds: 'Según script sync-timeline-artists.mjs',
    description: 'Sincroniza artistas con la línea temporal.',
  },
  {
    id: 'timeline-sql',
    run: 'node scripts/guia-base-datos.mjs run timeline-sql [args]',
    npm: 'npm run db:timeline:sql',
    creds: 'Según script',
    description: 'Variante SQL del sync de timeline.',
  },
  {
    id: 'user-list',
    run: 'node scripts/guia-base-datos.mjs run user-list [args]',
    npm: 'npm run db:user-list',
    creds: 'Según script',
    description: 'Lista de usuarios / artistas (sync-user-list-artists).',
  },
  {
    id: 'media-upload',
    run: 'node scripts/guia-base-datos.mjs run media-upload -- <archivo-local> <ruta-en-bucket>',
    npm: 'npm run media:upload -- …',
    creds: 'Service role / secret para Storage',
    description: 'Sube media al bucket; luego pegar URL pública en image_url en JSON + artist-json.',
  },
]

function printGuide() {
  console.log(`
OPTIMAL BREAKS — Guía base de datos (operador: agente Cursor, no el usuario)

Regla de proyecto: si piden actualizar Supabase/Postgres, el agente ejecuta los
comandos (terminal), edita JSON si hace falta, y reporta resultado. No pedir al
usuario que abra la terminal.

Punto de entrada unificado:
  node scripts/guia-base-datos.mjs run <orden> [argumentos]

Órdenes "run" disponibles:
  artist-json <slug>     UPSERT desde data/artists/<slug>.json
  artist-file <ruta>     UPSERT desde ruta relativa al repo
  ensure <ruta.json>     Alinear BD con JSON (ensure-artist-json-in-db)
  agent -- …             generar-artista-agente.mjs (pasar args tras --)
  photo -- …             elegir-foto-artista.mjs
  seed                   seed-supabase (solo seed)
  migrate                seed-supabase --all
  push-hibrida-fest      push-hibrida-fest.mjs (API service role)
  events-enrich <slug> [--with-poster] [--dry-run] [--force]
                               enriquecer-evento.mjs (SerpAPI web + OpenAI → completar ficha)
  events-prune-non-spain [--dry-run]  enriquecer-evento.mjs --prune-non-spain
  events-patch-raveart-winter-2026     fecha 14 mar 2026 en raveart-winter-festival-2026
  events-patch-raveart-summer-2026     4 jul 2026 Sevilla / Chaparrejo en raveart-summer-2026
  events-patch-raveart-rvt-we-love-retro-2026  RVT We Love Retro + Freestylers, Granada 10 abr 2026
  events-patch-raveart-rvt-booking-clubbing-2026  RVT Booking & Clubbing, Elysium Sevilla 11 abr 2026
  events-delete-slug <slug>            borrar un evento por slug (duplicados)
  events-poster …        elegir-poster-evento.mjs (Serp imágenes + cartel → Storage)
  migrate-files -- …     seed-supabase --files …
  verify                 seed-supabase --verify
  timeline [args]        sync-timeline-artists.mjs
  timeline-sql [args]    sync-timeline-artists.mjs --sql
  user-list [args]       sync-user-list-artists.mjs
  media-upload -- …      upload-storage-media.mjs

Catálogo JSON (para el agente):
  node scripts/guia-base-datos.mjs --json

Credenciales: .env.local en la raíz del repo (ver comentarios en cada script).

────────────────────────────────────────────────────────────
CATÁLOGO EN CASTELLANO (scripts/ — qué es cada cosa)
────────────────────────────────────────────────────────────

• guia-base-datos.mjs — «Mando central». No toca la BD sola; solo enruta a otros
  scripts. Ayuda: este texto; --json: lista para máquinas.

• actualizar-artista.mjs — «Meter o actualizar un artista desde JSON». Lee un
  fichero data/artists/….json y hace UPSERT en public.artists (Postgres o API).
  Siempre escribe en base si las credenciales están bien.

• lib/artist-upsert.mjs — «Motor común de guardado». No se ejecuta a mano; lo
  usan actualizar-artista, generar-artista-agente, elegir-foto (por defecto con BD) y la
  API admin. Ahí está el INSERT/UPDATE real de la tabla artists.

• generar-artista-agente.mjs — «Redactor IA de fichas». OpenAI (+ Serp opcional)
  genera la ficha. Por defecto: UPSERT en BD. Ojo: con --json-only o --stdout
  NO escribe en Supabase (solo fichero o consola).

• elegir-foto-artista.mjs — «Buscar foto, subirla a Storage y enlazar». Elige URL
  con SerpAPI+IA, descarga la imagen, la sube a bucket media bajo artists/<slug>/,
  y guarda en JSON y BD la URL pública de Supabase. --json-only: solo URL externa
  en JSON (sin Storage ni UPSERT).

• ensure-artist-json-in-db.mjs — «¿El JSON y la BD dicen lo mismo?». Lee la BD,
  compara bios/real_name con el JSON; si no coinciden, llama a actualizar-artista
  y escribe en base.

• seed-supabase.mjs — «Migraciones SQL y semilla». Ejecuta .sql contra Postgres
  (--all, --files, o solo seed). Modo --verify: solo lee conteos (anon), no escribe.

• push-hibrida-fest.mjs — UPSERT de organizations/events Hibrida Fest por API
  (service role) si no hay DATABASE_URL; mismo contenido que 014_….sql.

• enriquecer-evento.mjs — «Completar ficha de evento». El usuario crea el evento
  desde /administrator o pide al agente Cursor. Luego este script busca en internet
  (SerpAPI web) y OpenAI completa fecha, lineup, descripción, venue, tags, etc.
  Uso: enriquecer-evento.mjs <slug> [--with-poster] [--dry-run] [--force].
  Utilidades de mantenimiento incluidas:
  --prune-non-spain [--dry-run] borra eventos con country distinto de España.
  --delete-event-slug <slug> elimina una fila concreta (duplicados).
  --patch-raveart-winter-2026 / --patch-raveart-summer-2026 (carteles oficiales).

• elegir-poster-evento.mjs — Carteles de eventos: SerpAPI Google Imágenes +
  OpenAI eligen flyer/póster; descarga y sube a media/events/<slug>/poster.* y
  actualiza events.image_url. Slug único, --missing-only o --all; --vision opcional.

• sync-timeline-artists.mjs — «Artistas que salen en la cronología web». Sin
  flags: INSERT en artists de los que faltan. Con --sql: solo genera/actualiza
  el fichero 009_…sql en disco (no toca la BD hasta que migres ese SQL).

• sync-user-list-artists.mjs — «Lista extendida de nombres → filas nuevas».
  Inserta en artists los slugs que están en la lista larga y aún no existen.

• upload-storage-media.mjs — «Subir archivo al bucket media». Escribe en Storage
  de Supabase (no en la tabla artists). Después hace falta poner la URL en
  image_url (JSON + actualizar-artista o admin).

• prompts/artista-agente-system.txt — Texto de sistema para el agente de bios;
  no es un programa.

Resumen «¿escribe en la tabla artists?»: sí → actualizar-artista, generar-artista-agente
(salvo --json-only/--stdout), ensure (si hay desajuste), sync-timeline (sin --sql),
sync-user-list, elegir-foto (salvo --json-only). no (solo) → elegir-foto
--json-only, sync-timeline --sql (solo archivo), verify, guia.
`)
}

function printJson() {
  console.log(
    JSON.stringify(
      {
        operator: 'agent',
        workspaceRoot: ROOT,
        actions: ACTIONS,
        runPrefix: 'node scripts/guia-base-datos.mjs run',
      },
      null,
      2,
    ),
  )
}

function runNode(scriptName, args) {
  const scriptPath = join(SCRIPTS, scriptName)
  if (!existsSync(scriptPath)) {
    console.error('Script no encontrado:', scriptPath)
    process.exit(1)
  }
  const r = spawnSync(process.execPath, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: 'inherit',
    env: process.env,
  })
  process.exit(r.status === null ? 1 : r.status)
}

function main() {
  const argv = process.argv.slice(2)
  if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
    printGuide()
    return
  }
  if (argv[0] === '--json') {
    printJson()
    return
  }

  if (argv[0] !== 'run') {
    console.error('Argumento desconocido. Usa --help o run <orden> …')
    process.exit(1)
  }

  const sub = argv[1]
  const rest = argv.slice(2)

  if (!sub) {
    console.error('Falta orden tras "run". Ver: node scripts/guia-base-datos.mjs --help')
    process.exit(1)
  }

  switch (sub) {
    case 'artist-json': {
      const slug = (rest[0] || '').replace(/\.json$/i, '').trim()
      if (!slug) {
        console.error('Uso: run artist-json <slug>')
        process.exit(1)
      }
      const p = join(ROOT, 'data', 'artists', `${slug}.json`)
      if (!existsSync(p)) {
        console.error('No existe:', p)
        process.exit(1)
      }
      runNode('actualizar-artista.mjs', [p])
      break
    }
    case 'artist-file': {
      const rel = rest[0]
      if (!rel) {
        console.error('Uso: run artist-file <ruta-desde-raíz-repo>')
        process.exit(1)
      }
      const p = resolve(ROOT, rel)
      if (!existsSync(p)) {
        console.error('No existe:', p)
        process.exit(1)
      }
      runNode('actualizar-artista.mjs', [p])
      break
    }
    case 'ensure': {
      const pass = stripLeadingDashDash(rest)
      if (pass.length === 0) {
        console.error('Uso: run ensure data/artists/<slug>.json')
        process.exit(1)
      }
      runNode('ensure-artist-json-in-db.mjs', pass)
      break
    }
    case 'agent':
      runNode('generar-artista-agente.mjs', stripLeadingDashDash(rest))
      break
    case 'photo':
      runNode('elegir-foto-artista.mjs', stripLeadingDashDash(rest))
      break
    case 'seed':
      runNode('seed-supabase.mjs', [])
      break
    case 'migrate':
      runNode('seed-supabase.mjs', ['--all'])
      break
    case 'push-hibrida-fest':
      runNode('push-hibrida-fest.mjs', rest)
      break
    case 'events-enrich': {
      const enrichSlug = (rest[0] || '').trim()
      if (!enrichSlug) {
        console.error('Uso: run events-enrich <slug> [--with-poster] [--dry-run] [--force]')
        process.exit(1)
      }
      runNode('enriquecer-evento.mjs', rest)
      break
    }
    case 'events-prune-non-spain':
      runNode('enriquecer-evento.mjs', ['--prune-non-spain', ...rest])
      break
    case 'events-patch-raveart-winter-2026':
      runNode('enriquecer-evento.mjs', ['--patch-raveart-winter-2026', ...rest])
      break
    case 'events-patch-raveart-summer-2026':
      runNode('enriquecer-evento.mjs', ['--patch-raveart-summer-2026', ...rest])
      break
    case 'events-patch-raveart-rvt-we-love-retro-2026':
      runNode('enriquecer-evento.mjs', ['--patch-raveart-rvt-we-love-retro-2026', ...rest])
      break
    case 'events-patch-raveart-rvt-booking-clubbing-2026':
      runNode('enriquecer-evento.mjs', ['--patch-raveart-rvt-booking-clubbing-2026', ...rest])
      break
    case 'events-delete-slug': {
      const slug = (rest[0] || '').trim()
      if (!slug) {
        console.error('Uso: run events-delete-slug <slug>')
        process.exit(1)
      }
      runNode('enriquecer-evento.mjs', ['--delete-event-slug', slug])
      break
    }
    case 'events-poster':
      runNode('elegir-poster-evento.mjs', rest)
      break
    case 'migrate-files': {
      const files = stripLeadingDashDash(rest)
      if (files.length === 0) {
        console.error('Uso: run migrate-files 010_foo.sql …   (o migrate-files -- 010_foo.sql …)')
        process.exit(1)
      }
      runNode('seed-supabase.mjs', ['--files', ...files])
      break
    }
    case 'verify':
      runNode('seed-supabase.mjs', ['--verify'])
      break
    case 'timeline':
      runNode('sync-timeline-artists.mjs', rest)
      break
    case 'timeline-sql':
      runNode('sync-timeline-artists.mjs', ['--sql', ...rest])
      break
    case 'user-list':
      runNode('sync-user-list-artists.mjs', rest)
      break
    case 'media-upload':
      runNode('upload-storage-media.mjs', stripLeadingDashDash(rest))
      break
    default:
      console.error('Orden run desconocida:', sub)
      console.error('Ver: node scripts/guia-base-datos.mjs --help')
      process.exit(1)
  }
}

/** Quita un único "--" inicial si está (npm a veces lo inserta). */
function stripLeadingDashDash(args) {
  if (args[0] === '--') return args.slice(1)
  return args
}

main()
