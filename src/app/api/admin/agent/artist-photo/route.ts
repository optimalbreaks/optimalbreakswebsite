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

const SYSTEM_TEXT = `Eres editor de Optimal Breaks (música dance / breakbeat). Te pasan candidatos de Google Imágenes como METADATOS (no ves la foto).
Tu tarea: elegir a lo sumo UN candidato que sea muy probablemente una foto del artista o grupo indicado (retrato, promo, directo claro). Rechaza: otra persona homónima, memes, portadas de disco solas si parece que no hay persona, logos abstractos, renders genéricos, capturas de baja calidad, merchandising, resultados dudosos.
Responde SOLO un JSON con el esquema:
{"chosen": <número entero 0-based del array "candidates" o null>, "reason": <string breve en español>}
Si ningún candidato es fiable, chosen debe ser null.`

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

async function openAiChoose(artistName: string, slug: string, candidates: ImageCandidate[]): Promise<{ url: string | null; reason: string }> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const model = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4'

  const lines = candidates.map((c, i) => {
    const dim = c.width && c.height ? `${c.width}x${c.height}` : 'unknown'
    const host = hostFromUrl(c.original)
    return `[${i}] title: ${c.title}\n    source: ${c.source}\n    page: ${c.link}\n    image_host: ${host}\n    size: ${dim}`
  })

  const user = `Artista:\n- nombre: ${artistName}\n- slug: ${slug}\n\nCandidatos (índices 0..${candidates.length - 1}):\n${lines.join('\n\n')}\n\nDevuelve JSON: {"chosen": number|null, "reason": string}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
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
 * GET /api/admin/agent/artist-photo?queue=missing
 * Artists without image_url.
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
    const artists: { slug: string; name: string }[] = []
    const pageSize = 1000
    let from = 0
    for (;;) {
      const { data, error } = await sb
        .from('artists')
        .select('slug,name,image_url')
        .order('slug', { ascending: true })
        .range(from, from + pageSize - 1)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      if (!data?.length) break
      for (const row of data) {
        const url = String(row.image_url || '').trim()
        if (row.slug && row.name && !url.startsWith('https://')) {
          artists.push({ slug: row.slug, name: row.name })
        }
      }
      if (data.length < pageSize) break
      from += pageSize
    }
    return NextResponse.json({ count: artists.length, artists })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 })
  }
}

/**
 * POST /api/admin/agent/artist-photo
 * { slug, artistName } → SerpAPI images → OpenAI pick → download → Storage → UPSERT
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { slug, artistName } = body as { slug?: string; artistName?: string }
  if (!slug || !artistName) {
    return NextResponse.json({ error: 'Se requieren slug y artistName' }, { status: 400 })
  }

  const serpKey = process.env.SERPAPI_API_KEY?.trim()
  if (!serpKey) return NextResponse.json({ error: 'SERPAPI_API_KEY no configurada' }, { status: 500 })
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) return NextResponse.json({ error: 'OPENAI_API_KEY no configurada' }, { status: 500 })

  const query = `"${artistName}" DJ musician artist portrait photo`.replace(/\s+/g, ' ').trim()
  const alternateQueries = [
    `${artistName} DJ producer portrait press photo`,
    `"${artistName}" electronic DJ musician`,
    `"${artistName}" breakbeat DJ`,
  ]
    .map((q) => q.replace(/\s+/g, ' ').trim())
    .filter((q) => q !== query)

  let candidates: ImageCandidate[]
  try {
    candidates = await serpGoogleImages(query, serpKey, 18, { alternateQueries })
  } catch (e) {
    return NextResponse.json({ error: `SerpAPI: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  if (candidates.length === 0) {
    return NextResponse.json({ chosen: null, reason: 'Sin resultados de imágenes', candidates: 0 })
  }

  let chosen: { url: string | null; reason: string }
  try {
    chosen = await openAiChoose(artistName, slug, candidates)
  } catch (e) {
    return NextResponse.json({ error: `OpenAI: ${e instanceof Error ? e.message : e}` }, { status: 502 })
  }

  if (!chosen.url) {
    return NextResponse.json({ chosen: null, reason: chosen.reason, candidates: candidates.length })
  }

  const uploadUrl = pathToFileURL(
    join(process.cwd(), 'scripts', 'lib', 'upload-artist-portrait-to-storage.mjs'),
  ).href
  const { uploadArtistPortraitFromUrl } = await import(uploadUrl)

  let storageUrl: string
  try {
    storageUrl = await uploadArtistPortraitFromUrl({ slug, sourceUrl: chosen.url, quiet: true })
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
    .from('artists')
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
