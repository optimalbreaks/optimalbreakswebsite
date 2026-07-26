/**
 * Agente conversacional admin: OpenAI tool-calling + pending_ops (confirmación antes de escribir).
 */
import { readFileSync, existsSync } from 'fs'
import path from 'path'
import { createServiceSupabase } from '@/lib/supabase-admin'
import {
  executeChatActions,
  extractScreenshotFacts,
  fetchWebResearchContext,
  normalizeChatActions,
  toSlug,
  type ActionResult,
  type ChatAction,
  type ChatHistoryItem,
  type ChatIntent,
} from '@/lib/admin-chat'

/** Cliente tipado laxo: tablas nuevas (062) + from(table dinámica) rompen el genérico Database. */
function sbLoose() {
  return createServiceSupabase() as unknown as {
    from: (table: string) => {
      select: (cols?: string, opts?: object) => any
      insert: (row: unknown) => any
      update: (fields: unknown) => any
      delete: () => any
    }
  }
}

const ALLOWED_TABLES = [
  'artists',
  'labels',
  'events',
  'blog_posts',
  'scenes',
  'mixes',
  'history_entries',
] as const
type AllowedTable = (typeof ALLOWED_TABLES)[number]

const SEARCH_COL: Record<AllowedTable, string> = {
  artists: 'name',
  labels: 'name',
  events: 'name',
  blog_posts: 'title_en',
  scenes: 'name_en',
  mixes: 'title',
  history_entries: 'title_en',
}

const MAX_TOOL_ROUNDS = 10
const SQL_MAX_CHARS = 8_000
const SQL_ROW_LIMIT = 50

export type PendingOp =
  | {
      kind: 'chat_action'
      summary: string
      action: ChatAction
      attached_urls?: string[]
    }
  | {
      kind: 'db_insert'
      summary: string
      table: AllowedTable
      row: Record<string, unknown>
    }
  | {
      kind: 'db_update'
      summary: string
      table: AllowedTable
      id: string
      fields: Record<string, unknown>
    }
  | {
      kind: 'db_delete'
      summary: string
      table: AllowedTable
      id: string
    }
  | {
      kind: 'sql_write'
      summary: string
      sql: string
    }
  | {
      kind: 'agent_api'
      summary: string
      path: string
      body: Record<string, unknown>
    }

export type ToolTraceItem = { name: string; ok: boolean; detail: string }

export type AgentTurnResult = {
  reply: string
  pending_ops: PendingOp[]
  tool_trace: ToolTraceItem[]
  results?: ActionResult[]
  ok: boolean
}

function loadAgentSystemPrompt(): string {
  const p = path.resolve(process.cwd(), 'scripts', 'prompts', 'admin-chat-system.txt')
  if (existsSync(p)) return readFileSync(p, 'utf8').trim()
  return 'Eres el asistente editorial admin de Optimal Breaks. Usa tools. No escribas en BD sin confirmación del editor.'
}

function isAllowedTable(t: string): t is AllowedTable {
  return (ALLOWED_TABLES as readonly string[]).includes(t)
}

function summarizeOp(op: PendingOp): string {
  return op.summary
}

export function pendingOpsSummary(ops: PendingOp[]): string {
  if (!ops.length) return ''
  return ops.map((o, i) => `${i + 1}. ${summarizeOp(o)}`).join('\n')
}

export function looksLikeConfirm(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t) return false
  // Solo afirmaciones cortas (evita «sí pero cambia el slug…» → debe ir al agente)
  if (t.length > 48) return false
  return /^(sí|si|ok|vale|confirmo|confirma|confirmar|adelante|hazlo|guarda|guardar|yes|yep|go)([.!?\s]|$)/.test(
    t,
  )
}

export function looksLikeCancel(text: string): boolean {
  const t = text.trim().toLowerCase()
  if (!t || t.length > 48) return false
  return /^(cancel|cancela|cancelar|descarta|descartar|olvida|stop)([.!?\s]|$)/.test(t)
}

/**
 * pending_ops del último mensaje assistant del hilo.
 * Solo cuenta el más reciente: si ya se confirmó (pending vacío), NO reutiliza ops antiguas.
 */
export async function loadLatestPendingOps(opts: {
  userId: string
  threadId: string
}): Promise<PendingOp[]> {
  const data = await loadChatThread({ userId: opts.userId, threadId: opts.threadId })
  if (!data?.messages?.length) return []
  for (let i = data.messages.length - 1; i >= 0; i--) {
    const m = data.messages[i]
    if (m.role !== 'assistant') continue
    const ops = m.pending_ops
    if (Array.isArray(ops) && ops.length > 0) return ops as PendingOp[]
    return []
  }
  return []
}

