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
 *   node scripts/guia-base-datos.mjs run label-agent -- lot49 "Lot49"
 *   node scripts/guia-base-datos.mjs run photo -- fatboy-slim
 *   node scripts/guia-base-datos.mjs run label-photo -- --missing-only
 *   node scripts/guia-base-datos.mjs run translate-scenes [--slug SLUG] [--force] [--dry-run] [--limit N]
 *
 * Prompts de sistema de los agentes (.txt), OPENAI_MODEL por flujo: docs/AI_PROMPTS_AND_AGENTS.md
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
    id: 'delete-artist-slug',
    run: 'node scripts/guia-base-datos.mjs run delete-artist-slug <slug>',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SECRET); solo API REST',
    description:
      'Elimina un artista por slug en Supabase. Pone mixes.artist_id a NULL antes del DELETE (FK sin CASCADE).',
  },
  {
    id: 'artist-json',
    run: 'node scripts/guia-base-datos.mjs run artist-json <slug>',
    npm: 'npm run db:guia -- run artist-json <slug>',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SECRET); no Postgres para UPSERT',
    description:
      'UPSERT de un artista desde data/artists/<slug>.json (tras editar el JSON en repo).',
  },
  {
    id: 'artist-file',
    run: 'node scripts/guia-base-datos.mjs run artist-file <ruta-desde-raíz>',
    npm: 'npm run db:guia -- run artist-file data/artists/x.json',
    creds: 'Igual que artist-json (solo API Supabase)',
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
    creds: 'OPENAI_API_KEY + API Supabase (service role); opcional SERPAPI_API_KEY',
    description:
      'Genera ficha con OpenAI (+ Serp opcional) y UPSERT por defecto. --revise: refina ficha existente (JSON local o BD) sin vaciar biografías; varios --notes para docs del artista.',
  },
  {
    id: 'label-json',
    run: 'node scripts/guia-base-datos.mjs run label-json <slug>',
    npm: 'npm run db:guia -- run label-json lot49',
    creds: 'API Supabase service role (tabla public.labels)',
    description: 'UPSERT de un sello desde data/labels/<slug>.json.',
  },
  {
    id: 'label-agent',
    run: 'node scripts/guia-base-datos.mjs run label-agent -- <slug> "Nombre sello" [flags]',
    npm: 'npm run db:label:agent -- …',
    creds: 'OPENAI_API_KEY + API Supabase (service role); opcional SERPAPI_API_KEY',
    description:
      'Redactor IA de sellos (mismo flujo que agent de artistas): prompts/sello-agente-*.txt; --revise, --notes, --json-only, --save-json; --from-db para lote.',
  },
  {
    id: 'blog-agent',
    run: 'node scripts/guia-base-datos.mjs run blog-agent -- <slug> "Título ES" [--featured] [--brief archivo] [--no-search] [--json-only] [--save-json]',
    npm: 'npm run db:blog:agent -- …',
    creds: 'OPENAI_API_KEY + API Supabase (service role); opcional SERPAPI / OPENAI web_search',
    description:
      'Redactor IA de artículos de blog (gpt-5.6-terra por defecto vía OPENAI_BLOG_MODEL/OPENAI_MODEL): prompts/blog-agente-system.txt → UPSERT blog_posts. --featured para home; --save-json copia data/blog/<slug>.json. Portada: blog:refresh-images aparte.',
  },
  {
    id: 'photo',
    run: 'node scripts/guia-base-datos.mjs run photo -- <slug> | --all | --repair [--limit=N] …',
    npm: 'npm run db:artist:photo -- <slug> | npm run db:artist:photo:repair | npm run db:artist:sync-public-portraits',
    creds: 'OPENAI_API_KEY + SERPAPI_API_KEY + URL + SUPABASE_SERVICE_ROLE_KEY (Storage + UPSERT vía API)',
    description:
      'SerpAPI + modelo eligen imagen; descarga, sube a bucket media (artists/<slug>/portrait.*), image_url = URL Supabase; UPSERT. --json-only: sin Storage ni BD.',
  },
  {
    id: 'label-photo',
    run: 'node scripts/guia-base-datos.mjs run label-photo -- <slug> | --missing-only | --all [flags]',
    npm: 'npm run db:label:photo   # sin args = cola sin logo; npm run db:label:photo -- lot49',
    creds: 'OPENAI_API_KEY + SERPAPI_API_KEY + URL + SERVICE_ROLE (igual que API admin label-logo)',
    description:
      'Logos de sellos: Serp + OpenAI → Storage labels/<slug>/logo.* y UPDATE image_url. --missing-only = cola sin https en image_url.',
  },
  {
    id: 'labels-discogs',
    run: 'node scripts/guia-base-datos.mjs run labels-discogs [--apply] [--slug X] [--limit N] [--all] [--strict]',
    npm: 'npm run db:labels:discogs -- [--apply]',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; opcional DISCOGS_TOKEN',
    description:
      'Busca en Discogs cada sello de public.labels y, si hay match exacto por nombre, rellena discogs_id + discogs_url. Sin --apply = dry-run (solo imprime). Con --apply escribe data/labels/<slug>.json y UPSERT vía REST.',
  },
  {
    id: 'labels-discogs-images',
    run: 'node scripts/guia-base-datos.mjs run labels-discogs-images [--apply] [--slug X] [--limit N] [--all]',
    npm: 'npm run db:labels:discogs:images -- [--apply]',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY; recomendado DISCOGS_TOKEN',
    description:
      'Para cada sello con discogs_id pero sin image_url, descarga la imagen de /labels/<id>, la sube al bucket media (labels/<slug>/logo.*) y UPSERT image_url. Recupera logos perdidos usando Discogs como fuente.',
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
      'UPSERT organizacion hibrida-fest + 3 eventos vía API Supabase (alinea con 014/015). Añade --verify para comprobar columnas y datos.',
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
    id: 'network-enrich',
    run: 'node scripts/guia-base-datos.mjs run network-enrich [--only artists|labels|scenes|events] [--slug X] [--country ES] [--limit N] [--min-confidence 0.65] [--dry-run] [--force]',
    npm: 'npm run db:network:enrich -- --dry-run',
    creds: 'OPENAI_API_KEY + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'Agente IA (OPENAI_MODEL, por defecto gpt-5.4) que para cada entidad (artista/sello/escena/evento) sugiere qué SLUGS del archivo están conectados y fusiona en related_artists/labels_founded/key_artists/key_labels/lineup con dedupe. Marca ai_enriched_at. --dry-run imprime sugerencias sin escribir.',
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
      'Actualiza slug raveart-summer-2026: 4 jul 2026, Hacienda El Chaparrejo (Alcalá de Guadaira / Sevilla), XXIV aniversario. Horarios oficiales en 4 áreas (Summer Festival, 24th Anniversary, RVT Pro Main, Mass Bass) 16:00–07:00; cartel horarios public/images/events/summer-festival-2026-horarios.webp.',
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
    id: 'events-patch-raveart-rvt-we-love-retro-elysium-sevilla-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-raveart-rvt-we-love-retro-elysium-sevilla-2026',
    npm: 'npm run db:guia -- run events-patch-raveart-rvt-we-love-retro-elysium-sevilla-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT raveart-rvt-we-love-retro-elysium-sevilla-2026: We Love Retro, Elysium Sevilla 9 may 2026, cartel WebP → Storage, entradas MonsterTicket.',
  },
  {
    id: 'events-patch-raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026',
    npm: 'npm run db:guia -- run events-patch-raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026: Summer Festival presentación + Deekline, Sala El Tren 9 may 2026, MonsterTicket.',
  },
  {
    id: 'events-patch-raveart-retro-halloween-2025-poster',
    run: 'node scripts/guia-base-datos.mjs run events-patch-raveart-retro-halloween-2025-poster',
    npm: 'npm run db:guia -- run events-patch-raveart-retro-halloween-2025-poster',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'image_url = /images/events/retro-halloween-2025.webp en slug raveart-retro-halloween-2025.',
  },
  {
    id: 'events-patch-kultura-breakz-ii-aniversario-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-kultura-breakz-ii-aniversario-2026',
    npm: 'npm run db:guia -- run events-patch-kultura-breakz-ii-aniversario-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT kultura-breakz-ii-aniversario-2026: 2 may 2026 Sala Pandora Sevilla, cartel public/images/events/kultura-breakz-ii-aniversario-2026.avif, entradas Fourvenues, redes Kültur / Kultura Breakz.',
  },
  {
    id: 'events-patch-pure-bassline-7-aniversario-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-pure-bassline-7-aniversario-2026',
    npm: 'npm run db:guia -- run events-patch-pure-bassline-7-aniversario-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT pure-bassline-7-aniversario-2026: 2 abr 2026 (Jueves Santo) Sala Pandora Sevilla, cartel public/images/events/Pure_bassline_2026.webp, entradas Fourvenues.',
  },
  {
    id: 'events-patch-pure-bassline-15-agosto-2026-sevilla',
    run: 'node scripts/guia-base-datos.mjs run events-patch-pure-bassline-15-agosto-2026-sevilla',
    npm: 'npm run db:guia -- run events-patch-pure-bassline-15-agosto-2026-sevilla',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT made-in-spain-festival-2026-white-beach-lepe: Made in Spain Festival (Pure Bassline), sáb 15 ago 2026 White Beach Antilla (La Antilla, Lepe, Huelva, Roller Group). 5º avance cartel: showcases Banana Records, Distorsion Records, Guachinche Records + Karpin, Kultür, Lords of Motion, Maribel, Norbak, Rasco, Sans, The Brainkiller. Cartel public/images/events/made-in-spain-festival-2026-white-beach-lepe.webp; entradas Fourvenues rollercoaster + rollerwhitebeach.com. Borra slug legacy pure-bassline-15-agosto-2026-sevilla (ubicación errónea).',
  },
  {
    id: 'events-patch-natural-universal-retro-2026-malaga',
    run: 'node scripts/guia-base-datos.mjs run events-patch-natural-universal-retro-2026-malaga',
    npm: 'npm run db:guia -- run events-patch-natural-universal-retro-2026-malaga',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT natural-universal-retro-2026-malaga: 9 may 2026 Paris15 Málaga, cartel natural-universal-retro-2026-malaga.webp, lineup cartel + MonsterTicket.',
  },
  {
    id: 'events-patch-malaga-is-break-3-aniversario-frequency-break-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-malaga-is-break-3-aniversario-frequency-break-2026',
    npm: 'npm run db:guia -- run events-patch-malaga-is-break-3-aniversario-frequency-break-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT malaga-is-break-3-aniversario-frequency-break-2026: 3 abr 2026 Sala Roka Málaga, cartel public/images/events/malaga_is_break.webp, entradas MonsterTicket.',
  },
  {
    id: 'events-patch-cyber-bass-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-cyber-bass-2026',
    npm: 'npm run db:guia -- run events-patch-cyber-bass-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT cyber-bass-2026: 18 abr 2026 Sala Maruja Limón (Alhaurín de la Torre), GOAT Breakbeat, cartel public/images/events/cyber-bass-2026.webp, entradas MonsterTicket.',
  },
  {
    id: 'events-patch-safari-break-night-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-safari-break-night-2026',
    npm: 'npm run db:guia -- run events-patch-safari-break-night-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT safari-break-night-2026: 25 abr 2026 Safari Club Palomares del Río, Basshock Events, cartel public/images/events/safari-break-night.webp, MonsterTicket.',
  },
  {
    id: 'events-patch-break-the-flow-w-terrie-kynd-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-break-the-flow-w-terrie-kynd-2026',
    npm: 'npm run db:guia -- run events-patch-break-the-flow-w-terrie-kynd-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT break-the-flow-w-terrie-kynd-2026: 2 may 2026 Sala Teranga Torrox Costa, Frequency Break, cartel break-the-flow-w-terrie-kynd.webp, MonsterTicket.',
  },
  {
    id: 'events-patch-el-pinar-breaks-fest-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-el-pinar-breaks-fest-2026',
    npm: 'npm run db:guia -- run events-patch-el-pinar-breaks-fest-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT el-pinar-breaks-fest-2026: 9 may 2026 Sala El Pinar Baños de la Encina, line-up desde cartel, el-pinar-breaks-fest.webp, MonsterTicket.',
  },
  {
    id: 'events-patch-breaks-bloom-festival-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-breaks-bloom-festival-2026',
    npm: 'npm run db:guia -- run events-patch-breaks-bloom-festival-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT breaks-bloom-festival-2026: 19 sept 2026 Hacienda El Mantillo Pilas, lineup TBA en cartel, breaks-bloom-festival.webp, MonsterTicket.',
  },
  {
    id: 'events-patch-bellota-break-festival-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-bellota-break-festival-2026',
    npm: 'npm run db:guia -- run events-patch-bellota-break-festival-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT bellota-break-festival-2026: 13 jun 2026 Plaza de Toros Calzadilla de los Barros, 16+, bellota-break-festival-2026.webp, MonsterTicket.',
  },
  {
    id: 'events-patch-oshun-festival-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-oshun-festival-2026',
    npm: 'npm run db:guia -- run events-patch-oshun-festival-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT oshun-festival-2026: 15 ago 2026 Carpas Yerbabuena Barbate, primer avance lineup (Baymont Bross, Yo Speed, Bad Legs, Bowser, Darkbass, Xano…), oshun-festival-2026.webp, entradas sin parámetros RRPP.',
  },
  {
    id: 'events-patch-mas-ruido-black-hole-360-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-mas-ruido-black-hole-360-2026',
    npm: 'npm run db:guia -- run events-patch-mas-ruido-black-hole-360-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT mas-ruido-black-hole-360-2026: 18 abr 2026 Sala O’Farrell San Fernando, line-up cartel, mas-ruido-black-hole-360.webp, MonsterTicket.',
  },
  {
    id: 'events-patch-la-caseta-del-breakbeat-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-la-caseta-del-breakbeat-2026',
    npm: 'npm run db:guia -- run events-patch-la-caseta-del-breakbeat-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT la-caseta-del-breakbeat-2026: 25 abr 2026 Sala Pandora Sevilla (calle Gramil 2), cartel public/images/events/la_caseta_del_breakbeat.webp, entradas Fourvenues.',
  },
  {
    id: 'events-patch-fruity-loops-03-06-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-fruity-loops-03-06-2026',
    npm: 'npm run db:guia -- run events-patch-fruity-loops-03-06-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT fruity-loops-03-06-2026: 3 jun 2026, cartel AVIF fruity-loops-03-06-2026.avif, venta site.fourvenues.com (slug iaramargafatimagmailcom/events/…-MU2X).',
  },
  {
    id: 'events-patch-finger-lickin-boat-party-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-finger-lickin-boat-party-2026',
    npm: 'npm run db:guia -- run events-patch-finger-lickin-boat-party-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT finger-lickin-boat-party-2026: 16 may 2026 Dutch Master (Támesis), lineup Plump DJs / Krafty Kuts / A.Skillz / Soul of Man / Slyde / Jessica Joy, textos según comunicado FLR, Skiddle 42152456.',
  },
  {
    id: 'events-patch-finger-lickin-between-the-bridges-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-finger-lickin-between-the-bridges-2026',
    npm: 'npm run db:guia -- run events-patch-finger-lickin-between-the-bridges-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      "UPSERT finger-lickin-between-the-bridges-2026: 16 may 2026 Between the Bridges (Southbank SE1), 17:00–23:00, cartel public/images/events/finger-lickin-between-the-bridges-2026.webp, Skiddle 42363687, Freestylers + FLR lineup.",
  },
  {
    id: 'events-patch-dreambeach-costa-del-sol-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-dreambeach-costa-del-sol-2026',
    npm: 'npm run db:guia -- run events-patch-dreambeach-costa-del-sol-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT dreambeach-costa-del-sol-2026: 31 jul–1 ago 2026 Vélez-Málaga; web dreambeach.es; cartel public/images/events/DREAMBEACH_festival_2026.webp; lineup breaks: Karpin, Lady Waks B2B Stanton Warriors, Wizard.',
  },
  {
    id: 'events-patch-iberican-breaks-festival-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-iberican-breaks-festival-2026',
    npm: 'npm run db:guia -- run events-patch-iberican-breaks-festival-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT iberican-breaks-festival-2026: 16 may 2026 Terraza Manhattan Olvera (Cádiz), The Electronics Nightmare, cartel public/images/events/iberican-breaks-festival-2026.webp, entradas MonsterTicket.',
  },
  {
    id: 'events-patch-solaris-fest-matalascanas-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-solaris-fest-matalascanas-2026',
    npm: 'npm run db:guia -- run events-patch-solaris-fest-matalascanas-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT solaris-fest-matalascanas-2026: 20 jun 2026 Centro de Ocio Surfasaurus Matalascañas (100 m playa Doñana); cartel con horario Olmedbreak 17:00, Nileb 17:45, Dany BS 18:30, DJ Tokyo 19:15, Perfect Kombo 20:00, Basstyler 21:00, Anuschka 22:00, The BJ Crew 23:00, Sekret Chadow 00:00, Hankook 01:00–02:00; MonsterTicket + RVT; public/images/events/solaris-fest-matalascanas-2026.webp.',
  },
  {
    id: 'events-patch-floridance-festival-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-floridance-festival-2026',
    npm: 'npm run db:guia -- run events-patch-floridance-festival-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT floridance-festival-2026: 5 sept Rota Estadio Monago Animalia; avance lineup #2 cartel floridance-festival-2026.webp; MonsterTicket.',
  },
  {
    id: 'events-patch-electrolunch-xxl-picnic-76-sevilla-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-electrolunch-xxl-picnic-76-sevilla-2026',
    npm: 'npm run db:guia -- run events-patch-electrolunch-xxl-picnic-76-sevilla-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT electrolunch-xxl-picnic-76-sevilla-2026: 9 may 2026 Parque Magallanes Sevilla (Rocknrolla Producciones), main stage Stanton Warriors + Ylia, Jade Tansa, Magma, Luis Soldevilla; cartel public/images/events/electrolunch-xxl-picnic-76-sevilla-2026.webp; entrada gratuita hasta 17:00, pases ultimaentrada.com.',
  },
  {
    id: 'events-patch-breakdown-orlando-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-breakdown-orlando-2026',
    npm: 'npm run db:guia -- run events-patch-breakdown-orlando-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT breakdown-orlando-2026: BREAKDOWN, sáb 27 jun 2026 Broken Strings Brewery (1012 W Church St, Orlando FL), Fully Loaded + Rave Royalty present; headliner Huda Hudia (Kaleidoscope Music) + Soltek, Robotic, Matrix, Supagroover, Beezie, Axel V, Andres Morales; doors 20:00–23:30, all ages; cartel public/images/events/breakdown-orlando-2026.webp; tickets Eventbrite.',
  },
  {
    id: 'events-patch-power-breakbeat-con-autobots-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-power-breakbeat-con-autobots-2026',
    npm: 'npm run db:guia -- run events-patch-power-breakbeat-con-autobots-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT power-breakbeat-con-autobots-2026: 25 jul 2026 Sala Roka Málaga, Autobots confirmado, power-breakbeat-con-autobots.webp, MonsterTicket.',
  },
  {
    id: 'events-patch-aqua-breaks-pool-party-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-aqua-breaks-pool-party-2026',
    npm: 'npm run db:guia -- run events-patch-aqua-breaks-pool-party-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT aqua-breaks-pool-party-2026: 25 jul 2026 Campamento Rural La Torre La Rábida, cartel sin lineup, aqua-breaks-pool-party.webp, MonsterTicket.',
  },
  {
    id: 'events-patch-surbreak-breakbiteros-del-sur-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-surbreak-breakbiteros-del-sur-2026',
    npm: 'npm run db:guia -- run events-patch-surbreak-breakbiteros-del-sur-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT surbreak-breakbiteros-del-sur-2026: 15 ago 2026 Sala Las Palmeras La Línea, lineup cartel, surbreak-breakbiteros-del-sur.webp, MonsterTicket.',
  },
  {
    id: 'events-patch-farewell-summer-festival-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-farewell-summer-festival-2026',
    npm: 'npm run db:guia -- run events-patch-farewell-summer-festival-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT farewell-summer-festival-2026: 21–22 ago 2026 Recinto Ferial Pedro Abad, lineup TBA, entradas/info Instagram @farewell_summerfestival.',
  },
  {
    id: 'events-patch-ritmos-rotos-en-el-patio-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-ritmos-rotos-en-el-patio-2026',
    npm: 'npm run db:guia -- run events-patch-ritmos-rotos-en-el-patio-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT ritmos-rotos-en-el-patio-2026: 11 jul 2026 El Patio Pandora Sevilla, Soul Of Man + locales, ritmos-rotos-en-el-patio-2026.webp, Fourvenues adrianchupi.',
  },
  {
    id: 'events-patch-retro-goats-2026-malaga',
    run: 'node scripts/guia-base-datos.mjs run events-patch-retro-goats-2026-malaga',
    npm: 'npm run db:guia -- run events-patch-retro-goats-2026-malaga',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT retro-goats-2026-malaga: 20 jun 2026 Paris15 Málaga, GOAT Breakbeat, cartel retro-goats-2026-malaga.webp, MonsterTicket.',
  },
  {
    id: 'events-patch-ritmika-1-aniversario-white-beach-lepe-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-ritmika-1-aniversario-white-beach-lepe-2026',
    npm: 'npm run db:guia -- run events-patch-ritmika-1-aniversario-white-beach-lepe-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT ritmika-1-aniversario-white-beach-lepe-2026: Ritmika 1er Aniversario, festival open air 12h non-stop, sáb 18 jul 2026 White Beach Antilla (La Antilla, Lepe, Huelva, Roller Group). Cartel completo: headliners Ed Solo feat. Navigator + Keith Mackenzie feat. Sporty-O; show vand4los Bad Legs x Seekflow feat. JTT & L-Essence, Colombo vs Sekret Chadow, Guau vs Yo Speed, Jose Rodríguez + Gordo Master, Killerblitz vs Four Motion, Mbreaks, Perfect Kombo vs Seveng vs Basstyler, Rhades vs Pavane, Tortu, Urbano vs Bassmaster, Wiguez x Air Baxx; warm up Mastherizers vs Drumback, MC Speaker Reality. Doors 19:00-07:00, +18, gratis hasta 21:30 / GENERAL 10€+1€ G.D MonsterTicket + rollerwhitebeach.com. Cartel public/images/events/ritmika-1-aniversario-white-beach-lepe-2026.webp.',
  },
  {
    id: 'events-patch-coast-breakbeat-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-coast-breakbeat-2026',
    npm: 'npm run db:guia -- run events-patch-coast-breakbeat-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT coast-breakbeat-2026: Frequency Break, Sala Teranga Torrox Costa 18 jul 2026 (Evil Crew vs Playbass, Isma Breakz, Super Break, Franetik, Raü, DJ Fdez, Defkon7, CSBreak), MonsterTicket.',
  },
  {
    id: 'events-patch-breakclub-at-cosmos-club-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-breakclub-at-cosmos-club-2026',
    npm: 'npm run db:guia -- run events-patch-breakclub-at-cosmos-club-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT breakclub-at-cosmos-club-2026: BREAKCLUB at COSMOS CLUB Sevilla 17 jul 2026 00:00–07:00 (Black Voltaje, GoNe, Sirius, Dolt, Davo vs Coma, Alicia Krter, Mr John), MonsterTicket.',
  },
  {
    id: 'events-patch-break-nation-by-420-sound-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-break-nation-by-420-sound-2026',
    npm: 'npm run db:guia -- run events-patch-break-nation-by-420-sound-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT break-nation-by-420-sound-2026: Break Nation by 420 Energy Sound, Sala Roka Málaga 19 sept 2026 (cartel sin DJs individuales), MonsterTicket.',
  },
  {
    id: 'events-patch-finger-lickin-summer-takeover-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-finger-lickin-summer-takeover-2026',
    npm: 'npm run db:guia -- run events-patch-finger-lickin-summer-takeover-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      "UPSERT finger-lickin-summer-takeover-2026: Finger Lickin' Summer Takeover, Concorde 2 Brighton 15 ago 2026 (Freestylers, Plump DJs, Krafty Kuts, A.Skillz, Soul of Man), Skiddle.",
  },
  {
    id: 'events-patch-stanton-warriors-volks-brighton-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-stanton-warriors-volks-brighton-2026',
    npm: 'npm run db:guia -- run events-patch-stanton-warriors-volks-brighton-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT stanton-warriors-volks-brighton-2026: On the Beach afterparty, Volks Brighton 18 jul 2026 (Stanton Warriors, Calyx), Skiddle.',
  },
  {
    id: 'events-patch-stanton-sessions-steelyard-london-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-stanton-sessions-steelyard-london-2026',
    npm: 'npm run db:guia -- run events-patch-stanton-sessions-steelyard-london-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT stanton-sessions-steelyard-london-2026: Stanton Warriors Presents Stanton Sessions, The Steelyard London 10 oct 2026, Skiddle.',
  },
  {
    id: 'events-patch-deekline-iron-cow-orlando-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-deekline-iron-cow-orlando-2026',
    npm: 'npm run db:guia -- run events-patch-deekline-iron-cow-orlando-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT deekline-iron-cow-orlando-2026: Best of Breaks / Deekline, Iron Cow Orlando 18 jul 2026 (Tooltime, Audio, Amber Jane), Happeningnext.',
  },
  {
    id: 'events-patch-breaks-bass-guau-yo-speed-perth-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-breaks-bass-guau-yo-speed-perth-2026',
    npm: 'npm run db:guia -- run events-patch-breaks-bass-guau-yo-speed-perth-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT breaks-bass-guau-yo-speed-perth-2026: Breaks & Bass Guau + Yo Speed Australian Tour, The Aberdeen Hotel Perth 2 oct 2026 (Robwun, Micah B2B Philly Blunt, Krypsis, Rhythmiic), Megatix / RA.',
  },
  {
    id: 'events-patch-breaks-bass-guau-yo-speed-melbourne-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-breaks-bass-guau-yo-speed-melbourne-2026',
    npm: 'npm run db:guia -- run events-patch-breaks-bass-guau-yo-speed-melbourne-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT breaks-bass-guau-yo-speed-melbourne-2026: Guau + Yo Speed Australian Tour, The Industrique Melbourne 3 oct 2026, Industrique shop tickets.',
  },
  {
    id: 'events-patch-breaks-bass-guau-yo-speed-brisbane-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-breaks-bass-guau-yo-speed-brisbane-2026',
    npm: 'npm run db:guia -- run events-patch-breaks-bass-guau-yo-speed-brisbane-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT breaks-bass-guau-yo-speed-brisbane-2026: Guau + Yo Speed Australian Tour day party, The Brightside Outdoors Brisbane 5 oct 2026 (Kenny Beeper, Bosketta, Rhythmiic), Oztix.',
  },
  {
    id: 'events-patch-breaks-bass-guau-yo-speed-sydney-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-breaks-bass-guau-yo-speed-sydney-2026',
    npm: 'npm run db:guia -- run events-patch-breaks-bass-guau-yo-speed-sydney-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT breaks-bass-guau-yo-speed-sydney-2026: Guau + Yo Speed Australian Tour, ARQ Sydney Basement 4 oct 2026 (Rhythmiic + TBA), Humanitix.',
  },
  {
    id: 'events-patch-bionic-beatslappaz-si-paradiso-perth-2026',
    run: 'node scripts/guia-base-datos.mjs run events-patch-bionic-beatslappaz-si-paradiso-perth-2026',
    npm: 'npm run db:guia -- run events-patch-bionic-beatslappaz-si-paradiso-perth-2026',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT bionic-beatslappaz-si-paradiso-perth-2026: Bionic 1st birthday, Beatslappaz Si Paradiso Basement Perth 28 ago 2026 (1badbadams, Cobey), Humanitix / Facebook.',
  },
  {
    id: 'events-patch-dub-elements-friends',
    run: 'node scripts/guia-base-datos.mjs run events-patch-dub-elements-friends',
    npm: 'npm run db:guia -- run events-patch-dub-elements-friends',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'UPSERT dub-elements-friends: Dub Elements & Friends X Aniversario, Pandora Sevilla 11 sept 2026 (Main Room + Terraza Open Air; cartel T-Lex, Dub Engineer, Ecsta, Sobass), Fourvenues.',
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
      'Google Imágenes (SerpAPI) + OpenAI visión/OCR eligen cartel (leen el texto del flyer; --metadata-only = solo títulos). Sube a Storage y actualiza events.image_url. --json-only = URL externa sin Storage. Doc: docs/ADMIN_CHAT_CAPTURA.md',
  },
  {
    id: 'migrate-files',
    run: 'node scripts/guia-base-datos.mjs run migrate-files -- 010_x.sql 011_y.sql',
    npm: 'npm run db:migrate:raveart (ejemplo fijo en package.json)',
    creds: 'Postgres URI',
    description: 'Solo los ficheros SQL indicados tras --.',
  },
  {
    id: 'mixes-published',
    run: 'node scripts/guia-base-datos.mjs run mixes-published [--force]',
    npm: 'npm run db:mixes:published -- [--force]',
    creds:
      'NEXT_PUBLIC_SUPABASE_URL + SERVICE_ROLE. Aplicar antes migración 021_mixes_published_at.sql (Postgres o SQL Editor).',
    description:
      'Rellena mixes.published_at desde fecha de publicación de YouTube (API v3 con YOUTUBE_DATA_API_KEY, o yt-dlp, o scraping HTML). --force sobrescribe fechas ya guardadas.',
  },
  {
    id: 'mixes-file',
    run: 'node scripts/guia-base-datos.mjs run mixes-file data/mixes/<lote>.json',
    npm: 'npm run db:mixes -- data/mixes/lote.json',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SECRET); solo API REST, sin Postgres',
    description:
      'UPSERT de uno o varios mixes desde JSON (array o { "mixes": […] }). Igual espíritu que artist-file.',
  },
  {
    id: 'chart-propose',
    run: 'node scripts/guia-base-datos.mjs run chart-propose [--sources beatport,juno]',
    npm: 'npm run db:chart -- --dry-run [--sources beatport,juno]',
    creds: 'OPENAI_API_KEY (curación IA); Supabase opcional para historial previo',
    description:
      '40 Breaks Vitales: scrapea Beatport + fuentes opcionales, IA elige 40, muestra propuesta en terminal (dry-run). No sube a BD.',
  },
  {
    id: 'chart-confirm',
    run: 'node scripts/guia-base-datos.mjs run chart-confirm [--week 2026-03-30] [--sources beatport,juno]',
    npm: 'npm run db:chart -- --confirm [--week 2026-03-30]',
    creds: 'OPENAI_API_KEY + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      '40 Breaks Vitales: scrapea, cura con IA y sube a Supabase (chart_editions + chart_tracks). Publica automáticamente.',
  },
  {
    id: 'chart-featured-file',
    run: 'node scripts/guia-base-datos.mjs run chart-featured-file data/charts/picks/<semana>.json [--enrich-release-dates --write-json]',
    npm: 'npm run db:chart:featured -- data/charts/picks/2026-03-30.json',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'Picks «New releases» en /charts: UPSERT manual desde JSON (chart_featured_tracks). No scrapea tiendas; la edición week_date debe existir.',
  },
  {
    id: 'purge-featured-week-dates',
    run: 'node scripts/guia-base-datos.mjs run purge-featured-week-dates YYYY-MM-DD […] [--dry-run] [--keep-empty-editions]',
    npm: '—',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'Quita todas las filas chart_featured_tracks de esos lunes (`chart_editions.week_date`). chart_tracks del 40 y vinilo siguen igual. Si la edición queda huérfana (sin 40 ni vinilo), la borra (salvo `--keep-empty-editions`).',
  },
  {
    id: 'featured-import-admin',
    run: 'UI: /[lang]/administrator/tracks → bloque «Importar New Releases (Beatport)». API GET/POST /api/admin/featured-import (sesión admin). Hasta 50 URLs, pausa en serie, crear chart_editions opcional.',
    npm: '—',
    creds: 'Cookie admin + vars servidor (Supabase service)',
    description:
      'Importa singles desde URLs Beatport a chart_featured_tracks. Multi-semana: prefijo YYYY-MM-DD en cada línea. Sin Playwright en servidor (403 → script local).',
  },
  {
    id: 'chart-vinyl-file',
    run: 'node scripts/guia-base-datos.mjs run chart-vinyl-file data/charts/vinyl/<semana>.json',
    npm: 'npm run db:chart:vinyl -- data/charts/vinyl/2026-04-06.json',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'Retro Vinyl Picks semanales en /charts: UPSERT manual desde JSON (chart_vinyl_tracks). Datos de Discogs + YouTube. La edición week_date debe existir.',
  },
  {
    id: 'chart-vinyl-discogs',
    run: 'node scripts/guia-base-datos.mjs run chart-vinyl-discogs --label 5838 --week 2026-05-11 --limit 5 [--merge] [--write] [--apply]',
    npm: 'npm run db:chart:vinyl:discogs -- --label 5838 --week 2026-05-11 --limit 5 --merge --write --apply',
    creds: 'DISCOGS_TOKEN (opcional). Con --apply: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'Borrador Retro Vinyl desde Discogs (--master id|url o --label id|url) + búsqueda YouTube. --merge fusiona con JSON de la semana; --write/--apply publican en Supabase.',
  },
  {
    id: 'chart-artists',
    run: 'node scripts/guia-base-datos.mjs run chart-artists [--week=YYYY-MM-DD] [--all-published] [--file=ruta.json] [--dry-run]',
    npm: 'npm run db:chart:artists -- [--week=… | --all-published | --file=… | --dry-run]',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (salvo --file + --dry-run)',
    description:
      'Tras publicar el chart: lee artistas de chart_tracks + chart_featured_tracks (última semana por defecto), actualiza styles/bios en catálogo y crea JSON+UPSERT de faltantes. Ampliar alias en scripts/sync-chart-artists.mjs (CHART_NAME_TO_SLUG) si hace falta.',
  },
  {
    id: 'chart-artists-agent',
    run: 'node scripts/guia-base-datos.mjs run chart-artists-agent [--week=…] [--file=…] [--force] [--dry-run] [--limit=N] [--delay-ms=…] [--bootstrap-min-freq=N] [--bootstrap-only]',
    npm: 'npm run db:chart:artists:agent -- [flags]',
    creds: 'OPENAI_API_KEY + API Supabase (service role); opcional SERPAPI_API_KEY',
    description:
      'Enriquece con OpenAI (--revise --save-json) las fichas starter del chart; inyecta --notes con sellos y títulos del chart para desambiguar nombres genéricos. Por defecto solo JSON con plantilla starter; --force recorre todo el chart.',
  },
  {
    id: 'beatport-top',
    run: 'node scripts/guia-base-datos.mjs run beatport-top artist <slug> <beatport_id>',
    npm: 'npm run db:beatport:top -- artist yo-speed 526398',
    creds: 'NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'Scrapea el Top 10 de ventas de Beatport y guarda JSONB en beatport_top_tracks. --all-artists / --all-labels (con --missing-only solo quienes tienen lista vacía). --fill-missing-artists rellena huecos y busca beatport_id por nombre exacto en la búsqueda de Beatport cuando falta. --limit=N, --dry-run. Ante bloqueo Cloudflare (challenge "Just a moment…"): --headless usa Playwright + Chrome para sortearlo (requiere "npm i -D playwright" + "npx playwright install chromium"; tras un batch grande la IP queda en lista negra de CF varias horas y conviene esperar antes de reintentar).',
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
  {
    id: 'translate-scenes',
    run: 'node scripts/guia-base-datos.mjs run translate-scenes [scenes] [--slug SLUG] [--force] [--dry-run] [--limit N]',
    npm: 'npm run db:translate:scenes -- [--slug …] [--force] [--dry-run]',
    creds: 'OPENAI_API_KEY + NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY',
    description:
      'Traduce escenas ES→EN (inglés neutro) con OpenAI: name_es/description_es → name_en/description_en. Módulo reutilizable src/lib/translate-es-en-openai.ts (translateFieldEsToEn para más tablas). Admin: editar escena → botones bajo el editor.',
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
  label-json <slug>      UPSERT desde data/labels/<slug>.json
  label-agent -- …       generar-sello-agente.mjs (pasar args tras --)
  blog-agent -- …        generar-blog-agente.mjs (artículos blog_posts; gpt-5.6-terra)
  photo -- …             elegir-foto-artista.mjs
  label-photo -- …       elegir-foto-sello.mjs (logos sellos)
  labels-discogs [--apply] [--slug X] [--limit N] [--all] [--strict]
                               discogs-find-labels.mjs (match exacto Discogs → discogs_id/_url)
  labels-discogs-images [--apply] [--slug X] [--limit N] [--all]
                               discogs-labels-images.mjs (logo Discogs → bucket media → image_url)
  seed                   seed-supabase (solo seed)
  migrate                seed-supabase --all
  push-hibrida-fest      push-hibrida-fest.mjs (API service role)
  events-enrich <slug> [--with-poster] [--dry-run] [--force]
                               enriquecer-evento.mjs (SerpAPI web + OpenAI → completar ficha)
  network-enrich [--only artists|labels|scenes|events] [--slug X] [--country ES] [--limit N] [--dry-run]
                               enriquecer-red.mjs (GPT-5.4 → conexiones artistas/sellos/escenas/eventos; fusiona en BD)
  events-prune-non-spain [--dry-run]  enriquecer-evento.mjs --prune-non-spain
  events-patch-raveart-winter-2026     fecha 14 mar 2026 en raveart-winter-festival-2026
  events-patch-raveart-summer-2026     4 jul 2026 Sevilla / Chaparrejo en raveart-summer-2026
  events-patch-raveart-rvt-we-love-retro-2026  RVT We Love Retro + Freestylers, Granada 10 abr 2026
  events-patch-raveart-rvt-booking-clubbing-2026  RVT Booking & Clubbing, Elysium Sevilla 11 abr 2026
  events-patch-raveart-rvt-we-love-retro-elysium-sevilla-2026  We Love Retro, Elysium Sevilla 9 may 2026
  events-patch-raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026  RVT Summer Festival presentación, El Tren Granada 9 may 2026
  events-patch-raveart-retro-halloween-2025-poster  cartel public/images → raveart-retro-halloween-2025
  events-patch-kultura-breakz-ii-aniversario-2026  II Aniversario Kultura Breakz, Pandora Sevilla 2 may 2026
  events-patch-pure-bassline-7-aniversario-2026  Pure Bassline 7º Aniversario, Pandora Sevilla 2 abr 2026
  events-patch-pure-bassline-15-agosto-2026-sevilla  Made in Spain Festival (Pure Bassline), White Beach Antilla Lepe 15 ago 2026 (5º avance cartel, Fourvenues rollercoaster)
  events-patch-natural-universal-retro-2026-malaga  Nätural Universal Retro, Paris15 Málaga 9 may 2026 (MonsterTicket)
  events-patch-malaga-is-break-3-aniversario-frequency-break-2026  Malaga is Break 3º Aniversario Frequency Break, Sala Roka Málaga 3 abr 2026
  events-patch-cyber-bass-2026  Cyber Bass 2026 GOAT Breakbeat, Maruja Limón Alhaurín 18 abr 2026
  events-patch-safari-break-night-2026  Safari Break Night, Safari Club Palomares del Río 25 abr 2026
  events-patch-break-the-flow-w-terrie-kynd-2026  Break The Flow / Terrie Kynd, Sala Teranga Torrox 2 may 2026
  events-patch-el-pinar-breaks-fest-2026  El Pinar Breaks Fest, Baños de la Encina 9 may 2026
  events-patch-breaks-bloom-festival-2026  Breaks Bloom Festival, Hacienda El Mantillo Pilas 19 sept 2026
  events-patch-bellota-break-festival-2026  Bellota Break Festival, Calzadilla de los Barros 13 jun 2026
  events-patch-oshun-festival-2026  Oshun Festival, Carpas Yerbabuena Barbate 15 ago 2026
  events-patch-mas-ruido-black-hole-360-2026  +Ruido! Black Hole 360, O’Farrell San Fernando 18 abr 2026
  events-patch-la-caseta-del-breakbeat-2026  La Caseta del Breakbeat, Pandora Sevilla 25 abr 2026 (Fourvenues)
  events-patch-fruity-loops-03-06-2026  Fruity Loops, 3 jun 2026, entradas Fourvenues; cartel public/images/events/fruity-loops-03-06-2026.avif
  events-patch-finger-lickin-boat-party-2026  Finger Lickin Boat Party, Dutch Master Londres 16 may 2026
  events-patch-finger-lickin-between-the-bridges-2026  Finger Lickin' at Between the Bridges, Southbank Londres 16 may 2026 (17:00–23:00)
  events-patch-dreambeach-costa-del-sol-2026  Dreambeach Costa del Sol, Vélez-Málaga 31 jul–1 ago 2026 (breaks en cartel)
  events-patch-iberican-breaks-festival-2026  IBÉRICAN Breaks Festival, Olvera 16 may 2026 (Terraza Manhattan, MonsterTicket)
  events-patch-solaris-fest-matalascanas-2026  Solaris Fest, Matalascañas 20 jun 2026 (Surfasaurus, MonsterTicket, cartel local WebP)
  events-patch-floridance-festival-2026  Floridance Festival 2026, Rota 5 sept Estadio Monago (Animalia, MonsterTicket)
  events-patch-electrolunch-xxl-picnic-76-sevilla-2026  Electrolunch XXL · Picnic 76, Parque Magallanes Sevilla 9 may 2026 (Stanton Warriors + locales, ultimaentrada.com)
  events-patch-breakdown-orlando-2026  BREAKDOWN (Huda Hudia), Broken Strings Brewery Orlando 27 jun 2026 (Fully Loaded + Rave Royalty, Eventbrite)
  events-patch-power-breakbeat-con-autobots-2026  Power Breakbeat + Autobots, Sala Roka Málaga 25 jul 2026 (MonsterTicket)
  events-patch-aqua-breaks-pool-party-2026  Aqua Breaks Pool Party, La Rábida Huelva 25 jul 2026 (MonsterTicket)
  events-patch-surbreak-breakbiteros-del-sur-2026  Surbreak, Sala Las Palmeras La Línea 15 ago 2026 (MonsterTicket)
  events-patch-farewell-summer-festival-2026  Farewell Summer Festival, Recinto Ferial Pedro Abad 21–22 ago 2026 (Instagram)
  events-patch-ritmos-rotos-en-el-patio-2026  Ritmos Rotos en el Patio, Pandora Sevilla 11 jul 2026 (Fourvenues adrianchupi)
  events-patch-retro-goats-2026-malaga  RETRO Goats, Paris15 Málaga 20 jun 2026 (GOAT Breakbeat / MonsterTicket)
  events-patch-ritmika-1-aniversario-white-beach-lepe-2026  Ritmika 1er Aniversario · Festival Open Air 12h, White Beach Antilla (La Antilla, Lepe) 18 jul 2026 (Ed Solo feat. Navigator + Keith Mackenzie feat. Sporty-O + line up vand4los, MonsterTicket / rollerwhitebeach.com)
  events-patch-coast-breakbeat-2026          Coast Breakbeat, Sala Teranga Torrox Costa 18 jul 2026 (Frequency Break, MonsterTicket)
  events-patch-breakclub-at-cosmos-club-2026 BREAKCLUB at COSMOS CLUB Sevilla 17 jul 2026 (MonsterTicket)
  events-patch-break-nation-by-420-sound-2026 Break Nation by 420 Sound, Sala Roka Málaga 19 sept 2026 (MonsterTicket)
  events-patch-finger-lickin-summer-takeover-2026  Finger Lickin' Summer Takeover, Concorde 2 Brighton 15 ago 2026 (Skiddle)
  events-patch-stanton-warriors-volks-brighton-2026  On the Beach afterparty, Volks Brighton 18 jul 2026 (Stanton Warriors, Calyx)
  events-patch-stanton-sessions-steelyard-london-2026  Stanton Sessions, The Steelyard London 10 oct 2026 (Skiddle)
  events-patch-deekline-iron-cow-orlando-2026  Deekline @ Iron Cow Orlando 18 jul 2026 (Happeningnext)
  events-patch-breaks-bass-guau-yo-speed-perth-2026  Breaks & Bass Guau + Yo Speed, The Aberdeen Perth 2 oct 2026 (Megatix / RA)
  events-patch-breaks-bass-guau-yo-speed-melbourne-2026  Guau + Yo Speed tour, The Industrique Melbourne 3 oct 2026
  events-patch-breaks-bass-guau-yo-speed-brisbane-2026  Guau + Yo Speed tour day party, The Brightside Brisbane 5 oct 2026 (Oztix)
  events-patch-breaks-bass-guau-yo-speed-sydney-2026  Guau + Yo Speed tour, ARQ Sydney Basement 4 oct 2026 (Humanitix)
  events-patch-bionic-beatslappaz-si-paradiso-perth-2026  Bionic / Beatslappaz, Si Paradiso Basement Perth 28 ago 2026 (Humanitix)
  events-patch-dub-elements-friends  Dub Elements & Friends, Pandora Sevilla 11 sept 2026 (Fourvenues)
  events-delete-slug <slug>            borrar un evento por slug (duplicados)
  events-poster …        elegir-poster-evento.mjs (Serp imágenes + cartel → Storage)
  migrate-files -- …     seed-supabase --files …
  mixes-file <ruta>      UPSERT mixes desde JSON (actualizar-mixes.mjs; p. ej. data/mixes/*.json)
  mixes-published [--force]  backfill-mix-youtube-published-at.mjs (fecha publicación YouTube → orden /mixes)
  chart-propose [--sources …]  chart-40-breaks.mjs --dry-run (proponer chart semanal, solo terminal)
  chart-confirm [--week …] [--sources …]  chart-40-breaks.mjs --confirm (proponer + subir a Supabase)
  chart-featured-file <ruta.json>  chart-featured-upsert.mjs (New releases por semana, solo JSON manual)
  purge-featured-week-dates <YYYY-MM-DD …> [--dry-run] [--keep-empty-editions]  purge-chart-featured-by-week-date.mjs (quita NR; no toca el 40)
  featured-import-admin           panel /administrator/tracks + POST /api/admin/featured-import (URLs Beatport → Supabase)
  chart-vinyl-file <ruta.json>    chart-vinyl-upsert.mjs (Retro Vinyl Picks semanales, Discogs+YouTube, solo JSON manual)
  chart-vinyl-discogs [--master|--label] … [--week=…] [--merge] [--write] [--apply]  chart-vinyl-from-discogs.mjs
  chart-artists [--week=…|--all-published|--file=…] [--dry-run]  sync-chart-artists.mjs (catálogo ↔ nombres del chart)
  chart-artists-agent [--week=…|--file=…] [--force] [--dry-run] [--limit=N]  enrich-chart-artists-agent.mjs (agente + notas con sellos/títulos)
  beatport-top artist <slug> <beatport_id>  beatport-top-tracks.mjs (Top 10 ventas Beatport → JSONB en BD)
  beatport-top label <slug> <beatport_id>   idem para sellos
  beatport-top --all-artists | --all-labels [--missing-only] [--dry-run]  batch (--missing-only solo sin Top 10)
  beatport-top --fill-missing-artists [--limit=N] [--dry-run]  artistas sin lista (+ búsqueda Beatport si no hay beatport_id)
  beatport-top … --headless  fuerza navegador (Chrome) para pasar el challenge Cloudflare cuando da 403
  verify                 seed-supabase --verify
  timeline [args]        sync-timeline-artists.mjs
  timeline-sql [args]    sync-timeline-artists.mjs --sql
  user-list [args]       sync-user-list-artists.mjs
  media-upload -- …      upload-storage-media.mjs
  translate-scenes …     traducir-bd-en.ts (tsx): escenas ES→EN OpenAI; --slug --force --dry-run --limit

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

• lib/artist-upsert.mjs — «Motor común de guardado» (solo REST Supabase + service role;
  sin Postgres/pg). Lo usan actualizar-artista, generar-artista-agente, elegir-foto
  (UPSERT) y la API admin.

• generar-artista-agente.mjs — «Redactor IA de fichas». OpenAI (+ Serp opcional)
  genera la ficha. --revise + ficha en data/artists o BD: refina biografías y campos
  sin vaciar el texto existente; varios --notes. Por defecto: UPSERT en BD. Ojo:
  con --json-only o --stdout NO escribe en Supabase (solo fichero o consola).

• actualizar-sello.mjs / generar-sello-agente.mjs — «Sello desde JSON» / «Redactor IA
  de sellos». Misma mecánica que artistas: lib/label-upsert.mjs, prompts en
  scripts/prompts/sello-agente-system.txt (+ revision). Guía: run label-json <slug>,
  run label-agent -- <slug> "Nombre". Lote: generar-sello-agente.mjs --from-db.

• elegir-foto-sello.mjs — «Logo del sello» (misma idea que la API /admin/agent/label-logo):
  SerpAPI + OpenAI → media/labels/<slug>/logo.* y UPDATE labels.image_url.
  run label-photo -- --missing-only | <slug> | --all.

• elegir-foto-artista.mjs — «Buscar foto, subirla a Storage y enlazar». Elige URL
  con SerpAPI+IA, descarga bytes de imagen válidos (rechaza HTML), sube a bucket
  media bajo artists/<slug>/, y guarda en JSON y BD la URL pública de Supabase.
  --repair: cola desde Supabase (sin https o URL rota); si falla → image_url null.
  Omite slugs con retrato en public/images/artists según data/artist-public-portrait-map.json
  salvo --force-rephoto. sync-artist-public-portrait-urls.mjs: mapa+fichero → /images/artists/…
  en JSON y UPSERT. --json-only: solo URL externa en JSON (sin Storage ni UPSERT).
  Documentación: docs/ARTIST_AI_AGENT.md (Fotos de artista).

• ensure-artist-json-in-db.mjs — «¿El JSON y la BD dicen lo mismo?». Lee la BD,
  compara bios/real_name con el JSON; si no coinciden, llama a actualizar-artista
  y escribe en base.

• delete-artist-by-slug.mjs — Borrar fila artists por slug (API REST): pone
  mixes.artist_id a NULL si apunta al artista y luego DELETE. run delete-artist-slug <slug>.

• seed-supabase.mjs — «Migraciones SQL y semilla». Ejecuta .sql contra Postgres
  (--all, --files, o solo seed). Modo --verify: solo lee conteos (anon), no escribe.

• push-hibrida-fest.mjs — UPSERT de organizations/events Hibrida Fest por API
  (service role); mismo contenido que 014_….sql.

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

• beatport-top-tracks.mjs — «Top 10 de ventas en Beatport» (artistas y sellos).
  Scrapea __NEXT_DATA__ de la ficha pública, extrae los 10 tracks más vendidos
  (con sample_url para preview) y guarda en beatport_top_tracks (JSONB).
  run beatport-top artist yo-speed 526398 | label 83 54171. Batch: --all-artists
  / --all-labels (--missing-only solo filas con beatport_top_tracks vacío);
  --fill-missing-artists (prioriza esa cola + busca nombre exacto si falta beatport_id);
  opcional --limit=N. Las fichas web de artista/sello
  muestran el bloque «BEATPORT TOP 10» como acordeón en el hero: filas idénticas
  al chart semanal (PositionBadge, artwork, artista|sello|año, BPM, key, BEATPORT)
  y barra flotante inferior compartida (transporte, progreso, mediaSession). El
  reproductor usa claimAudio('beatport-top') para excluirse mutuamente con el deck,
  mixes y chart. Migración: 046_beatport_top_tracks.sql. Docs: README.md §
  «Beatport: weekly chart vs Top 10» y «Global audio system».

• chart-40-breaks.mjs — «40 Breaks Vitales». Scrapea Beatport Top 100
  Breaks/Breakbeat/UK Bass (+ Juno opcional), IA selecciona los 40 mejores,
  muestra propuesta en terminal (--dry-run) o sube a Supabase (--confirm).
  Compara con la edición anterior para calcular movimiento y semanas en chart.
  Uso rápido: run chart-propose | run chart-confirm [--week 2026-03-30].

• chart-featured-upsert.mjs — «New releases» en /charts. Lee solo un JSON con
  week_date + picks (título, artistas, link_url, artwork opcional, etc.) y
  sustituye chart_featured_tracks para esa edición. No scrapea tiendas.

• sync-chart-artists.mjs — Tras publicar la semana: cruza nombres del chart
  (chart_tracks + chart_featured_tracks, última edición por defecto) con
  data/artists; añade Breakbeat + mención «40 Breaks Vitales» en bios; crea
  fichas starter y UPSERT de faltantes. run chart-artists [--week=…|--all-published|--file=…] [--dry-run].

• enrich-chart-artists-agent.mjs — Tras chart-artists: para fichas aún en
  plantilla «starter», llama al agente (--revise --save-json) con un .md de notas
  que incluye sellos y títulos del chart (desambiguación de nombres genéricos).
  run chart-artists-agent [--week=…|--file=…] [--force] [--dry-run] [--limit=N].

• sync-timeline-artists.mjs — «Artistas que salen en la cronología web». Sin
  flags: INSERT en artists de los que faltan. Con --sql: solo genera/actualiza
  el fichero 009_…sql en disco (no toca la BD hasta que migres ese SQL).

• sync-user-list-artists.mjs — «Lista extendida de nombres → filas nuevas».
  Inserta en artists los slugs que están en la lista larga y aún no existen.

• upload-storage-media.mjs — «Subir archivo al bucket media». Escribe en Storage
  de Supabase (no en la tabla artists). Después hace falta poner la URL en
  image_url (JSON + actualizar-artista o admin).

• traducir-bd-en.ts — «Traducción ES→EN (inglés neutro) con OpenAI». Por ahora
  public.scenes (name/description). Prompt scripts/prompts/translate-es-en-neutral-system.txt;
  lógica compartida en src/lib/translate-es-en-openai.ts (translateFieldEsToEn para ampliar).
  CLI: run translate-scenes …; admin: editar escena → botones bajo el editor HTML.

• prompts/artista-agente-system.txt — Texto de sistema para el agente de bios;
  no es un programa.

• prompts/sello-agente-system.txt — Texto de sistema para el agente de sellos.

Resumen «¿escribe en la tabla artists?»: sí → actualizar-artista, generar-artista-agente
(salvo --json-only/--stdout), ensure (si hay desajuste), sync-timeline (sin --sql),
sync-user-list, elegir-foto (salvo --json-only), delete-artist-slug (borrar fila). No (solo) → elegir-foto
--json-only, sync-timeline --sql (solo archivo), verify, guia.

Resumen «¿escribe en la tabla labels?»: sí → actualizar-sello, generar-sello-agente
(salvo --json-only/--stdout), push-labels-batch.mjs.
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
  // Redes con inspección SSL: el padre puede tener --use-system-ca pero el hijo no hereda ese
  // argumento de argv. Sin esto, fetch() a Supabase falla (p. ej. UNABLE_TO_VERIFY_LEAF_SIGNATURE).
  // Desactivar: OB_NO_SYSTEM_CA=1
  const nodeMajor = Number((process.versions.node || '0').split('.')[0])
  const argv =
    nodeMajor >= 20 && String(process.env.OB_NO_SYSTEM_CA || '').trim() !== '1'
      ? ['--use-system-ca', scriptPath, ...args]
      : [scriptPath, ...args]
  const r = spawnSync(process.execPath, argv, {
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
    case 'delete-artist-slug': {
      const slugDel = (rest[0] || '').trim()
      if (!slugDel) {
        console.error('Uso: run delete-artist-slug <slug>')
        process.exit(1)
      }
      runNode('delete-artist-by-slug.mjs', [slugDel])
      break
    }
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
    case 'label-json': {
      const slug = (rest[0] || '').replace(/\.json$/i, '').trim()
      if (!slug) {
        console.error('Uso: run label-json <slug>')
        process.exit(1)
      }
      const p = join(ROOT, 'data', 'labels', `${slug}.json`)
      if (!existsSync(p)) {
        console.error('No existe:', p)
        process.exit(1)
      }
      runNode('actualizar-sello.mjs', [p])
      break
    }
    case 'label-agent':
      runNode('generar-sello-agente.mjs', stripLeadingDashDash(rest))
      break
    case 'blog-agent':
      runNode('generar-blog-agente.mjs', stripLeadingDashDash(rest))
      break
    case 'photo':
      runNode('elegir-foto-artista.mjs', stripLeadingDashDash(rest))
      break
    case 'label-photo':
      runNode('elegir-foto-sello.mjs', stripLeadingDashDash(rest))
      break
    case 'labels-discogs':
      runNode('discogs-find-labels.mjs', stripLeadingDashDash(rest))
      break
    case 'labels-discogs-images':
      runNode('discogs-labels-images.mjs', stripLeadingDashDash(rest))
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
    case 'network-enrich': {
      runNode('enriquecer-red.mjs', rest)
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
    case 'events-patch-raveart-rvt-we-love-retro-elysium-sevilla-2026':
      runNode('enriquecer-evento.mjs', [
        '--patch-raveart-rvt-we-love-retro-elysium-sevilla-2026',
        ...rest,
      ])
      break
    case 'events-patch-raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026':
      runNode('enriquecer-evento.mjs', [
        '--patch-raveart-rvt-summer-festival-presentacion-oficial-el-tren-granada-2026',
        ...rest,
      ])
      break
    case 'events-patch-raveart-retro-halloween-2025-poster':
      runNode('enriquecer-evento.mjs', ['--patch-raveart-retro-halloween-2025-poster', ...rest])
      break
    case 'events-patch-kultura-breakz-ii-aniversario-2026':
      runNode('enriquecer-evento.mjs', ['--patch-kultura-breakz-ii-aniversario-2026', ...rest])
      break
    case 'events-patch-pure-bassline-7-aniversario-2026':
      runNode('enriquecer-evento.mjs', ['--patch-pure-bassline-7-aniversario-2026', ...rest])
      break
    case 'events-patch-pure-bassline-15-agosto-2026-sevilla':
      runNode('enriquecer-evento.mjs', ['--patch-pure-bassline-15-agosto-2026-sevilla', ...rest])
      break
    case 'events-patch-natural-universal-retro-2026-malaga':
      runNode('enriquecer-evento.mjs', ['--patch-natural-universal-retro-2026-malaga', ...rest])
      break
    case 'events-patch-malaga-is-break-3-aniversario-frequency-break-2026':
      runNode('enriquecer-evento.mjs', [
        '--patch-malaga-is-break-3-aniversario-frequency-break-2026',
        ...rest,
      ])
      break
    case 'events-patch-cyber-bass-2026':
      runNode('enriquecer-evento.mjs', ['--patch-cyber-bass-2026', ...rest])
      break
    case 'events-patch-safari-break-night-2026':
      runNode('enriquecer-evento.mjs', ['--patch-safari-break-night-2026', ...rest])
      break
    case 'events-patch-break-the-flow-w-terrie-kynd-2026':
      runNode('enriquecer-evento.mjs', ['--patch-break-the-flow-w-terrie-kynd-2026', ...rest])
      break
    case 'events-patch-el-pinar-breaks-fest-2026':
      runNode('enriquecer-evento.mjs', ['--patch-el-pinar-breaks-fest-2026', ...rest])
      break
    case 'events-patch-breaks-bloom-festival-2026':
      runNode('enriquecer-evento.mjs', ['--patch-breaks-bloom-festival-2026', ...rest])
      break
    case 'events-patch-bellota-break-festival-2026':
      runNode('enriquecer-evento.mjs', ['--patch-bellota-break-festival-2026', ...rest])
      break
    case 'events-patch-oshun-festival-2026':
      runNode('enriquecer-evento.mjs', ['--patch-oshun-festival-2026', ...rest])
      break
    case 'events-patch-mas-ruido-black-hole-360-2026':
      runNode('enriquecer-evento.mjs', ['--patch-mas-ruido-black-hole-360-2026', ...rest])
      break
    case 'events-patch-la-caseta-del-breakbeat-2026':
      runNode('enriquecer-evento.mjs', ['--patch-la-caseta-del-breakbeat-2026', ...rest])
      break
    case 'events-patch-fruity-loops-03-06-2026':
      runNode('enriquecer-evento.mjs', ['--patch-fruity-loops-03-06-2026', ...rest])
      break
    case 'events-patch-finger-lickin-boat-party-2026':
      runNode('enriquecer-evento.mjs', ['--patch-finger-lickin-boat-party-2026', ...rest])
      break
    case 'events-patch-finger-lickin-between-the-bridges-2026':
      runNode('enriquecer-evento.mjs', ['--patch-finger-lickin-between-the-bridges-2026', ...rest])
      break
    case 'events-patch-dreambeach-costa-del-sol-2026':
      runNode('enriquecer-evento.mjs', ['--patch-dreambeach-costa-del-sol-2026', ...rest])
      break
    case 'events-patch-iberican-breaks-festival-2026':
      runNode('enriquecer-evento.mjs', ['--patch-iberican-breaks-festival-2026', ...rest])
      break
    case 'events-patch-solaris-fest-matalascanas-2026':
      runNode('enriquecer-evento.mjs', ['--patch-solaris-fest-matalascanas-2026', ...rest])
      break
    case 'events-patch-floridance-festival-2026':
      runNode('enriquecer-evento.mjs', ['--patch-floridance-festival-2026', ...rest])
      break
    case 'events-patch-electrolunch-xxl-picnic-76-sevilla-2026':
      runNode('enriquecer-evento.mjs', [
        '--patch-electrolunch-xxl-picnic-76-sevilla-2026',
        ...rest,
      ])
      break
    case 'events-patch-breakdown-orlando-2026':
      runNode('enriquecer-evento.mjs', ['--patch-breakdown-orlando-2026', ...rest])
      break
    case 'events-patch-power-breakbeat-con-autobots-2026':
      runNode('enriquecer-evento.mjs', ['--patch-power-breakbeat-con-autobots-2026', ...rest])
      break
    case 'events-patch-aqua-breaks-pool-party-2026':
      runNode('enriquecer-evento.mjs', ['--patch-aqua-breaks-pool-party-2026', ...rest])
      break
    case 'events-patch-surbreak-breakbiteros-del-sur-2026':
      runNode('enriquecer-evento.mjs', [
        '--patch-surbreak-breakbiteros-del-sur-2026',
        ...rest,
      ])
      break
    case 'events-patch-farewell-summer-festival-2026':
      runNode('enriquecer-evento.mjs', ['--patch-farewell-summer-festival-2026', ...rest])
      break
    case 'events-patch-ritmos-rotos-en-el-patio-2026':
      runNode('enriquecer-evento.mjs', ['--patch-ritmos-rotos-en-el-patio-2026', ...rest])
      break
    case 'events-patch-retro-goats-2026-malaga':
      runNode('enriquecer-evento.mjs', ['--patch-retro-goats-2026-malaga', ...rest])
      break
    case 'events-patch-ritmika-1-aniversario-white-beach-lepe-2026':
      runNode('enriquecer-evento.mjs', [
        '--patch-ritmika-1-aniversario-white-beach-lepe-2026',
        ...rest,
      ])
      break
    case 'events-patch-coast-breakbeat-2026':
      runNode('enriquecer-evento.mjs', ['--patch-coast-breakbeat-2026', ...rest])
      break
    case 'events-patch-breakclub-at-cosmos-club-2026':
      runNode('enriquecer-evento.mjs', ['--patch-breakclub-at-cosmos-club-2026', ...rest])
      break
    case 'events-patch-break-nation-by-420-sound-2026':
      runNode('enriquecer-evento.mjs', ['--patch-break-nation-by-420-sound-2026', ...rest])
      break
    case 'events-patch-finger-lickin-summer-takeover-2026':
      runNode('enriquecer-evento.mjs', ['--patch-finger-lickin-summer-takeover-2026', ...rest])
      break
    case 'events-patch-stanton-warriors-volks-brighton-2026':
      runNode('enriquecer-evento.mjs', ['--patch-stanton-warriors-volks-brighton-2026', ...rest])
      break
    case 'events-patch-stanton-sessions-steelyard-london-2026':
      runNode('enriquecer-evento.mjs', ['--patch-stanton-sessions-steelyard-london-2026', ...rest])
      break
    case 'events-patch-deekline-iron-cow-orlando-2026':
      runNode('enriquecer-evento.mjs', ['--patch-deekline-iron-cow-orlando-2026', ...rest])
      break
    case 'events-patch-breaks-bass-guau-yo-speed-perth-2026':
      runNode('enriquecer-evento.mjs', ['--patch-breaks-bass-guau-yo-speed-perth-2026', ...rest])
      break
    case 'events-patch-breaks-bass-guau-yo-speed-melbourne-2026':
      runNode('enriquecer-evento.mjs', ['--patch-breaks-bass-guau-yo-speed-melbourne-2026', ...rest])
      break
    case 'events-patch-breaks-bass-guau-yo-speed-brisbane-2026':
      runNode('enriquecer-evento.mjs', ['--patch-breaks-bass-guau-yo-speed-brisbane-2026', ...rest])
      break
    case 'events-patch-breaks-bass-guau-yo-speed-sydney-2026':
      runNode('enriquecer-evento.mjs', ['--patch-breaks-bass-guau-yo-speed-sydney-2026', ...rest])
      break
    case 'events-patch-bionic-beatslappaz-si-paradiso-perth-2026':
      runNode('enriquecer-evento.mjs', ['--patch-bionic-beatslappaz-si-paradiso-perth-2026', ...rest])
      break
    case 'events-patch-dub-elements-friends':
      runNode('enriquecer-evento.mjs', ['--patch-dub-elements-friends', ...rest])
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
    case 'mixes-published':
      runNode('backfill-mix-youtube-published-at.mjs', rest)
      break
    case 'mixes-file': {
      const rel = rest[0]
      if (!rel) {
        console.error('Uso: run mixes-file <ruta-desde-raíz-repo>')
        console.error('  Ej: run mixes-file data/mixes/raveart-festival-sessions-2024-2025.json')
        process.exit(1)
      }
      const p = resolve(ROOT, rel)
      if (!existsSync(p)) {
        console.error('No existe:', p)
        process.exit(1)
      }
      runNode('actualizar-mixes.mjs', [p])
      break
    }
    case 'chart-propose':
      runNode('chart-40-breaks.mjs', ['--dry-run', ...rest])
      break
    case 'chart-confirm':
      runNode('chart-40-breaks.mjs', ['--confirm', ...rest])
      break
    case 'chart-featured-file': {
      const rel = rest[0]
      if (!rel) {
        console.error('Uso: run chart-featured-file <ruta-desde-raíz-repo.json>')
        console.error('  Ej: run chart-featured-file data/charts/picks/2026-03-30.json')
        process.exit(1)
      }
      const p = resolve(ROOT, rel)
      if (!existsSync(p)) {
        console.error('No existe:', p)
        process.exit(1)
      }
      runNode('chart-featured-upsert.mjs', [rel, ...rest.slice(1)])
      break
    }
    case 'purge-featured-week-dates': {
      if (!rest.filter((x) => /^\d{4}-\d{2}-\d{2}$/.test(x)).length) {
        console.error(
          'Uso: run purge-featured-week-dates YYYY-MM-DD [YYYY-MM-DD …] [--dry-run] [--keep-empty-editions]',
        )
        process.exit(1)
      }
      runNode('purge-chart-featured-by-week-date.mjs', rest)
      break
    }
    case 'chart-vinyl-file': {
      const rel = rest[0]
      if (!rel) {
        console.error('Uso: run chart-vinyl-file <ruta-desde-raíz-repo.json>')
        console.error('  Ej: run chart-vinyl-file data/charts/vinyl/2026-04-06.json')
        process.exit(1)
      }
      const p = resolve(ROOT, rel)
      if (!existsSync(p)) {
        console.error('No existe:', p)
        process.exit(1)
      }
      runNode('chart-vinyl-upsert.mjs', [rel])
      break
    }
    case 'chart-vinyl-discogs':
      runNode('chart-vinyl-from-discogs.mjs', rest)
      break
    case 'chart-artists':
      runNode('sync-chart-artists.mjs', rest)
      break
    case 'chart-artists-agent':
      runNode('enrich-chart-artists-agent.mjs', rest)
      break
    case 'beatport-top':
      runNode('beatport-top-tracks.mjs', rest)
      break
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
    case 'translate-scenes': {
      const tsxCli = join(ROOT, 'node_modules', 'tsx', 'dist', 'cli.mjs')
      const scriptTs = join(SCRIPTS, 'traducir-bd-en.ts')
      if (!existsSync(tsxCli) || !existsSync(scriptTs)) {
        console.error('Falta tsx o scripts/traducir-bd-en.ts. Ejecuta: npm install')
        process.exit(1)
      }
      const pass = rest[0] === 'scenes' ? rest : ['scenes', ...rest]
      const r = spawnSync(process.execPath, [tsxCli, scriptTs, ...pass], {
        cwd: ROOT,
        stdio: 'inherit',
        env: process.env,
      })
      process.exit(r.status === null ? 1 : r.status)
      break
    }
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
