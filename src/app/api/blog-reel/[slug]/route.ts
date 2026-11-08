/**
 * Guion del reel de un artículo (8 nov 2026). Lo pide la cola de render del PC
 * (`fabrica.optimal_reel`) con la clave de servicio; no es una ruta pública.
 *
 * GET  → { spec }  (escenas al molde A · Fanzine, pista, audio firmado e imágenes reales).
 *        El guion se escribe una vez y se guarda en `blog_posts.reel_spec`; `?force=1` lo rehace.
 * POST → { status, url? } marca `reel_status` / `reel_url` cuando el MP4 está subido o falló.
 */
import { createHmac, timingSafeEqual } from 'node:crypto'
import { NextRequest, NextResponse } from 'next/server'
import { createServiceSupabase, fetchAllRows } from '@/lib/supabase-admin'
import { isGpt5Family, openAiChatCompletionsBody, resolveOpenAiModel } from '@/lib/openai-editorial'
import { attachOnSiteFullAudio } from '@/lib/track-canonical-key'
import { isGiftDownloadTrack } from '@/lib/gift-download'
import type { BeatportTopTrack } from '@/types/database'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 120

const SITE = 'https://www.optimalbreaks.com'
const AUDIO_TTL_S = 6 * 60 * 60
const TOTAL_S = 60
const TIPOS = ['gancho', 'cita', 'dato', 'artista', 'tema'] as const

type Escena = Record<string, unknown> & { tipo: string; seg: number }
type Imagen = { url: string; que: string }

function serviceKey(): string {
  return process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY || ''
}

function authorized(req: NextRequest): boolean {
  const key = serviceKey()
  const got = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!key || !got) return false
  const a = Buffer.from(key)
  const b = Buffer.from(got)
  return a.length === b.length && timingSafeEqual(a, b)
}

/** Misma firma que `/api/audio/[file]`: la fábrica baja el MP3 sin pasar por la web. */
function signedAudioUrl(path: string): string {
  const file = path.split('/').pop() || ''
  const secret = process.env.AUDIO_STREAM_SECRET || serviceKey()
  const exp = Math.floor(Date.now() / 1000) + AUDIO_TTL_S
  const s = createHmac('sha256', secret).update(`${file}:${exp}`).digest('base64url')
  return `${SITE}/api/audio/${file}?e=${exp}&s=${s}`
}

