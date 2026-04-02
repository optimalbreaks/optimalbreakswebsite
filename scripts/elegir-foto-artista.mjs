/**
 * OPTIMAL BREAKS — Elegir foto de artista: SerpAPI (Google Imágenes) + OpenAI
 *
 * Índice agente: scripts/guia-base-datos.mjs → run photo -- …
 *
 * Busca imágenes con SerpAPI, envía al modelo los metadatos de cada candidato
 * (título, fuente, enlace a la página, dimensiones, dominio de la imagen) y
 * recibe el índice del mejor retrato / foto promocional coherente con el nombre.
 * La IA no analiza píxeles salvo que uses --vision (GPT con imágenes en miniatura).
 *
 * Requiere: OPENAI_API_KEY, SERPAPI_API_KEY en .env.local
 * Opcional: OPENAI_MODEL (por defecto igual que generar-artista-agente: gpt-5.4)
 *
 * Aviso legal: las URLs son de terceros; revisa derechos y licencias antes de uso público.
 *
 * Tras elegir la URL del buscador, descarga la imagen y la sube al bucket `media`
 * (artists/<slug>/portrait.*); `image_url` en JSON y BD es la URL pública de Supabase.
 * Sin subir (URL externa en JSON solamente): --json-only (requiere luego Storage a mano).
 *
 * Uso:
 *   npm run db:artist:photo -- fatboy-slim
 *   npm run db:artist:photo -- --all
 *   npm run db:artist:photo -- --all --skip-existing --limit 10
 *   npm run db:artist:photo -- --repair              # BD: sin imagen https o URL rota (HEAD) → nueva búsqueda; si falla → image_url null (fallback web)
 *   npm run db:artist:photo -- --repair --dry-run
 *   npm run db:artist:photo -- --repair --limit=20
 *   npm run db:artist:photo -- slug --dry-run
 *   npm run db:artist:photo -- slug --json-only   # no sube a Storage ni UPSERT; solo URL externa en JSON
 *   npm run db:artist:photo -- slug --vision       # modelo multimodal (más coste)
 *
 * No toca artistas con retrato en public/images/artists (mapa o image_url /images/artists/) salvo --force-rephoto.
 */

import { readFileSync, existsSync, writeFileSync, readdirSync } from 'fs'
import { resolve, dirname, join } from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'
import {
  loadEnvLocal,
  upsertArtist,
  validateArtistRow,
  supabaseApiCredentials,
} from './lib/artist-upsert.mjs'
import {
  uploadArtistPortraitFromUrl,
  hasStorageCredentials,
} from './lib/upload-artist-portrait-to-storage.mjs'
import { fetchGoogleImageCandidates } from './lib/serp-google-images.mjs'
import {
  shouldSkipInternetArtistPhotoSearch,
  hasEditorialPortraitFile,
} from './lib/editorial-public-artist-portrait.mjs'

const __dirname = dirname(fileURLToPath(import.meta.url))
const ROOT = resolve(__dirname, '..')
const ARTISTS_DIR = join(ROOT, 'data', 'artists')

const DEFAULT_MAX_CANDIDATES = 18
const DEFAULT_DELAY_MS = 1200

function parseArgs(argv) {
  const flags = new Set()
  const rest = []
  for (const a of argv) {
    if (a.startsWith('--')) flags.add(a)
    else rest.push(a)
  }
  return { flags, positional: rest }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms))
}

function hostFromUrl(u) {
  try {
    return new URL(u).hostname
  } catch {
    return ''
  }
}

function buildImageSearchQuery(artist, extraSuffix) {
  const name = String(artist.name || '').trim()
  const rn = artist.real_name ? String(artist.real_name).trim() : ''
  const country = artist.country ? String(artist.country).trim() : ''
  let q = `"${name}"`
  if (rn) q += ` ${rn}`
  q += ' DJ musician artist portrait photo'
  if (country) q += ` ${country}`
  if (extraSuffix) q += ` ${extraSuffix}`
  return q.replace(/\s+/g, ' ').trim()
}

