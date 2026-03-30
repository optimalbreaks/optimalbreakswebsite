import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

const ENRICHABLE_FIELDS = [
  'name', 'description_en', 'description_es', 'event_type',
  'date_start', 'date_end', 'location', 'city', 'country', 'venue',
  'address', 'coords', 'lineup', 'stages', 'schedule', 'tags',
  'website', 'tickets_url', 'socials', 'capacity', 'age_restriction',
  'doors_open', 'doors_close', 'is_featured',
]

function loadSystemPrompt(): string {
  const p = path.resolve(process.cwd(), 'scripts', 'prompts', 'evento-enriquecer-system.txt')
  if (!existsSync(p)) throw new Error(`Prompt del sistema no encontrado: ${p}`)
  return readFileSync(p, 'utf8').trim()
}

async function fetchSerpContext(query: string, apiKey: string): Promise<string> {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('num', '10')
  url.searchParams.set('gl', 'es')
  url.searchParams.set('api_key', apiKey)

  try {
    const res = await fetch(url.toString())
    if (!res.ok) return ''
    const data = await res.json()
    const bits: string[] = []
    if (Array.isArray(data.organic_results)) {
      for (const r of data.organic_results.slice(0, 10)) {
        if (r.title) bits.push(`Title: ${r.title}`)
        if (r.snippet) bits.push(`Snippet: ${r.snippet}`)
        if (r.link) bits.push(`URL: ${r.link}`)
        bits.push('---')
      }
    }
    return bits.join('\n').slice(0, 9_000)
  } catch {
    return ''
  }
}

function buildSearchQuery(event: Record<string, unknown>): string {
  const name = String(event.name || '').trim()
  const city =
    event.city && String(event.city).trim() !== 'TBA'
      ? String(event.city).trim()
      : ''
  const country = event.country ? String(event.country).trim() : ''
  const venue = event.venue ? String(event.venue).trim() : ''
  let year = ''
  if (event.date_start) year = String(event.date_start).slice(0, 4)
  let q = `"${name}"`
  if (year) q += ` ${year}`
  if (city) q += ` ${city}`
  else if (country) q += ` ${country}`
  if (venue) q += ` ${venue}`
  q += ' festival event lineup'
  return q.replace(/\s+/g, ' ').trim()
}

function isEmpty(val: unknown): boolean {
  if (val == null) return true
  if (typeof val === 'string' && (val.trim() === '' || val.trim() === 'TBA')) return true
  if (Array.isArray(val) && val.length === 0) return true
  if (typeof val === 'object' && !Array.isArray(val) && Object.keys(val as object).length === 0) return true
  return false
}

function mergeEnrichment(
  current: Record<string, unknown>,
  enriched: Record<string, unknown>,
  force: boolean,
): Record<string, unknown> {
  const patch: Record<string, unknown> = {}
  for (const field of ENRICHABLE_FIELDS) {
    const newVal = enriched[field]
    if (isEmpty(newVal)) continue
    if (force || isEmpty(current[field])) {
      patch[field] = newVal
    }
  }
  return patch
}

function normalizeDate(val: unknown): string | null {
  if (val == null || val === '') return null
  const s = String(val).slice(0, 10)
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : null
}

function normalizePatch(patch: Record<string, unknown>): Record<string, unknown> {
  if ('date_start' in patch) patch.date_start = normalizeDate(patch.date_start)
  if ('date_end' in patch) patch.date_end = normalizeDate(patch.date_end)
  if ('website' in patch) {
    if (typeof patch.website !== 'string' || !patch.website.startsWith('https://')) {
      delete patch.website
    }
  }
  if ('tickets_url' in patch) {
    if (typeof patch.tickets_url !== 'string' || !patch.tickets_url.startsWith('https://')) {
      delete patch.tickets_url
    }
  }
  if ('lineup' in patch && Array.isArray(patch.lineup)) {
    patch.lineup = Array.from(new Set((patch.lineup as string[]).map((s) => String(s).trim()).filter(Boolean)))
  }
  if ('tags' in patch && Array.isArray(patch.tags)) {
    patch.tags = Array.from(new Set((patch.tags as string[]).map((s) => String(s).trim().toLowerCase()).filter(Boolean)))
  }
  if ('coords' in patch) {
    const c = patch.coords as Record<string, unknown> | null
    if (!c || typeof c.lat !== 'number' || typeof c.lng !== 'number') delete patch.coords
  }
  return patch
}

