/**
 * Revisor del chat editorial de Optimal Breaks (admin + colaboradores).
 * Molde: revisores de Nora / Andrea / Laura, pero aquí lo que importa es la subida:
 * qué se intentó guardar, qué falló, por qué, y qué cambio de código lo arregla.
 *
 * Detecta:
 *  - ✗ en la confirmación (la BD no guardó).
 *  - Propuestas (pending_ops) que nadie confirmó: «Load failed», abandono o mal routing.
 *  - El colaborador repite el mismo enlace o pregunta «¿dónde está?».
 *  - Un «hecho» que escribió en otra ficha: slug preparado distinto del slug guardado
 *    (Electrolunch, 20 oct 2026: el cartel del 24 oct pisó el Picnic 76 del 9 may).
 * Agrupa por causa, busca en src/ la línea que genera el error y pide al modelo
 * diagnóstico + arreglo concreto. No escribe en la BD.
 *
 * Uso (Windows: no uses npm run si hay flags):
 *   npx tsx scripts/review-chatbot-messages.ts             # últimos 7 días
 *   npx tsx scripts/review-chatbot-messages.ts --days=14
 *   npx tsx scripts/review-chatbot-messages.ts --since=2026-10-10
 *   npx tsx scripts/review-chatbot-messages.ts --no-llm    # solo recuento y causas
 */
import { execFileSync } from 'child_process'
import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { createClient } from '@supabase/supabase-js'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const ROOT = path.join(__dirname, '..')
process.loadEnvFile(path.join(ROOT, '.env.local'))
if (process.env.OB_STRICT_TLS !== '1') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'

const REPORT_PATH = path.join(ROOT, 'docs', 'chatbot', 'INFORME-REVISION-CHAT.md')

type Msg = {
  thread_id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  pending_ops: { type?: string; summary?: string; label?: string }[] | null
  tool_trace: { name?: string; detail?: string }[] | null
  attached_urls: string[] | null
  created_at: string
}

type Incident = {
  kind: 'fallo' | 'sin_confirmar' | 'repite' | 'confuso' | 'pisa'
  when: string
  who: string
  thread: string
  user_text: string
  assistant_text: string
  cause: string
}

type CauseReview = {
  diagnostico: string
  causa_raiz: string
  archivo: string
  arreglo: string
  prioridad: 'alta' | 'media' | 'baja'
}

function parseArgs() {
  const args = process.argv.slice(2)
  const val = (k: string) => args.find((a) => a.startsWith(`--${k}=`))?.split('=')[1]?.trim()
  const days = Number(val('days') || '7') || 7
  const since = val('since') || new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10)
  return { since, llm: !args.includes('--no-llm') }
}

const madrid = (iso: string) => new Date(iso).toLocaleString('sv-SE', { timeZone: 'Europe/Madrid' }).slice(0, 16)

const short = (s: string, n = 300) => {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length > n ? `${t.slice(0, n)}…` : t
}

const userText = (m: Msg) => {
  const urls = (m.attached_urls || []).filter((u) => !/\/storage\/v1\//.test(u))
  return short(m.content || (m.attached_urls?.length ? '(captura / imagen)' : ''), 240) + (urls.length && !m.content.includes(urls[0]) ? ` ${urls.join(' ')}` : '')
}

/** Causa normalizada: sin números, slugs ni URLs, para agrupar el mismo fallo. */
function causeOf(line: string): string {
  return line
    .replace(/https?:\/\/\S+/g, '<url>')
    .replace(/\b[a-z0-9]+(?:-[a-z0-9]+){1,}\b/g, '<slug>')
    .replace(/\d+/g, 'N')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 200)
}

const FAIL_LINE = /✗ \[([a-z_]+)\]\s*([^✓✗]*)/g
const SAME_LINK_WINDOW_MS = 6 * 60 * 60 * 1000
const CONFUSED = /\b(d[oó]nde est[aá]|no (?:sale|aparece|est[aá])|otra vez|no funciona|falla|error|no va|por qu[eé])\b/i

