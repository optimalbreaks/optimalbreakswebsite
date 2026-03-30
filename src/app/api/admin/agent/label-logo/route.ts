import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

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

const SYSTEM_LOGO = `Eres editor de Optimal Breaks (música dance / breakbeat). Te pasan candidatos de Google Imágenes como METADATOS (no ves el píxel).
Tu tarea: elegir a lo sumo UN candidato que sea muy probablemente el logo o imagen oficial del sello discográfico indicado.
Prefiere: logotipo oficial, imagotipo, imagen de perfil del sello en redes, arte de cabecera de la discográfica.
Rechaza: portadas de disco individuales, fotos de artistas, memes, resultados de otro sello homónimo, capturas de baja calidad, imágenes genéricas, merchandising.
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

async function openAiChooseLogo(
  labelName: string,
  slug: string,
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

  const user = `Sello discográfico:\n- nombre: ${labelName}\n- slug: ${slug}\n\nCandidatos (índices 0..${candidates.length - 1}):\n${lines.join('\n\n')}\n\nDevuelve JSON: {"chosen": number|null, "reason": string}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({
      model, temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_LOGO },
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

function extFromSourceUrl(sourceUrl: string): string {
  try {
    const p = new URL(sourceUrl).pathname.toLowerCase()
    if (p.endsWith('.png')) return '.png'
    if (p.endsWith('.webp')) return '.webp'
    if (p.endsWith('.gif')) return '.gif'
    if (p.endsWith('.jpeg')) return '.jpeg'
    if (p.endsWith('.jpg')) return '.jpg'
  } catch { /* ignore */ }
  return '.jpg'
}

function mimeForExt(ext: string): string {
  if (ext === '.png') return 'image/png'
  if (ext === '.webp') return 'image/webp'
  if (ext === '.gif') return 'image/gif'
  return 'image/jpeg'
}

async function uploadLabelLogoFromUrl(slug: string, sourceUrl: string): Promise<string> {
  const sb = createServiceSupabase()
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, '')
  if (!base) throw new Error('Falta NEXT_PUBLIC_SUPABASE_URL')

  const res = await fetch(sourceUrl, { headers: { 'User-Agent': 'OptimalBreaksLabelLogo/1.0' } })
  if (!res.ok) throw new Error(`Descarga: HTTP ${res.status}`)

  const buf = Buffer.from(await res.arrayBuffer())
  if (buf.length > 12 * 1024 * 1024) throw new Error('Imagen demasiado grande (>12 MB)')

  const ext = extFromSourceUrl(sourceUrl)
  const objectPath = `labels/${slug}/logo${ext}`

  let contentType = mimeForExt(ext)
  const ct = res.headers.get('content-type')
  if (ct && ct.startsWith('image/')) contentType = ct.split(';')[0].trim()

  const { error } = await sb.storage.from('media').upload(objectPath, buf, { contentType, upsert: true })
  if (error) throw new Error(`Storage: ${error.message}`)

  return `${base}/storage/v1/object/public/media/${objectPath}`
}

/**
 * GET /api/admin/agent/label-logo?queue=missing
 * Labels without image_url.
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
    const labels: { slug: string; name: string }[] = []
    const pageSize = 1000
    let from = 0
    for (;;) {
      const { data, error } = await sb
        .from('labels')
        .select('slug,name,image_url')
        .order('slug', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) break
      for (const row of data) {
        const url = String(row.image_url || '').trim()
        if (row.slug && row.name && !url.startsWith('https://')) {
          labels.push({ slug: row.slug, name: row.name })
        }
      }
      if (data.length < pageSize) break
      from += pageSize
    }
    return NextResponse.json({ count: labels.length, labels })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

/**
 * POST /api/admin/agent/label-logo
 * { slug, labelName } → SerpAPI images → OpenAI pick → download → Storage → UPDATE labels.image_url
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { slug, labelName } = body as { slug?: string; labelName?: string }
  if (!slug || !labelName) {
    return NextResponse.json({ error: 'Se requieren slug y labelName' }, { status: 400 })
  }

  const serpKey = process.env.SERPAPI_API_KEY?.trim()
  if (!serpKey) return NextResponse.json({ error: 'SERPAPI_API_KEY no configurada' }, { status: 500 })
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })

  const query = `"${labelName}" record label logo discography music`

  let candidates: ImageCandidate[]
  try {
    candidates = await serpGoogleImages(query, serpKey, 18)
  } catch (e) {
    return NextResponse.json({ error: `SerpAPI: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  if (candidates.length === 0) {
    return NextResponse.json({ chosen: null, reason: 'Sin resultados de imágenes', candidates: 0 })
  }

  let chosen: { url: string | null; reason: string }
  try {
    chosen = await openAiChooseLogo(labelName, slug, candidates)
  } catch (e) {
    return NextResponse.json({ error: `OpenAI: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  if (!chosen.url) {
    return NextResponse.json({ chosen: null, reason: chosen.reason, candidates: candidates.length })
  }

  let storageUrl: string
  try {
    storageUrl = await uploadLabelLogoFromUrl(slug, chosen.url)
  } catch (e) {
    return NextResponse.json({
      chosen: chosen.url,
      reason: chosen.reason,
      storageError: e instanceof Error ? e.message : String(e),
      saved: false,
    })
  }

  const sb = createServiceSupabase()
  const { error: dbErr } = await sb
    .from('labels')
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
