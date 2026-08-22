import { createServiceSupabase } from '@/lib/supabase-admin'
import { openAiChatCompletionsBody } from '@/lib/openai-editorial'
import { pathToFileURL } from 'url'
import { join } from 'path'
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { waitUntil } from '@vercel/functions'

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
      type: 'label'
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

export type ScreenshotFacts = {
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

/**
 * Carteles suelen poner «21 de agosto» sin año; el modelo inventa 2023/2024.
 * Si la fecha ya pasó, la sube a la próxima ocurrencia del mismo día/mes (UTC).
 * Devuelve solo `YYYY-MM-DD` (sin hora).
 */
/**
 * Normaliza fechas de evento a YYYY-MM-DD.
 * - Si el año del ISO es claramente erróneo del modelo (p. ej. 2023/2024 con hoy en 2026),
 *   reinterpreta día/mes como la próxima ocurrencia futura.
 * - Si el año es el actual o el anterior reciente (edición ya celebrada / año explícito en cartel),
 *   se respeta aunque la fecha ya haya pasado (no empujar a +1 año).
 */
export function normalizeUpcomingEventDate(
  iso: string | null | undefined,
  now = new Date(),
): string | null {
  if (iso == null || iso === '') return null
  const m = String(iso).trim().match(/^(\d{4})-(\d{2})-(\d{2})/)
  if (!m) return null
  const mo = Number(m[2])
  const d = Number(m[3])
  if (!mo || !d || mo > 12 || d > 31) return null

  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()))
  const y = Number(m[1])
  const candidate = new Date(Date.UTC(y, mo - 1, d))
  if (Number.isNaN(candidate.getTime())) return null

  const fmt = (dt: Date) => {
    const yy = dt.getUTCFullYear()
    const mm = String(dt.getUTCMonth() + 1).padStart(2, '0')
    const dd = String(dt.getUTCDate()).padStart(2, '0')
    return `${yy}-${mm}-${dd}`
  }

  if (candidate >= today) return fmt(candidate)

  const currentY = today.getUTCFullYear()
  // Años muy antiguos = alucinación típica del modelo en carteles sin año
  if (y <= currentY - 2) {
    const thisYear = new Date(Date.UTC(currentY, mo - 1, d))
    const next =
      !Number.isNaN(thisYear.getTime()) && thisYear >= today
        ? thisYear
        : new Date(Date.UTC(currentY + 1, mo - 1, d))
    if (Number.isNaN(next.getTime())) return null
    return fmt(next)
  }

  // Año explícito reciente (esta edición ya pasó): conservar
  return fmt(candidate)
}

function loadSystemPrompt(): string {
  const p = path.resolve(process.cwd(), 'scripts', 'prompts', 'admin-chat-system.txt')
  if (existsSync(p)) return readFileSync(p, 'utf8').trim()
  // Fallback si el bundle no incluye scripts/prompts
  return `Eres el asistente editorial de Optimal Breaks. Con capturas de cartel, lee el evento y devuelve JSON { "reply":"...", "actions":[{ "type":"event", "slug":"...", "name":"...", "use_attached_image":true, "enrich":true, "lineup":[], "city":"", "country":"ES", "date_start":null }] }. Upsert directo, sin pedir confirmación.`
}

function stripJsonFence(raw: string): string {
  let s = raw.trim()
  if (s.startsWith('```')) {
    s = s.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/i, '')
  }
  return s
}

function httpsFromList(list: unknown): string | null {
  if (!Array.isArray(list)) return null
  for (const x of list) {
    const s = String(x || '').trim()
    if (s.startsWith('https://')) return s
    if (/^[a-z0-9.-]+\.[a-z]{2,}/i.test(s)) return `https://${s.replace(/^\/\//, '')}`
  }
  return null
}

