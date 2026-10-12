// Aportación de colaboradores: lo que el chat editorial confirmó y lo que sigue en el catálogo.
// El historial vive en admin_chat_messages. Desde ahora cada confirmación guarda un trazo
// `executed` (ops + resultado). Las anteriores se reconstruyen con el último pending_ops y el «Hecho».

import { createServiceSupabase, fetchAllRows, selectByIds } from '@/lib/supabase-admin'

const CATALOG = new Set(['vinyl', 'new_release', 'mix', 'event', 'artist', 'label'])
const CREATED_WINDOW_MS = 15 * 60 * 1000

export type ContributionStatus = 'sigue' | 'actualizado' | 'no-entro' | 'ya-no-esta' | 'sin-comprobar'

export type ContributionKind = 'tema' | 'mix' | 'evento' | 'artista' | 'sello'

export type ContributionRow = {
  key: string
  kind: ContributionKind
  status: ContributionStatus
  title: string
  at: string
  href: string | null
  note: string
  attempts: number
}

export type ContributionCounts = {
  temas: number
  mixes: number
  eventos: number
  actualizados: number
  artistas: number
  sellos: number
  noEntraron: number
  yaNoEstan: number
}

export type CollaboratorContribution = {
  id: string
  name: string
  email: string
  username: string | null
  counts: ContributionCounts
  rows: ContributionRow[]
}

type LooseOp = {
  kind?: string
  action?: {
    type?: string
    slug?: string
    name?: string
    title?: string
    artist_name?: string
    urls_text?: string
    items?: Array<{
      title?: string
      mix_name?: string
      artists?: Array<{ name?: string } | string>
      youtube_url?: string | null
    }>
  }
}

type ResultLine = { type: string; ok: boolean; summary: string }

type Lookup =
  | { type: 'vinyl'; youtubeId: string }
  | { type: 'featured'; url: string; beatportId: string | null }
  | { type: 'slug'; table: 'mixes' | 'events' | 'artists' | 'labels'; slug: string }

type Intent = 'new' | 'update' | 'fail' | 'upsert' | 'ambiguous'

type Draft = {
  key: string
  kind: ContributionKind
  title: string
  at: string
  note: string
  intended: Intent
  lookup: Lookup | null
  attempts: number
}

type LiveHit = { id: string; title: string; href: string; createdAt: string | null }

const STRENGTH: Record<Intent, number> = {
  new: 5,
  upsert: 4,
  update: 3,
  ambiguous: 2,
  fail: 1,
}

export function executedOpsTrace(
  ops: unknown[],
  results: Array<{ type: string; ok: boolean; summary: string }>,
): { name: string; ok: boolean; detail: string }[] {
  return [
    {
      name: 'executed',
      ok: results.some((r) => r.ok),
      detail: JSON.stringify({
        ops,
        results: results.map((r) => ({ type: r.type, ok: r.ok, summary: r.summary })),
      }),
    },
  ]
}

function asArray(raw: unknown): unknown[] {
  if (typeof raw === 'string') {
    try {
      return asArray(JSON.parse(raw))
    } catch {
      return []
    }
  }
  return Array.isArray(raw) ? raw : []
}

function asOps(raw: unknown): LooseOp[] {
  return asArray(raw).filter((x): x is LooseOp => Boolean(x) && typeof x === 'object')
}

function youtubeIdFromUrl(url: string): string | null {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    if (host === 'youtu.be') {
      const id = u.pathname.split('/').filter(Boolean)[0] || ''
      return /^[a-zA-Z0-9_-]{11}$/.test(id) ? id : null
    }
    if (host === 'youtube.com' || host === 'm.youtube.com' || host === 'music.youtube.com') {
      const v = u.searchParams.get('v')
      if (v && /^[a-zA-Z0-9_-]{11}$/.test(v)) return v
      const m = u.pathname.match(/\/(?:embed|shorts|live|v)\/([a-zA-Z0-9_-]{11})/)
      return m?.[1] || null
    }
  } catch {
    /* url rota */
  }
  return null
}

