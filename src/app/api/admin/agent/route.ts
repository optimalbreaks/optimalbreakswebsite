import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

const VALID_CATEGORIES = ['pioneer', 'uk_legend', 'us_artist', 'andalusian', 'current', 'crew']

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
  let s = `Genera el JSON del artista.\n\nslug (kebab-case): ${opts.slug}\nNombre artístico principal: ${opts.artistName}\n`

  if (opts.research) {
    s += `\nCONTEXTO DE BÚSQUEDA WEB (puede contener errores; contrasta y no inventes cifras exactas sin soporte):\n---\n${opts.research}\n---\n`
  } else {
    s += '\nNo hay contexto web; usa conocimiento fiable hasta tu fecha de corte y sé conservador con datos específicos.\n'
  }

  if (opts.notes) {
    s += `\nNOTAS DEL EDITOR (prioridad alta si entran en conflicto con lo anterior):\n---\n${opts.notes}\n---\n`
  }

  s += `\nRecuerda: bio_es y bio_en con párrafos separados por \\n\\n (doble salto de línea dentro del string JSON).\nslug debe ser exactamente: "${opts.slug}"\n`
  return s
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
  out.styles = Array.isArray(out.styles) ? out.styles : []
  out.essential_tracks = Array.isArray(out.essential_tracks) ? out.essential_tracks : []
  out.recommended_mixes = Array.isArray(out.recommended_mixes) ? out.recommended_mixes : []
  out.related_artists = Array.isArray(out.related_artists) ? out.related_artists : []
  out.labels_founded = Array.isArray(out.labels_founded) ? out.labels_founded : []
  out.key_releases = Array.isArray(out.key_releases) ? out.key_releases : []
  out.socials =
    out.socials && typeof out.socials === 'object' && !Array.isArray(out.socials)
      ? out.socials
      : {}
  if (out.website === undefined) out.website = null
  if (out.real_name === undefined) out.real_name = null
  if (out.image_url === undefined) out.image_url = null
  if (typeof out.is_featured !== 'boolean') out.is_featured = false
  if (typeof out.sort_order !== 'number') out.sort_order = 50
  for (const kr of out.key_releases as Record<string, unknown>[]) {
    if (typeof kr.year !== 'number') kr.year = 2000
    if (kr.note === undefined) kr.note = ''
  }
  return out
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
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

  const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.35,
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
  return NextResponse.json(normalized)
}
