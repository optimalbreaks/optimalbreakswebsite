import { createServiceSupabase } from '@/lib/supabase-admin'
import { pathToFileURL } from 'url'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import path from 'path'

export type ChatHistoryItem = { role: 'user' | 'assistant'; content: string }

export type ChatAction =
  | {
      type: 'artist'
      slug: string
      name: string
      notes?: string
      search?: boolean
    }
  | {
      type: 'event'
      slug: string
      name: string
      country?: string
      city?: string
      venue?: string
      location?: string
      address?: string
      date_start?: string | null
      date_end?: string | null
      event_type?: string
      lineup?: string[]
      website?: string | null
      tickets_url?: string | null
      description_es?: string
      description_en?: string
      tags?: string[]
      enrich?: boolean
      use_attached_image?: boolean
    }
  | {
      type: 'mix'
      slug: string
      title: string
      artist_name: string
      platform?: string
      mix_type?: string
      video_url?: string | null
      embed_url?: string | null
      year?: number | null
      duration_minutes?: number | null
      published_at?: string | null
      description_es?: string
      description_en?: string
      image_url?: string | null
      is_featured?: boolean
    }
  | {
      type: 'new_release'
      urls_text: string
      default_week_date?: string | null
      create_edition_if_missing?: boolean
    }
  | {
      type: 'vinyl'
      week_date: string
      create_edition_if_missing?: boolean
      items: Array<{
        title: string
        mix_name?: string
        artists?: Array<{ name: string } | string>
        label?: string
        catalog_number?: string
        year?: number | null
        format?: string
        discogs_url?: string
        youtube_url?: string | null
        artwork_url?: string | null
        note_en?: string
        note_es?: string
        sort_order?: number
      }>
    }

export type ChatPlan = {
  reply: string
  actions: ChatAction[]
}

export type ActionResult = {
  type: string
  ok: boolean
  summary: string
  detail?: unknown
}

const MIX_TYPES = new Set([
  'essential_mix',
  'classic_set',
  'radio_show',
  'youtube_session',
  'podcast',
])
const PLATFORMS = new Set(['soundcloud', 'youtube', 'mixcloud', 'other'])
const EVENT_TYPES = new Set(['festival', 'club_night', 'past_iconic', 'upcoming'])

export function toSlug(input: string): string {
  return String(input || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function httpsOrNull(v: unknown): string | null {
  if (typeof v !== 'string') return null
  const t = v.trim()
  return t.startsWith('https://') ? t : null
}

function loadSystemPrompt(): string {
  const p = path.resolve(process.cwd(), 'scripts', 'prompts', 'admin-chat-system.txt')
  if (!existsSync(p)) throw new Error(`Prompt no encontrado: ${p}`)
  return readFileSync(p, 'utf8').trim()
}

function stripJsonFence(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  return s
}

export function parseChatPlan(raw: unknown): ChatPlan {
  if (!raw || typeof raw !== 'object') {
    return { reply: 'No pude interpretar el plan.', actions: [] }
  }
  const o = raw as Record<string, unknown>
  const reply = typeof o.reply === 'string' && o.reply.trim() ? o.reply.trim() : 'Hecho.'
  const actions = Array.isArray(o.actions) ? (o.actions as ChatAction[]) : []
  return { reply, actions }
}

async function resolveFinalUrl(url: string): Promise<string> {
  try {
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      headers: { 'User-Agent': 'OptimalBreaksAdminChat/1.0' },
    })
    return res.url || url
  } catch {
    return url
  }
}

async function soundcloudOembed(trackUrl: string): Promise<{
  title?: string
  author_name?: string
  thumbnail_url?: string
}> {
  try {
    const u = new URL('https://soundcloud.com/oembed')
    u.searchParams.set('format', 'json')
    u.searchParams.set('url', trackUrl)
    const res = await fetch(u.toString(), { headers: { Accept: 'application/json' } })
    if (!res.ok) return {}
    return (await res.json()) as { title?: string; author_name?: string; thumbnail_url?: string }
  } catch {
    return {}
  }
}

function youtubeIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    if (u.hostname.includes('youtu.be')) {
      const id = u.pathname.replace(/^\//, '').slice(0, 11)
      return id.length === 11 ? id : null
    }
    if (u.hostname.includes('youtube.com')) {
      const v = u.searchParams.get('v')
      if (v && v.length === 11) return v
      const m = u.pathname.match(/\/(?:embed|shorts)\/([a-zA-Z0-9_-]{11})/)
      return m?.[1] || null
    }
  } catch {
    /* ignore */
  }
  return null
}

async function adminInternalPost(
  originRequest: Request,
  pathName: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const url = new URL(pathName, originRequest.url)
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      cookie: originRequest.headers.get('cookie') || '',
    },
    body: JSON.stringify(body),
  })
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
  return { ok: res.ok, status: res.status, json }
}

async function upsertArtistAction(
  action: Extract<ChatAction, { type: 'artist' }>,
  originRequest: Request,
): Promise<ActionResult> {
  const slug = toSlug(action.slug || action.name)
  const name = String(action.name || '').trim()
  if (!slug || !name) {
    return { type: 'artist', ok: false, summary: 'Faltan slug o name' }
  }
  const { ok, json } = await adminInternalPost(originRequest, '/api/admin/agent', {
    slug,
    artistName: name,
    notes: action.notes || undefined,
    search: action.search !== false,
  })
  if (!ok || !json.saved) {
    return {
      type: 'artist',
      ok: false,
      summary: `Artista ${slug}: ${String(json.error || json.dbError || 'falló el upsert')}`,
      detail: json,
    }
  }
  return {
    type: 'artist',
    ok: true,
    summary: `Artista upsert: ${name} (${slug})`,
    detail: { slug, row: json.row },
  }
}

async function upsertEventAction(
  action: Extract<ChatAction, { type: 'event' }>,
  originRequest: Request,
  attachedImageUrls: string[],
): Promise<ActionResult> {
  const slug = toSlug(action.slug || action.name)
  const name = String(action.name || '').trim()
  if (!slug || !name) {
    return { type: 'event', ok: false, summary: 'Faltan slug o name' }
  }

  const sb = createServiceSupabase()
  const eventType = EVENT_TYPES.has(String(action.event_type))
    ? String(action.event_type)
    : 'upcoming'

  const city = action.city?.trim() || 'TBA'
  const location =
    action.location?.trim() ||
    [city, (action.country || 'ES').trim()].filter(Boolean).join(', ')

  const row: Record<string, unknown> = {
    slug,
    name,
    country: (action.country || 'ES').trim() || 'ES',
    city,
    venue: action.venue?.trim() || null,
    location,
    address: action.address?.trim() || null,
    date_start: action.date_start || null,
    date_end: action.date_end || null,
    event_type: eventType,
    lineup: Array.isArray(action.lineup)
      ? Array.from(new Set(action.lineup.map((s) => String(s).trim()).filter(Boolean)))
      : [],
    website: httpsOrNull(action.website),
    tickets_url: httpsOrNull(action.tickets_url),
    description_es: typeof action.description_es === 'string' ? action.description_es : '',
    description_en: typeof action.description_en === 'string' ? action.description_en : '',
    tags: Array.isArray(action.tags)
      ? Array.from(new Set(action.tags.map((t) => String(t).trim().toLowerCase()).filter(Boolean)))
      : [],
    stages: [],
    schedule: [],
    socials: {},
    is_featured: false,
  }

  if (action.use_attached_image && attachedImageUrls[0]) {
    row.image_url = attachedImageUrls[0]
  }

  const { data: existing } = await sb.from('events').select('id, slug').eq('slug', slug).maybeSingle()

  let writeErr: string | undefined
  if (existing?.id) {
    const patch: Record<string, unknown> = { name: row.name, country: row.country }
    for (const key of [
      'city',
      'venue',
      'location',
      'address',
      'date_start',
      'date_end',
      'event_type',
      'website',
      'tickets_url',
      'image_url',
    ] as const) {
      const v = row[key]
      if (v != null && v !== '' && v !== 'TBA') patch[key] = v
    }
    if (Array.isArray(row.lineup) && (row.lineup as string[]).length) patch.lineup = row.lineup
    if (Array.isArray(row.tags) && (row.tags as string[]).length) patch.tags = row.tags
    if (typeof row.description_es === 'string' && row.description_es.trim()) {
      patch.description_es = row.description_es
    }
    if (typeof row.description_en === 'string' && row.description_en.trim()) {
      patch.description_en = row.description_en
    }
    const { error } = await sb.from('events').update(patch).eq('slug', slug)
    writeErr = error?.message
  } else {
    const { error } = await sb.from('events').insert(row)
    writeErr = error?.message
  }
  if (writeErr) {
    return { type: 'event', ok: false, summary: `Evento ${slug}: ${writeErr}` }
  }

  let enrichNote = ''
  if (action.enrich !== false) {
    const { ok, json } = await adminInternalPost(originRequest, '/api/admin/agent/event', {
      slug,
      force: false,
    })
    if (ok && json.saved) {
      enrichNote = ` · enriquecido (${(json.fieldsUpdated as string[] | undefined)?.join(', ') || 'campos'})`
    } else if (json.message) {
      enrichNote = ` · enrich: ${String(json.message)}`
    } else if (!ok) {
      enrichNote = ` · enrich falló: ${String(json.error || json.dbError || 'error')}`
    }
  }

  return {
    type: 'event',
    ok: true,
    summary: `Evento upsert: ${name} (${slug})${enrichNote}`,
    detail: { slug, image_url: row.image_url ?? null },
  }
}

