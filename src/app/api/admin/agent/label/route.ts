import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { readFileSync, existsSync } from 'fs'
import path, { join } from 'path'
import { pathToFileURL } from 'url'

function loadSystemPrompt(): string {
  const p = path.resolve(process.cwd(), 'scripts', 'prompts', 'sello-agente-system.txt')
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
  labelName: string
  notes?: string
  research: string
}): string {
  let s = `Genera el JSON del sello discografico siguiendo el prompt de sistema (redactor Optimal Breaks).\n\nslug (kebab-case): ${opts.slug}\nNombre del sello (canónico): ${opts.labelName}\n`

  if (opts.research) {
    s += `\nCONTEXTO DE BÚSQUEDA WEB (puede contener errores; contrasta y no inventes cifras exactas sin soporte):\n---\n${opts.research}\n---\n`
  } else {
    s += '\nNo hay contexto web; usa conocimiento fiable hasta tu fecha de corte y sé conservador con datos específicos.\n'
  }

  if (opts.notes) {
    s += `\nNOTAS DEL EDITOR (máxima prioridad si hay conflicto con web o modelo):\n---\n${opts.notes}\n---\n`
  }

  s += `
CHECKLIST (obligatorio antes de cerrar la respuesta):
- Solo un objeto JSON parseable; sin markdown, sin texto fuera del JSON, sin campos extra.
- Prioridad de fuentes: notas del editor > contexto web > conocimiento general.
- No inventes años exactos de fundación, catálogos completos, charts, premios ni URLs sin base razonable.
- slug EXACTO (kebab-case, solo a-z, 0-9, guiones): "${opts.slug}"
- description_es y description_en: apunta a 8-14 párrafos cada una; separa párrafos con \\n\\n dentro del string JSON.
- Arrays sin duplicados ni strings vacíos; sin placeholders (TBD, N/A, unknown).
- website e image_url: solo URLs https presentes en contexto o notas; si no hay evidencia, null.
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

function normalizeLabel(obj: Record<string, unknown>, expectedSlug: string) {
  const out = { ...obj } as Record<string, unknown>
  out.slug =
    String(out.slug || expectedSlug)
      .toLowerCase()
      .replace(/[^a-z0-9-]/g, '')
      .replace(/^-|-$/g, '') || expectedSlug
  out.name = String(out.name || '').trim() || String(out.slug)
  out.country = typeof out.country === 'string' ? out.country.trim() : ''
  const fy = out.founded_year
  if (fy === undefined || fy === null || fy === '') {
    out.founded_year = null
  } else {
    const n = typeof fy === 'number' ? fy : parseInt(String(fy), 10)
    out.founded_year = Number.isFinite(n) && n >= 1800 && n <= 2100 ? n : null
  }
  out.description_en = String(out.description_en || '').trim()
  out.description_es = String(out.description_es || '').trim()
  out.key_artists = uniqueNonEmptyStrings(out.key_artists)
  out.key_releases = uniqueNonEmptyStrings(out.key_releases)
  const web = out.website
  out.website =
    typeof web === 'string' && web.trim().startsWith('https://') ? web.trim() : null
  const img = out.image_url
  out.image_url =
    typeof img === 'string' && img.trim().startsWith('https://') ? img.trim() : null
  if (typeof out.is_active !== 'boolean') out.is_active = true
  if (typeof out.is_featured !== 'boolean') out.is_featured = false
  return out
}

function validateMinimal(obj: Record<string, unknown>): string[] {
  const err: string[] = []
  if (!obj.slug) err.push('slug')
  if (!obj.name || !String(obj.name).trim()) err.push('name')
  if (!obj.description_en || !String(obj.description_en).trim()) err.push('description_en')
  if (!obj.description_es || !String(obj.description_es).trim()) err.push('description_es')
  return err
}

/**
 * GET /api/admin/agent/label?queue=pending
 * Returns labels with empty or very short descriptions.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const queue = request.nextUrl.searchParams.get('queue')
  if (queue !== 'pending') {
    return NextResponse.json(
      { error: 'Usa ?queue=pending para obtener la cola de sellos pendientes.' },
      { status: 400 },
    )
  }

  try {
    const sb = createServiceSupabase()
    const labels: { slug: string; name: string }[] = []
    const pageSize = 1000
    let from = 0
    for (;;) {
      const { data, error } = await sb
        .from('labels')
        .select('slug,name,description_es')
        .order('slug', { ascending: true })
        .range(from, from + pageSize - 1)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!data?.length) break
      for (const row of data) {
        const desc = String(row.description_es || '').trim()
        if (row.slug && row.name && desc.length < 100) {
          labels.push({ slug: row.slug, name: row.name })
        }
      }
      if (data.length < pageSize) break
      from += pageSize
    }

    return NextResponse.json({ count: labels.length, labels })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/admin/agent/label
 * Generate label JSON via OpenAI and upsert to Supabase.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { slug, labelName, notes, search } = body as {
    slug?: string
    labelName?: string
    notes?: string
    search?: boolean
  }

  if (!slug || !labelName) {
    return NextResponse.json({ error: 'Se requieren slug y labelName' }, { status: 400 })
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
        `${labelName} record label breakbeat discography`,
        serpKey,
      )
    }
  }

  const systemPrompt = loadSystemPrompt()
  const userPrompt = buildUserPrompt({ slug, labelName, notes, research })
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

  const normalized = normalizeLabel(parsed, slug)
  const missing = validateMinimal(normalized)
  if (missing.length) {
    return NextResponse.json(
      { error: `Faltan campos obligatorios: ${missing.join(', ')}` },
      { status: 502 },
    )
  }

  const upsertUrl = pathToFileURL(
    join(process.cwd(), 'scripts', 'lib', 'label-upsert.mjs'),
  ).href
  const { upsertLabel } = await import(upsertUrl)

  let saved = false
  let row: { id: string; slug: string; name: string; created_at: string } | null = null
  let dbError: string | undefined

  try {
    row = (await upsertLabel(normalized)) as typeof row
    saved = true
  } catch (e) {
    dbError = e instanceof Error ? e.message : String(e)
  }

  return NextResponse.json({
    label: normalized,
    saved,
    row: saved ? row : undefined,
    dbError: saved ? undefined : dbError,
  })
}