/** Normaliza actions del modelo (payload anidado, type en español, etc.). */
export function normalizeChatActions(raw: unknown): ChatAction[] {
  if (!Array.isArray(raw)) return []
  const out: ChatAction[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    let o = item as Record<string, unknown>
    if (o.payload && typeof o.payload === 'object' && !Array.isArray(o.payload)) {
      o = { ...o, ...(o.payload as Record<string, unknown>) }
    }
    if (o.event && typeof o.event === 'object' && !o.type) {
      o = { type: 'event', ...(o.event as Record<string, unknown>) }
    }
    let type = String(o.type || o.kind || o.action || '')
      .toLowerCase()
      .trim()
    if (type === 'evento' || type === 'events') type = 'event'
    if (type === 'artista' || type === 'artists') type = 'artist'
    if (type === 'sello' || type === 'labels' || type === 'record_label') type = 'label'
    if (type === 'mixes') type = 'mix'
    if (type === 'new-release' || type === 'new_releases' || type === 'nr' || type === 'featured') {
      type = 'new_release'
    }
    if (type === 'vinilo' || type === 'vinyl_pick' || type === 'vinyls') type = 'vinyl'

    if (type === 'event') {
      const name = String(o.name || o.title || '').trim()
      const slug = toSlug(String(o.slug || name))
      if (!name && !slug) continue
      out.push({
        type: 'event',
        slug: slug || toSlug(name),
        name: name || slug,
        country: o.country != null ? String(o.country) : undefined,
        city: o.city != null ? String(o.city) : undefined,
        venue: o.venue != null ? String(o.venue) : undefined,
        location: o.location != null ? String(o.location) : undefined,
        address: o.address != null ? String(o.address) : undefined,
        date_start: normalizeUpcomingEventDate(
          o.date_start != null ? String(o.date_start) : null,
        ),
        date_end: normalizeUpcomingEventDate(o.date_end != null ? String(o.date_end) : null),
        event_type: o.event_type != null ? String(o.event_type) : undefined,
        lineup: Array.isArray(o.lineup) ? o.lineup.map((x) => String(x)) : undefined,
        website: httpsOrNull(o.website),
        tickets_url: httpsOrNull(o.tickets_url),
        description_es: o.description_es != null ? String(o.description_es) : undefined,
        description_en: o.description_en != null ? String(o.description_en) : undefined,
        tags: Array.isArray(o.tags) ? o.tags.map((x) => String(x)) : undefined,
        enrich: o.enrich !== false,
        use_attached_image: o.use_attached_image !== false,
      })
      continue
    }
    if (type === 'artist') {
      const name = String(o.name || o.artistName || o.artist_name || '').trim()
      const slug = toSlug(String(o.slug || name))
      if (!name || !slug) continue
      out.push({
        type: 'artist',
        slug,
        name,
        notes: o.notes != null ? String(o.notes) : undefined,
        search: o.search !== false,
      })
      continue
    }
    if (type === 'label') {
      const name = String(o.name || o.labelName || o.label_name || '').trim()
      const slug = toSlug(String(o.slug || name))
      if (!name || !slug) continue
      out.push({
        type: 'label',
        slug,
        name,
        notes: o.notes != null ? String(o.notes) : undefined,
        search: o.search !== false,
      })
      continue
    }
    if (type === 'mix') {
      const title = String(o.title || '').trim()
      const slug = toSlug(String(o.slug || title))
      if (!title || !slug) continue
      out.push({
        type: 'mix',
        slug,
        title,
        artist_name: String(o.artist_name || o.artistName || 'Unknown'),
        platform: o.platform != null ? String(o.platform) : undefined,
        mix_type: o.mix_type != null ? String(o.mix_type) : undefined,
        video_url: httpsOrNull(o.video_url),
        embed_url: httpsOrNull(o.embed_url),
        year: o.year != null ? Number(o.year) : null,
        duration_minutes: o.duration_minutes != null ? Number(o.duration_minutes) : null,
        published_at: o.published_at != null ? String(o.published_at) : null,
        description_es: o.description_es != null ? String(o.description_es) : undefined,
        description_en: o.description_en != null ? String(o.description_en) : undefined,
        image_url: httpsOrNull(o.image_url),
        is_featured: Boolean(o.is_featured),
      })
      continue
    }
    if (type === 'new_release') {
      const urls_text = String(o.urls_text || o.urls || '').trim()
      if (!urls_text) continue
      out.push({
        type: 'new_release',
        urls_text,
        default_week_date: o.default_week_date != null ? String(o.default_week_date) : null,
        create_edition_if_missing: o.create_edition_if_missing !== false,
      })
      continue
    }
    if (type === 'vinyl') {
      const week_date = String(o.week_date || '').trim()
      const items = Array.isArray(o.items) ? o.items : Array.isArray(o.vinyl) ? o.vinyl : []
      if (!week_date || !items.length) continue
      out.push({
        type: 'vinyl',
        week_date,
        create_edition_if_missing: o.create_edition_if_missing !== false,
        items: items as Extract<ChatAction, { type: 'vinyl' }>['items'],
      })
    }
  }
  return out
}

export function parseChatPlan(raw: unknown): ChatPlan {
  if (!raw || typeof raw !== 'object') {
    return { reply: 'No pude interpretar el plan.', actions: [] }
  }
  const o = raw as Record<string, unknown>
  const reply = typeof o.reply === 'string' && o.reply.trim() ? o.reply.trim() : 'Hecho.'
  const actions = normalizeChatActions(o.actions)
  return { reply, actions }
}

