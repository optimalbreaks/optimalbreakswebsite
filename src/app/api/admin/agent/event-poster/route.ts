import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { join } from 'path'
import { pathToFileURL } from 'url'

type ImageCandidate = {
  title: string
  source: string
  link: string
  original: string
  width: number | null
  height: number | null
  thumbnail: string
}

function hostFromUrl(u: string): string {
  try { return new URL(u).hostname } catch { return '' }
}

const SYSTEM_POSTER = `Eres editor de Optimal Breaks (música dance / breakbeat). Recibes candidatos de Google Imágenes como METADATOS (no ves el píxel salvo modo visión aparte).
Tu tarea: elegir a lo sumo UN candidato que sea muy probablemente el cartel, póster o flyer oficial o promocional del evento indicado (fecha, ciudad, nombre coherente).
Rechaza: fotos de público genéricas sin diseño de evento, capturas de Instagram/Twitter sin cartel, logos sueltos, otra ciudad o año claramente distinto, merchandising, memes, resultados dudoso-homónimos.
Prefiere proporción vertical u horizontal típica de flyer (no exijas datos EXIF; usa título y fuente).
Responde SOLO JSON:
{"chosen": <índice 0-based del array "candidates" o null>, "reason": <string breve en español>}
Si ningún candidato es fiable, chosen debe ser null.`

async function serpGoogleImages(query: string, apiKey: string, max = 18): Promise<ImageCandidate[]> {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google_images')
  url.searchParams.set('q', query)
  url.searchParams.set('api_key', apiKey)
  url.searchParams.set('hl', 'en')
  url.searchParams.set('gl', 'uk')

  const res = await fetch(url.toString())
  const data = await res.json()
  if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${data.error || res.statusText}`)

  const raw = data.images_results
  if (!Array.isArray(raw)) return []

  const seen = new Set<string>()
  const out: ImageCandidate[] = []
  for (const r of raw) {
    if (out.length >= max) break
    const original = typeof r.original === 'string' ? r.original.trim() : ''
    if (!original.startsWith('https://')) continue
    if (r.is_product === true) continue
    const key = original.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({
      title: String(r.title || '').slice(0, 200),
      source: String(r.source || '').slice(0, 120),
      link: typeof r.link === 'string' ? r.link.slice(0, 500) : '',
      original,
      width: typeof r.original_width === 'number' ? r.original_width : null,
      height: typeof r.original_height === 'number' ? r.original_height : null,
      thumbnail: typeof r.thumbnail === 'string' ? r.thumbnail : '',
    })
  }
  return out
}

async function openAiChoosePoster(
  event: { name: string; slug: string; city?: string | null; country?: string | null; date_start?: string | null; venue?: string | null; event_type?: string | null; image_url?: string | null },
  candidates: ImageCandidate[],
): Promise<{ url: string | null; reason: string }> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4'

  const lines = candidates.map((c, i) => {
    const dim = c.width && c.height ? `${c.width}x${c.height}` : 'unknown'
    const host = hostFromUrl(c.original)
    return `[${i}] title: ${c.title}\n    source: ${c.source}\n    page: ${c.link}\n    image_host: ${host}\n    size: ${dim}`
  })

  const user = `Evento:\n- nombre: ${event.name}\n- slug: ${event.slug}\n- ciudad: ${event.city ?? 'null'}\n- pais: ${event.country ?? 'null'}\n- venue: ${event.venue ?? 'null'}\n- fecha_inicio: ${event.date_start ?? 'null'}\n- tipo: ${event.event_type ?? 'null'}\n\nCandidatos (índices 0..${candidates.length - 1}):\n${lines.join('\n\n')}\n\nDevuelve JSON: {"chosen": number|null, "reason": string}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_POSTER },
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
  if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const parsed = JSON.parse(raw)
  const chosen = parsed.chosen
  const reason = typeof parsed.reason === 'string' ? parsed.reason : ''
  if (chosen !== null && chosen !== undefined) {
    const n = Number(chosen)
    if (Number.isInteger(n) && n >= 0 && n < candidates.length) {
      return { url: candidates[n].original, reason }
    }
  }
  return { url: null, reason: reason || 'sin candidato adecuado' }
}