async function adminPost(
  originRequest: Request,
  pathName: string,
  body: unknown,
): Promise<{ ok: boolean; status: number; json: Record<string, unknown> }> {
  const url = new URL(pathName, originRequest.url)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        cookie: originRequest.headers.get('cookie') || '',
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(120_000),
    })
    const json = (await res.json().catch(() => ({}))) as Record<string, unknown>
    return { ok: res.ok, status: res.status, json }
  } catch (e) {
    return {
      ok: false,
      status: 502,
      json: { error: e instanceof Error ? e.message : String(e) },
    }
  }
}

function getPgConnectionString(): string {
  const keys = [
    'DATABASE_URL',
    'DIRECT_URL',
    'SUPABASE_DB_URL',
    'POSTGRES_URL',
    'POSTGRES_URL_NON_POOLING',
    'SUPABASE_POSTGRES_URL',
    'POSTGRES_PRISMA_URL',
    'SUPABASE_DATABASE_URL',
  ]
  for (const k of keys) {
    const v = process.env[k]?.trim()
    if (v) return v
  }
  const password = (
    process.env.SUPABASE_DB_PASSWORD ||
    process.env.POSTGRES_PASSWORD ||
    process.env.PGPASSWORD ||
    ''
  ).trim()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL || ''
  const m = url.match(/https?:\/\/([a-z0-9-]+)\.supabase\.co/i)
  if (password && m) {
    return `postgresql://postgres:${encodeURIComponent(password)}@db.${m[1]}.supabase.co:5432/postgres`
  }
  return ''
}

async function runSql(sql: string, readOnly: boolean): Promise<{ ok: boolean; detail: unknown }> {
  const connectionString = getPgConnectionString()
  if (!connectionString) {
    return {
      ok: false,
      detail: {
        error:
          'SQL no disponible: falta DATABASE_URL (o SUPABASE_DB_PASSWORD + NEXT_PUBLIC_SUPABASE_URL). Usa tools de catálogo/CRUD REST.',
      },
    }
  }
  const trimmed = sql.trim().replace(/;+\s*$/, '')
  if (!trimmed || trimmed.length > SQL_MAX_CHARS) {
    return { ok: false, detail: { error: 'SQL vacío o demasiado largo' } }
  }
  if (trimmed.includes(';')) {
    return { ok: false, detail: { error: 'Solo un statement (sin ; intermedios)' } }
  }
  if (readOnly) {
    if (!/^\s*select\b/i.test(trimmed) && !/^\s*with\b/i.test(trimmed)) {
      return { ok: false, detail: { error: 'db_sql_read solo admite SELECT/WITH' } }
    }
  } else if (/^\s*select\b/i.test(trimmed)) {
    return { ok: false, detail: { error: 'Usa db_sql_read para SELECT' } }
  }

  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const pg = require('pg') as {
    Client: new (c: object) => {
      connect: () => Promise<void>
      query: (s: string) => Promise<{ rowCount: number | null; rows: unknown[]; command: string }>
      end: () => Promise<void>
    }
  }
  const client = new pg.Client({
    connectionString,
    ssl: { rejectUnauthorized: false },
    statement_timeout: 15_000,
  })
  try {
    await client.connect()
    const finalSql = readOnly
      ? `SELECT * FROM (${trimmed}) AS _ob_q LIMIT ${SQL_ROW_LIMIT}`
      : trimmed
    const res = await client.query(finalSql)
    return {
      ok: true,
      detail: {
        rowCount: res.rowCount,
        rows: readOnly ? res.rows : res.rows?.slice?.(0, 20) ?? [],
        command: res.command,
      },
    }
  } catch (e) {
    return { ok: false, detail: { error: e instanceof Error ? e.message : String(e) } }
  } finally {
    await client.end().catch(() => {})
  }
}