export function eventActionFromScreenshotFacts(
  facts: ScreenshotFacts,
  opts?: { forceEnrich?: boolean },
): Extract<ChatAction, { type: 'event' }> | null {
  const name = String(facts.event_name || '').trim()
  if (!name) return null
  const year = (facts.date_start || '').slice(0, 4)
  const slug = toSlug([name, year, facts.city].filter(Boolean).join(' '))
  if (!slug) return null
  const ticket = httpsFromList(facts.tickets_or_urls)
  const descBase = String(facts.raw_text || '').trim().slice(0, 600)
  return {
    type: 'event',
    slug,
    name,
    city: facts.city?.trim() || 'TBA',
    country: (facts.country || 'ES').trim() || 'ES',
    venue: facts.venue?.trim() || undefined,
    date_start: facts.date_start || null,
    lineup: Array.isArray(facts.lineup)
      ? facts.lineup.map((x) => String(x).trim()).filter(Boolean)
      : [],
    tickets_url: ticket,
    website: ticket,
    description_es:
      descBase ||
      `Evento ${name}${facts.city ? ` en ${facts.city}` : ''}${facts.date_text ? ` — ${facts.date_text}` : ''}.`,
    description_en:
      `Event: ${name}${facts.city ? ` in ${facts.city}` : ''}${facts.date_text ? ` — ${facts.date_text}` : ''}.`,
    event_type: 'club_night',
    enrich: opts?.forceEnrich !== false,
    use_attached_image: true,
    tags: ['from-capture'],
  }
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
  opts?: { timeoutMs?: number },
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const url = new URL(pathName, originRequest.url)
  const timeoutMs = opts?.timeoutMs
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: originRequest.headers.get('cookie') || '',
      },
      body: JSON.stringify(body),
      ...(timeoutMs && timeoutMs > 0 ? { signal: AbortSignal.timeout(timeoutMs) } : {}),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e)
    const timedOut = /timeout|aborted|AbortError/i.test(msg) || (e instanceof Error && e.name === 'TimeoutError')
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      json: { error: timedOut ? 'timeout' : msg },
    }
  }
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
  const vetoKey = `${slug} ${name}`.toLowerCase()
  if (/\bvazteria[\s-]*x\b/.test(vetoKey) || slug === 'vazteria-x') {
    return {
      type: 'artist',
      ok: false,
      summary: 'Opt-out: Vazteria X pidió no tener ficha. Las canciones sí; no se restaura el perfil.',
    }
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

  // Foto en segundo plano (paridad con cartel tras evento). La ficha del agente
  // casi nunca trae image_url https; no esperamos aquí para no colgar el chat.
  const row = (json.row || {}) as { image_url?: string | null }
  const currentImage = typeof row.image_url === 'string' ? row.image_url.trim() : ''
  const needsPhoto = !currentImage.startsWith('https://')
  if (needsPhoto) {
    const backgroundPhoto = (async () => {
      await adminInternalPost(
        originRequest,
        '/api/admin/agent/artist-photo',
        { slug, artistName: name, light: true },
        { timeoutMs: 90_000 },
      )
    })()
    try {
      waitUntil(backgroundPhoto)
    } catch {
      void backgroundPhoto.catch(() => {})
    }
  }

  return {
    type: 'artist',
    ok: true,
    summary: needsPhoto
      ? `Artista upsert: ${name} (${slug}) · buscando foto en segundo plano`
      : `Artista upsert: ${name} (${slug})`,
    detail: { slug, row: json.row },
  }
}

async function upsertLabelAction(
  action: Extract<ChatAction, { type: 'label' }>,
  originRequest: Request,
): Promise<ActionResult> {
  const slug = toSlug(action.slug || action.name)
  const name = String(action.name || '').trim()
  if (!slug || !name) {
    return { type: 'label', ok: false, summary: 'Faltan slug o name del sello' }
  }
  const { ok, json } = await adminInternalPost(originRequest, '/api/admin/agent/label', {
    slug,
    labelName: name,
    notes: action.notes || undefined,
    search: action.search !== false,
  })
  if (!ok || !json.saved) {
    return {
      type: 'label',
      ok: false,
      summary: `Sello ${slug}: ${String(json.error || json.dbError || 'falló el upsert')}`,
      detail: json,
    }
  }

  const row = (json.row || {}) as { image_url?: string | null }
  const currentImage = typeof row.image_url === 'string' ? row.image_url.trim() : ''
  const needsLogo = !currentImage.startsWith('https://')
  if (needsLogo) {
    const backgroundLogo = (async () => {
      await adminInternalPost(
        originRequest,
        '/api/admin/agent/label-logo',
        { slug, labelName: name },
        { timeoutMs: 90_000 },
      )
    })()
    try {
      waitUntil(backgroundLogo)
    } catch {
      void backgroundLogo.catch(() => {})
    }
  }

  return {
    type: 'label',
    ok: true,
    summary: needsLogo
      ? `Sello upsert: ${name} (${slug}) · buscando logo en segundo plano`
      : `Sello upsert: ${name} (${slug})`,
    detail: { slug, row: json.row },
  }
}

