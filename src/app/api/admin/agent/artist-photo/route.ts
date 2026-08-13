import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'
import { openAiChatCompletionsBody, resolveOpenAiModel } from '@/lib/openai-editorial'
import { join } from 'path'
import { pathToFileURL } from 'url'

/** Visión + SerpAPI; el chat usa light=true para no colgar. */
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
  if (preferThumb) {
    if (thumb.startsWith('https://')) return thumb
    if (originalOk) return original
  } else {
    if (originalOk) return original
    if (thumb.startsWith('https://')) return thumb
  }
  return original.startsWith('https://') ? original : null
}

/** URLs que suelen devolver HTML/login al descargar (no sirven para Storage). */
function isDownloadableImageUrl(url: string): boolean {
  if (!url.startsWith('https://')) return false
  const host = hostFromUrl(url).toLowerCase()
  const blocked = [
    'lookaside.instagram.com',
    'lookaside.fbsbx.com',
    'instagram.com',
    'facebook.com',
    'fbcdn.net',
  ]
  return !blocked.some((h) => host.includes(h))
}

function isDownloadableOriginal(c: ImageCandidate): boolean {
  return isDownloadableImageUrl(typeof c.original === 'string' ? c.original : '')
}

function preferDownloadableCandidates(candidates: ImageCandidate[]): ImageCandidate[] {
  const good = candidates.filter(isDownloadableOriginal)
  // Si hay suficientes descargables, no ofrecemos lookaside/IG al modelo
  return good.length >= 3 ? good : candidates
}

const SYSTEM_PHOTO_VISION = `Eres editor de Optimal Breaks (música dance / breakbeat). Ves miniaturas/imágenes de candidatos a foto de artista.

OBLIGATORIO — visión:
1) Mira cada imagen: debe ser claramente un retrato, promo o foto de directo del artista/grupo indicado.
2) RECHAZA otra persona homónima, memes, portadas de disco sin persona clara, logos abstractos, merchandising, capturas borrosas, collages genéricos.
3) RECHAZA resultados dudosos aunque el título de Google diga el nombre (Google Imágenes se equivoca a menudo).
4) Entre varios válidos, prefiere: cara/identidad reconocible, buena resolución, fuente press/oficial.

Responde SOLO JSON:
{"chosen": <índice 0-based o null>, "reason": <string breve en español>}
Si ninguno es fiable, chosen = null.`

const SYSTEM_PHOTO_META = `Eres editor de Optimal Breaks (música dance / breakbeat). Te pasan candidatos de Google Imágenes como METADATOS (no ves la foto).
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

async function openAiChoosePhotoVision(
  artistName: string,
  slug: string,
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
      text: `Artista a emparejar (mira cada imagen; no confíes solo en el título de Google):
- nombre: ${artistName}
- slug: ${slug}

Candidatos ordenados por resolución estimada (índices 0..${maxImg - 1}). Elige UN índice cuya foto sea de ESTE artista, o null.
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
          { role: 'system', content: SYSTEM_PHOTO_VISION },
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
  return { url: null, reason: reason || 'ninguna foto encaja por visión' }
}