/**
 * GET /api/admin/agent/event-poster?queue=missing
 * Events without image_url.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const queue = request.nextUrl.searchParams.get('queue')
  if (queue !== 'missing') {
    return NextResponse.json({ error: 'Usa ?queue=missing' }, { status: 400 })
  }

  try {
    const sb = createServiceSupabase()
    const events: { slug: string; name: string }[] = []
    const pageSize = 1000
    let from = 0
    for (;;) {
      const { data, error } = await sb
        .from('events')
        .select('slug,name,image_url')
        .order('date_start', { ascending: false, nullsFirst: true })
        .range(from, from + pageSize - 1)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) break
      for (const row of data) {
        const url = String(row.image_url || '').trim()
        if (row.slug && row.name && !url.startsWith('https://')) {
          events.push({ slug: row.slug, name: row.name })
        }
      }
      if (data.length < pageSize) break
      from += pageSize
    }
    return NextResponse.json({ count: events.length, events })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

/**
 * POST /api/admin/agent/event-poster
 * { slug } → SerpAPI images → OpenAI pick → download → Storage → UPDATE events.image_url
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { slug } = body as { slug?: string }
  if (!slug) return NextResponse.json({ error: 'Se requiere slug' }, { status: 400 })

  const serpKey = process.env.SERPAPI_API_KEY?.trim()
  if (!serpKey) return NextResponse.json({ error: 'SERPAPI_API_KEY no configurada' }, { status: 500 })
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })

  const sb = createServiceSupabase()
  const { data: event, error: fetchErr } = await sb
    .from('events')
    .select('slug, name, city, country, date_start, venue, event_type, image_url')
    .eq('slug', slug)
    .maybeSingle()
  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!event) return NextResponse.json({ error: `No existe evento con slug: ${slug}` }, { status: 404 })

  const name = String(event.name || '').trim()
  const city = event.city && String(event.city).trim() !== 'TBA' ? String(event.city).trim() : ''
  const country = event.country ? String(event.country).trim() : ''
  const venue = event.venue ? String(event.venue).trim() : ''
  let year = ''
  if (event.date_start) year = String(event.date_start).slice(0, 4)
  let q = `"${name}"`
  if (year) q += ` ${year}`
  if (city) q += ` ${city}`
  if (country) q += ` ${country}`
  if (venue) q += ` ${venue}`
  q += ' festival club night poster flyer cartel event'

  let candidates: ImageCandidate[]
  try {
    candidates = await serpGoogleImages(q.replace(/\s+/g, ' ').trim(), serpKey, 18)
  } catch (e) {
    return NextResponse.json({ error: `SerpAPI: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  if (candidates.length === 0) {
    return NextResponse.json({ chosen: null, reason: 'Sin resultados de imágenes', candidates: 0 })
  }

  let chosen: { url: string | null; reason: string }
  try {
    chosen = await openAiChoosePoster(event, candidates)
  } catch (e) {
    return NextResponse.json({ error: `OpenAI: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  if (!chosen.url) {
    return NextResponse.json({ chosen: null, reason: chosen.reason, candidates: candidates.length })
  }

  const uploadUrl = pathToFileURL(
    join(process.cwd(), 'scripts', 'lib', 'upload-event-poster-to-storage.mjs'),
  ).href
  const { uploadEventPosterFromUrl } = await import(uploadUrl)

  let storageUrl: string
  try {
    storageUrl = await uploadEventPosterFromUrl({ slug, sourceUrl: chosen.url, quiet: true })
  } catch (e) {
    return NextResponse.json({
      chosen: chosen.url,
      reason: chosen.reason,
      storageError: e instanceof Error ? e.message : String(e),
      saved: false,
    })
  }

  const { error: dbErr } = await sb
    .from('events')
    .update({ image_url: storageUrl })
    .eq('slug', slug)

  return NextResponse.json({
    chosen: chosen.url,
    storageUrl,
    reason: chosen.reason,
    candidates: candidates.length,
    saved: !dbErr,
    dbError: dbErr?.message,
  })
}