/** Nombre normalizado para detectar eventos duplicados (sin acentos, ni símbolos, minúsculas). */
function normalizeEventName(s: string): string {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
}

function isChatScreenshotUrl(url: unknown): boolean {
  return typeof url === 'string' && url.includes('/media/chat/')
}

type ExistingEventRow = {
  id: string
  slug: string
  name: string
  date_start: string | null
  city: string | null
  image_url: string | null
}

/**
 * Busca un evento ya existente que sea el mismo que el nuevo:
 * mismo slug, o nombre normalizado igual/contenido (y año compatible si ambos tienen fecha).
 */
function findDuplicateEvent(
  all: ExistingEventRow[],
  slug: string,
  name: string,
  dateStart: string | null | undefined,
): ExistingEventRow | null {
  const bySlug = all.find((e) => e.slug === slug)
  if (bySlug) return bySlug

  const normNew = normalizeEventName(name)
  if (!normNew || normNew.length < 5) return null
  const newYear = (dateStart || '').slice(0, 4)

  for (const e of all) {
    const normOld = normalizeEventName(e.name)
    if (!normOld) continue
    const sameName =
      normOld === normNew ||
      (normOld.length >= 8 && normNew.includes(normOld)) ||
      (normNew.length >= 8 && normOld.includes(normNew))
    if (!sameName) continue
    // Ediciones anuales: si ambos tienen año y difiere, NO es duplicado
    const oldYear = (e.date_start || '').slice(0, 4)
    if (newYear && oldYear && newYear !== oldYear) continue
    return e
  }
  return null
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
  const dateStart = normalizeUpcomingEventDate(action.date_start)
  const dateEnd = normalizeUpcomingEventDate(action.date_end) || dateStart

  const row: Record<string, unknown> = {
    slug,
    name,
    country: (action.country || 'ES').trim() || 'ES',
    city,
    venue: action.venue?.trim() || null,
    location,
    address: action.address?.trim() || null,
    date_start: dateStart,
    date_end: dateEnd,
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

  // Duplicados: buscar por slug Y por nombre normalizado (p. ej. mismo evento con otro slug)
  const { data: allEvents } = await sb
    .from('events')
    .select('id, slug, name, date_start, city, image_url')
    .limit(3000)
  const existing = findDuplicateEvent(
    (allEvents || []) as ExistingEventRow[],
    slug,
    name,
    action.date_start,
  )
  const targetSlug = existing?.slug || slug
  const isDuplicate = Boolean(existing && existing.slug !== slug)

  let writeErr: string | undefined
  if (existing?.id) {
    const patch: Record<string, unknown> = { country: row.country }
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
    ] as const) {
      const v = row[key]
      if (v != null && v !== '' && v !== 'TBA') patch[key] = v
    }
    // La captura del chat NUNCA sustituye un cartel ya existente
    const hasGoodImage =
      typeof existing.image_url === 'string' &&
      existing.image_url.startsWith('https://') &&
      !isChatScreenshotUrl(existing.image_url)
    if (!hasGoodImage && row.image_url) patch.image_url = row.image_url
    if (Array.isArray(row.lineup) && (row.lineup as string[]).length) patch.lineup = row.lineup
    if (Array.isArray(row.tags) && (row.tags as string[]).length) patch.tags = row.tags
    if (typeof row.description_es === 'string' && row.description_es.trim()) {
      patch.description_es = row.description_es
    }
    if (typeof row.description_en === 'string' && row.description_en.trim()) {
      patch.description_en = row.description_en
    }
    const { error } = await sb.from('events').update(patch).eq('slug', targetSlug)
    writeErr = error?.message
  } else {
    const { error } = await sb.from('events').insert(row)
    writeErr = error?.message
  }
  if (writeErr) {
    return { type: 'event', ok: false, summary: `Evento ${targetSlug}: ${writeErr}` }
  }

  // Enrich + cartel oficial en SEGUNDO PLANO (waitUntil).
  // Antes se esperaban aquí y el self-fetch a Vercel / OCR podían matar la respuesta
  // del chat aunque el UPSERT ya hubiera ido bien → el usuario veía error al final.
  const currentImage = existing?.image_url || (row.image_url as string | undefined) || null
  const needsRealPoster =
    !currentImage || !String(currentImage).startsWith('https://') || isChatScreenshotUrl(currentImage)

  const backgroundWork = (async () => {
    const tasks: Promise<unknown>[] = []
    if (action.enrich !== false) {
      tasks.push(
        adminInternalPost(
          originRequest,
          '/api/admin/agent/event',
          { slug: targetSlug, force: false },
          { timeoutMs: 90_000 },
        ),
      )
    }
    if (needsRealPoster) {
      tasks.push(
        adminInternalPost(
          originRequest,
          '/api/admin/agent/event-poster',
          { slug: targetSlug, light: true },
          { timeoutMs: 90_000 },
        ),
      )
    }
    if (tasks.length) await Promise.allSettled(tasks)
  })()

  try {
    waitUntil(backgroundWork)
  } catch {
    void backgroundWork.catch(() => {})
  }

  const header = isDuplicate
    ? `Ya existía «${existing?.name}» (${targetSlug}); actualizado sin duplicar`
    : existing
      ? `Evento ya existente actualizado: ${name} (${targetSlug})`
      : `Evento creado: ${name} (${targetSlug})`

  const bgNote =
    action.enrich !== false || needsRealPoster
      ? ' · completando ficha/cartel en segundo plano'
      : ''

  return {
    type: 'event',
    ok: true,
    summary: `${header}${bgNote}`,
    detail: { slug: targetSlug, duplicate_of: isDuplicate ? existing?.slug : undefined },
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
  const vinylIdentityKey = keyMod.vinylIdentityKey as (row: {
    youtube_url?: string | null
    title?: string
    mix_name?: string
    artists?: unknown
  }) => string

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
    .select('id, title, mix_name, artists, sort_order, youtube_url')
    .eq('chart_edition_id', editionId)
  if (exErr) return { type: 'vinyl', ok: false, summary: exErr.message }

  const existingByKey = new Map<string, string>()
  let maxSort = 0
  for (const r of existingRows || []) {
    const k = vinylIdentityKey(r)
    if (k && !existingByKey.has(k)) existingByKey.set(k, r.id as string)
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
    const k = vinylIdentityKey({ title, mix_name, artists, youtube_url })
    const liveId = k ? existingByKey.get(k) : undefined

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
        case 'label':
          results.push(await upsertLabelAction(action, originRequest))
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

/** Alineado con el límite del bucket `media` en Supabase (5 MB). */
const CHAT_IMAGE_MAX_BYTES = 5 * 1024 * 1024

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

function defaultWebSearchPrompt(query: string): string {
  return `Investiga en la web (música electrónica / breakbeat): ${query}

Devuelve SOLO un resumen factual en texto plano (sin markdown) con datos verificables: nombres, fechas, lugares, sellos, discografía, line-up, URLs oficiales.
Incluye la URL de la fuente junto a cada dato clave. Si algo no aparece, no lo inventes.`
}

export const EVENT_WEB_SEARCH_PROMPT = (query: string) =>
  `Investiga en la web el evento de música electrónica / breakbeat: ${query}

Prioriza fuentes oficiales (web del evento, promotor, ticketeras: MonsterTicket, Dice, RA, Resident Advisor, Facebook Events).

Devuelve SOLO un resumen factual en texto plano (sin markdown) con:
- Nombre oficial del evento
- Fecha(s) exacta(s) (YYYY-MM-DD si posible) y horarios (doors / cierre)
- Recinto/venue, dirección, ciudad y país
- Line-up completo / artistas confirmados (y stages si hay)
- URL oficial (website) y URL de venta de entradas (tickets)
- Redes sociales del evento si aparecen
- Precio, edad mínima, capacidad, promotor
Incluye la URL de la fuente junto a cada dato clave. Si algo no aparece, no lo inventes.`

/** Búsqueda web nativa de OpenAI (Responses API, tool web_search). Devuelve resumen factual. */
async function fetchOpenAIWebSearchContext(
  query: string,
  apiKey: string,
  prompt?: string,
): Promise<string> {
  // Preferir gpt-5.6-terra (web search nativo); override con OPENAI_SEARCH_MODEL
  const model =
    process.env.OPENAI_SEARCH_MODEL?.trim() ||
    process.env.OPENAI_CHAT_MODEL?.trim() ||
    'gpt-5.6-terra'
  const input = prompt || defaultWebSearchPrompt(query)

  // web_search (actual) → web_search_preview (legacy)
  for (const toolType of ['web_search', 'web_search_preview']) {
    try {
      const res = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
        },
        body: JSON.stringify({
          model,
          tools: [{ type: toolType }],
          tool_choice: 'auto',
          input,
        }),
        signal: AbortSignal.timeout(90_000),
      })
      if (!res.ok) {
        // 400 suele ser tool type no soportado → probar el otro
        if (res.status === 400) continue
        continue
      }
      const data = await res.json()
      let text = ''
      if (typeof data.output_text === 'string') {
        text = data.output_text
      } else if (Array.isArray(data.output)) {
        for (const item of data.output) {
          if (item?.type === 'message' && Array.isArray(item.content)) {
            for (const c of item.content) {
              if (
                (c?.type === 'output_text' || c?.type === 'text') &&
                typeof c.text === 'string'
              ) {
                text += c.text + '\n'
              }
            }
          }
        }
      }
      const trimmed = text.trim().slice(0, 12_000)
      if (trimmed) return trimmed
    } catch {
      /* probar siguiente tool type / fallback SerpAPI */
    }
  }
  return ''
}