function plain(html: string): string {
  return (html || '')
    .replace(/<(script|style)[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim()
}

function txt(v: unknown, max: number): string {
  const s = typeof v === 'string' ? v.replace(/\s+/g, ' ').trim() : typeof v === 'number' ? String(v) : ''
  if (s.length <= max) return s
  const cut = s.slice(0, max)
  const sp = cut.lastIndexOf(' ')
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).replace(/[\s,;:–-]+$/, '')
}

function trackTitle(t: BeatportTopTrack): string {
  const mix = (t.mix_name || '').trim()
  return mix && !/^original mix$/i.test(mix) ? `${t.title} (${mix})` : t.title
}

function artistNames(t: BeatportTopTrack): string[] {
  return (t.artists || []).map((a) => (a?.name || '').trim()).filter(Boolean)
}

/** Beatport sirve la carátula a 250 px en el JSONB; en el reel va a casi 600. */
function bigArt(url: string | null | undefined): string | null {
  return url ? url.replace(/\/image_size\/\d+x\d+\//, '/image_size/1400x1400/') : null
}

function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

async function loadMaterial(slug: string) {
  const supabase = createServiceSupabase()
  const { data: post, error } = await supabase
    .from('blog_posts')
    .select('slug, title_es, excerpt_es, content_es, category, tags, image_url, published_at, beatport_tracks, beatport_release_url, reel_spec, reel_status, reel_url')
    .eq('slug', slug)
    .maybeSingle()
  if (error || !post) return null
  const p = post as Record<string, unknown>

  let tracks = (Array.isArray(p.beatport_tracks) ? p.beatport_tracks : []) as BeatportTopTrack[]
  const { data: fullRows } = await supabase
    .from('chart_featured_tracks')
    .select('id, title, mix_name, artists, link_url, full_audio_url')
    .not('full_audio_url', 'is', null)
  if (fullRows?.length && tracks.length) {
    tracks = attachOnSiteFullAudio(
      tracks,
      (fullRows as Array<Record<string, unknown>>).map((r) => ({
        id: String(r.id),
        title: (r.title as string) || null,
        mix_name: (r.mix_name as string) || null,
        artists: r.artists,
        link_url: (r.link_url as string) || null,
        full_audio_url: (r.full_audio_url as string) || null,
        chartKind: 'featured',
      })),
    )
  }

  const main =
    tracks.find((t) => isGiftDownloadTrack(t.full_audio_url)) ||
    tracks.find((t) => t.full_audio_url) ||
    tracks.find((t) => t.sample_url) ||
    null

  const text = plain(String(p.content_es || ''))
  const imagenes: Imagen[] = []
  const push = (url: unknown, que: string) => {
    const raw = typeof url === 'string' ? url.trim() : ''
    const u = /^\/[^/]/.test(raw) ? `${SITE}${raw}` : raw
    if (/^https:\/\//.test(u) && !imagenes.some((i) => i.url === u)) imagenes.push({ url: u, que })
  }
  push(p.image_url, 'portada del artículo')
  for (const t of tracks.slice(0, 8)) {
    push(bigArt(t.artwork_url), `carátula del tema «${trackTitle(t)}» de ${artistNames(t).join(', ')}${t.release_year ? ` (${t.release_year})` : ''}`)
  }

  const { data: allArtists } = await fetchAllRows<{ name: string; image_url: string | null; country: string | null }>((from, to) =>
    supabase.from('artists').select('name, image_url, country').order('slug').range(from, to),
  )
  const credited = new Set(tracks.flatMap(artistNames).map((n) => n.toLowerCase()))
  // Una mención de pasada (un nombre en una lista) no merece foto: acreditado, en el titular o nombrado dos veces.
  const head = `${p.title_es || ''} ${p.excerpt_es || ''}`
  const veces = (name: string, s: string) => (s.match(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRe(name)}(?=[^\\p{L}\\p{N}]|$)`, 'giu')) || []).length
  const artistas = (allArtists || [])
    .filter((a) => a.name && a.name.length >= 3)
    .filter((a) => credited.has(a.name.toLowerCase()) || veces(a.name, head) > 0 || veces(a.name, text) >= 2)
    .slice(0, 8)
  for (const a of artistas) push(a.image_url, `foto del artista ${a.name}`)

  const labelNames = Array.from(new Set(tracks.map((t) => (t.label || '').trim()).filter(Boolean))).slice(0, 4)
  const { data: labels } = labelNames.length
    ? await supabase.from('labels').select('name, image_url').in('name', labelNames)
    : { data: [] as Array<{ name: string; image_url: string | null }> }
  for (const l of labels || []) push(l.image_url, `logo del sello ${l.name}`)

  const gratis = main && isGiftDownloadTrack(main.full_audio_url) ? 'descarga' : main?.full_audio_url ? 'stream' : null
  const audio = main?.full_audio_url
    ? { kind: 'full', path: main.full_audio_url, src: signedAudioUrl(main.full_audio_url) }
    : main?.sample_url
      ? { kind: 'sample', path: null, src: main.sample_url }
      : null

  return {
    supabase,
    post: p,
    text,
    tracks,
    main,
    artistas,
    labels: labels || [],
    imagenes,
    gratis,
    audio,
  }
}

type Material = NonNullable<Awaited<ReturnType<typeof loadMaterial>>>

function cierre(m: Material): Escena {
  const titulo = m.gratis === 'descarga' ? 'DESCÁRGALO GRATIS' : m.gratis === 'stream' ? 'ESCÚCHALO ENTERO' : 'LÉELO ENTERO'
  const sub = m.gratis ? 'GRATIS EN OPTIMALBREAKS.COM' : 'EN OPTIMALBREAKS.COM'
  return { tipo: 'cierre', seg: 8, titulo, sub }
}

function fallbackEscenas(m: Material): Escena[] {
  const p = m.post
  const cover = m.imagenes[0]?.url
  const out: Escena[] = [
    { tipo: 'gancho', seg: 6, kicker: txt(String(p.category || 'blog').toUpperCase(), 24), titulo: txt(String(p.title_es || '').toUpperCase(), 60), sub: txt(p.excerpt_es, 90), imagen: cover },
  ]
  for (const a of m.artistas.filter((x) => x.image_url).slice(0, 2)) {
    out.push({ tipo: 'artista', seg: 9, nombre: a.name.toUpperCase(), lugar: txt(a.country, 24).toUpperCase(), frase: '', dato: '', imagen: a.image_url })
  }
  if (m.main) {
    const fichas = [m.main.label && `SELLO · ${m.main.label}`, m.main.bpm && `${m.main.bpm} BPM`, m.main.key && `TONO · ${m.main.key}`]
      .filter(Boolean)
      .map((f) => txt(String(f).toUpperCase(), 28))
    out.push({ tipo: 'tema', seg: 9, ano: m.main.release_year || '', titulo: txt(m.main.title.toUpperCase(), 40), sub: txt(artistNames(m.main).join(' × '), 50), fichas, imagen: bigArt(m.main.artwork_url) || cover })
  }
  out.push(cierre(m))
  return out
}

const SYSTEM = `Eres el editor de vídeo de Optimal Breaks, web de breakbeat. Conviertes un artículo del blog en el guion de un reel vertical de 60 segundos, sin voz: solo textos grandes sobre imágenes y la música del tema.
Devuelve JSON: {"escenas":[...]} con 5 a 7 escenas, en español de España. La primera es "gancho". No escribas la escena de cierre: la pone el sistema.
Tipos y campos (respeta los límites de caracteres):
- gancho: kicker (≤22, mayúsculas, p. ej. "EXCLUSIVA" o "HISTORIA"), titulo (≤40, mayúsculas, golpe de efecto), sub (≤60), imagen.
- cita: ano (año o ""), titulo (≤30, mayúsculas), texto (≤90, contexto), cita (≤110, frase literal del artículo o de alguien citado en él, sin comillas), imagen.
- dato: ano (año o ""), titulo (≤30, mayúsculas), lineas (2 o 3 frases completas de ≤42 con datos concretos; nunca a medias), imagen (opcional: logo del sello o carátula de la que hable, si no se ha usado).
- artista: nombre (≤24, mayúsculas), lugar (≤24, mayúsculas, ciudad o país), frase (≤64), dato (≤56), imagen (su foto si está en la lista).
- tema: ano, titulo (≤36, mayúsculas, el nombre del tema), sub (≤50, artistas), fichas (2 o 3 de ≤20: sello, BPM, año, versión), imagen (su carátula).
Reglas:
- Solo hechos del artículo o de los datos. No inventes años, lugares, cifras ni citas. Si no sabes el año, "".
- Cuenta una historia de menos a más: gancho → contexto o historia → quién lo hace → el detalle que sorprende. Cada escena aporta algo nuevo: nunca repitas un dato, una idea ni un titular de otra escena.
- Que el tema esté entero, gratis o descargable ya lo dicen el casete fijo y el cierre: no gastes ninguna escena en eso (el gancho puede nombrarlo una vez, como mucho).
- Si el artículo trata de un solo tema, no hagas escena "tema": el gancho y el casete ya lo presentan.
- El casete fijo enseña siempre título y artistas del tema que suena: no los repitas como dato, ni su BPM ni su duración.
- Los titulares dicen algo ("RUSIA Y CÁDIZ", "NOMINADO EN 2008"), nunca son rótulos vacíos como "EL DETALLE FINAL", "DATOS" o "CURIOSIDADES".
- imagen: copia tal cual una URL de la lista y que enseñe lo que dice la escena. Escena de un artista → su foto. Escena de un tema o un disco → su carátula. Una foto de artista nunca ilustra a otra persona ni a un tema. Cada imagen, una sola vez en todo el reel.
- Escena "artista" solo si su foto está en la lista; si no hay foto, cuenta lo suyo en una escena "dato".
- Frases cortas, de cartel de fanzine. Nada de hashtags ni emojis.`

async function llmEscenas(m: Material): Promise<{ escenas: Escena[]; model: string } | null> {
  const key = process.env.OPENAI_API_KEY
  if (!key) return null
  const p = m.post
  const datos = {
    titulo: p.title_es,
    entradilla: p.excerpt_es,
    categoria: p.category,
    etiquetas: p.tags,
    tema_que_suena: m.main
      ? { titulo: trackTitle(m.main), artistas: artistNames(m.main), sello: m.main.label, bpm: m.main.bpm, ano: m.main.release_year, gratis: m.gratis }
      : null,
    otros_temas: m.tracks.slice(0, 8).map((t) => `${trackTitle(t)} — ${artistNames(t).join(', ')} (${t.label || ''}${t.release_year ? `, ${t.release_year}` : ''})`),
    artistas: m.artistas.map((a) => ({ nombre: a.name, pais: a.country })),
    imagenes: m.imagenes,
  }
  const user = `Datos:\n${JSON.stringify(datos)}\n\nArtículo:\n${m.text.slice(0, 9000)}`
  const model = resolveOpenAiModel('OPENAI_BLOG_REEL_MODEL')
  const payload = openAiChatCompletionsBody({
    model,
    messages: [
      { role: 'system', content: SYSTEM },
      { role: 'user', content: user },
    ],
    responseFormat: { type: 'json_object' },
    maxCompletionTokens: 6000,
    temperature: 0.7,
  })
  if (isGpt5Family(model)) payload.reasoning_effort = 'low'
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(90_000),
    })
    if (!res.ok) {
      console.error('[blog-reel] OpenAI', res.status, (await res.text()).slice(0, 300))
      return null
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const raw = JSON.parse(j.choices?.[0]?.message?.content || '{}') as { escenas?: unknown }
    const escenas = normalizar(Array.isArray(raw.escenas) ? raw.escenas : [], m)
    return escenas.length >= 3 ? { escenas, model } : null
  } catch (err) {
    console.error('[blog-reel]', err)
    return null
  }
}

/** Recorta textos, valida imágenes contra la lista real y reparte los 60 s. */
function normalizar(list: unknown[], m: Material): Escena[] {
  const urls = new Set(m.imagenes.map((i) => i.url))
  const cover = m.imagenes[0]?.url
  const pic = (v: unknown) => (typeof v === 'string' && urls.has(v.trim()) ? v.trim() : cover)
  const up = (v: unknown, n: number) => txt(v, n).toUpperCase()
  const ano = (v: unknown) => (/^\d{4}$/.test(String(v ?? '').trim()) ? String(v).trim() : '')
  const out: Escena[] = []
  for (const it of list) {
    if (!it || typeof it !== 'object') continue
    const e = it as Record<string, unknown>
    const tipo = String(e.tipo || '')
    if (!(TIPOS as readonly string[]).includes(tipo)) continue
    if (tipo === 'gancho' && out.length) continue
    if (tipo === 'gancho') out.push({ tipo, seg: 0, kicker: up(e.kicker, 22), titulo: up(e.titulo, 44), sub: txt(e.sub, 70), imagen: pic(e.imagen) })
    else if (tipo === 'cita') {
      const cita = txt(String(e.cita || '').replace(/^[«"“']+|[»"”']+$/g, ''), 110)
      if (cita) out.push({ tipo, seg: 0, ano: ano(e.ano), titulo: up(e.titulo, 30), texto: txt(e.texto, 90), cita, imagen: pic(e.imagen) })
    } else if (tipo === 'dato') {
      const lineas = (Array.isArray(e.lineas) ? e.lineas : []).map((l) => txt(l, 60)).filter(Boolean).slice(0, 3)
      if (lineas.length) out.push({ tipo, seg: 0, ano: ano(e.ano), titulo: up(e.titulo, 30), lineas, ...(e.imagen ? { imagen: pic(e.imagen) } : {}) })
    } else if (tipo === 'artista') {
      const nombre = up(e.nombre, 24)
      if (nombre) out.push({ tipo, seg: 0, nombre, lugar: up(e.lugar, 24), frase: txt(e.frase, 80), dato: txt(e.dato, 70), imagen: pic(e.imagen) })
    } else if (tipo === 'tema') {
      const fichas = (Array.isArray(e.fichas) ? e.fichas : []).map((f) => up(f, 24)).filter(Boolean).slice(0, 3)
      out.push({ tipo, seg: 0, ano: ano(e.ano), titulo: up(e.titulo, 36), sub: txt(e.sub, 50), fichas, imagen: pic(e.imagen) })
    }
    if (out.length >= 7) break
  }
  if (!out.length || out[0].tipo !== 'gancho') return []
  const que = new Map(m.imagenes.map((i) => [i.url, i.que]))
  const usadas = new Set<string>()
  for (const e of out) {
    const u = typeof e.imagen === 'string' ? e.imagen : ''
    const mala = !u || usadas.has(u) || (e.tipo === 'artista' && !String(que.get(u) || '').startsWith('foto del artista'))
    if (mala && e.tipo !== 'gancho') delete e.imagen
    else if (u) usadas.add(u)
  }
  return repartir([...out, cierre(m)])
}

function repartir(escenas: Escena[]): Escena[] {
  const mid = escenas.length - 2
  const resto = TOTAL_S - 6 - 8
  const base = mid > 0 ? Math.floor(resto / mid) : 0
  let extra = mid > 0 ? resto - base * mid : 0
  return escenas.map((e, i) => {
    if (i === 0) return { ...e, seg: 6 }
    if (i === escenas.length - 1) return { ...e, seg: 8 + (mid > 0 ? 0 : resto) }
    const seg = base + (extra > 0 ? 1 : 0)
    if (extra > 0) extra--
    return { ...e, seg }
  })
}

export async function GET(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { slug } = await ctx.params
  const m = await loadMaterial(slug)
  if (!m) return NextResponse.json({ error: 'not found' }, { status: 404 })

  const force = req.nextUrl.searchParams.get('force') === '1'
  const saved = m.post.reel_spec as { escenas?: Escena[]; model?: string } | null
  let escenas = !force && Array.isArray(saved?.escenas) && saved.escenas.length ? saved.escenas : null
  let model = saved?.model || 'guardado'
  if (!escenas) {
    const llm = await llmEscenas(m)
    escenas = llm?.escenas || repartir(fallbackEscenas(m))
    model = llm?.model || 'sin-ia'
    await m.supabase
      .from('blog_posts')
      .update({ reel_spec: { escenas, model, at: new Date().toISOString() }, reel_updated_at: new Date().toISOString() } as never)
      .eq('slug', slug)
  }

  const main = m.main
  return NextResponse.json({
    spec: {
      slug,
      lang: 'es',
      url: 'OPTIMALBREAKS.COM',
      gratis: m.gratis,
      model,
      pista: main
        ? {
            titulo: trackTitle(main).toUpperCase(),
            artistas: artistNames(main).join(' × ').toUpperCase(),
            sello: (main.label || '').toUpperCase(),
            bpm: main.bpm || 0,
            portada: bigArt(main.artwork_url) || m.imagenes[0]?.url || null,
          }
        : null,
      audio: m.audio,
      imagenes: m.imagenes,
      escenas,
    },
    reel_status: m.post.reel_status ?? null,
    reel_url: m.post.reel_url ?? null,
  })
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  if (!authorized(req)) return NextResponse.json({ error: 'forbidden' }, { status: 403 })
  const { slug } = await ctx.params
  const body = (await req.json().catch(() => ({}))) as { status?: string; url?: string }
  const status = ['en_cola', 'hecho', 'fallo', 'pedir'].includes(String(body.status)) ? String(body.status) : null
  if (!status) return NextResponse.json({ error: 'status' }, { status: 400 })
  const patch: Record<string, unknown> = { reel_status: status, reel_updated_at: new Date().toISOString() }
  if (status === 'hecho') {
    if (!/^https:\/\//.test(String(body.url || ''))) return NextResponse.json({ error: 'url' }, { status: 400 })
    patch.reel_url = body.url
  }
  const { error } = await createServiceSupabase().from('blog_posts').update(patch as never).eq('slug', slug)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true, status })
}