/** Varias formulaciones; SerpAPI a veces falla con comillas o nombres raros. */
function buildArtistImageSearchQueries(artist, extraSuffix) {
  const suffix = extraSuffix ? ` ${String(extraSuffix).trim()}` : ''
  const name = String(artist.name || '').trim()
  const rn = artist.real_name ? String(artist.real_name).trim() : ''
  const country = artist.country ? String(artist.country).trim() : ''
  const styles = Array.isArray(artist.styles)
    ? artist.styles.filter(Boolean).slice(0, 2).join(' ')
    : ''

  const primary = buildImageSearchQuery(artist, extraSuffix)
  const alts = []
  if (name) alts.push(`${name} DJ producer portrait press photo${suffix}`.replace(/\s+/g, ' ').trim())
  if (name && styles) alts.push(`"${name}" ${styles} musician DJ`.replace(/\s+/g, ' ').trim())
  if (rn && name && rn.toLowerCase() !== name.toLowerCase()) {
    alts.push(`"${rn}" ${name} DJ`.replace(/\s+/g, ' ').trim())
  }
  if (name && country) alts.push(`"${name}" ${country} electronic DJ`.replace(/\s+/g, ' ').trim())

  const seenQ = new Set()
  const unique = []
  for (const q of [primary, ...alts]) {
    const k = q.replace(/\s+/g, ' ').trim()
    if (!k || seenQ.has(k)) continue
    seenQ.add(k)
    unique.push(k)
  }
  return unique
}

async function isImageUrlBroken(url) {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), 15000)
  try {
    let res = await fetch(url, {
      method: 'HEAD',
      signal: ctrl.signal,
      redirect: 'follow',
      headers: { 'User-Agent': 'OptimalBreaksPhotoRepair/1.0' },
    })
    if (res.ok) return false
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, {
        method: 'GET',
        headers: {
          Range: 'bytes=0-0',
          'User-Agent': 'OptimalBreaksPhotoRepair/1.0',
        },
        signal: ctrl.signal,
        redirect: 'follow',
      })
      return !(res.ok || res.status === 206)
    }
    return true
  } catch {
    return true
  } finally {
    clearTimeout(timer)
  }
}