/**
 * Contexto web para fichas: OpenAI web search primero; SerpAPI solo como respaldo.
 * (SerpAPI sigue siendo necesario aparte para Google IMÁGENES: carteles, fotos, logos.)
 */
export async function fetchWebResearchContext(
  query: string,
  opts?: { prompt?: string },
): Promise<{ context: string; source: 'openai' | 'serpapi' | 'none' }> {
  const q = query.trim()
  if (!q) return { context: '', source: 'none' }

  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (openaiKey) {
    const ctx = await fetchOpenAIWebSearchContext(q, openaiKey, opts?.prompt)
    if (ctx) return { context: ctx, source: 'openai' }
  }
  const serpKey = process.env.SERPAPI_API_KEY?.trim()
  if (serpKey) {
    const ctx = await fetchSerpContext(q, serpKey)
    if (ctx) return { context: ctx, source: 'serpapi' }
  }
  return { context: '', source: 'none' }
}

export async function extractScreenshotFacts(opts: {
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
  "date_start": "YYYY-MM-DD. Si el flyer muestra año (2026, '26), ÚSALO aunque la fecha ya haya pasado. Solo si NO hay año (p. ej. «21 de agosto»), usa el próximo día/mes FUTURO desde hoy (nunca inventes 2023/2024). Si no puedes inferir el día, null",
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
    body: JSON.stringify(
      openAiChatCompletionsBody({
        model: opts.model,
        temperature: 0.1,
        maxCompletionTokens: 4000,
        responseFormat: { type: 'json_object' },
        messages: [{ role: 'user', content: parts }],
      }),
    ),
  })
  if (!res.ok) return null
  const data = await res.json()
  const content = data.choices?.[0]?.message?.content
  if (!content) return null
  try {
    const facts = JSON.parse(stripJsonFence(content)) as ScreenshotFacts
    if (facts.date_start) {
      facts.date_start = normalizeUpcomingEventDate(facts.date_start)
    }
    return facts
  } catch {
    return null
  }
}

