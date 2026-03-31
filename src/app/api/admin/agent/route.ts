import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { readFileSync, existsSync } from 'fs'
import path, { join } from 'path'
import { pathToFileURL } from 'url'

const VALID_CATEGORIES = ['pioneer', 'uk_legend', 'us_artist', 'andalusian', 'current', 'crew']

/** Coincide con buildBioEs() en scripts/sync-user-list-artists.mjs */
const BIO_ES_LISTADO_EXTENDIDO_PREFIX = 'Incluido en el listado extendido'

/**
 * Cola editorial: artistas cuyo bio_es sigue siendo la ficha mínima del listado extendido (pendientes de texto real).
 * GET /api/admin/agent?queue=listado-extendido
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const queue = request.nextUrl.searchParams.get('queue')
  if (queue !== 'listado-extendido') {
    return NextResponse.json(
      { error: 'Usa ?queue=listado-extendido para obtener la cola de fichas pendientes.' },
      { status: 400 },
    )
  }

  try {
    const sb = createServiceSupabase()
    const artists: { slug: string; name: string }[] = []
    const pageSize = 1000
    let from = 0
    for (;;) {
      const { data, error } = await sb
        .from('artists')
        .select('slug,name')
        .like('bio_es', `${BIO_ES_LISTADO_EXTENDIDO_PREFIX}%`)
        .order('slug', { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!data?.length) break
      for (const row of data) {
        if (row.slug && row.name) {
          artists.push({ slug: row.slug, name: row.name })
        }
      }
      if (data.length < pageSize) break
      from += pageSize
    }

    return NextResponse.json({
      count: artists.length,
      prefix: BIO_ES_LISTADO_EXTENDIDO_PREFIX,
      artists,
    })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function loadSystemPrompt(): string {
  const p = path.resolve(process.cwd(), 'scripts', 'prompts', 'artista-agente-system.txt')
  if (!existsSync(p)) throw new Error(`Prompt del sistema no encontrado: ${p}`)
  return readFileSync(p, 'utf8').trim()
}

async function fetchSerpContext(query: string, apiKey: string): Promise<string> {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('num', '10')
  url.searchParams.set('api_key', apiKey)

  try {
    const res = await fetch(url.toString())
    if (!res.ok) return ''
    const data = await res.json()
    const bits: string[] = []
    if (Array.isArray(data.organic_results)) {
      for (const r of data.organic_results.slice(0, 8)) {
        if (r.title) bits.push(`Título: ${r.title}`)
        if (r.snippet) bits.push(`Resumen: ${r.snippet}`)
        if (r.link) bits.push(`URL: ${r.link}`)
        bits.push('---')
      }
    }
    if (data.answer_box?.answer) bits.push(`Answer: ${data.answer_box.answer}`)
    return bits.join('\n').slice(0, 12_000)
  } catch {
    return ''
  }
}

function buildUserPrompt(opts: {
  slug: string
  artistName: string
  notes?: string
  research: string
}): string {
  let s = `Genera el JSON del artista siguiendo el prompt de sistema V2 (redactor Optimal Breaks).\n\nslug (kebab-case): ${opts.slug}\nNombre artístico principal: ${opts.artistName}\n`

  if (opts.research) {
    s += `\nCONTEXTO DE BÚSQUEDA WEB (puede contener errores; contrasta y no inventes cifras exactas sin soporte):\n---\n${opts.research}\n---\n`
  } else {
    s += '\nNo hay contexto web; usa conocimiento fiable hasta tu fecha de corte y sé conservador con datos específicos.\n'
  }

  if (opts.notes) {
    s += `\nNOTAS DEL EDITOR (máxima prioridad si hay conflicto con web o modelo):\n---\n${opts.notes}\n---\n`
  }

  s += `
CHECKLIST V2 (obligatorio antes de cerrar la respuesta):
- Solo un objeto JSON parseable; sin markdown, sin texto fuera del JSON, sin campos extra.
- Prioridad de fuentes: notas del editor > contexto web > conocimiento general.
- No inventes charts, fechas exactas, premios, sellos, colaboraciones ni URLs sin base razonable.
- slug EXACTO (kebab-case, solo a-z, 0-9, guiones): "${opts.slug}"
- bio_es y bio_en: apunta normalmente a 10-16 parrafos cada una; solo alarga mas si hay base suficiente, y si la evidencia es limitada prioriza precision antes que longitud. Separa parrafos con \\n\\n dentro del string JSON.
- Arrays sin duplicados ni strings vacíos; sin placeholders (TBD, N/A, unknown).
- related_artists: SOLO artistas; NUNCA nombres de sellos discográficos. labels_founded solo si el artista fundó el sello.
- socials y website: solo URLs https presentes en contexto o notas; si no hay evidencia, {} y null.
- image_url: null salvo URL https pública clara y estable en el contexto.
`
  return s
}

function uniqueNonEmptyStrings(arr: unknown): string[] {
  if (!Array.isArray(arr)) return []
  const seen = new Set<string>()
  const out: string[] = []
  for (const x of arr) {
    const t = String(x ?? '').trim()
    if (!t) continue
    const k = t.toLowerCase()
    if (seen.has(k)) continue
    seen.add(k)
    out.push(t)
  }
  return out
}

function normalizeSocials(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {}
  const out: Record<string, string> = {}
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    const key = String(k).trim().toLowerCase()
    const url = String(v ?? '').trim()
    if (!key || !url.startsWith('https://')) continue
    if (!out[key]) out[key] = url
  }
  return out
}

function normalizeArtist(obj: Record<string, unknown>, expectedSlug: string) {
  const out = { ...obj } as Record<string, unknown>
  out.slug =
    (String(out.slug || expectedSlug))
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-|-$/g, '') || expectedSlug
  if (!VALID_CATEGORIES.includes(String(out.category))) out.category = 'current'
  out.name_display = String(out.name_display || out.name || '').toUpperCase()
  out.styles = uniqueNonEmptyStrings(out.styles)
  out.essential_tracks = uniqueNonEmptyStrings(out.essential_tracks)
  out.recommended_mixes = uniqueNonEmptyStrings(out.recommended_mixes)
  out.related_artists = uniqueNonEmptyStrings(out.related_artists)
  out.labels_founded = uniqueNonEmptyStrings(out.labels_founded)
  out.key_releases = Array.isArray(out.key_releases) ? out.key_releases : []
  out.socials = normalizeSocials(out.socials)
  const web = out.website === undefined ? null : out.website
  out.website =
    typeof web === 'string' && web.trim().startsWith('https://') ? web.trim() : null
  const rn = out.real_name
  if (rn === undefined || rn === null) out.real_name = null
  else {
    const t = String(rn).trim()
    out.real_name = t || null
  }
  const img = out.image_url
  out.image_url =
    typeof img === 'string' && img.trim().startsWith('https://') ? img.trim() : null
  if (typeof out.is_featured !== 'boolean') out.is_featured = false
  let so = typeof out.sort_order === 'number' ? out.sort_order : 50
  if (!Number.isFinite(so)) so = 50
  out.sort_order = Math.min(200, Math.max(1, Math.round(so)))
  for (const kr of out.key_releases as Record<string, unknown>[]) {
    if (typeof kr.year !== 'number') kr.year = 2000
    if (kr.note === undefined) kr.note = ''
  }
  return out
}

function validateMinimal(obj: Record<string, unknown>): string[] {
  const err: string[] = []
  if (!obj.slug) err.push('slug')
  if (!obj.name || !String(obj.name).trim()) err.push('name')
  if (!obj.name_display || !String(obj.name_display).trim()) err.push('name_display')
  if (!obj.bio_en || !String(obj.bio_en).trim()) err.push('bio_en')
  if (!obj.bio_es || !String(obj.bio_es).trim()) err.push('bio_es')
  return err
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { slug, artistName, notes, search } = body as {
    slug?: string
    artistName?: string
    notes?: string
    search?: boolean
  }

  if (!slug || !artistName) {
    return NextResponse.json({ error: 'Se requieren slug y artistName' }, { status: 400 })
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })
  }

  let research = ''
  if (search) {
    const serpKey = process.env.SERPAPI_API_KEY?.trim()
    if (serpKey) {
      research = await fetchSerpContext(
        `${artistName} DJ producer breakbeat biography discography`,
        serpKey,
      )
    }
  }

  const systemPrompt = loadSystemPrompt()
  const userPrompt = buildUserPrompt({ slug, artistName, notes, research })
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4'

  const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.28,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
    }),
  })

  if (!oaiRes.ok) {
    const errText = await oaiRes.text()
    return NextResponse.json(
      { error: `OpenAI ${oaiRes.status}: ${errText}` },
      { status: 502 },
    )
  }

  const oaiData = await oaiRes.json()
  const content = oaiData.choices?.[0]?.message?.content
  if (!content) {
    return NextResponse.json({ error: 'Respuesta vacía de OpenAI' }, { status: 502 })
  }

  let raw = content.trim()
  if (raw.startsWith('```')) {
    raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }

  let parsed: Record<string, unknown>
  try {
    parsed = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'JSON inválido del modelo' }, { status: 502 })
  }

  const normalized = normalizeArtist(parsed, slug)
  const missing = validateMinimal(normalized)
  if (missing.length) {
    return NextResponse.json(
      { error: `Faltan campos obligatorios: ${missing.join(', ')}` },
      { status: 502 },
    )
  }

  const upsertUrl = pathToFileURL(
    join(process.cwd(), 'scripts', 'lib', 'artist-upsert.mjs'),
  ).href
  const { upsertArtist } = await import(upsertUrl)

  let saved = false
  let row: { id: string; slug: string; name: string; created_at: string } | null = null
  let dbError: string | undefined

  try {
    row = (await upsertArtist(normalized)) as typeof row
    saved = true
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    artist: normalized,
    saved,
    row: saved ? row : undefined,
    dbError: saved ? undefined : dbError,
  })
}
