// ============================================
// OPTIMAL BREAKS — Texto del post de los vídeos R/F (cliente)
//
// `aiShareCaption` pide el texto a GPT‑5.6 (`/api/admin/share-caption`) y, si
// falla o tarda más de 55 s, devuelve el de plantilla. Se lanza EN PARALELO
// con el render del vídeo, así que normalmente no añade espera.
// `buildPageVideoCaption` es la plantilla de los vídeos de página
// (Top 100, New Releases, blog); las de temas y sesiones están en share-track.ts.
// ============================================

import type { Locale } from '@/lib/i18n-config'

export type ShareCaptionKind = 'track' | 'set' | 'top100' | 'week' | 'blog' | 'events' | 'digest' | 'day' | 'gift'
export type SharePlatform = 'instagram' | 'facebook'

/** `@usuario` a partir de una URL de Instagram guardada. Sin ficha o sin perfil, null. */
export function instagramMention(socials: unknown): string | null {
  if (!socials || typeof socials !== 'object' || Array.isArray(socials)) return null
  const url = Object.entries(socials as Record<string, unknown>).find(
    ([key, value]) => key.toLowerCase() === 'instagram' && typeof value === 'string',
  )?.[1]
  if (typeof url !== 'string') return null
  let path = ''
  try {
    const parsed = new URL(url)
    if (!/(^|\.)instagram\.com$/i.test(parsed.hostname)) return null
    path = parsed.pathname
  } catch {
    return null
  }
  const handle = (path.split('/').filter(Boolean)[0] || '').replace(/^@/, '')
  if (!/^[A-Za-z0-9._]{1,30}$/.test(handle)) return null
  if (/^(p|reel|reels|stories|explore|accounts)$/i.test(handle)) return null
  return `@${handle}`
}

const DAY_MONTHS_ES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre']
const DAY_MONTHS_EN = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December']

/**
 * Presente solo si el reel se genera el mismo día (Madrid).
 * `when` va en mayúsculas para el vídeo; `spoken` para el pie.
 */
export function dayReelTense(iso: string, es: boolean): { today: boolean; when: string; spoken: string } {
  const todayIso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid', year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date())
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso)
  if (!m) return { today: false, when: '', spoken: '' }
  const day = Number(m[3])
  const monthEs = DAY_MONTHS_ES[Number(m[2]) - 1] || ''
  const monthEn = DAY_MONTHS_EN[Number(m[2]) - 1] || ''
  return {
    today: iso === todayIso,
    when: es ? `${day} DE ${monthEs.toUpperCase()}` : `${monthEn.toUpperCase()} ${day}`,
    spoken: es ? `${day} de ${monthEs}` : `${monthEn} ${day}`,
  }
}

/** Las menciones van al final del pie, una por línea, para que el artista las reciba. */
export function appendInstagramMentions(caption: string, mentions: string[]): string {
  const handles = [...new Set(mentions.map((m) => m.trim()).filter((m) => /^@[A-Za-z0-9._]{1,30}$/.test(m)))]
  const text = caption.trim()
  if (!handles.length) return text
  const set = new Set(handles.map((h) => h.toLowerCase()))
  const lines = text.split('\n')
  const first = lines[0]?.trim().split(/\s+/).filter(Boolean) ?? []
  if (first.length && first.every((part) => set.has(part.toLowerCase()))) {
    lines.shift()
    while (lines[0] === '') lines.shift()
  }
  const body = lines.filter((line) => !set.has(line.trim().toLowerCase())).join('\n').replace(/\n{3,}/g, '\n\n').trim()
  return `${body}\n\n${handles.join('\n')}`
}

/** Los @ van al final, mientras quepan en el tope de Instagram (2.200). */
export function captionWithMentions(caption: string, mentions: string[], max = 2200): string {
  const handles = [...new Set(mentions.map((m) => m.trim()).filter((m) => /^@[A-Za-z0-9._]{1,30}$/.test(m)))]
  const kept: string[] = []
  for (const handle of handles) {
    const next = appendInstagramMentions(caption, [...kept, handle])
    if (next.length > max) break
    kept.push(handle)
  }
  return kept.length ? appendInstagramMentions(caption, kept) : caption.trim()
}