export async function uploadChatImages(
  files: File[],
): Promise<{
  urls: string[]
  errors: string[]
  dataUrls: { mime: string; dataUrl: string; publicUrl?: string }[]
}> {
  const sb = createServiceSupabase()
  const urls: string[] = []
  const errors: string[] = []
  const dataUrls: { mime: string; dataUrl: string; publicUrl?: string }[] = []
  const allowed = new Set(['image/jpeg', 'image/png', 'image/webp', 'image/gif'])

  for (const file of files) {
    if (!(file instanceof File)) continue
    if (!allowed.has(file.type)) {
      errors.push(`${file.name}: MIME no permitido`)
      continue
    }
    if (file.size > CHAT_IMAGE_MAX_BYTES) {
      errors.push(`${file.name}: demasiado grande (máx 5MB tras comprimir)`)
      continue
    }
    const mime = file.type || 'image/jpeg'
    const ext = mime === 'image/png' ? 'png' : mime === 'image/webp' ? 'webp' : 'jpg'
    const storagePath = `chat/${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
    const buffer = Buffer.from(await file.arrayBuffer())
    const { error } = await sb.storage.from('media').upload(storagePath, buffer, {
      contentType: mime,
      upsert: true,
    })
    if (error) {
      errors.push(`${file.name}: ${error.message}`)
      continue
    }
    const { data } = sb.storage.from('media').getPublicUrl(storagePath)
    const publicUrl = data?.publicUrl
    if (publicUrl) {
      urls.push(publicUrl)
      dataUrls.push({
        mime,
        dataUrl: `data:${mime};base64,${buffer.toString('base64')}`,
        publicUrl,
      })
    }
  }
  return { urls, errors, dataUrls }
}

export type ChatIntent = 'event' | 'new_release' | 'vinyl' | 'mix' | 'artist' | 'label'

const CHAT_INTENTS = new Set<string>([
  'event',
  'new_release',
  'vinyl',
  'mix',
  'artist',
  'label',
])

export function normalizeChatIntent(raw: unknown): ChatIntent | null {
  if (typeof raw !== 'string') return null
  const v = raw.trim().toLowerCase().replace(/-/g, '_')
  if (v === 'nr' || v === 'release' || v === 'releases') return 'new_release'
  if (v === 'vinilo' || v === 'vinyl_pick') return 'vinyl'
  if (v === 'artista') return 'artist'
  if (v === 'sello' || v === 'record_label' || v === 'labels') return 'label'
  if (CHAT_INTENTS.has(v)) return v as ChatIntent
  return null
}

/**
 * Infiera intención desde el texto cuando el editor no pulsó un chip.
 * Evita que «añade el sello X» acabe como evento (sesgo histórico del chat).
 */
export function inferChatIntent(message: string): ChatIntent | null {
  const raw = String(message || '').trim()
  if (!raw) return null
  const m = raw.toLowerCase()

  if (/beatport\.com\/[^\s]*\/?(track|release)(\/|\?|$)/i.test(raw)) return 'new_release'
  if (/beatport\.com\/[^\s]*\/?label(\/|\?|$)/i.test(raw)) return 'label'
  if (/\b(sello|sellos|discográfic|discografic|record label)\b/.test(m)) return 'label'
  if (/\b(vinyl pick|vinilo|vinilos|discogs\.com)\b/.test(m) && !/\b(evento|festival|cartel)\b/.test(m)) {
    return 'vinyl'
  }
  if (
    /\b(essential mix|soundcloud\.com|on\.soundcloud|youtu\.be|youtube\.com)\b/.test(m) &&
    !/\b(evento|festival|cartel|vinyl|vinilo|discogs)\b/.test(m)
  ) {
    return 'mix'
  }
  if (
    /\b(artista|artistas|ficha de|bio de|\bdj\b)\b/.test(m) &&
    !/\b(sello|evento|festival|cartel|vinyl|vinilo)\b/.test(m)
  ) {
    return 'artist'
  }
  if (/\b(evento|eventos|festival|cartel|flyer|entradas|monsterticket|dice\.fm)\b/.test(m)) {
    return 'event'
  }
  return null
}

/** Si hay intención forzada, descarta actions de otro tipo (p. ej. event cuando pedían sello). */
export function filterActionsByIntent(actions: ChatAction[], intent: ChatIntent | null): ChatAction[] {
  if (!intent) return actions
  return actions.filter((a) => a.type === intent)
}

export async function planChatWithOpenAI(opts: {
  message: string
  history: ChatHistoryItem[]
  imageDataUrls: { mime: string; dataUrl: string; publicUrl?: string }[]
  attachedPublicUrls: string[]
  /** Modo elegido en la UI; fuerza el type de action principal. */
  intent?: ChatIntent | null
}): Promise<{ plan: ChatPlan; facts: ScreenshotFacts | null }> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) throw new Error('OPENAI_API_KEY no configurada')

  const systemPrompt = loadSystemPrompt()
  const intent = opts.intent ?? inferChatIntent(opts.message)
  const treatAsEvent = !intent || intent === 'event'
  // Visión: forzar modelo con imagen; OPENAI_MODEL a veces es un modelo sin vision fiable
  const visionModel =
    process.env.OPENAI_CHAT_MODEL?.trim() ||
    process.env.OPENAI_VISION_MODEL?.trim() ||
    'gpt-5.6-terra'
  const hasImages = opts.imageDataUrls.length > 0 || opts.attachedPublicUrls.length > 0

  let screenshotFacts: ScreenshotFacts | null = null
  let webContext = ''

  // OCR de cartel solo cuando el modo es evento (o sin modo): evita clasificar un Beatport como fiesta
  if (opts.imageDataUrls.length > 0 && treatAsEvent) {
    screenshotFacts = await extractScreenshotFacts({
      openaiKey,
      model: visionModel,
      message: opts.message,
      imageDataUrls: opts.imageDataUrls.slice(0, 2),
    })
  }

  const q =
    screenshotFacts?.search_query?.trim() ||
    [
      screenshotFacts?.event_name,
      screenshotFacts?.city,
      screenshotFacts?.date_start?.slice(0, 4) || screenshotFacts?.date_text,
      treatAsEvent ? 'entradas festival club event lineup' : '',
    ]
    .filter(Boolean)
    .join(' ')
    .trim() ||
    (opts.message.match(/https?:\/\/\S+/i)
      ? opts.message.match(/https?:\/\/\S+/i)?.[0] || ''
      : opts.message
          .replace(/https?:\/\/\S+/gi, '')
          .trim()
          .slice(0, 120))
  let webSource: 'openai' | 'serpapi' | 'none' = 'none'
  // Investigación web de eventos solo en modo evento; en NR/vinyl suele bastar el link
  if (q && q.length > 3 && (treatAsEvent || /https?:\/\//i.test(opts.message))) {
    const research = await fetchWebResearchContext(
      q,
      treatAsEvent ? { prompt: EVENT_WEB_SEARCH_PROMPT(q) } : undefined,
    )
    webContext = research.context
    webSource = research.source
  }

  const historyMsgs = opts.history.slice(-6).map((h) => ({
    role: h.role as 'user' | 'assistant',
    content: h.content,
  }))

  const userParts: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: 'high' | 'low' | 'auto' } }
  > = []

  const defaultNoText = treatAsEvent
    ? '(sin texto; solo captura/imagen — trata como alta de evento desde cartel)'
    : `(sin texto; solo captura/imagen — modo forzado: ${intent})`

  let text = ''
  if (intent) {
    text += `INTENCIÓN DEL EDITOR (UI — OBLIGATORIA): type="${intent}".
Genera actions de ese tipo. No uses "event" salvo que intent sea "event".
Si faltan datos críticos, reply pidiendo el dato y deja actions vacío.
`
  }
  text += `MENSAJE DEL EDITOR:\n${opts.message || defaultNoText}\n`
  if (opts.attachedPublicUrls.length) {
    text += `\nIMÁGENES SUBIDAS (Storage)${treatAsEvent ? '. En action event usa use_attached_image=true' : ''}:\n`
    opts.attachedPublicUrls.forEach((u, i) => {
      text += `${i + 1}. ${u}\n`
    })
  }
  if (screenshotFacts) {
    text += `\nHECHOS YA LEÍDOS DE LA CAPTURA (OCR previo; priorízalos):\n${JSON.stringify(screenshotFacts, null, 2)}\n`
  }
  if (webContext) {
    text += `\nCONTEXTO WEB (${webSource === 'openai' ? 'OpenAI web_search' : 'SerpAPI fallback'}; puede tener errores; no inventes URLs que no aparezcan):\n---\n${webContext}\n---\n`
  } else if (hasImages) {
    text += `\n(Sin contexto web. Completa solo con lo legible en la imagen y el mensaje.)\n`
  }
  text += `\nHoy (UTC): ${new Date().toISOString().slice(0, 10)}\n`
  if (treatAsEvent) {
    text += `OBLIGATORIO: si hay cartel/evento identificable, actions DEBE incluir al menos un objeto { "type":"event", "slug":"...", "name":"...", "use_attached_image":true, "enrich":true, ...campos }.\n`
  } else {
    text += `OBLIGATORIO: actions deben ser type="${intent}" (no inventes evento).\n`
  }
  text += `No respondas solo con reply. Devuelve SOLO el JSON del plan.`
  userParts.push({ type: 'text', text })

  // Si ya hay OCR, no reenviar 3 capturas (payload enorme / timeouts). Solo 1 de apoyo.
  const shouldAttachImage =
    opts.imageDataUrls[0] &&
    (treatAsEvent ? !screenshotFacts?.event_name : true)
  if (shouldAttachImage && opts.imageDataUrls[0]) {
    userParts.push({
      type: 'image_url',
      image_url: { url: opts.imageDataUrls[0].dataUrl, detail: 'high' },
    })
  }

  const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify(
      openAiChatCompletionsBody({
        model: visionModel,
        temperature: 0.1,
        maxCompletionTokens: 8000,
        responseFormat: { type: 'json_object' },
        messages: [
          { role: 'system', content: systemPrompt },
          ...historyMsgs,
          { role: 'user', content: userParts },
        ],
      }),
    ),
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

  if (opts.attachedPublicUrls.length) {
    plan.actions = plan.actions.map((a) => {
      if (a && typeof a === 'object' && a.type === 'event') {
        return { ...a, use_attached_image: true, enrich: a.enrich !== false }
      }
      return a
    })
  }

  // Fallback duro: solo en modo evento (o sin intención)
  const hasEvent = plan.actions.some((a) => a.type === 'event')
  if (treatAsEvent && !hasEvent && screenshotFacts?.event_name) {
    const fallback = eventActionFromScreenshotFacts(screenshotFacts)
    if (fallback) {
      plan.actions = [fallback, ...plan.actions]
      if (!plan.reply || /posible|intent|intentar/i.test(plan.reply)) {
        plan.reply = `He leído el cartel «${fallback.name}» y lo guardo en la base de datos.`
      }
    }
  }

  // Guardrail: con intención (UI o inferida), nunca ejecutar otro tipo (p. ej. event por sello)
  if (intent) {
    const before = plan.actions.length
    const wrong = plan.actions.filter((a) => a.type !== intent)
    plan.actions = filterActionsByIntent(plan.actions, intent)
    if (before > 0 && plan.actions.length === 0 && wrong.length) {
      const wrongTypes = Array.from(new Set(wrong.map((a) => a.type))).join(', ')
      plan.reply = [
        plan.reply,
        `He descartado acciones incorrectas (${wrongTypes}): pediste ${intent}, no eso.`,
      ]
        .filter(Boolean)
        .join('\n')
    }
  }

  return { plan, facts: screenshotFacts }
}
