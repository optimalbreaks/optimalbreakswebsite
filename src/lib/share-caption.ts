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

export type ShareCaptionKind = 'track' | 'set' | 'top100' | 'week' | 'blog' | 'events' | 'digest'
export type SharePlatform = 'instagram' | 'facebook'

export async function aiShareCaption(opts: {
  kind: ShareCaptionKind
  platform: SharePlatform
  lang: Locale | string
  url: string
  context: Record<string, unknown>
  fallback: string
}): Promise<string> {
  try {
    const res = await fetch('/api/admin/share-caption', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        kind: opts.kind,
        platform: opts.platform,
        lang: opts.lang,
        url: opts.url,
        context: opts.context,
      }),
      signal: AbortSignal.timeout(55_000),
    })
    if (!res.ok) return opts.fallback
    const j = (await res.json()) as { caption?: string }
    return j.caption?.trim() || opts.fallback
  } catch {
    return opts.fallback
  }
}

/** Plantilla (sin IA) de los vídeos de página. Máx. 5 hashtags genéricos. */
export function buildPageVideoCaption(
  kind: 'top100' | 'week' | 'blog' | 'events' | 'digest',
  d: {
    title?: string
    count?: number
    weekLabel?: string
    first?: string
    excerpt?: string
    /** Resumen de /topreleases. */
    period?: 'FORTNIGHT' | 'QUARTER' | 'WEEK'
    artists?: number
    labels?: number
    topPlayed?: string
    topSaved?: string
    bpm?: number | null
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
      ? d.period === 'QUARTER' ? 'trimestre' : week ? 'semana que viene' : 'quincena'
      : d.period === 'QUARTER' ? 'quarter' : week ? 'next week' : 'fortnight'
    return [
      es ? `📊 El breakbeat de la ${p}, en datos.` : `📊 The ${p} in breakbeat, in numbers.`,
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