async function upsertMixAction(action: Extract<ChatAction, { type: 'mix' }>): Promise<ActionResult> {
  const slug = toSlug(action.slug || action.title)
  const title = String(action.title || '').trim()
  const artist_name = String(action.artist_name || '').trim()
  if (!slug || !title) {
    return { type: 'mix', ok: false, summary: 'Faltan slug o title' }
  }

  let platform = String(action.platform || 'other')
  let video_url = httpsOrNull(action.video_url)
  let embed_url = httpsOrNull(action.embed_url)
  let image_url = httpsOrNull(action.image_url)
  let mix_type = String(action.mix_type || 'youtube_session')

  if (video_url && (video_url.includes('youtube.com') || video_url.includes('youtu.be'))) {
    platform = 'youtube'
    if (!MIX_TYPES.has(mix_type)) mix_type = 'youtube_session'
    const yid = youtubeIdFromUrl(video_url)
    if (yid && !image_url) {
      image_url = `https://i.ytimg.com/vi/${yid}/hqdefault.jpg`
    }
  }

  if (embed_url && embed_url.includes('soundcloud.com')) {
    platform = 'soundcloud'
    if (!MIX_TYPES.has(mix_type)) mix_type = 'classic_set'
    if (embed_url.includes('on.soundcloud.com')) {
      embed_url = await resolveFinalUrl(embed_url)
    }
    const oe = await soundcloudOembed(embed_url)
    if (!image_url && oe.thumbnail_url?.startsWith('https://')) image_url = oe.thumbnail_url
    if (!title && oe.title) {
      /* title already required */
    }
    if (!artist_name && oe.author_name) {
      /* keep artist_name as provided */
    }
  }

  if (!PLATFORMS.has(platform)) platform = 'other'
  if (!MIX_TYPES.has(mix_type)) mix_type = platform === 'youtube' ? 'youtube_session' : 'classic_set'

  const row = {
    slug,
    title,
    artist_name: artist_name || 'Unknown',
    description_en: typeof action.description_en === 'string' ? action.description_en : title,
    description_es: typeof action.description_es === 'string' ? action.description_es : title,
    mix_type,
    platform,
    year: action.year != null && Number.isFinite(Number(action.year)) ? Number(action.year) : null,
    duration_minutes:
      action.duration_minutes != null && Number.isFinite(Number(action.duration_minutes))
        ? Number(action.duration_minutes)
        : null,
    video_url,
    embed_url,
    image_url,
    is_featured: Boolean(action.is_featured),
    ...(typeof action.published_at === 'string' && action.published_at.trim()
      ? { published_at: action.published_at.trim() }
      : {}),
  }

  const sb = createServiceSupabase()
  const { data, error } = await sb.from('mixes').upsert(row, { onConflict: 'slug' }).select('id, slug, title')
  if (error) {
    return { type: 'mix', ok: false, summary: `Mix ${slug}: ${error.message}` }
  }
  return {
    type: 'mix',
    ok: true,
    summary: `Mix upsert: ${title} (${slug})`,
    detail: data?.[0] || { slug },
  }
}