/**
 * GET /api/admin/agent/event?queue=pending
 * Returns events with empty or short descriptions (candidates for enrichment).
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const queue = request.nextUrl.searchParams.get('queue')
  if (queue !== 'pending') {
    return NextResponse.json(
      { error: 'Usa ?queue=pending para obtener la cola de eventos pendientes.' },
      { status: 400 },
    )
  }

  try {
    const sb = createServiceSupabase()
    const events: { slug: string; name: string }[] = []
    const pageSize = 1000
    let from = 0
    for (;;) {
      const { data, error } = await sb
        .from('events')
        .select('slug,name,description_es')
        .order('date_start', { ascending: false, nullsFirst: true })
        .range(from, from + pageSize - 1)

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      if (!data?.length) break
      for (const row of data) {
        const desc = String(row.description_es || '').trim()
        if (row.slug && row.name && desc.length < 100) {
          events.push({ slug: row.slug, name: row.name })
        }
      }
      if (data.length < pageSize) break
      from += pageSize
    }

    return NextResponse.json({ count: events.length, events })
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

/**
 * POST /api/admin/agent/event
 * Enrich an event via OpenAI + SerpAPI and update in Supabase.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { slug, force } = body as {
    slug?: string
    force?: boolean
  }

  if (!slug) {
    return NextResponse.json({ error: 'Se requiere slug' }, { status: 400 })
  }

  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) {
    return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })
  }

  const sb = createServiceSupabase()

  const { data: event, error: fetchErr } = await sb
    .from('events')
    .select('*')
    .eq('slug', slug)
    .maybeSingle()

  if (fetchErr) {
    return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  }
  if (!event) {
    return NextResponse.json({ error: `No existe evento con slug: ${slug}` }, { status: 404 })
  }

  const systemPrompt = loadSystemPrompt()

  let webContext = '(Sin búsqueda web — falta SERPAPI_API_KEY)'
  const serpKey = process.env.SERPAPI_API_KEY?.trim()
  if (serpKey) {
    const q = buildSearchQuery(event)
    webContext = await fetchSerpContext(q, serpKey)
    if (!webContext) webContext = '(Sin resultados de búsqueda.)'
  }

  const today = new Date().toISOString().slice(0, 10)
  const userPrompt = `FICHA ACTUAL DEL EVENTO (JSON):
${JSON.stringify(event, null, 2)}

FECHA DE HOY: ${today}

CONTEXTO WEB (resultados de búsqueda):
---
${webContext}
---

Devuelve SOLO el JSON final con todos los campos del esquema (ver sistema).

Prioridades para este enriquecimiento:
- Respeta los valores existentes si ya son plausibles y el contexto no los contradice.
- Prioriza los campos que más valor aportan a la BD y a la página de detalle: fecha, venue, ciudad, país, location, address, lineup, stages, schedule, tags, website, tickets_url, socials, doors_open, doors_close, age_restriction y capacity.
- Si no hay día exacto confirmado, deja date_start/date_end en null.
- Si no hay evidencia suficientemente clara para un campo, devuélvelo vacío en lugar de inferirlo.
- Las descripciones EN/ES deben contar la misma historia y no introducir hechos nuevos.

Los campos que ya tienen valor correcto, repítelos tal cual.`

  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-4o-mini'

  const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.2,
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

  let enriched: Record<string, unknown>
  try {
    enriched = JSON.parse(raw)
  } catch {
    return NextResponse.json({ error: 'JSON inválido del modelo' }, { status: 502 })
  }

  const patch = normalizePatch(mergeEnrichment(event, enriched, !!force))

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({
      event: enriched,
      saved: false,
      message: 'No hay campos nuevos que actualizar.',
    })
  }

  const { error: updateErr } = await sb.from('events').update(patch).eq('slug', slug)
  if (updateErr) {
    return NextResponse.json({
      event: enriched,
      saved: false,
      dbError: updateErr.message,
      fieldsUpdated: Object.keys(patch),
    })
  }

  return NextResponse.json({
    event: enriched,
    saved: true,
    fieldsUpdated: Object.keys(patch),
  })
}