async function fetchAllArtistsFromSupabase() {
  const creds = supabaseApiCredentials()
  if (!creds) throw new Error('Sin credenciales Supabase (API)')
  const sb = createClient(creds.url, creds.key, {
    auth: { persistSession: false, autoRefreshToken: false },
  })
  const pageSize = 1000
  let from = 0
  const rows = []
  for (;;) {
    const { data, error } = await sb
      .from('artists')
      .select('*')
      .order('slug', { ascending: true })
      .range(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    if (!data?.length) break
    rows.push(...data)
    if (data.length < pageSize) break
    from += pageSize
  }
  return rows
}

function normalizeDbRowToArtistJson(row) {
  const o = { ...row }
  delete o.id
  delete o.created_at
  delete o.updated_at
  return o
}

async function finalizeArtistPhoto({ artist, slug, imageUrlFinal, flags, quiet, reason }) {
  const path = join(ARTISTS_DIR, `${slug}.json`)
  const next = { ...artist, image_url: imageUrlFinal }

  if (flags.has('--dry-run')) {
    if (!quiet) {
      console.log(
        `[foto] ${slug}: dry-run → image_url`,
        imageUrlFinal ?? 'null',
        reason ? `(${reason})` : '',
      )
    }
    return { ok: true, slug, url: imageUrlFinal, reason: reason || '', dryRun: true }
  }

  writeFileSync(path, JSON.stringify(next, null, 2) + '\n', 'utf8')
  if (!quiet) console.log(`[foto] ${slug}: guardado ${path}`)

  if (flags.has('--json-only')) {
    return { ok: true, slug, url: imageUrlFinal, reason: reason || '' }
  }

  const errors = validateArtistRow(next)
  if (errors.length) {
    console.error(`[foto] ${slug}: validación fallida, no UPSERT:`, errors.join('; '))
    return { ok: false, slug, error: 'validation' }
  }
  try {
    await upsertArtist(next)
    if (!quiet) console.log(`[foto] ${slug}: UPSERT en base OK`)
  } catch (e) {
    console.error(`[foto] ${slug}: UPSERT`, e.message)
    return { ok: false, slug, error: e.message }
  }

  return { ok: true, slug, url: imageUrlFinal, reason: reason || '' }
}

async function collectRepairTargets(rows, quiet) {
  const out = []
  const chunk = 15
  for (let i = 0; i < rows.length; i += chunk) {
    const part = rows.slice(i, i + chunk)
    const results = await Promise.all(
      part.map(async (row) => {
        if (hasEditorialPortraitFile(row.slug)) return null
        const url = String(row.image_url ?? '').trim()
        const localStatic =
          url.startsWith('/images/artists/') && url.toLowerCase().endsWith('.webp')
        if (localStatic) return null
        const missing = !url.startsWith('https://')
        if (missing) return { row, reason: 'sin image_url https' }
        const broken = await isImageUrlBroken(url)
        if (broken) return { row, reason: 'URL no accesible' }
        return null
      }),
    )
    for (const r of results) {
      if (r) out.push(r)
    }
  }
  if (!quiet) console.log(`[repair] comprobadas ${rows.length} filas en artists`)
  return out
}

const SYSTEM_TEXT = `Eres editor de Optimal Breaks (música dance / breakbeat). Te pasan candidatos de Google Imágenes como METADATOS (no ves la foto).
Tu tarea: elegir a lo sumo UN candidato que sea muy probablemente una foto del artista o grupo indicado (retrato, promo, directo claro). Rechaza: otra persona homónima, memes, portadas de disco solas si parece que no hay persona, logos abstractos, renders genéricos, capturas de baja calidad, merchandising, resultados dudosos.
Responde SOLO un JSON con el esquema:
{"chosen": <número entero 0-based del array "candidates" o null>, "reason": <string breve en español>}
Si ningún candidato es fiable, chosen debe ser null.`

async function openAiChooseCandidateText({ artist, candidates, quiet }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY en .env.local')
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4'

  const lines = candidates.map((c, i) => {
    const dim =
      c.width && c.height ? `${c.width}x${c.height}` : 'unknown'
    const host = hostFromUrl(c.original)
    return `[${i}] title: ${c.title}\n    source: ${c.source}\n    page: ${c.link}\n    image_host: ${host}\n    size: ${dim}`
  })

  const user = `Artista:
- nombre_artistico: ${artist.name}
- nombre_real: ${artist.real_name ?? 'null'}
- pais: ${artist.country ?? 'null'}
- slug: ${artist.slug}

Candidatos (mismo orden que los índices 0..n-1):
${lines.join('\n\n')}

Devuelve JSON: {"chosen": number|null, "reason": string}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_TEXT },
        { role: 'user', content: user },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI ${res.status}: ${err}`)
  }
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) throw new Error('Respuesta OpenAI vacía')

  let raw = content.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  const parsed = JSON.parse(raw)
  const chosen = parsed.chosen
  const reason = typeof parsed.reason === 'string' ? parsed.reason : ''
  if (chosen !== null && chosen !== undefined) {
    const n = Number(chosen)
    if (!Number.isInteger(n) || n < 0 || n >= candidates.length) {
      if (!quiet) {
        console.warn('[foto] Índice inválido del modelo:', chosen, '→ se ignora')
      }
      return { url: null, reason: reason || 'índice inválido' }
    }
    return { url: candidates[n].original, reason }
  }
  return { url: null, reason: reason || 'sin candidato' }
}