async function openAiChoosePhotoMeta(
  artistName: string,
  slug: string,
  candidates: ImageCandidate[],
): Promise<{ url: string | null; reason: string }> {
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) throw new Error('Falta OPENAI_API_KEY')
  const model = resolveOpenAiModel()

  const lines = candidates.map((c, i) => {
    const dim = c.width && c.height ? `${c.width}x${c.height}` : 'unknown'
    const host = hostFromUrl(c.original)
    return `[${i}] title: ${c.title}\n    source: ${c.source}\n    page: ${c.link}\n    image_host: ${host}\n    size: ${dim}`
  })

  const user = `Artista:\n- nombre: ${artistName}\n- slug: ${slug}\n\nCandidatos (índices 0..${candidates.length - 1}):\n${lines.join('\n\n')}\n\nDevuelve JSON: {"chosen": number|null, "reason": string}`

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify(
      openAiChatCompletionsBody({
        model,
        temperature: 0.15,
        maxCompletionTokens: 2000,
        responseFormat: { type: 'json_object' },
        messages: [
          { role: 'system', content: SYSTEM_PHOTO_META },
          { role: 'user', content: user },
        ],
      }),
    ),
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

  const portraitHref = pathToFileURL(
    join(process.cwd(), 'scripts', 'lib', 'editorial-public-artist-portrait.mjs'),
  ).href
  const { hasEditorialPortraitFile } = (await import(portraitHref)) as {
    hasEditorialPortraitFile: (s: string) => boolean
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
        if (!row.slug || !row.name || url.startsWith('https://')) continue
        if (hasEditorialPortraitFile(row.slug)) continue
        artists.push({ slug: row.slug, name: row.name })
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
 * { slug, artistName?, light? } → SerpAPI → visión (o metadatos fallback) → Storage → UPSERT
 * Si falta artistName, se lee de BD por slug.
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { slug, artistName: artistNameIn, light, metadataOnly } = body as {
    slug?: string
    artistName?: string
    light?: boolean
    metadataOnly?: boolean
  }
  if (!slug) {
    return NextResponse.json({ error: 'Se requiere slug' }, { status: 400 })
  }

  const sb = createServiceSupabase()
  let artistName = typeof artistNameIn === 'string' ? artistNameIn.trim() : ''
  if (!artistName) {
    const { data: row, error } = await sb
      .from('artists')
      .select('name')
      .eq('slug', slug)
      .maybeSingle()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    artistName = String(row?.name || '').trim()
  }
  if (!artistName) {
    return NextResponse.json(
      { error: 'Se requieren slug y artistName (o artista existente en BD)' },
      { status: 400 },
    )
  }

  const force = request.nextUrl.searchParams.get('force') === '1'
  if (!force) {
    const portraitHref = pathToFileURL(
      join(process.cwd(), 'scripts', 'lib', 'editorial-public-artist-portrait.mjs'),
    ).href
    const { hasEditorialPortraitFile } = (await import(portraitHref)) as {
      hasEditorialPortraitFile: (s: string) => boolean
    }
    if (hasEditorialPortraitFile(slug)) {
      return NextResponse.json({
        skipped: true,
        reason:
          'Retrato editorial en public/images/artists (mapa). Quita el slug del JSON map o llama POST /api/admin/agent/artist-photo?force=1',
      })
    }
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
    `${artistName} DJ live photo`,
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

  const pool = preferDownloadableCandidates(candidates)

  let chosen: { url: string | null; reason: string }
  try {
    if (metadataOnly === true) {
      chosen = await openAiChoosePhotoMeta(artistName, slug, pool)
    } else {
      chosen = await openAiChoosePhotoVision(artistName, slug, pool, { light: light === true })
      if (!chosen.url) {
        const meta = await openAiChoosePhotoMeta(artistName, slug, pool)
        if (meta.url) chosen = { ...meta, reason: `${meta.reason} (fallback metadatos)` }
      }
    }
    // Si eligió un host no descargable, reintenta solo con pool descargable
    if (chosen.url && !isDownloadableImageUrl(chosen.url)) {
      const onlyGood = candidates.filter(isDownloadableOriginal)
      if (onlyGood.length) {
        const meta = await openAiChoosePhotoMeta(artistName, slug, onlyGood)
        if (meta.url) {
          chosen = { ...meta, reason: `${meta.reason} (evitó CDN Instagram/Facebook)` }
        } else {
          chosen = { url: null, reason: 'solo candidatas en hosts no descargables (IG/FB)' }
        }
      }
    }
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

  const { error: dbErr } = await sb.from('artists').update({ image_url: storageUrl }).eq('slug', slug)

  return NextResponse.json({
    chosen: chosen.url,
    storageUrl,
    reason: chosen.reason,
    candidates: candidates.length,
    saved: !dbErr,
    dbError: dbErr?.message,
  })
}