const TOOL_DEFINITIONS = [
  {
    type: 'function' as const,
    function: {
      name: 'search_catalog',
      description: 'Buscar en artists, labels, events o mixes por nombre/slug.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: ['artists', 'labels', 'events', 'mixes'] },
          query: { type: 'string' },
          limit: { type: 'number' },
        },
        required: ['table', 'query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'get_record',
      description: 'Leer una ficha por tabla + slug o id.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: [...ALLOWED_TABLES] },
          slug: { type: 'string' },
          id: { type: 'string' },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'web_search',
      description: 'Investigar en la web (evento, sello, artista, etc.).',
      parameters: {
        type: 'object',
        properties: { query: { type: 'string' } },
        required: ['query'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'read_image_facts',
      description: 'OCR/visión de capturas adjuntas en este turno (carteles, etc.).',
      parameters: {
        type: 'object',
        properties: { focus: { type: 'string', description: 'Qué buscar en la imagen' } },
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_upsert_artist',
      description: 'Preparar alta/actualización de artista (requiere confirmación del editor).',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
          notes: { type: 'string' },
          search: { type: 'boolean' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_upsert_label',
      description: 'Preparar alta/actualización de SELLO discográfico (no evento). Requiere confirmación.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
          notes: { type: 'string' },
          search: { type: 'boolean' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_upsert_event',
      description:
        'Preparar alta/actualización de EVENTO/fiesta. Requiere confirmación. date_start/date_end en YYYY-MM-DD; si el cartel no trae año, usa la próxima fecha futura (nunca un año pasado).',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          name: { type: 'string' },
          country: { type: 'string' },
          city: { type: 'string' },
          venue: { type: 'string' },
          address: { type: 'string' },
          date_start: {
            type: 'string',
            description: 'YYYY-MM-DD futuro. Sin año en el cartel → próximo día/mes desde hoy.',
          },
          date_end: { type: 'string' },
          event_type: { type: 'string' },
          lineup: { type: 'array', items: { type: 'string' } },
          website: { type: 'string' },
          tickets_url: { type: 'string' },
          description_es: { type: 'string' },
          description_en: { type: 'string' },
          tags: { type: 'array', items: { type: 'string' } },
          enrich: { type: 'boolean' },
          use_attached_image: { type: 'boolean' },
        },
        required: ['name'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_upsert_mix',
      description: 'Preparar upsert de mix (YouTube/SoundCloud). Requiere confirmación.',
      parameters: {
        type: 'object',
        properties: {
          slug: { type: 'string' },
          title: { type: 'string' },
          artist_name: { type: 'string' },
          platform: { type: 'string' },
          mix_type: { type: 'string' },
          video_url: { type: 'string' },
          embed_url: { type: 'string' },
          year: { type: 'number' },
          description_es: { type: 'string' },
          description_en: { type: 'string' },
        },
        required: ['title'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_new_releases',
      description: 'Preparar import New Releases desde URLs Beatport /track o /release. Requiere confirmación.',
      parameters: {
        type: 'object',
        properties: {
          urls_text: { type: 'string', description: 'Una URL por línea' },
          default_week_date: { type: 'string' },
        },
        required: ['urls_text'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_vinyl_picks',
      description: 'Preparar vinyl picks de una semana. Requiere confirmación.',
      parameters: {
        type: 'object',
        properties: {
          week_date: { type: 'string' },
          items: { type: 'array', items: { type: 'object' } },
        },
        required: ['week_date', 'items'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_enrich_event',
      description: 'Encolar enriquecimiento web de un evento existente (tras confirmación).',
      parameters: {
        type: 'object',
        properties: { slug: { type: 'string' } },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_event_poster',
      description: 'Encolar búsqueda de cartel oficial para un evento (tras confirmación).',
      parameters: {
        type: 'object',
        properties: { slug: { type: 'string' } },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_artist_photo',
      description: 'Encolar foto de artista (tras confirmación).',
      parameters: {
        type: 'object',
        properties: { slug: { type: 'string' } },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_label_logo',
      description: 'Encolar logo de sello (tras confirmación).',
      parameters: {
        type: 'object',
        properties: { slug: { type: 'string' } },
        required: ['slug'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'db_list',
      description: 'Listar filas de una tabla admin (lectura).',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: [...ALLOWED_TABLES] },
          search: { type: 'string' },
          limit: { type: 'number' },
          page: { type: 'number' },
        },
        required: ['table'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'db_get',
      description: 'GET por id en tabla admin.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: [...ALLOWED_TABLES] },
          id: { type: 'string' },
        },
        required: ['table', 'id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_db_insert',
      description: 'Preparar INSERT genérico (requiere confirmación).',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: [...ALLOWED_TABLES] },
          row: { type: 'object' },
        },
        required: ['table', 'row'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_db_update',
      description: 'Preparar UPDATE genérico por id (requiere confirmación).',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: [...ALLOWED_TABLES] },
          id: { type: 'string' },
          fields: { type: 'object' },
        },
        required: ['table', 'id', 'fields'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_db_delete',
      description: 'Preparar DELETE por id (requiere confirmación). Destructivo.',
      parameters: {
        type: 'object',
        properties: {
          table: { type: 'string', enum: [...ALLOWED_TABLES] },
          id: { type: 'string' },
        },
        required: ['table', 'id'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'db_sql_read',
      description: 'Ejecutar SELECT/WITH de solo lectura (máx 50 filas). Requiere DATABASE_URL.',
      parameters: {
        type: 'object',
        properties: { sql: { type: 'string' } },
        required: ['sql'],
      },
    },
  },
  {
    type: 'function' as const,
    function: {
      name: 'stage_db_sql_write',
      description: 'Preparar SQL de escritura (INSERT/UPDATE/DELETE…). Siempre requiere confirmación.',
      parameters: {
        type: 'object',
        properties: {
          sql: { type: 'string' },
          summary: { type: 'string' },
        },
        required: ['sql'],
      },
    },
  },
]

type ToolCtx = {
  originRequest: Request
  pendingOps: PendingOp[]
  imageDataUrls: { mime: string; dataUrl: string; publicUrl?: string }[]
  attachedPublicUrls: string[]
  userMessage: string
}

async function runTool(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolCtx,
): Promise<{ ok: boolean; detail: unknown }> {
  const sb = sbLoose()

  if (name === 'search_catalog') {
    const table = String(args.table || '')
    const query = String(args.query || '').trim()
    const limit = Math.min(30, Math.max(1, Number(args.limit) || 12))
    if (!isAllowedTable(table) || !['artists', 'labels', 'events', 'mixes'].includes(table)) {
      return { ok: false, detail: { error: 'tabla inválida' } }
    }
    const col = SEARCH_COL[table]
    const safe = query.replace(/[%_,]/g, ' ').trim()
    let q = sb.from(table).select('*').limit(limit)
    if (safe) {
      q = q.ilike(col, `%${safe}%`)
    }
    const { data, error } = await q
    if (error) return { ok: false, detail: { error: error.message } }
    // Compactar filas para el modelo
    const rows = ((data || []) as Record<string, unknown>[]).map((o) => {
      return {
        id: o.id,
        slug: o.slug,
        name: o.name ?? o.title ?? null,
        city: o.city ?? null,
        date_start: o.date_start ?? null,
        country: o.country ?? null,
      }
    })
    return { ok: true, detail: { count: rows.length, rows } }
  }

  if (name === 'get_record') {
    const table = String(args.table || '')
    if (!isAllowedTable(table)) return { ok: false, detail: { error: 'tabla inválida' } }
    const id = args.id != null ? String(args.id) : ''
    const slug = args.slug != null ? String(args.slug) : ''
    let q = sb.from(table).select('*')
    if (id) q = q.eq('id', id)
    else if (slug) q = q.eq('slug', slug)
    else return { ok: false, detail: { error: 'falta slug o id' } }
    const { data, error } = await q.maybeSingle()
    if (error) return { ok: false, detail: { error: error.message } }
    return { ok: true, detail: data }
  }

  if (name === 'web_search') {
    const query = String(args.query || '').trim()
    if (!query) return { ok: false, detail: { error: 'query vacío' } }
    const research = await fetchWebResearchContext(query)
    return {
      ok: Boolean(research.context),
      detail: { source: research.source, context: research.context.slice(0, 10_000) },
    }
  }

  if (name === 'read_image_facts') {
    if (!ctx.imageDataUrls.length) {
      return { ok: false, detail: { error: 'No hay imágenes en este turno' } }
    }
    const openaiKey = process.env.OPENAI_API_KEY?.trim()
    if (!openaiKey) return { ok: false, detail: { error: 'OPENAI_API_KEY no configurada' } }
    const model =
      process.env.OPENAI_CHAT_MODEL?.trim() ||
      process.env.OPENAI_VISION_MODEL?.trim() ||
      'gpt-4o'
    const focus = String(args.focus || ctx.userMessage || '')
    const facts = await extractScreenshotFacts({
      openaiKey,
      model,
      message: focus,
      imageDataUrls: ctx.imageDataUrls.slice(0, 2),
    })
    return { ok: Boolean(facts), detail: facts }
  }

  const stageChat = (action: ChatAction, summary: string) => {
    const op: PendingOp = {
      kind: 'chat_action',
      summary,
      action,
      attached_urls: ctx.attachedPublicUrls.length ? ctx.attachedPublicUrls : undefined,
    }
    ctx.pendingOps.push(op)
    return { ok: true, detail: { staged: true, summary, pending_count: ctx.pendingOps.length } }
  }

  if (name === 'stage_upsert_artist') {
    const nameA = String(args.name || '').trim()
    const slug = toSlug(String(args.slug || nameA))
    if (!nameA) return { ok: false, detail: { error: 'name requerido' } }
    return stageChat(
      {
        type: 'artist',
        slug,
        name: nameA,
        notes: args.notes != null ? String(args.notes) : undefined,
        search: args.search !== false,
      },
      `Upsert artista «${nameA}» (${slug})`,
    )
  }

  if (name === 'stage_upsert_label') {
    const nameL = String(args.name || '').trim()
    const slug = toSlug(String(args.slug || nameL))
    if (!nameL) return { ok: false, detail: { error: 'name requerido' } }
    return stageChat(
      {
        type: 'label',
        slug,
        name: nameL,
        notes: args.notes != null ? String(args.notes) : undefined,
        search: args.search !== false,
      },
      `Upsert sello «${nameL}» (${slug})`,
    )
  }

  if (name === 'stage_upsert_event') {
    const parsed = normalizeChatActions([{ type: 'event', ...args }])
    const action = parsed[0]
    if (!action || action.type !== 'event') {
      return { ok: false, detail: { error: 'evento inválido' } }
    }
    if (ctx.attachedPublicUrls.length) {
      action.use_attached_image = action.use_attached_image !== false
    }
    return stageChat(action, `Upsert evento «${action.name}» (${action.slug})`)
  }

  if (name === 'stage_upsert_mix') {
    const parsed = normalizeChatActions([{ type: 'mix', ...args }])
    const action = parsed[0]
    if (!action || action.type !== 'mix') return { ok: false, detail: { error: 'mix inválido' } }
    return stageChat(action, `Upsert mix «${action.title}» (${action.slug})`)
  }

  if (name === 'stage_new_releases') {
    const urls_text = String(args.urls_text || '').trim()
    if (!urls_text) return { ok: false, detail: { error: 'urls_text vacío' } }
    return stageChat(
      {
        type: 'new_release',
        urls_text,
        default_week_date: args.default_week_date != null ? String(args.default_week_date) : null,
        create_edition_if_missing: true,
      },
      `Import New Releases (${urls_text.split(/\n/).filter(Boolean).length} URL(s))`,
    )
  }

  if (name === 'stage_vinyl_picks') {
    const parsed = normalizeChatActions([
      {
        type: 'vinyl',
        week_date: args.week_date,
        items: args.items,
        create_edition_if_missing: true,
      },
    ])
    const action = parsed[0]
    if (!action || action.type !== 'vinyl') return { ok: false, detail: { error: 'vinyl inválido' } }
    return stageChat(
      action,
      `Vinyl picks semana ${action.week_date} (${action.items.length} ítem(s))`,
    )
  }

  if (name === 'stage_enrich_event') {
    const slug = toSlug(String(args.slug || ''))
    if (!slug) return { ok: false, detail: { error: 'slug' } }
    ctx.pendingOps.push({
      kind: 'agent_api',
      summary: `Enriquecer evento ${slug}`,
      path: '/api/admin/agent/event',
      body: { slug },
    })
    return { ok: true, detail: { staged: true, slug } }
  }

  if (name === 'stage_event_poster') {
    const slug = toSlug(String(args.slug || ''))
    if (!slug) return { ok: false, detail: { error: 'slug' } }
    ctx.pendingOps.push({
      kind: 'agent_api',
      summary: `Cartel oficial evento ${slug}`,
      path: '/api/admin/agent/event-poster',
      body: { slug, light: true },
    })
    return { ok: true, detail: { staged: true, slug } }
  }

  if (name === 'stage_artist_photo') {
    const slug = toSlug(String(args.slug || ''))
    if (!slug) return { ok: false, detail: { error: 'slug' } }
    ctx.pendingOps.push({
      kind: 'agent_api',
      summary: `Foto artista ${slug}`,
      path: '/api/admin/agent/artist-photo',
      body: { slug },
    })
    return { ok: true, detail: { staged: true, slug } }
  }

  if (name === 'stage_label_logo') {
    const slug = toSlug(String(args.slug || ''))
    if (!slug) return { ok: false, detail: { error: 'slug' } }
    ctx.pendingOps.push({
      kind: 'agent_api',
      summary: `Logo sello ${slug}`,
      path: '/api/admin/agent/label-logo',
      body: { slug },
    })
    return { ok: true, detail: { staged: true, slug } }
  }

  if (name === 'db_list') {
    const table = String(args.table || '')
    if (!isAllowedTable(table)) return { ok: false, detail: { error: 'tabla' } }
    const limit = Math.min(50, Math.max(1, Number(args.limit) || 20))
    const page = Math.max(1, Number(args.page) || 1)
    const search = String(args.search || '').trim()
    const from = (page - 1) * limit
    let q = sb.from(table).select('*', { count: 'exact' })
    if (search) q = q.ilike(SEARCH_COL[table], `%${search}%`)
    const { data, error, count } = await q.range(from, from + limit - 1)
    if (error) return { ok: false, detail: { error: error.message } }
    return { ok: true, detail: { count, page, rows: data } }
  }

  if (name === 'db_get') {
    const table = String(args.table || '')
    const id = String(args.id || '')
    if (!isAllowedTable(table) || !id) return { ok: false, detail: { error: 'tabla/id' } }
    const { data, error } = await sb.from(table).select('*').eq('id', id).maybeSingle()
    if (error) return { ok: false, detail: { error: error.message } }
    return { ok: true, detail: data }
  }

  if (name === 'stage_db_insert') {
    const table = String(args.table || '')
    const row = (args.row && typeof args.row === 'object' ? args.row : null) as Record<
      string,
      unknown
    > | null
    if (!isAllowedTable(table) || !row) return { ok: false, detail: { error: 'tabla/row' } }
    const label = String(row.name || row.title || row.slug || table)
    ctx.pendingOps.push({
      kind: 'db_insert',
      summary: `INSERT ${table}: ${label}`,
      table,
      row,
    })
    return { ok: true, detail: { staged: true } }
  }

  if (name === 'stage_db_update') {
    const table = String(args.table || '')
    const id = String(args.id || '')
    const fields = (args.fields && typeof args.fields === 'object' ? args.fields : null) as Record<
      string,
      unknown
    > | null
    if (!isAllowedTable(table) || !id || !fields) {
      return { ok: false, detail: { error: 'tabla/id/fields' } }
    }
    ctx.pendingOps.push({
      kind: 'db_update',
      summary: `UPDATE ${table} id=${id}`,
      table,
      id,
      fields,
    })
    return { ok: true, detail: { staged: true } }
  }

  if (name === 'stage_db_delete') {
    const table = String(args.table || '')
    const id = String(args.id || '')
    if (!isAllowedTable(table) || !id) return { ok: false, detail: { error: 'tabla/id' } }
    ctx.pendingOps.push({
      kind: 'db_delete',
      summary: `DELETE ${table} id=${id}`,
      table,
      id,
    })
    return { ok: true, detail: { staged: true } }
  }

  if (name === 'db_sql_read') {
    return runSql(String(args.sql || ''), true)
  }

  if (name === 'stage_db_sql_write') {
    const sql = String(args.sql || '').trim()
    if (!sql) return { ok: false, detail: { error: 'sql vacío' } }
    const summary = String(args.summary || `SQL write: ${sql.slice(0, 80)}`)
    ctx.pendingOps.push({ kind: 'sql_write', summary, sql })
    return { ok: true, detail: { staged: true, summary } }
  }

  return { ok: false, detail: { error: `Tool desconocida: ${name}` } }
}

export async function executePendingOps(
  ops: PendingOp[],
  originRequest: Request,
): Promise<ActionResult[]> {
  const results: ActionResult[] = []
  const sb = sbLoose()

  for (const op of ops) {
    try {
      if (op.kind === 'chat_action') {
        const action = op.action
        if (!action || typeof action !== 'object' || !('type' in action)) {
          results.push({
            type: 'chat_action',
            ok: false,
            summary: `Op inválida (sin action): ${op.summary || '?'}`,
          })
          continue
        }
        const r = await executeChatActions(
          [action],
          originRequest,
          op.attached_urls || [],
        )
        if (!r.length) {
          results.push({
            type: String((action as { type?: string }).type || 'chat_action'),
            ok: false,
            summary: `Sin resultado al ejecutar: ${op.summary}`,
          })
        } else {
          results.push(...r)
        }
        continue
      }
      if (op.kind === 'db_insert') {
        const { data, error } = await sb.from(op.table).insert(op.row).select().single()
        results.push({
          type: 'db_insert',
          ok: !error,
          summary: error ? error.message : op.summary,
          detail: data,
        })
        continue
      }
      if (op.kind === 'db_update') {
        const { data, error } = await sb
          .from(op.table)
          .update(op.fields)
          .eq('id', op.id)
          .select()
          .single()
        results.push({
          type: 'db_update',
          ok: !error,
          summary: error ? error.message : op.summary,
          detail: data,
        })
        continue
      }
      if (op.kind === 'db_delete') {
        const { error } = await sb.from(op.table).delete().eq('id', op.id)
        results.push({
          type: 'db_delete',
          ok: !error,
          summary: error ? error.message : op.summary,
        })
        continue
      }
      if (op.kind === 'sql_write') {
        const r = await runSql(op.sql, false)
        results.push({
          type: 'sql_write',
          ok: r.ok,
          summary: r.ok ? op.summary : String((r.detail as { error?: string })?.error || 'SQL falló'),
          detail: r.detail,
        })
        continue
      }
      if (op.kind === 'agent_api') {
        const { ok, json, status } = await adminPost(originRequest, op.path, op.body)
        results.push({
          type: 'agent_api',
          ok,
          summary: ok
            ? op.summary
            : `${op.summary}: ${String(json.error || status)}`,
          detail: json,
        })
      }
    } catch (e) {
      results.push({
        type: op.kind,
        ok: false,
        summary: e instanceof Error ? e.message : String(e),
      })
    }
  }
  return results
}

type OaiMsg =
  | { role: 'system' | 'user' | 'assistant'; content: string | unknown }
  | {
      role: 'assistant'
      content: string | null
      tool_calls: Array<{
        id: string
        type: 'function'
        function: { name: string; arguments: string }
      }>
    }
  | { role: 'tool'; tool_call_id: string; content: string }

export async function runAdminChatAgent(opts: {
  message: string
  history: ChatHistoryItem[]
  intent?: ChatIntent | null
  imageDataUrls: { mime: string; dataUrl: string; publicUrl?: string }[]
  attachedPublicUrls: string[]
  originRequest: Request
}): Promise<AgentTurnResult> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) throw new Error('OPENAI_API_KEY no configurada')

  const model =
    process.env.OPENAI_CHAT_MODEL?.trim() ||
    process.env.OPENAI_AGENT_MODEL?.trim() ||
    process.env.OPENAI_MODEL?.trim() ||
    'gpt-4o'

  const pendingOps: PendingOp[] = []
  const toolTrace: ToolTraceItem[] = []
  const ctx: ToolCtx = {
    originRequest: opts.originRequest,
    pendingOps,
    imageDataUrls: opts.imageDataUrls,
    attachedPublicUrls: opts.attachedPublicUrls,
    userMessage: opts.message,
  }

  let system = loadAgentSystemPrompt()
  system += `

## Modo agente (obligatorio)
- Eres un chatbot conversacional. Puedes preguntar, aclarar y explicar.
- Usa tools para LEER la BD y la web cuando haga falta.
- Las tools stage_* / stage_db_* / stage_db_sql_write NO escriben: preparan operaciones.
- Cuando hayas preparado cambios, resume en español qué harás y pide al editor que pulse Confirmar (o diga «sí»).
- NUNCA digas que ya guardaste en BD hasta que el sistema te confirme tras el botón Confirmar.
- Distingue entidades: sello (label) ≠ evento ≠ artista ≠ mix ≠ new_release ≠ vinyl.
`

  if (opts.intent) {
    system += `\nHINT UI del editor (prioridad alta): intent=${opts.intent}. Prefiere tools de ese tipo.\n`
  }
  if (opts.attachedPublicUrls.length) {
    system += `\nImágenes de este turno (Storage):\n${opts.attachedPublicUrls.map((u, i) => `${i + 1}. ${u}`).join('\n')}\n`
  }
  if (looksLikeConfirm(opts.message)) {
    system += `\nEl editor acaba de afirmar («${opts.message.trim()}»). OBLIGATORIO en este turno: llama a stage_* con la entidad del historial (sello/artista/evento/…). No digas que no hay operaciones pendientes ni vuelvas a preguntar si lo añade.\n`
  }

  const userParts: Array<
    | { type: 'text'; text: string }
    | { type: 'image_url'; image_url: { url: string; detail?: string } }
  > = [{ type: 'text', text: opts.message || '(sin texto; hay captura adjunta)' }]
  for (const img of opts.imageDataUrls.slice(0, 2)) {
    userParts.push({
      type: 'image_url',
      image_url: { url: img.dataUrl, detail: 'high' },
    })
  }

  const messages: OaiMsg[] = [
    { role: 'system', content: system },
    ...opts.history.slice(-16).map((h) => ({
      role: h.role as 'user' | 'assistant',
      content: h.content,
    })),
    {
      role: 'user',
      content: userParts.length === 1 ? opts.message || '(captura)' : userParts,
    },
  ]

  let finalReply = ''

  for (let round = 0; round < MAX_TOOL_ROUNDS; round++) {
    const oaiRes = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${openaiKey}`,
      },
      body: JSON.stringify({
        model,
        temperature: 0.2,
        tools: TOOL_DEFINITIONS,
        tool_choice: 'auto',
        messages,
      }),
      signal: AbortSignal.timeout(120_000),
    })

    if (!oaiRes.ok) {
      const errText = await oaiRes.text()
      throw new Error(`OpenAI ${oaiRes.status}: ${errText.slice(0, 500)}`)
    }

    const oaiData = await oaiRes.json()
    const choice = oaiData.choices?.[0]?.message
    if (!choice) throw new Error('Respuesta vacía de OpenAI')

    const toolCalls = Array.isArray(choice.tool_calls) ? choice.tool_calls : []
    if (!toolCalls.length) {
      finalReply = String(choice.content || '').trim()
      break
    }

    messages.push({
      role: 'assistant',
      content: choice.content ?? null,
      tool_calls: toolCalls,
    })

    for (const tc of toolCalls) {
      const fn = tc.function?.name || 'unknown'
      let args: Record<string, unknown> = {}
      try {
        args = JSON.parse(tc.function?.arguments || '{}') as Record<string, unknown>
      } catch {
        args = {}
      }
      const result = await runTool(fn, args, ctx)
      toolTrace.push({
        name: fn,
        ok: result.ok,
        detail: result.ok
          ? String((result.detail as { summary?: string })?.summary || fn)
          : String((result.detail as { error?: string })?.error || 'error'),
      })
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        content: JSON.stringify(result.detail).slice(0, 12_000),
      })
    }
  }

  if (!finalReply) {
    finalReply = pendingOps.length
      ? 'He preparado operaciones. Revisa y pulsa Confirmar para guardarlas en la BD.'
      : 'Listo. ¿En qué más te ayudo?'
  }

  if (pendingOps.length) {
    // El modelo a menudo dice «he creado» aunque solo haya hecho stage (aún no hay fila).
    finalReply = finalReply
      .replace(/\bhe creado\b/gi, 'he preparado')
      .replace(/\bya (está|esta) (creado|guardado|en la bd|en la base)\b/gi, 'queda pendiente de confirmar')
      .replace(/\bguardado en (la )?bd\b/gi, 'preparado (aún no guardado)')
      .replace(/\bcreado el evento\b/gi, 'preparado el evento')
    const block = pendingOpsSummary(pendingOps)
    if (!/pendiente de confirmar/i.test(finalReply)) {
      finalReply = `${finalReply}\n\n———\nPendiente de confirmar (aún NO está en la BD):\n${block}\n\nPulsa «Confirmar y guardar» o responde «sí» para escribir en Supabase.`
    }
  }

  return {
    reply: finalReply,
    pending_ops: pendingOps,
    tool_trace: toolTrace,
    ok: true,
  }
}

/** Persistencia de hilos */
export async function ensureChatThread(opts: {
  userId: string
  threadId?: string | null
  title?: string
  intent?: string | null
}): Promise<string> {
  const sb = sbLoose()
  if (opts.threadId) {
    const { data } = await sb
      .from('admin_chat_threads')
      .select('id')
      .eq('id', opts.threadId)
      .eq('user_id', opts.userId)
      .maybeSingle()
    if (data?.id) {
      await sb
        .from('admin_chat_threads')
        .update({ updated_at: new Date().toISOString(), intent: opts.intent || null })
        .eq('id', data.id)
      return data.id as string
    }
  }
  const { data, error } = await sb
    .from('admin_chat_threads')
    .insert({
      user_id: opts.userId,
      title: opts.title || 'Chat editorial',
      intent: opts.intent || null,
    })
    .select('id')
    .single()
  if (error || !data?.id) throw new Error(error?.message || 'No se pudo crear hilo')
  return data.id as string
}

export async function appendChatMessages(opts: {
  threadId: string
  messages: Array<{
    role: 'user' | 'assistant' | 'system'
    content: string
    pending_ops?: PendingOp[] | null
    tool_trace?: ToolTraceItem[] | null
    attached_urls?: string[] | null
  }>
}): Promise<void> {
  const sb = sbLoose()
  const rows = opts.messages.map((m) => ({
    thread_id: opts.threadId,
    role: m.role,
    content: m.content,
    pending_ops: m.pending_ops ?? null,
    tool_trace: m.tool_trace ?? null,
    attached_urls: m.attached_urls ?? null,
  }))
  const { error } = await sb.from('admin_chat_messages').insert(rows)
  if (error) throw new Error(error.message)
  await sb
    .from('admin_chat_threads')
    .update({ updated_at: new Date().toISOString() })
    .eq('id', opts.threadId)
}

export async function loadChatThread(opts: {
  userId: string
  threadId: string
}): Promise<{
  thread: { id: string; title: string | null; intent: string | null }
  messages: Array<{
    id: string
    role: string
    content: string
    pending_ops: PendingOp[] | null
    tool_trace: ToolTraceItem[] | null
    attached_urls: string[] | null
    created_at: string
  }>
} | null> {
  const sb = sbLoose()
  const { data: thread } = await sb
    .from('admin_chat_threads')
    .select('id, title, intent')
    .eq('id', opts.threadId)
    .eq('user_id', opts.userId)
    .maybeSingle()
  if (!thread) return null
  const { data: messages, error } = await sb
    .from('admin_chat_messages')
    .select('id, role, content, pending_ops, tool_trace, attached_urls, created_at')
    .eq('thread_id', opts.threadId)
    .order('created_at', { ascending: true })
    .limit(200)
  if (error) throw new Error(error.message)
  return {
    thread: thread as { id: string; title: string | null; intent: string | null },
    messages: (messages || []) as Array<{
      id: string
      role: string
      content: string
      pending_ops: PendingOp[] | null
      tool_trace: ToolTraceItem[] | null
      attached_urls: string[] | null
      created_at: string
    }>,
  }
}

export async function listChatThreads(userId: string, limit = 20) {
  const sb = sbLoose()
  const { data, error } = await sb
    .from('admin_chat_threads')
    .select('id, title, intent, updated_at, created_at')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false })
    .limit(limit)
  if (error) throw new Error(error.message)
  return data || []
}