/** Modelo multimodal: envía miniaturas (URLs públicas). Requiere modelo con visión. */
async function openAiChooseCandidateVision({ artist, candidates, quiet }) {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY en .env.local')
  const model =
    process.env.OPENAI_VISION_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-4o-mini'

  const maxImg = Math.min(8, candidates.length)
  const content = [
    {
      type: 'text',
      text: `Artista: "${artist.name}"${artist.real_name ? ` (real: ${artist.real_name})` : ''}. País: ${artist.country || '?'}. Elige UN índice 0..${candidates.length - 1} cuya imagen sea claramente ese artista/grupo, o null si ninguna sirve. Responde SOLO JSON: {"chosen": number|null, "reason": "..."}`,
    },
  ]

  for (let i = 0; i < maxImg; i++) {
    const c = candidates[i]
    const imgUrl = c.thumbnail && c.thumbnail.startsWith('https://') ? c.thumbnail : c.original
    content.push({ type: 'text', text: `\n--- Imagen candidato [${i}] (${c.source}) ---` })
    content.push({
      type: 'image_url',
      image_url: { url: imgUrl, detail: 'low' },
    })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${key}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'system',
          content:
            'Eres un experto en identificar músicos y DJs en fotos. Responde solo JSON válido.',
        },
        { role: 'user', content },
      ],
    }),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI vision ${res.status}: ${err}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Respuesta OpenAI vacía')
  let raw = text.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  const parsed = JSON.parse(raw)
  const chosen = parsed.chosen
  const reason = typeof parsed.reason === 'string' ? parsed.reason : ''
  if (chosen !== null && chosen !== undefined) {
    const n = Number(chosen)
    if (!Number.isInteger(n) || n < 0 || n >= candidates.length) {
      if (!quiet) console.warn('[foto] Vision: índice inválido:', chosen)
      return { url: null, reason }
    }
    return { url: candidates[n].original, reason }
  }
  return { url: null, reason }
}

async function processOneArtist({
  slug,
  flags,
  serpKey,
  maxCandidates,
  querySuffix,
  quiet,
  dbRow,
  repairMode,
}) {
  const repair = Boolean(repairMode)
  const path = join(ARTISTS_DIR, `${slug}.json`)
  let artist
  if (existsSync(path)) {
    try {
      artist = JSON.parse(readFileSync(path, 'utf8'))
    } catch (e) {
      console.error(slug, e.message)
      return { ok: false, slug, error: e.message }
    }
  } else if (dbRow) {
    artist = normalizeDbRowToArtistJson(dbRow)
  } else {
    console.error(`No existe: ${path}`)
    return { ok: false, slug, error: 'missing file' }
  }

  if (!artist.name || !String(artist.name).trim()) {
    console.error(slug, 'JSON sin name')
    return { ok: false, slug, error: 'no name' }
  }

  if (!flags.has('--force-rephoto') && shouldSkipInternetArtistPhotoSearch(slug, artist.image_url)) {
    if (!quiet) {
      console.log(
        `[foto] ${slug}: retrato en public/images/artists (mapa o /images/artists/) — omitido; --force-rephoto para buscar de nuevo`,
      )
    }
    return { ok: true, slug, skipped: true, reason: 'editorial-public-portrait' }
  }

  if (flags.has('--skip-existing')) {
    const u = artist.image_url
    if (typeof u === 'string' && u.trim().startsWith('https://')) {
      if (!quiet) console.log(`[foto] ${slug}: ya tiene image_url, omitido`)
      return { ok: true, slug, skipped: true }
    }
  }

  const queries = buildArtistImageSearchQueries(artist, querySuffix)
  const [primaryQ, ...altQueries] = queries
  if (!quiet) console.log(`[foto] ${slug}: SerpAPI →`, primaryQ, altQueries.length ? `+${altQueries.length} alt.` : '')

  let candidates
  try {
    candidates = await fetchGoogleImageCandidates(primaryQ, serpKey, maxCandidates, {
      alternateQueries: altQueries,
    })
  } catch (e) {
    console.error(`[foto] ${slug}: SerpAPI`, e.message)
    return { ok: false, slug, error: e.message }
  }

  if (candidates.length === 0) {
    if (!quiet) console.log(`[foto] ${slug}: sin candidatos`)
    if (repair) {
      return finalizeArtistPhoto({
        artist,
        slug,
        imageUrlFinal: null,
        flags,
        quiet,
        reason: 'sin resultados → null (fallback web)',
      })
    }
    return { ok: true, slug, url: null, reason: 'sin resultados' }
  }

  if (!quiet) console.log(`[foto] ${slug}: ${candidates.length} candidatos → OpenAI…`)

  let url = null
  let reason = ''
  try {
    if (flags.has('--vision')) {
      ;({ url, reason } = await openAiChooseCandidateVision({
        artist,
        candidates,
        quiet,
      }))
    } else {
      ;({ url, reason } = await openAiChooseCandidateText({
        artist,
        candidates,
        quiet,
      }))
    }
  } catch (e) {
    console.error(`[foto] ${slug}: OpenAI`, e.message)
    return { ok: false, slug, error: e.message }
  }

  if (!quiet) {
    console.log(`[foto] ${slug}: decisión →`, url ? url.slice(0, 80) + '…' : null)
    console.log(`         motivo: ${reason}`)
  }

  if (flags.has('--dry-run')) {
    return { ok: true, slug, url, reason, dryRun: true }
  }

  let imageUrlFinal = url || null
  if (url && !flags.has('--json-only')) {
    try {
      imageUrlFinal = await uploadArtistPortraitFromUrl({ slug, sourceUrl: url, quiet })
    } catch (e) {
      console.error(`[foto] ${slug}: no se pudo subir a Storage:`, e.message)
      if (repair) {
        return finalizeArtistPhoto({
          artist,
          slug,
          imageUrlFinal: null,
          flags,
          quiet,
          reason: `subida fallida → null (${e.message})`,
        })
      }
      return { ok: false, slug, error: e.message }
    }
  }

  if (flags.has('--json-only')) {
    if (!quiet) {
      console.log(
        `[foto] ${slug}: --json-only → URL externa en JSON; sin Storage ni UPSERT`,
      )
    }
    const pathJson = join(ARTISTS_DIR, `${slug}.json`)
    const next = { ...artist, image_url: imageUrlFinal }
    if (!flags.has('--dry-run')) {
      writeFileSync(pathJson, JSON.stringify(next, null, 2) + '\n', 'utf8')
      if (!quiet) console.log(`[foto] ${slug}: guardado ${pathJson}`)
    }
    return { ok: true, slug, url: imageUrlFinal, reason }
  }

  return finalizeArtistPhoto({
    artist,
    slug,
    imageUrlFinal,
    flags,
    quiet,
    reason,
  })
}

