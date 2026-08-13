import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { openAiChatCompletionsBody, resolveOpenAiModel } from '@/lib/openai-editorial'
import { join } from 'path'
import { pathToFileURL } from 'url'

/** Visión OCR + SerpAPI + Storage; el chat usa light=true para no colgar. */
export const maxDuration = 120

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
  try {
    return new URL(u).hostname
  } catch {
    return ''
  }
}

function pixelScore(c: ImageCandidate): number {
  const w = typeof c.width === 'number' ? c.width : 0
  const h = typeof c.height === 'number' ? c.height : 0
  return w * h
}

function sortCandidatesByPixels(candidates: ImageCandidate[]): ImageCandidate[] {
  return [...candidates].sort((a, b) => pixelScore(b) - pixelScore(a))
}

function visionImageUrl(c: ImageCandidate, preferThumb: boolean): string | null {
  const original = typeof c.original === 'string' ? c.original : ''
  const thumb = typeof c.thumbnail === 'string' ? c.thumbnail : ''
  const host = hostFromUrl(original).toLowerCase()
  const blockedHosts = ['lookaside.instagram.com', 'lookaside.fbsbx.com', 'instagram.com']
  const originalOk =
    original.startsWith('https://') && !blockedHosts.some((h) => host.includes(h))
  // En modo light (chat): thumbs = OCR rápido. En modo normal: original para más nitidez.
  if (preferThumb) {
    if (thumb.startsWith('https://')) return thumb
    if (originalOk) return original
  } else {
    if (originalOk) return original
    if (thumb.startsWith('https://')) return thumb
  }
  return original.startsWith('https://') ? original : null
}

const SYSTEM_POSTER_VISION = `Eres editor de Optimal Breaks (música dance / breakbeat). Ves miniaturas/imágenes de candidatos a cartel.

OBLIGATORIO — OCR visual:
1) LEE el texto visible en cada imagen (título del evento, artistas, fecha, venue, ciudad).
2) SOLO elige un candidato si ese texto encaja con el evento pedido (nombre o marca reconocible, año/fecha coherente, venue/ciudad si aparecen).
3) RECHAZA imágenes cuyo texto sea de OTRO evento aunque el metadato/título de Google diga lo contrario (Google Imágenes se equivoca a menudo).
4) RECHAZA fotos de público, selfies, logos sueltos, merchandising, memes, Stories borrosas sin flyer.

Entre varios carteles válidos del mismo evento, prefiere: más información (line-up/fecha/venue), mejor legibilidad y resolución aparente, fuente de ticketera/promotor.

Responde SOLO JSON:
{"chosen": <índice 0-based o null>, "reason": <string breve en español citando texto leído en el cartel si eliges uno>}
Si ninguno encaja por OCR, chosen = null.`

type SerpImageOpts = { alternateQueries?: string[] }

async function serpGoogleImages(
  query: string,
  apiKey: string,
  max = 18,
  opts: SerpImageOpts = {},
): Promise<ImageCandidate[]> {
  const href = pathToFileURL(join(process.cwd(), 'scripts', 'lib', 'serp-google-images.mjs')).href
  const { fetchGoogleImageCandidates } = await import(href)
  return fetchGoogleImageCandidates(query, apiKey, max, opts) as Promise<ImageCandidate[]>
}

async function openAiChoosePosterVision(
  event: {
    name: string
    slug: string
    city?: string | null
    country?: string | null
    date_start?: string | null
    venue?: string | null
    event_type?: string | null
  },
  candidates: ImageCandidate[],
  opts?: { light?: boolean },
): Promise<{ url: string | null; reason: string }> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const model = resolveOpenAiModel('OPENAI_VISION_MODEL')
  const light = opts?.light === true
  const maxImg = Math.min(light ? 8 : 10, candidates.length)
  const detail: 'high' | 'low' = light ? 'low' : 'high'
  const preferThumb = light

  const ranked = sortCandidatesByPixels(candidates)
  const content: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail: 'high' | 'low' | 'auto' } }
  > = [
    {
      type: 'text',
      text: `Evento a emparejar (lee el texto de cada imagen; no confíes solo en el título de Google):
- nombre: ${event.name}
- slug: ${event.slug}
- ciudad: ${event.city || '?'}
- venue: ${event.venue || '?'}
- fecha_inicio: ${event.date_start || '?'}
- país: ${event.country || '?'}

Candidatos ordenados por resolución estimada (índices 0..${maxImg - 1}). Elige UN índice cuyo cartel, por OCR, sea de ESTE evento, o null.
JSON: {"chosen": number|null, "reason": "..."}`,
    },
  ]

  for (let i = 0; i < maxImg; i++) {
    const c = ranked[i]
    const imgUrl = visionImageUrl(c, preferThumb)
    if (!imgUrl) continue
    const dim = c.width && c.height ? `${c.width}x${c.height}` : '?'
    content.push({
      type: 'text',
      text: `\n--- [${i}] source=${c.source || '?'} size=${dim} title=${(c.title || '').slice(0, 120)} ---`,
    })
    content.push({
      type: 'image_url',
      image_url: { url: imgUrl, detail },
    })
  }

  if (content.length <= 1) {
    return { url: null, reason: 'sin URLs de imagen usables para visión' }
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(
      openAiChatCompletionsBody({
        model,
        temperature: 0.1,
        maxCompletionTokens: 2000,
        responseFormat: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_POSTER_VISION },
          { role: 'user', content },
        ],
      }),
    ),
  })
  if (!res.ok) {
    const err = await res.text()
    throw new Error(`OpenAI vision ${res.status}: ${err}`)
  }
  const data = await res.json()
  const text = data.choices?.[0]?.message?.content
  if (!text) throw new Error('Respuesta OpenAI vacía')

  let raw = String(text).trim()
  if (raw.startsWith('```')) raw = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  const parsed = JSON.parse(raw)
  const chosen = parsed.chosen
  const reason = typeof parsed.reason === 'string' ? parsed.reason : ''
  if (chosen !== null && chosen !== undefined) {
    const n = Number(chosen)
    if (Number.isInteger(n) && n >= 0 && n < maxImg) {
      return { url: ranked[n].original, reason }
    }
  }
  return { url: null, reason: reason || 'ningún cartel encaja por OCR' }
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
 * { slug } → SerpAPI images → OpenAI visión/OCR → download → Storage → UPDATE events.image_url
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { slug, light } = body as { slug?: string; light?: boolean }
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
  const primary = q.replace(/\s+/g, ' ').trim()
  const alternateQueries = [
    `"${name}" poster flyer event`,
    `"${name}" cartel flyer`,
    year ? `"${name}" ${year} festival poster` : '',
    year && city ? `"${name}" ${city} ${year} poster` : '',
    city ? `"${name}" ${city} club night poster` : '',
    venue ? `"${name}" ${venue} event poster` : '',
  ]
    .map((s) => s.replace(/\s+/g, ' ').trim())
    .filter((s) => s && s !== primary)

  let candidates: ImageCandidate[]
  try {
    candidates = await serpGoogleImages(primary, serpKey, 18, { alternateQueries })
  } catch (e) {
    return NextResponse.json({ error: `SerpAPI: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  if (candidates.length === 0) {
    return NextResponse.json({ chosen: null, reason: 'Sin resultados de imágenes', candidates: 0 })
  }

  let chosen: { url: string | null; reason: string }
  try {
    chosen = await openAiChoosePosterVision(event, candidates, { light: light === true })
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