export async function aiShareCaption(opts: {
  kind: ShareCaptionKind
  platform: SharePlatform
  /** Idioma de la página. El pie va igual: español arriba, inglés debajo. */
  lang: Locale | string
  url: string
  context: Record<string, unknown>
  /** Plantilla en un idioma: se usa en los dos (ver `bilingualCaption`). */
  fallback: (lang: Locale) => string
}): Promise<string> {
  // Español primero siempre, también desde /en: el público y los artistas son sobre todo españoles.
  const fallback = bilingualCaption(opts.fallback('es'), opts.fallback('en'), {
    lang: 'es',
    url: opts.url,
    platform: opts.platform,
  })
  try {
    const res = await fetch('/api/admin/share-caption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: opts.kind,
        platform: opts.platform,
        lang: 'es',
        url: opts.url,
        context: opts.context,
      }),
      signal: AbortSignal.timeout(55_000),
    })
    const j = (await res.json().catch(() => ({}))) as { caption?: string; mentions?: unknown }
    const mentions = Array.isArray(j.mentions) ? j.mentions.filter((m): m is string => typeof m === 'string') : []
    const raw = res.ok ? j.caption?.trim() || fallback : fallback
    return captionWithMentions(withInstagramShareCta(raw, opts.platform), mentions)
  } catch {
    return withInstagramShareCta(fallback, opts.platform)
  }
}

const SHARE_CTA_ES =
  'Y si te gusta este reel, compártelo. Dale al sobre de enviar y mándaselo a tu gente, a tus amigos. Eso es lo que más ayuda a difundir el breakbeat.'
const SHARE_CTA_EN =
  'And if you like this reel, share it. Hit the send button and pass it to your people, to your friends. That is what spreads breakbeat the most.'