function detect(msgs: Msg[], who: Record<string, string>): { incidents: Incident[]; okCount: number } {
  const incidents: Incident[] = []
  let okCount = 0
  const byThread = new Map<string, Msg[]>()
  for (const m of msgs) {
    const list = byThread.get(m.thread_id) || []
    list.push(m)
    byThread.set(m.thread_id, list)
  }
  const seenLinks = new Map<string, number>()

  for (const [thread, list] of byThread) {
    const author = who[thread] || '¿?'
    list.forEach((m, i) => {
      const prevUser = [...list.slice(0, i)].reverse().find((x) => x.role === 'user')
      if (m.role === 'assistant') {
        okCount += (m.content.match(/✓ \[/g) || []).length
        for (const hit of m.content.matchAll(FAIL_LINE)) {
          incidents.push({
            kind: 'fallo',
            when: m.created_at,
            who: author,
            thread,
            user_text: prevUser ? userText(prevUser) : '',
            assistant_text: short(m.content, 400),
            cause: `[${hit[1]}] ${causeOf(hit[2])}`,
          })
        }
        const landed = m.content.match(/Ya existía «([^»]+)» \(([^)]+)\); actualizado sin duplicar/)
        if (landed) {
          const trace = Array.isArray(m.tool_trace) ? m.tool_trace : []
          const executed = trace.find((t) => t.name === 'executed')
          let prepared: { slug?: string; name?: string; date_start?: string | null } | null = null
          try {
            const detail = JSON.parse(executed?.detail || '')
            prepared = detail?.ops?.[0]?.action ?? null
          } catch {
            prepared = null
          }
          if (prepared?.slug && prepared.slug !== landed[2]) {
            incidents.push({
              kind: 'pisa',
              when: m.created_at,
              who: author,
              thread,
              user_text: prevUser ? userText(prevUser) : '',
              assistant_text: short(
                `preparó «${prepared.name || '?'}» (${prepared.slug}, ${prepared.date_start || 'sin fecha'}) y escribió en «${landed[1]}» (${landed[2]})`,
                400,
              ),
              cause: '[event] actualizado sin duplicar en otra ficha (slug distinto al preparado)',
            })
          }
        }
        if (m.pending_ops?.length) {
          const resolved = list
            .slice(i + 1)
            .some((x) => x.role === 'assistant' && /[✓✗] \[|descartadas|No se completó/.test(x.content))
          if (!resolved) {
            const op = m.pending_ops[0]
            incidents.push({
              kind: 'sin_confirmar',
              when: m.created_at,
              who: author,
              thread,
              user_text: prevUser ? userText(prevUser) : '',
              assistant_text: short(m.content, 400),
              cause: `[${op?.type || 'op'}] propuesta sin resultado (abandono, «Load failed» o respuesta que no convenció)`,
            })
          }
        }
        return
      }
      if (m.role !== 'user') return
      const t = new Date(m.created_at).getTime()
      for (const url of m.content.match(/https?:\/\/\S+/g) || []) {
        const key = url.replace(/[?#].*$/, '').replace(/\/(?:es|en|de|fr)\//, '/').toLowerCase()
        const before = seenLinks.get(key)
        if (before !== undefined && t - before < SAME_LINK_WINDOW_MS) {
          const next = list.slice(i + 1).find((x) => x.role === 'assistant')
          incidents.push({
            kind: 'repite',
            when: m.created_at,
            who: author,
            thread,
            user_text: userText(m),
            assistant_text: next ? short(next.content, 400) : '(sin respuesta guardada)',
            cause: 'el colaborador pega otra vez el mismo enlace: la primera vez no le sirvió',
          })
        }
        seenLinks.set(key, t)
      }
      if (CONFUSED.test(m.content) && m.content.length < 200) {
        const prevAssistant = [...list.slice(0, i)].reverse().find((x) => x.role === 'assistant')
        incidents.push({
          kind: 'confuso',
          when: m.created_at,
          who: author,
          thread,
          user_text: userText(m),
          assistant_text: prevAssistant ? short(prevAssistant.content, 400) : '',
          cause: 'el colaborador no entiende la respuesta o cree que no se guardó',
        })
      }
    })
  }
  return { incidents, okCount }
}

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const p = path.join(dir, name)
    if (statSync(p).isDirectory()) walk(p, out)
    else if (/\.(ts|tsx|txt)$/.test(name)) out.push(p)
  }
  return out
}

let sourceCache: { file: string; lines: string[] }[] | null = null
function sources() {
  if (!sourceCache) {
    const files = [...walk(path.join(ROOT, 'src')), path.join(ROOT, 'scripts', 'prompts', 'admin-chat-system.txt')]
    sourceCache = files.filter(existsSync).map((file) => ({ file, lines: readFileSync(file, 'utf8').split(/\r?\n/) }))
  }
  return sourceCache
}

/** Busca en el código el literal que produce el error y devuelve ±40 líneas. */
function codeFor(cause: string): string {
  // Lo variable (números, slugs, URLs) parte el mensaje: se buscan los trozos fijos, del más largo al más corto.
  const fragments = cause
    .replace(/^\[[a-z_]+\]\s*/, '')
    .split(/N|<slug>|<url>|[()«»]/)
    .map((f) => f.replace(/^[\s:,.·-]+|[\s:,.·-]+$/g, ''))
    .filter((f) => f.length >= 10)
    .sort((a, b) => b.length - a.length)
  for (const frag of fragments) {
    for (const { file, lines } of sources()) {
      const idx = lines.findIndex((l) => l.includes(frag))
      if (idx < 0) continue
      const from = Math.max(0, idx - 40)
      const rel = path.relative(ROOT, file).replace(/\\/g, '/')
      return `// ${rel}:${from + 1}\n${lines.slice(from, idx + 40).join('\n')}`
    }
  }
  return ''
}

/** Mapa real del flujo, para que el modelo no invente rutas. */
const FLOW_MAP = `- src/components/AgentChat.tsx — UI del chat (widget). «Confirmar» manda el mensaje con las pending_ops del último assistant.
- src/app/api/admin/agent/chat/route.ts — POST del chat. Si el mensaje es una confirmación y hay ops → executePendingOps; si no → runAdminChatAgent.
- src/lib/admin-chat-agent.ts — agente OpenAI con tools (stage_*), applyYouTubeRoutes / applySoundCloudRoutes, executePendingOps.
- src/lib/admin-chat.ts — acciones al confirmar (vinyl, new_release → /api/admin/featured-import, soundcloud_track, mix, event, artist, label), routeYouTubeTracks / routeSoundCloudTracks, cola chart_import_queue, búsqueda web.
- src/app/api/admin/featured-import/route.ts — import de enlaces Beatport a chart_featured_tracks.
- src/lib/beatport-genre-import.ts — createBeatportPageLoader (fetch y, fuera de Vercel, Chrome).
- src/lib/collaborator-contributions.ts — cuenta lo que aporta cada colaborador a partir del texto «✓ [tipo] …».
- scripts/prompts/admin-chat-system.txt — prompt del agente.`

function gitLog(since: string): string {
  try {
    return execFileSync('git', ['log', `--since=${since}`, '--format=%h %ad %s', '--date=format:%m-%d %H:%M'], {
      cwd: ROOT,
      encoding: 'utf8',
    })
      .split('\n')
      .slice(0, 40)
      .join('\n')
  } catch {
    return ''
  }
}

async function reviewCause(cause: string, samples: Incident[], code: string, commits: string): Promise<CauseReview | null> {
  const apiKey = process.env.OPENAI_API_KEY?.trim()
  if (!apiKey) return null
  const model = process.env.OPENAI_REVIEW_MODEL?.trim() || process.env.OPENAI_CHAT_MODEL?.trim() || 'gpt-5.6-terra'
  const system = readFileSync(path.join(ROOT, 'scripts', 'prompts', 'admin-chat-system.txt'), 'utf8').slice(0, 6000)
  const prompt = `Eres el revisor técnico del chat editorial de Optimal Breaks (Next.js en Vercel + Supabase).
Admin y colaboradores pegan enlaces (Beatport, YouTube, SoundCloud) o carteles; el chat prepara una operación y al «Confirmar» la guarda.
Tu trabajo: explicar por qué falla esta causa y proponer el arreglo de código concreto. Sin generalidades.

Contexto conocido:
- Desde Vercel, Cloudflare tapa beatport.com (búsqueda y fichas). No se puede usar Chrome con ventana ni el client ID de la documentación de Beatport.
- Un tema que ya está en el catálogo o en la cola de Imports se contesta «No te preocupes, que este tema ya está».
- Mismo tema = misma fila (UPDATE, nunca borrar e insertar).

Archivos del flujo (usa SOLO estas rutas o las del código de abajo; no inventes otras):
${FLOW_MAP}

Commits desde el inicio del periodo (fecha local). Si un commit posterior al último caso ya lo arregla, dilo en "diagnostico" y pon prioridad "baja":
${commits || '(sin git)'}

Extracto del prompt del agente:
${system}

CAUSA: ${cause}
Último caso: ${madrid(samples[samples.length - 1].when)} (hora de Madrid)
Casos (${samples.length}):
${samples
  .slice(0, 6)
  .map((s) => `- ${madrid(s.when)} ${s.who}\n  Usuario: ${s.user_text}\n  Chat: ${s.assistant_text}`)
  .join('\n')}

Código donde nace el mensaje:
${code || '(no localizado)'}

Responde SOLO con JSON:
{"diagnostico": "qué le pasa al usuario, en una frase", "causa_raiz": "por qué ocurre en el código", "archivo": "ruta:línea", "arreglo": "cambio concreto (puede incluir un diff corto)", "prioridad": "alta|media|baja"}`
  try {
    const res = await fetch('https://api.openai.com/v1/responses', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({ model, input: prompt }),
      signal: AbortSignal.timeout(120_000),
    })
    if (!res.ok) return null
    const data = (await res.json()) as { output_text?: string; output?: { type: string; content?: { text?: string }[] }[] }
    const text =
      data.output_text ||
      (data.output || [])
        .filter((o) => o.type === 'message')
        .flatMap((o) => o.content || [])
        .map((c) => c.text || '')
        .join('')
    const json = text.match(/\{[\s\S]*\}/)?.[0]
    return json ? (JSON.parse(json) as CauseReview) : null
  } catch {
    return null
  }
}