async function importNewReleasesAction(
  action: Extract<ChatAction, { type: 'new_release' }>,
  originRequest: Request,
): Promise<ActionResult> {
  const urls_text = String(action.urls_text || '').trim()
  if (!urls_text) {
    return { type: 'new_release', ok: false, summary: 'Sin URLs Beatport' }
  }
  const { ok, json } = await adminInternalPost(originRequest, '/api/admin/featured-import', {
    urls_text,
    default_week_date: action.default_week_date || null,
    create_edition_if_missing: action.create_edition_if_missing !== false,
    pause_ms: 2200,
  })
  if (!ok) {
    return {
      type: 'new_release',
      ok: false,
      summary: `New Releases: ${String(json.error || 'error')}`,
      detail: json,
    }
  }
  const summary = json.summary as
    | { insertadas?: number; fallidas?: number; saltadas_duplicado?: number; saltadas_multi?: number }
    | undefined
  return {
    type: 'new_release',
    ok: true,
    summary: `New Releases: ${summary?.insertadas ?? 0} insertadas, ${summary?.saltadas_duplicado ?? 0} dupes, ${summary?.saltadas_multi ?? 0} multi, ${summary?.fallidas ?? 0} fallidas`,
    detail: json,
  }
}

async function upsertVinylAction(action: Extract<ChatAction, { type: 'vinyl' }>): Promise<ActionResult> {
  const weekDate = String(action.week_date || '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(weekDate)) {
    return { type: 'vinyl', ok: false, summary: 'week_date inválido (YYYY-MM-DD)' }
  }
  const items = Array.isArray(action.items) ? action.items : []
  if (!items.length) {
    return { type: 'vinyl', ok: false, summary: 'Sin items de vinilo' }
  }

  const keyMod = await import(
    pathToFileURL(join(process.cwd(), 'scripts', 'lib', 'chart-vinyl-track-key.mjs')).href
  )
  const vinylTrackKey = keyMod.vinylTrackKey as (
    title: string,
    mixName: string,
    artists: unknown,
  ) => string

  const sb = createServiceSupabase()
  const { data: editionRow, error: edErr } = await sb
    .from('chart_editions')
    .select('id')
    .eq('week_date', weekDate)
    .maybeSingle()
  if (edErr) return { type: 'vinyl', ok: false, summary: edErr.message }

  let editionId = editionRow?.id as string | undefined
  if (!editionId) {
    if (action.create_edition_if_missing === false) {
      return { type: 'vinyl', ok: false, summary: `No hay chart_editions para ${weekDate}` }
    }
    const { data: inserted, error: insEdErr } = await sb
      .from('chart_editions')
      .insert({
        week_date: weekDate,
        title: `40 Breaks Vitales — ${weekDate}`,
        description_en: `The 40 breakbeat tracks defining the week of ${weekDate}.`,
        description_es: `Los 40 temas de breakbeat que definen la semana del ${weekDate}.`,
        sources: [],
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insEdErr || !inserted?.id) {
      return { type: 'vinyl', ok: false, summary: insEdErr?.message || 'No se pudo crear edición' }
    }
    editionId = inserted.id as string
  }

  const { data: existingRows, error: exErr } = await sb
    .from('chart_vinyl_tracks')
    .select('id, title, mix_name, artists, sort_order')
    .eq('chart_edition_id', editionId)
  if (exErr) return { type: 'vinyl', ok: false, summary: exErr.message }

  const existingByKey = new Map<string, string>()
  let maxSort = 0
  for (const r of existingRows || []) {
    const k = vinylTrackKey(r.title, r.mix_name ?? '', r.artists)
    if (!existingByKey.has(k)) existingByKey.set(k, r.id as string)
    const so = Number(r.sort_order || 0)
    if (so > maxSort) maxSort = so
  }

  let inserted = 0
  let updated = 0
  const errors: string[] = []

  for (const raw of items) {
    const title = String(raw.title || '').trim()
    if (!title) {
      errors.push('item sin title')
      continue
    }
    const discogs_url = String(raw.discogs_url || '').trim()
    const youtube_url = String(raw.youtube_url || '').trim()
    if (!discogs_url && !youtube_url) {
      errors.push(`"${title}": falta discogs_url o youtube_url`)
      continue
    }
    const artists = Array.isArray(raw.artists)
      ? raw.artists
          .map((a) =>
            typeof a === 'string' ? { name: a } : { name: String(a?.name || '').trim() },
          )
          .filter((a) => a.name)
      : []
    const mix_name = String(raw.mix_name || '').trim()
    const k = vinylTrackKey(title, mix_name, artists)
    const liveId = existingByKey.get(k)

    let sort_order: number
    if (raw.sort_order != null && Number.isFinite(Number(raw.sort_order))) {
      sort_order = Number(raw.sort_order)
      maxSort = Math.max(maxSort, sort_order)
    } else if (liveId) {
      sort_order = Number(
        (existingRows || []).find((r) => r.id === liveId)?.sort_order || maxSort + 1,
      )
    } else {
      maxSort += 1
      sort_order = maxSort
    }

    const row = {
      chart_edition_id: editionId,
      sort_order,
      title,
      mix_name,
      artists,
      label: String(raw.label || '').trim(),
      catalog_number: String(raw.catalog_number || '').trim(),
      year: raw.year != null && Number.isFinite(Number(raw.year)) ? Number(raw.year) : null,
      format: String(raw.format || '').trim(),
      discogs_url: discogs_url || '',
      youtube_url: youtube_url || null,
      artwork_url: httpsOrNull(raw.artwork_url),
      note_en: String(raw.note_en || '').trim(),
      note_es: String(raw.note_es || '').trim(),
    }

    if (liveId) {
      const { error } = await sb.from('chart_vinyl_tracks').update(row).eq('id', liveId)
      if (error) errors.push(`update ${title}: ${error.message}`)
      else updated++
    } else {
      const { error } = await sb.from('chart_vinyl_tracks').insert(row)
      if (error) errors.push(`insert ${title}: ${error.message}`)
      else {
        inserted++
        existingByKey.set(k, 'new')
      }
    }
  }

  return {
    type: 'vinyl',
    ok: errors.length === 0,
    summary: `Vinyl ${weekDate}: ${inserted} nuevos, ${updated} actualizados${errors.length ? ` · errores: ${errors.join('; ')}` : ''}`,
    detail: { week_date: weekDate, inserted, updated, errors },
  }
}

export async function executeChatActions(
  actions: ChatAction[],
  originRequest: Request,
  attachedImageUrls: string[],
): Promise<ActionResult[]> {
  const results: ActionResult[] = []
  for (const action of actions) {
    if (!action || typeof action !== 'object' || !('type' in action)) continue
    try {
      switch (action.type) {
        case 'artist':
          results.push(await upsertArtistAction(action, originRequest))
          break
        case 'event': {
          const eventAction =
            attachedImageUrls.length > 0
              ? { ...action, use_attached_image: true, enrich: action.enrich !== false }
              : action
          results.push(await upsertEventAction(eventAction, originRequest, attachedImageUrls))
          break
        }
        case 'mix':
          results.push(await upsertMixAction(action))
          break
        case 'new_release':
          results.push(await importNewReleasesAction(action, originRequest))
          break
        case 'vinyl':
          results.push(await upsertVinylAction(action))
          break
        default:
          results.push({
            type: String((action as { type?: string }).type || '?'),
            ok: false,
            summary: 'Tipo de acción desconocido',
          })
      }
    } catch (e) {
      results.push({
        type: String((action as { type?: string }).type || '?'),
        ok: false,
        summary: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return results
}

const CHAT_IMAGE_MAX_BYTES = 12 * 1024 * 1024

async function fetchSerpContext(query: string, apiKey: string): Promise<string> {
  const url = new URL('https://serpapi.com/search.json')
  url.searchParams.set('engine', 'google')
  url.searchParams.set('q', query)
  url.searchParams.set('num', '10')
  url.searchParams.set('gl', 'es')
  url.searchParams.set('hl', 'es')
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
    return bits.join('\n').slice(0, 10_000)
  } catch {
    return ''
  }
}

type ScreenshotFacts = {
  event_name?: string
  city?: string
  country?: string
  venue?: string
  date_text?: string
  date_start?: string | null
  lineup?: string[]
  tickets_or_urls?: string[]
  raw_text?: string
  search_query?: string
}

async function extractScreenshotFacts(opts: {
  openaiKey: string
  model: string
  message: string
  imageDataUrls: { mime: string; dataUrl: string }[]
}): Promise<ScreenshotFacts | null> {
  if (!opts.imageDataUrls.length) return null

  const parts: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail: 'high' } }
  > = [
    {
      type: 'text',
      text: `Eres un lector de carteles/capturas de eventos de música electrónica (breakbeat, bass, club, festivales).
Lee la imagen con detalle (OCR). El editor escribió: ${opts.message || '(nada; solo captura)'}.

Devuelve SOLO JSON:
{
  "event_name": "nombre del evento o null",
  "city": "ciudad o null",
  "country": "país corto o null",
  "venue": "sala/club o null",
  "date_text": "fecha como aparece en el flyer",
  "date_start": "YYYY-MM-DD si puedes inferirlo con seguridad, si no null",
  "lineup": ["DJ1","DJ2"],
  "tickets_or_urls": ["urls o dominios visibles"],
  "raw_text": "transcripción breve de lo legible",
  "search_query": "consulta Google corta para encontrar entradas/ficha oficial"
}`,
    },
  ]
  for (const img of opts.imageDataUrls.slice(0, 2)) {
    parts.push({ type: 'image_url', image_url: { url: img.dataUrl, detail: 'high' } })
  }

  const res = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${opts.openaiKey}`,
    },
    body: JSON.stringify({
      model: opts.model,
      temperature: 0.1,
      response_format: { type: 'json_object' },
      messages: [{ role: 'user', content: parts }],
    }),
  })
  if (!res.ok) return null
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) return null
  try {
    return JSON.parse(stripJsonFence(content)) as ScreenshotFacts
  } catch {
    return null
  }
}

export async function uploadChatImages(
  files: File[],
): Promise<{ urls: string[]; errors: string[] }> {
  const sb = createServiceSupabase()
  const urls: string[] = []
  const errors: string[] = []
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

  for (const file of files) {
    if (!(file instanceof File)) continue
    if (!allowed.has(file.type)) {
      errors.push(`${file.name}: MIME no permitido`)
      continue
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      errors.push(`${file.name}: demasiado grande (máx 12MB)`)
      continue
    }
    const ext = file.name.split('.').pop() || 'jpg'
    const storagePath = `chat/${Date.now()}_${file.name.replace(/\s+/g, '_').slice(0, 80)}.${ext}`.replace(
      /\.+\./,
      '.',
    )
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await sb.storage.from('media').upload(storagePath, buffer, {
      contentType: file.type,
      upsert: true,
    })
    if (error) {
      errors.push(`${file.name}: ${error.message}`)
      continue
    }
    const { data } = sb.storage.from('media').getPublicUrl(storagePath)
    if (data?.publicUrl) urls.push(data.publicUrl)
  }
  return { urls, errors }
}

export async function planChatWithOpenAI(opts: {
  message: string
  history: ChatHistoryItem[]
  imageDataUrls: { mime: string; dataUrl: string; publicUrl?: string }[]
  attachedPublicUrls: string[]
}): Promise<ChatPlan> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) throw new Error('OPENAI_API_KEY no configurada')

  const systemPrompt = loadSystemPrompt()
  const model = process.env.OPENAI_CHAT_MODEL?.trim() || process.env.OPENAI_MODEL?.trim() || 'gpt-4o'
  const hasImages = opts.imageDataUrls.length > 0 || opts.attachedPublicUrls.length > 0

  let screenshotFacts: ScreenshotFacts | null = null
  let webContext = ''

  if (hasImages && opts.imageDataUrls.length > 0) {
    screenshotFacts = await extractScreenshotFacts({
      openaiKey,
      model,
      message: opts.message,
      imageDataUrls: opts.imageDataUrls,
    })
  }

  const serpKey = process.env.SERPAPI_API_KEY?.trim()
  if (serpKey) {
    const q =
      screenshotFacts?.search_query?.trim() ||
      [
        screenshotFacts?.event_name,
        screenshotFacts?.city,
        screenshotFacts?.date_start?.slice(0, 4) || screenshotFacts?.date_text,
        'entradas evento',
      ]
        .filter(Boolean)
        .join(' ')
        .trim() ||
      (opts.message.match(/https?:\/\/\S+/i)
        ? ''
        : opts.message
            .replace(/https?:\/\/\S+/gi, '')
            .trim()
            .slice(0, 120))
    if (q && q.length > 3) {
      webContext = await fetchSerpContext(q, serpKey)
    }
  }

  const historyMsgs = opts.history.slice(-8).map((h) => ({
    role: h.role as 'user' | 'assistant',
    content: h.content,
  }))

  const userParts: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'high' | 'low' | 'auto' } }
  > = []

  let text = `MENSAJE DEL EDITOR:\n${opts.message || '(sin texto; solo captura/imagen — trata como alta de evento desde cartel)'}\n`
  if (opts.attachedPublicUrls.length) {
    text += `\nIMÁGENES SUBIDAS (Storage). En action event usa use_attached_image=true:\n`
    opts.attachedPublicUrls.forEach((u, i) => {
      text += `${i + 1}. ${u}\n`
    })
  }
  if (screenshotFacts) {
    text += `\nHECHOS YA LEÍDOS DE LA CAPTURA (OCR previo; priorízalos):\n${JSON.stringify(screenshotFacts, null, 2)}\n`
  }
  if (webContext) {
    text += `\nCONTEXTO WEB (búsqueda; puede tener errores; no inventes URLs que no aparezcan):\n---\n${webContext}\n---\n`
  } else if (hasImages) {
    text += `\n(Sin contexto web / SerpAPI. Completa solo con lo legible en la imagen y el mensaje.)\n`
  }
  text += `\nHoy (UTC): ${new Date().toISOString().slice(0, 10)}\nDevuelve SOLO el JSON del plan (reply + actions). Si hay cartel, action event con enrich=true y use_attached_image=true.`
  userParts.push({ type: 'text', text })

  for (const img of opts.imageDataUrls.slice(0, 4)) {
    userParts.push({
      type: 'image_url',
      image_url: { url: img.dataUrl, detail: 'high' },
    })
  }

  const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      temperature: 0.15,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: systemPrompt },
        ...historyMsgs,
        { role: 'user', content: userParts },
      ],
    }),
  })

  if (!oaiRes.ok) {
    const errText = await oaiRes.text()
    throw new Error(`OpenAI ${oaiRes.status}: ${errText.slice(0, 500)}`)
  }

  const oaiData = await oaiRes.json()
  const content = oaiData.choices?.[0]?.message?.content
  if (!content) throw new Error('Respuesta vacía de OpenAI')

  let parsed: unknown
  try {
    parsed = JSON.parse(stripJsonFence(content))
  } catch {
    throw new Error('JSON inválido del modelo')
  }
  const plan = parseChatPlan(parsed)

  // Garantías para capturas: cartel → image_url + enrich
  if (opts.attachedPublicUrls.length) {
    plan.actions = plan.actions.map((a) => {
      if (a && typeof a === 'object' && a.type === 'event') {
        return { ...a, use_attached_image: true, enrich: a.enrich !== false }
      }
      return a
    })
  }

  return plan
}