function beatportTrackId(url: string): string | null {
  const m = url.match(/beatport\.com\/track\/[^/?#]+\/(\d+)/i)
  return m?.[1] || null
}

function artistLabel(artists: Array<{ name?: string } | string> | undefined): string {
  return (artists || [])
    .map((a) => (typeof a === 'string' ? a : a?.name || ''))
    .map((s) => s.trim())
    .filter(Boolean)
    .join(', ')
}

function stableUrl(url: string): string {
  try {
    const u = new URL(url)
    const host = u.hostname.replace(/^www\./, '')
    const path = u.pathname.replace(/\/$/, '')
    return `${host}${path}`
  } catch {
    return url
  }
}

function clip(s: string, n = 160): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n - 1)}…` : t
}

function isResult(content: string): boolean {
  return content.startsWith('Hecho.') || content.startsWith('No se completó')
}

function parseLines(content: string): ResultLine[] {
  if (!isResult(content)) return []
  const out: ResultLine[] = []
  for (const line of content.split('\n')) {
    const m = line.match(/^(✓|✗) \[([^\]]+)\] (.+)$/)
    if (!m) continue
    out.push({ ok: m[1] === '✓', type: m[2], summary: m[3] })
  }
  return out
}

function readExecuted(trace: unknown): { ops: LooseOp[]; results: ResultLine[] } | null {
  for (const item of asArray(trace)) {
    if (!item || typeof item !== 'object') continue
    const rec = item as { name?: string; detail?: unknown }
    if (rec.name !== 'executed') continue
    let detail: unknown = rec.detail
    if (typeof detail === 'string') {
      try {
        detail = JSON.parse(detail)
      } catch {
        return null
      }
    }
    if (!detail || typeof detail !== 'object') return null
    const body = detail as { ops?: unknown; results?: unknown }
    const results = asArray(body.results)
      .map((r) => {
        if (!r || typeof r !== 'object') return null
        const row = r as { type?: string; ok?: boolean; summary?: string }
        if (!row.type || typeof row.summary !== 'string') return null
        return { type: row.type, ok: Boolean(row.ok), summary: row.summary }
      })
      .filter((r): r is ResultLine => Boolean(r))
    return { ops: asOps(body.ops), results }
  }
  return null
}

function countsFrom(summary: string, re: RegExp): number[] {
  const m = summary.match(re)
  return m ? m.slice(1).map((n) => Number(n)) : []
}

function urlsFrom(text: string | undefined): string[] {
  if (!text) return []
  return text
    .split(/\s+/)
    .map((s) => s.trim())
    .filter((s) => s.startsWith('https://'))
}

function vinylTitle(item: {
  title?: string
  mix_name?: string
  artists?: Array<{ name?: string } | string>
}): string {
  const who = artistLabel(item.artists)
  const title = (item.title || 'Tema').trim()
  const mix = item.mix_name && !/original mix/i.test(item.mix_name) ? ` (${item.mix_name})` : ''
  return who ? `${who} — ${title}${mix}` : `${title}${mix}`
}

function expand(op: LooseOp | undefined, line: ResultLine, at: string): Omit<Draft, 'attempts'>[] {
  const action = op?.kind === 'chat_action' ? op.action : undefined
  const summary = line.summary

  if (line.type === 'vinyl') {
    const [nuevos = 0, actualizados = 0] = countsFrom(summary, /(\d+)\s+nuevos,\s+(\d+)\s+actualizados/)
    const fail = !line.ok || (nuevos === 0 && actualizados === 0)
    const items = action?.items?.length ? action.items : [null]
    const mixed = !fail && nuevos > 0 && actualizados > 0 && items.length > 1
    return items.map((item) => {
      const title = item ? vinylTitle(item) : clip(summary)
      const youtubeId = item?.youtube_url ? youtubeIdFromUrl(item.youtube_url) : null
      let intended: Intent = 'fail'
      if (!fail) {
        if (mixed) intended = 'ambiguous'
        else if (actualizados > 0 && nuevos === 0) intended = 'update'
        else intended = 'new'
      }
      return {
        key: youtubeId ? `vinyl:${youtubeId.toLowerCase()}` : `vinyl:${title.toLowerCase()}`,
        kind: 'tema',
        title,
        at,
        note: fail ? clip(summary) : '',
        intended,
        lookup: !fail && youtubeId ? { type: 'vinyl', youtubeId } : null,
      }
    })
  }

  if (line.type === 'new_release') {
    const [insertadas = 0, dupes = 0, , fallidas = 0] = countsFrom(
      summary,
      /(\d+)\s+insertadas,\s+(\d+)\s+dupes,\s+(\d+)\s+multi,\s+(\d+)\s+fallidas/,
    )
    const urls = urlsFrom(action?.urls_text)
    const list = urls.length ? urls : [summary]
    const single = list.length === 1
    return list.map((url) => {
      const isUrl = url.startsWith('https://')
      let intended: Intent = 'fail'
      if (line.ok && single && insertadas > 0 && fallidas === 0) intended = 'new'
      else if (line.ok && single && insertadas === 0 && dupes > 0) intended = 'update'
      else if (line.ok && !single && insertadas > 0 && fallidas === 0 && dupes === 0) intended = 'new'
      else if (line.ok && insertadas + dupes > 0) intended = 'ambiguous'
      const bp = isUrl ? beatportTrackId(url) : null
      return {
        key: bp ? `nr:${bp}` : `nr:${stableUrl(url).toLowerCase()}`,
        kind: 'tema' as const,
        title: isUrl ? stableUrl(url) : clip(summary),
        at,
        note: clip(summary),
        intended,
        lookup: intended !== 'fail' && isUrl ? { type: 'featured' as const, url, beatportId: bp } : null,
      }
    })
  }

  if (line.type === 'event') {
    const created = summary.match(/Evento creado:\s+(.+?)\s+\(([^)]+)\)/)
    const updated =
      summary.match(/Evento ya existente actualizado:\s+(.+?)\s+\(([^)]+)\)/) ||
      summary.match(/Ya existía «([^»]+)» \(([^)]+)\)/)
    const hit = created || updated
    const slug = hit?.[2] || action?.slug || ''
    const title = hit?.[1] || action?.name || clip(summary)
    const fail = !line.ok
    const intended: Intent = fail ? 'fail' : created ? 'new' : updated ? 'update' : 'upsert'
    return [
      {
        key: slug ? `event:${slug}` : `event:${title.toLowerCase()}`,
        kind: 'evento',
        title,
        at,
        note: fail || !hit ? clip(summary) : '',
        intended,
        lookup: !fail && slug ? { type: 'slug', table: 'events', slug } : null,
      },
    ]
  }

  if (line.type === 'mix' || line.type === 'artist' || line.type === 'label') {
    const re =
      line.type === 'mix'
        ? /Mix upsert:\s+(.+?)\s+\(([^)]+)\)/
        : line.type === 'artist'
          ? /Artista upsert:\s+(.+?)\s+\(([^)]+)\)/
          : /Sello upsert:\s+(.+?)\s+\(([^)]+)\)/
    const hit = summary.match(re)
    const slug = hit?.[2] || action?.slug || ''
    const title =
      hit?.[1] ||
      (line.type === 'mix' ? action?.title : action?.name) ||
      clip(summary)
    const who = line.type === 'mix' ? action?.artist_name : ''
    const fail = !line.ok || !hit
    const table = line.type === 'mix' ? 'mixes' : line.type === 'artist' ? 'artists' : 'labels'
    const kind: ContributionKind = line.type === 'mix' ? 'mix' : line.type === 'artist' ? 'artista' : 'sello'
    return [
      {
        key: `${line.type}:${slug || title.toLowerCase()}`,
        kind,
        title: who ? `${who} — ${title}` : title,
        at,
        note: fail ? clip(summary) : '',
        intended: fail ? 'fail' : 'upsert',
        lookup: !fail && slug ? { type: 'slug', table, slug } : null,
      },
    ]
  }

  return []
}

function absorb(map: Map<string, Draft>, draft: Omit<Draft, 'attempts'>) {
  const prev = map.get(draft.key)
  if (!prev) {
    map.set(draft.key, { ...draft, attempts: 1 })
    return
  }
  prev.attempts += 1
  if (STRENGTH[draft.intended] > STRENGTH[prev.intended]) {
    const attempts = prev.attempts
    Object.assign(prev, draft, { attempts })
  }
}

function draftsFromThread(messages: Array<{ role: string; content: string; pending_ops: unknown; tool_trace: unknown; created_at: string }>): Draft[] {
  const map = new Map<string, Draft>()
  let staged: LooseOp[] = []
  const ordered = [...messages].sort((a, b) => a.created_at.localeCompare(b.created_at))
  for (const msg of ordered) {
    if (msg.role !== 'assistant') continue
    const pending = asOps(msg.pending_ops)
    if (pending.length) staged = pending
    const executed = readExecuted(msg.tool_trace)
    const lines = executed?.results?.length ? executed.results : parseLines(msg.content || '')
    if (!lines.length) continue
    const ops = executed?.ops?.length ? executed.ops : staged
    const catalogLines = lines.filter((line) => CATALOG.has(line.type))
    const catalogOps = ops.filter(
      (op) => op.kind === 'chat_action' && CATALOG.has(String(op.action?.type || '')),
    )
    const n = Math.max(catalogOps.length, catalogLines.length)
    for (let i = 0; i < n; i++) {
      const line = catalogLines[i]
      if (!line) continue
      const op = catalogOps[i]
      const paired = op?.action?.type === line.type ? op : undefined
      for (const draft of expand(paired, line, msg.created_at)) absorb(map, draft)
    }
    staged = []
  }
  return [...map.values()]
}

function emptyCounts(): ContributionCounts {
  return {
    temas: 0,
    mixes: 0,
    eventos: 0,
    actualizados: 0,
    artistas: 0,
    sellos: 0,
    noEntraron: 0,
    yaNoEstan: 0,
  }
}

function addCount(counts: ContributionCounts, row: ContributionRow) {
  if (row.status === 'no-entro') counts.noEntraron += 1
  else if (row.status === 'ya-no-esta') counts.yaNoEstan += 1
  else if (row.status === 'actualizado') counts.actualizados += 1
  else if (row.status === 'sigue') {
    if (row.kind === 'tema') counts.temas += 1
    else if (row.kind === 'mix') counts.mixes += 1
    else if (row.kind === 'evento') counts.eventos += 1
    else if (row.kind === 'artista') counts.artistas += 1
    else counts.sellos += 1
  }
}

export async function loadCollaboratorContributions(lang: string): Promise<CollaboratorContribution[]> {
  const sb = createServiceSupabase()
  const { data: profiles, error: profileErr } = await sb
    .from('profiles')
    .select('id, display_name, username')
    .eq('role', 'collaborator')
  if (profileErr) throw new Error(profileErr.message)
  const people = profiles || []
  if (!people.length) return []

  const ids = people.map((p) => p.id)
  const emails = new Map<string, string>()
  await Promise.all(
    ids.map(async (id) => {
      const { data } = await sb.auth.admin.getUserById(id)
      if (data.user?.email) emails.set(id, data.user.email)
    }),
  )

  const { data: threads, error: threadErr } = await selectByIds<{ id: string; user_id: string }>(ids, (chunk) =>
    sb.from('admin_chat_threads').select('id, user_id').in('user_id', chunk),
  )
  if (threadErr) throw new Error(threadErr.message)

  const threadOwner = new Map(threads.map((t) => [t.id, t.user_id]))
  const threadIds = threads.map((t) => t.id)
  type Msg = {
    thread_id: string
    role: string
    content: string
    pending_ops: unknown
    tool_trace: unknown
    created_at: string
  }
  const messages: Msg[] = []
  for (let i = 0; i < threadIds.length; i += 40) {
    const chunk = threadIds.slice(i, i + 40)
    const page = await fetchAllRows<Msg>((from, to) =>
      sb
        .from('admin_chat_messages')
        .select('thread_id, role, content, pending_ops, tool_trace, created_at')
        .in('thread_id', chunk)
        .order('created_at', { ascending: true })
        .order('thread_id', { ascending: true })
        .range(from, to),
    )
    if (page.error) throw new Error(page.error.message)
    messages.push(...page.data)
  }

  const byUser = new Map<string, Msg[]>()
  for (const msg of messages) {
    const uid = threadOwner.get(msg.thread_id)
    if (!uid) continue
    const list = byUser.get(uid) || []
    list.push(msg)
    byUser.set(uid, list)
  }

  const draftsByUser = new Map<string, Draft[]>()
  const vinylIds = new Set<string>()
  const beatportIds = new Set<string>()
  const featuredUrls = new Set<string>()
  const slugs: Record<'mixes' | 'events' | 'artists' | 'labels', Set<string>> = {
    mixes: new Set(),
    events: new Set(),
    artists: new Set(),
    labels: new Set(),
  }

  for (const person of people) {
    const drafts = draftsFromThread(byUser.get(person.id) || [])
    draftsByUser.set(person.id, drafts)
    for (const d of drafts) {
      if (d.intended === 'fail' || !d.lookup) continue
      if (d.lookup.type === 'vinyl') vinylIds.add(d.lookup.youtubeId)
      else if (d.lookup.type === 'featured') {
        if (d.lookup.beatportId) beatportIds.add(d.lookup.beatportId)
        else featuredUrls.add(d.lookup.url)
      } else slugs[d.lookup.table].add(d.lookup.slug)
    }
  }

  const vinylHits = new Map<string, LiveHit>()
  await Promise.all(
    [...vinylIds].map(async (youtubeId) => {
      const { data } = await sb
        .from('chart_vinyl_tracks')
        .select('id, title, youtube_url, artists')
        .ilike('youtube_url', `%${youtubeId}%`)
        .limit(8)
      for (const row of data || []) {
        const found = row.youtube_url ? youtubeIdFromUrl(row.youtube_url) : null
        if (!found || found.toLowerCase() !== youtubeId.toLowerCase()) continue
        const who = artistLabel(row.artists as Array<{ name?: string } | string>)
        vinylHits.set(youtubeId.toLowerCase(), {
          id: row.id,
          title: who ? `${who} — ${row.title}` : row.title,
          href: `/${lang}/charts?play=vinyl:${row.id}`,
          createdAt: null,
        })
      }
    }),
  )

  const featuredHits = new Map<string, LiveHit>()
  await Promise.all(
    [...beatportIds].map(async (bp) => {
      const { data } = await sb
        .from('chart_featured_tracks')
        .select('id, title, link_url, artists')
        .ilike('link_url', `%/${bp}%`)
        .limit(8)
      for (const row of data || []) {
        if (beatportTrackId(row.link_url) !== bp) continue
        const who = artistLabel(row.artists as Array<{ name?: string } | string>)
        featuredHits.set(`bp:${bp}`, {
          id: row.id,
          title: who ? `${who} — ${row.title}` : row.title,
          href: `/${lang}/charts?play=featured:${row.id}`,
          createdAt: null,
        })
      }
    }),
  )
  await Promise.all(
    [...featuredUrls].map(async (url) => {
      const { data } = await sb
        .from('chart_featured_tracks')
        .select('id, title, link_url, artists')
        .eq('link_url', url)
        .limit(1)
      const row = data?.[0]
      if (!row) return
      const who = artistLabel(row.artists as Array<{ name?: string } | string>)
      featuredHits.set(`url:${url}`, {
        id: row.id,
        title: who ? `${who} — ${row.title}` : row.title,
        href: `/${lang}/charts?play=featured:${row.id}`,
        createdAt: null,
      })
    }),
  )

  const slugHits = new Map<string, LiveHit>()
  const slugTables = ['mixes', 'events', 'artists', 'labels'] as const
  for (const table of slugTables) {
    const list = [...slugs[table]]
    if (!list.length) continue
    const { data, error } = await selectByIds<{ id: string; slug: string; created_at: string; title?: string; name?: string; artist_name?: string }>(
      list,
      (chunk) => {
        if (table === 'mixes') {
          return sb.from('mixes').select('id, slug, title, artist_name, created_at').in('slug', chunk)
        }
        if (table === 'events') {
          return sb.from('events').select('id, slug, name, created_at').in('slug', chunk)
        }
        if (table === 'artists') {
          return sb.from('artists').select('id, slug, name, created_at').in('slug', chunk)
        }
        return sb.from('labels').select('id, slug, name, created_at').in('slug', chunk)
      },
    )
    if (error) throw new Error(error.message)
    for (const row of data) {
      const label =
        table === 'mixes'
          ? `${row.artist_name || ''} — ${row.title || row.slug}`.replace(/^ — /, '')
          : row.name || row.slug
      const href =
        table === 'mixes'
          ? `/${lang}/mixes/${row.slug}`
          : table === 'events'
            ? `/${lang}/events/${row.slug}`
            : table === 'artists'
              ? `/${lang}/artists/${row.slug}`
              : `/${lang}/labels/${row.slug}`
      slugHits.set(`${table}:${row.slug}`, { id: row.id, title: label, href, createdAt: row.created_at })
    }
  }

  const out: CollaboratorContribution[] = people.map((person) => {
    const counts = emptyCounts()
    const rows: ContributionRow[] = []
    for (const draft of draftsByUser.get(person.id) || []) {
      let intended = draft.intended
      let hit: LiveHit | null = null
      if (draft.lookup?.type === 'vinyl') hit = vinylHits.get(draft.lookup.youtubeId.toLowerCase()) || null
      else if (draft.lookup?.type === 'featured') {
        hit = draft.lookup.beatportId
          ? featuredHits.get(`bp:${draft.lookup.beatportId}`) || null
          : featuredHits.get(`url:${draft.lookup.url}`) || null
      } else if (draft.lookup?.type === 'slug') {
        hit = slugHits.get(`${draft.lookup.table}:${draft.lookup.slug}`) || null
      }

      if (intended === 'upsert') {
        if (!hit) intended = 'new'
        else {
          const created = hit.createdAt ? Date.parse(hit.createdAt) : NaN
          const at = Date.parse(draft.at)
          intended = Number.isFinite(created) && Math.abs(created - at) <= CREATED_WINDOW_MS ? 'new' : 'update'
        }
      }

      let status: ContributionStatus
      if (intended === 'fail') status = 'no-entro'
      else if (intended === 'ambiguous' || !draft.lookup) status = 'sin-comprobar'
      else if (intended === 'update') status = hit ? 'actualizado' : 'ya-no-esta'
      else status = hit ? 'sigue' : 'ya-no-esta'

      let note = draft.note
      if (status === 'ya-no-esta') note = note || 'Se guardó y ya no está en el catálogo.'
      if (draft.attempts > 1) {
        const times = `${draft.attempts} confirmaciones`
        note = note ? `${note} · ${times}` : times
      }

      const row: ContributionRow = {
        key: draft.key,
        kind: draft.kind,
        status,
        title: hit && status !== 'no-entro' ? hit.title : draft.title,
        at: draft.at,
        href: hit && (status === 'sigue' || status === 'actualizado') ? hit.href : null,
        note,
        attempts: draft.attempts,
      }
      addCount(counts, row)
      rows.push(row)
    }
    rows.sort((a, b) => b.at.localeCompare(a.at))
    const email = emails.get(person.id) || ''
    const name = person.display_name?.trim() || person.username?.trim() || email || 'Colaborador'
    return { id: person.id, name, email, username: person.username, counts, rows }
  })

  out.sort((a, b) => {
    const score = (p: CollaboratorContribution) => p.counts.temas + p.counts.mixes + p.counts.eventos
    return score(b) - score(a) || a.name.localeCompare(b.name, 'es')
  })
  return out
}