async function main() {
  const { since, llm } = parseArgs()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SECRET_KEY
  if (!url || !key) throw new Error('Faltan NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY en .env.local')
  const sb = createClient(url, key, { auth: { persistSession: false } })

  const { data: threads, error: thErr } = await sb.from('admin_chat_threads').select('id, user_id').gte('updated_at', since)
  if (thErr) throw new Error(thErr.message)
  if (!threads?.length) {
    console.log(`Sin hilos desde ${since}.`)
    return
  }
  const emails: Record<string, string> = {}
  for (const uid of new Set(threads.map((t) => t.user_id as string))) {
    const { data } = await sb.auth.admin.getUserById(uid)
    emails[uid] = (data.user?.email || uid).split('@')[0]
  }
  const who = Object.fromEntries(threads.map((t) => [t.id as string, emails[t.user_id as string]]))

  const msgs: Msg[] = []
  const ids = threads.map((t) => t.id as string)
  for (let i = 0; i < ids.length; i += 100) {
    const { data, error } = await sb
      .from('admin_chat_messages')
      .select('thread_id, role, content, pending_ops, tool_trace, attached_urls, created_at')
      .in('thread_id', ids.slice(i, i + 100))
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .range(0, 4999)
    if (error) throw new Error(error.message)
    msgs.push(...((data || []) as Msg[]))
  }
  // Pregunta y respuesta se guardan en el mismo insert y comparten created_at: la pregunta va primero.
  msgs.sort((a, b) => a.created_at.localeCompare(b.created_at) || (a.role === 'user' ? -1 : b.role === 'user' ? 1 : 0))

  const { incidents, okCount } = detect(msgs, who)
  const groups = new Map<string, Incident[]>()
  for (const inc of incidents) {
    const k = `${inc.kind} · ${inc.cause}`
    groups.set(k, [...(groups.get(k) || []), inc])
  }
  const ordered = [...groups.entries()].sort((a, b) => b[1].length - a[1].length)

  console.log(`\nRevisión del chat editorial desde ${since}: ${msgs.length} mensajes, ${okCount} guardados, ${incidents.length} incidencias en ${ordered.length} causas\n`)

  const perUser: Record<string, { ok: number; fallos: number; sin: number }> = {}
  for (const m of msgs) {
    if (m.role !== 'assistant') continue
    const u = (perUser[who[m.thread_id]] ||= { ok: 0, fallos: 0, sin: 0 })
    u.ok += (m.content.match(/✓ \[/g) || []).length
  }
  for (const inc of incidents) {
    const u = (perUser[inc.who] ||= { ok: 0, fallos: 0, sin: 0 })
    if (inc.kind === 'fallo') u.fallos++
    if (inc.kind === 'sin_confirmar') u.sin++
  }

  const lines: string[] = [
    '# Revisión del chat editorial (subidas)',
    '',
    `Generado: ${new Date().toISOString()} · desde ${since}`,
    '',
    '## Resumen',
    '',
    `- Mensajes: ${msgs.length}`,
    `- Guardados (✓): ${okCount}`,
    `- Incidencias: ${incidents.length} en ${ordered.length} causas`,
    '',
    '| Cuenta | Guardados | Fallos | Sin confirmar |',
    '|---|---|---|---|',
    ...Object.entries(perUser).map(([u, s]) => `| ${u} | ${s.ok} | ${s.fallos} | ${s.sin} |`),
    '',
    '## Causas (de más a menos frecuente)',
    '',
  ]

  const commits = gitLog(since)
  for (const [i, [cause, samples]] of ordered.entries()) {
    process.stdout.write(`[${i + 1}/${ordered.length}] ${samples.length}× ${cause.slice(0, 90)} `)
    const kind = samples[0].kind
    const code = kind === 'fallo' || kind === 'pisa' ? codeFor(samples[0].cause) : ''
    // «repite» y «confuso» son síntomas: la causa sale en los fallos o en las propuestas sin confirmar.
    const lastIso = samples[samples.length - 1].when
    const opType = samples[0].cause.match(/^\[([a-z_]+)\]/)?.[1]
    const okAfter =
      kind === 'fallo' && opType
        ? msgs
            .filter((m) => m.role === 'assistant' && m.created_at > lastIso)
            .reduce((n, m) => n + (m.content.match(new RegExp(`✓ \\[${opType}\\]`, 'g')) || []).length, 0)
        : 0
    const after = okAfter
      ? `Después del último fallo hay ${okAfter} guardados correctos de tipo [${opType}]: probablemente ya está arreglado.`
      : ''
    const review =
      llm && (kind === 'fallo' || kind === 'sin_confirmar' || kind === 'pisa')
        ? await reviewCause(cause, samples, code, after ? `${after}\n${commits}` : commits)
        : null
    console.log(review ? `→ ${review.prioridad}` : '')
    lines.push(
      `### ${samples.length}× ${cause}`,
      '',
      `Último: ${madrid(lastIso)} · cuentas: ${[...new Set(samples.map((s) => s.who))].join(', ')}`,
      ...(after ? ['', `**${after}**`] : []),
      '',
    )
    for (const s of samples.slice(0, 4)) {
      lines.push(`- ${madrid(s.when)} **${s.who}** — ${s.user_text || '—'}`, `  - Chat: ${s.assistant_text}`)
    }
    if (review) {
      lines.push(
        '',
        `**Diagnóstico:** ${review.diagnostico}`,
        '',
        `**Causa raíz:** ${review.causa_raiz}`,
        '',
        `**Dónde:** \`${review.archivo}\` · prioridad **${review.prioridad}**`,
        '',
        `**Arreglo propuesto:**`,
        '',
        review.arreglo,
      )
    } else if (code) {
      lines.push('', `Código: \`${code.split('\n')[0].replace('// ', '')}\``)
    }
    lines.push('')
  }

  mkdirSync(path.dirname(REPORT_PATH), { recursive: true })
  writeFileSync(REPORT_PATH, lines.join('\n'), 'utf8')
  console.log(`\nInforme: ${path.relative(ROOT, REPORT_PATH)}`)
}

main().catch((e) => {
  console.error(`\n${e instanceof Error ? e.message : e}\n`)
  process.exit(1)
})