/** En el pie de Instagram, justo antes del enlace: el sobre de enviar. */
export function withInstagramShareCta(caption: string, platform: SharePlatform): string {
  if (platform !== 'instagram') return caption
  if (/sobre de enviar/i.test(caption)) return caption
  const lines = caption.split('\n')
  const last = (pred: (line: string) => boolean) => {
    for (let i = lines.length - 1; i >= 0; i--) if (pred(lines[i])) return i
    return -1
  }
  const enAt = lines.findIndex((l) => l.trim() === '🇬🇧 EN')
  const insert = (at: number, block: string) => {
    lines.splice(Math.max(0, at), 0, '', block, '')
  }
  if (enAt >= 0) insert(enAt, SHARE_CTA_ES)
  const linkAt = last((l) => /enlace en la bio|link in bio/i.test(l))
  const hashAt = last((l) => /^#\S/.test(l.trim()))
  const tail = linkAt >= 0 ? linkAt : hashAt >= 0 ? hashAt : lines.length
  insert(tail, enAt >= 0 ? SHARE_CTA_EN : `${SHARE_CTA_ES}\n${SHARE_CTA_EN}`)
  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim()
}

/**
 * Pie bilingüe a partir de dos plantillas: la del idioma de la página entera y,
 * debajo, el cuerpo de la otra (≈ 650 caracteres). El enlace y los hashtags van
 * una sola vez, al final; el enlace de Instagram, en los dos idiomas.
 */
export function bilingualCaption(
  main: string,
  other: string,
  opts: { lang: Locale; url: string; platform: SharePlatform },
): string {
  const es = opts.lang === 'es'
  const body = (t: string) =>
    t
      .split('\n')
      .filter((l) => !/^#\S/.test(l.trim()))
      .map((l) => {
        let cut = l.trimEnd()
        if (opts.url && cut.endsWith(opts.url)) cut = cut.slice(0, -opts.url.length)
        cut = cut.replace(/(enlace en la bio|link in bio)\.?$/i, '').replace(/[\s:·]+$/, '')
        if (cut === l.trimEnd()) return l
        // «🎧 Escúchalo en Optimal Breaks: enlace en la bio.» → se queda la acción; «🔗 Enlace en la bio.» → fuera.
        return /[\p{L}\p{N}]/u.test(cut) ? `${cut}.` : null
      })
      .filter((l): l is string => l !== null)
      .join('\n')
      .replace(/\n{3,}/g, '\n\n')
      .trim()
  const tags = main.split('\n').filter((l) => /^#\S/.test(l.trim())).pop() ?? ''
  let alt = ''
  for (const p of body(other).split(/\n{2,}/)) {
    if (alt && alt.length + p.length > 650) break
    alt += (alt ? '\n\n' : '') + p
  }
  const link =
    opts.platform === 'instagram'
      ? es
        ? '🔗 Enlace en la bio · Link in bio'
        : '🔗 Link in bio · Enlace en la bio'
      : `👉 ${opts.url}`
  return [body(main), alt ? `${es ? '🇬🇧 EN' : '🇪🇸 ES'}\n${alt}` : '', link, tags].filter(Boolean).join('\n\n')
}

/** Plantilla (sin IA) de los vídeos de página. Máx. 5 hashtags genéricos. */
/** Plantilla del reel del regalo. El modelo la sustituye si responde. */
export function buildGiftVideoCaption(
  d: { title: string; artist: string; also: string[] },
  opts: { lang: Locale | string; url: string; platform: SharePlatform },
): string {
  const es = opts.lang !== 'en'
  const link = opts.platform === 'instagram' ? (es ? '🔗 Enlace en la bio.' : '🔗 Link in bio.') : `👉 ${opts.url}`
  const also = d.also.slice(0, 4).map((title) => `🎧 ${title}`)
  return [
    es
      ? `🎁 ${d.artist} regala «${d.title}». El tema entero, y se puede descargar.`
      : `🎁 ${d.artist} is giving away “${d.title}”. The whole track, and you can download it.`,
    '',
    es
      ? 'Se oye de principio a fin en Optimal Breaks. La descarga pide una cuenta, seguir a @optimal.breaks y a @woter_dj, y dos capturas donde se lea Siguiendo.'
      : 'It plays start to finish on Optimal Breaks. The download needs an account, a follow of @optimal.breaks and of @woter_dj, and two screenshots that show Following.',
    '',
    ...also,
    also.length
      ? es
        ? 'Y esto también es suyo: lo más guardado, en el mismo artículo.'
        : 'And this is his too: the most saved, in the same article.'
      : '',
    '',
    es ? '¿Ya lo has metido en un set? 👇' : 'Have you played it in a set yet? 👇',
    '',
    link,
    '',
    '#breakbeat #breaks #freedownload #electronicmusic #dj',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
}

export function buildPageVideoCaption(
  kind: 'top100' | 'week' | 'blog' | 'events' | 'digest' | 'day',
  d: {
    title?: string
    count?: number
    weekLabel?: string
    first?: string
    excerpt?: string
    /** Resumen de /topreleases. */
    period?: 'FORTNIGHT' | 'MONTH' | 'QUARTER' | 'WEEK'
    artists?: number
    labels?: number
    topPlayed?: string
    topSaved?: string
    bpm?: number | null
    /** `YYYY-MM-DD` del artículo del día. El presente solo vale si es hoy en Madrid. */
    dayIso?: string
    /** Temas que suenan en el reel del día. Una línea cada uno. */
    tracks?: { artists: string; title: string }[]
    /** true = esas líneas son la selección de Optimal Breaks. */
    selection?: boolean
  },
  opts: { lang: Locale | string; url: string; platform: SharePlatform },
): string {
  const es = opts.lang !== 'en'
  const link =
    opts.platform === 'instagram' ? (es ? '🔗 Enlace en la bio.' : '🔗 Link in bio.') : `👉 ${opts.url}`
  if (kind === 'top100') {
    return [
      es ? '🏆 Los 10 breaks que más ha guardado la comunidad.' : '🏆 The 10 breaks our community saved the most.',
      d.first ? (es ? `El #1 ahora mismo: ${d.first}.` : `Current #1: ${d.first}.`) : '',
      es ? 'Sin votos ni encuestas: solo saves reales.' : 'No votes, no polls: only real saves.',
      es ? '¿Cuál pondrías tú en el #1? 👇' : 'Which one would you put at #1? 👇',
      '',
      link,
      '',
      '#breakbeat #breaks #top100 #electronicmusic #dj',
    ]
      .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
      .join('\n')
  }
  if (kind === 'week') {
    return [
      es
        ? `🆕 ${d.count ?? ''} lanzamientos nuevos de breakbeat esta semana${d.weekLabel ? ` (${d.weekLabel})` : ''}.`
        : `🆕 ${d.count ?? ''} new breakbeat releases this week${d.weekLabel ? ` (${d.weekLabel})` : ''}.`,
      es ? 'Seleccionados uno a uno por Optimal Breaks.' : 'Hand-picked by Optimal Breaks.',
      es ? 'Guárdalo para tu próxima sesión 💾' : 'Save it for your next set 💾',
      '',
      link,
      '',
      '#breakbeat #newmusic #newreleases #breaks #electronicmusic',
    ].join('\n')
  }
  if (kind === 'events') {
    return [
      es
        ? '🎉 Eventos de los próximos 14 días. Te los vas a perder.'
        : "🎉 The next 14 days of events. You're gonna miss them.",
      es
        ? `${d.count ?? ''} citas de breakbeat${d.weekLabel ? ` (${d.weekLabel})` : ''}.`
        : `${d.count ?? ''} breakbeat nights${d.weekLabel ? ` (${d.weekLabel})` : ''}.`,
      d.first ? (es ? `Abre ${d.first}.` : `It opens with ${d.first}.`) : '',
      es ? '¿A cuál vas? Etiqueta a quien te acompaña 👇' : 'Which one are you hitting? Tag who you are taking 👇',
      '',
      link,
      '',
      '#breakbeat #rave #electronicmusic #festival #dj',
    ]
      .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
      .join('\n')
  }
  if (kind === 'digest') {
    const week = d.period === 'WEEK'
    const p = es
      ? d.period === 'QUARTER' ? 'del trimestre' : d.period === 'MONTH' ? 'del mes' : week ? 'de la semana que viene' : 'de la quincena'
      : d.period === 'QUARTER' ? 'quarter' : d.period === 'MONTH' ? 'month' : week ? 'next week' : 'fortnight'
    return [
      es ? `📊 El breakbeat ${p}, en datos.` : `📊 The ${p} in breakbeat, in numbers.`,
      d.title || null,
      '',
      es
        ? `${d.count ?? ''} temas nuevos de ${d.artists ?? ''} artistas y ${d.labels ?? ''} sellos${d.weekLabel ? ` (${d.weekLabel})` : ''}.`
        : `${d.count ?? ''} new tracks from ${d.artists ?? ''} artists and ${d.labels ?? ''} labels${d.weekLabel ? ` (${d.weekLabel})` : ''}.`,
      !week && d.topPlayed ? (es ? `🎧 El más escuchado en la web: ${d.topPlayed}.` : `🎧 Most played on the site: ${d.topPlayed}.`) : null,
      !week && d.topSaved ? (es ? `➕ El más guardado: ${d.topSaved}.` : `➕ Most saved: ${d.topSaved}.`) : null,
      d.bpm ? (es ? `BPM medio: ${d.bpm}.` : `Average BPM: ${d.bpm}.`) : null,
      '',
      es ? '¿Cuál ha sido tu tema? ¿Falta alguno? 👇' : 'What was your track? Anything missing? 👇',
      '',
      link,
      '',
      '#breakbeat #breaks #newreleases #newmusic #electronicmusic',
    ]
      .filter((l): l is string => l !== null)
      .join('\n')
  }
  if (kind === 'day') {
    const spoken = d.dayIso ? dayReelTense(d.dayIso, es) : null
    const when = spoken && !spoken.today ? spoken.spoken : ''
    const tracks = (d.tracks ?? []).slice(0, 5).map((t) => `🎧 ${t.artists} — ${t.title}`)
    const head = when
      ? (es ? `🆕 ${d.count ?? ''} lanzamientos de breakbeat salieron el ${when}` : `🆕 ${d.count ?? ''} breakbeat releases came out on ${when}`)
      : (es ? `🆕 ${d.count ?? ''} lanzamientos de breakbeat salen hoy` : `🆕 ${d.count ?? ''} breakbeat releases are out today`)
    const mid = es
      ? `➕ ${d.selection ? 'La selección de Optimal Breaks. ' : ''}${d.count ?? ''} temas. El resto, en la web.`
      : `➕ ${d.selection ? 'The Optimal Breaks selection. ' : ''}${d.count ?? ''} tracks. The rest, on the site.`
    return [
      head,
      '',
      ...tracks,
      tracks.length ? '' : null,
      mid,
      es ? '👉 Mándaselo a quien pincha breakbeat.' : '👉 Send it to whoever plays breakbeat.',
      '',
      link,
      '',
      '#breakbeat #breaks #ukbreaks #breakbeatmusic #newreleases',
    ]
      .filter((l): l is string => l !== null)
      .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
      .join('\n')
  }
  return [
    `📰 ${d.title || ''}`,
    d.excerpt ? d.excerpt.slice(0, 220) : '',
    es ? '¿Qué te parece? Te leemos 👇' : 'What do you think? Tell us 👇',
    '',
    link,
    '',
    '#breakbeat #breaks #electronicmusic #musicnews #dj',
  ]
    .filter((l, i, a) => !(l === '' && a[i - 1] === ''))
    .join('\n')
}