async function main() {
  loadEnvLocal()
  const { flags, positional } = parseArgs(process.argv.slice(2))

  const serpKey = process.env.SERPAPI_API_KEY?.trim()
  if (!serpKey) {
    console.error('Falta SERPAPI_API_KEY en .env.local')
    process.exit(1)
  }
  if (!process.env.OPENAI_API_KEY?.trim()) {
    console.error('Falta OPENAI_API_KEY en .env.local')
    process.exit(1)
  }

  if (!flags.has('--json-only') && !flags.has('--dry-run') && !hasStorageCredentials()) {
    console.error(
      'Falta Storage: NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SECRET) para subir al bucket media.',
    )
    console.error('  Sin eso no se puede guardar la foto en tu proyecto. Usa --json-only solo para probar (URL externa en JSON).')
    process.exit(1)
  }

  const quiet = flags.has('--quiet')
  const maxCandidates = (() => {
    const a = process.argv.find((x) => x.startsWith('--max-candidates='))
    if (!a) return DEFAULT_MAX_CANDIDATES
    const n = parseInt(a.split('=')[1], 10)
    return Number.isFinite(n) && n > 2 ? Math.min(n, 30) : DEFAULT_MAX_CANDIDATES
  })()

  const delayMs = (() => {
    const a = process.argv.find((x) => x.startsWith('--delay-ms='))
    if (!a) return DEFAULT_DELAY_MS
    const n = parseInt(a.split('=')[1], 10)
    return Number.isFinite(n) && n >= 0 ? n : DEFAULT_DELAY_MS
  })()

  const querySuffixArg = process.argv.find((x) => x.startsWith('--query-suffix='))
  const querySuffix = querySuffixArg ? querySuffixArg.split('=').slice(1).join('=').trim() : ''

  if (flags.has('--repair')) {
    if (!supabaseApiCredentials()) {
      console.error(
        '[repair] Falta NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY (o SECRET) para leer artists.',
      )
      process.exit(1)
    }
    let rows
    try {
      rows = await fetchAllArtistsFromSupabase()
    } catch (e) {
      console.error('[repair]', e.message || e)
      process.exit(1)
    }
    const targets = await collectRepairTargets(rows, quiet)
    if (!quiet) {
      console.log(`[repair] ${targets.length} artistas a reprocesar (sin imagen o URL rota)`)
      for (const t of targets.slice(0, 40)) {
        console.log(`  - ${t.row.slug} (${t.reason})`)
      }
      if (targets.length > 40) console.log(`  … y ${targets.length - 40} más`)
    }
    let work = targets.map((t) => ({ slug: t.row.slug, dbRow: t.row }))
    work.sort((a, b) => a.slug.localeCompare(b.slug))
    const limitRepair = process.argv.find((x) => x.startsWith('--limit='))
    if (limitRepair) {
      const n = parseInt(limitRepair.split('=')[1], 10)
      if (Number.isFinite(n) && n > 0) work = work.slice(0, n)
    }
    let ok = 0
    let fail = 0
    for (let i = 0; i < work.length; i++) {
      const { slug, dbRow } = work[i]
      const r = await processOneArtist({
        slug,
        flags,
        serpKey,
        maxCandidates,
        querySuffix,
        quiet,
        dbRow,
        repairMode: true,
      })
      if (r.ok) ok++
      else fail++
      if (i < work.length - 1 && delayMs > 0) await sleep(delayMs)
    }
    if (!quiet) {
      console.log(`\nListo [repair]: ${ok} ok, ${fail} errores (${work.length} procesados)`)
    }
    if (fail > 0) process.exit(1)
    return
  }

  let slugs = []
  if (flags.has('--all')) {
    if (!existsSync(ARTISTS_DIR)) {
      console.error('No existe', ARTISTS_DIR)
      process.exit(1)
    }
    slugs = readdirSync(ARTISTS_DIR)
      .filter((f) => f.endsWith('.json'))
      .map((f) => f.replace(/\.json$/, ''))
      .sort()
  } else if (positional.length >= 1) {
    slugs = [positional[0].replace(/\.json$/, '')]
  } else {
    console.error(`Uso:
  npm run db:artist:photo -- <slug>
  npm run db:artist:photo -- --all [opciones]
  npm run db:artist:photo -- --repair [--limit=N]   # BD: sin https o URL rota → buscar; si no hay foto → image_url null

Opciones:
  --repair           cola desde Supabase (falta imagen o HEAD falla); requiere SERVICE_ROLE
  --force-rephoto    ignorar retratos editoriales en public/images/artists y buscar igualmente
  --dry-run          no escribe JSON ni BD
  --skip-existing    omitir si image_url ya es https
  --json-only        URL externa en JSON solamente; no Storage ni UPSERT
  --vision           usar miniaturas + modelo multimodal (OPENAI_VISION_MODEL o gpt-4o-mini)
  --limit=N          con --all o --repair, procesar solo N artistas
  --max-candidates=N SerpAPI: máximo a considerar (default ${DEFAULT_MAX_CANDIDATES})
  --delay-ms=N       pausa entre artistas (default ${DEFAULT_DELAY_MS})
  --query-suffix=... añade texto a la consulta de imágenes
  --quiet
`)
    process.exit(1)
  }

  const limitArg = process.argv.find((x) => x.startsWith('--limit='))
  if (limitArg && flags.has('--all')) {
    const n = parseInt(limitArg.split('=')[1], 10)
    if (Number.isFinite(n) && n > 0) slugs = slugs.slice(0, n)
  }

  let ok = 0
  let fail = 0
  for (let i = 0; i < slugs.length; i++) {
    const slug = slugs[i]
    const r = await processOneArtist({
      slug,
      flags,
      serpKey,
      maxCandidates,
      querySuffix,
      quiet,
    })
    if (r.ok) ok++
    else fail++
    if (i < slugs.length - 1 && delayMs > 0) await sleep(delayMs)
  }

  if (!quiet) {
    console.log(`\nListo: ${ok} ok, ${fail} errores (${slugs.length} procesados)`)
  }
  if (fail > 0) process.exit(1)
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
