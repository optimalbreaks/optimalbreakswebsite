// ============================================
// OPTIMAL BREAKS — Texto del post para los vídeos R/F
// Admin: todos los tipos. Artista con ficha reclamada: solo tema y sesión.
//
// POST { kind, platform, lang, url, context } → { caption }
//   kind: 'track' | 'set' | 'top100' | 'week' | 'blog' | 'events' | 'digest'
//   platform: 'instagram' (enlace en la bio) | 'facebook' (URL en el texto)
//
// Lo escribe GPT‑5.6 (OPENAI_SHARE_CAPTION_MODEL u OPENAI_MODEL) con un tono
// distinto para cada tipo de publicación, pensado para el algoritmo de
// Instagram: gancho en la primera línea, datos concretos, llamada a comentar o
// guardar y, como mucho, 5 hashtags genéricos de gran difusión. Nunca hashtags
// de artistas, sellos o festivales: esos los etiqueta el admin a mano (se
// filtran también aquí por si el modelo se los salta).
// Bilingüe (25 oct 2026): español arriba y un bloque más corto en inglés debajo
// («🇬🇧 EN»); enlace y hashtags una sola vez, al final. El cliente manda siempre
// `lang: 'es'`, también desde /en: el público y los artistas son sobre todo españoles.
// Si falla, el cliente usa el texto de plantilla, también bilingüe (`bilingualCaption`).
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrClaimedArtist } from '@/lib/admin-auth'
import { isGpt5Family, openAiChatCompletionsBody, resolveOpenAiModel } from '@/lib/openai-editorial'
import { madridCalendarDate } from '@/lib/share-track'

export const runtime = 'nodejs'
export const maxDuration = 60

type Kind = 'track' | 'set' | 'top100' | 'week' | 'blog' | 'events' | 'digest'
const KINDS: readonly Kind[] = ['track', 'set', 'top100', 'week', 'blog', 'events', 'digest']
type Platform = 'instagram' | 'facebook'

const KIND_ES: Record<Kind, string> = {
  track: [
    'Un tema concreto que recomendamos (reel con su portada animada). Vende por qué merece la pena escucharlo: energía, estilo, para qué momento de una sesión.',
    'El vídeo lleva un adhesivo grande con el estado del tema (`releaseStatus` del contexto) y el texto debe ir en la misma línea:',
    '· coming_soon (COMING SOON): aún no ha salido. Crea expectación, di cuándo sale y cuántos días faltan, invita a guardar el reel para el día del lanzamiento. No digas que ya se puede comprar ni escuchar entero.',
    '· new_release (NEW RELEASE): salió hace poco (días en `daysSinceRelease`). Es novedad: está en nuestras New Releases, invita a escucharlo, guardarlo y meterlo en sus sets.',
    '· archive_pick (ARCHIVE PICK): tema con meses o años. Rescate del archivo: por qué sigue sonando hoy, el año en que salió, invita a recordar si lo pinchaban o lo bailaban. No lo vendas como novedad.',
    '· sin releaseStatus: recomendación sin fecha; no hables de novedad ni de archivo.',
  ].join('\n'),
  set:
    'Una sesión (DJ set) grabada en directo en un festival o evento. Transmite el directo con los datos que hay: festival o evento, ciudad, fecha, quién la pinchó y si se puede descargar gratis en MP3 (`freeDownload`) o escuchar entera. Si se descarga, dilo arriba: es lo que más se guarda.',
  top100:
    'El Top 100 de la comunidad Optimal Breaks: los temas que más han guardado los usuarios (el vídeo es una cuenta atrás del 10 al 1). Destaca el #1 y provoca debate sobre el ranking.',
  week:
    'Los nuevos lanzamientos (New Releases) de breakbeat de la semana seleccionados por Optimal Breaks. Destaca el volumen y algunos nombres, e invita a descubrir la selección.',
  blog:
    'Un artículo del blog de Optimal Breaks. Da ganas de leerlo con un gancho sobre el tema del artículo, sin contarlo todo.',
  events:
    'La agenda de breakbeat de los próximos 14 días. El vídeo abre con «te los vas a perder» y luego enseña el cartel, la fecha, la ciudad y el lineup de cada evento, cinco segundos por cita. Nombra varias con ciudad y día. Invita a decir a cuál van.',
  digest: [
    'El resumen de datos de una quincena o un trimestre de lanzamientos de breakbeat (sección Top Releases de Optimal Breaks). El vídeo dura 60 s y enseña, por escenas: cuántos temas, artistas y sellos salieron (y la diferencia con el periodo anterior), los 5 más escuchados en la web, los 5 más guardados con el «+», los artistas y sellos que más sacaron, las estrellas del Top 100 con música nueva, el BPM medio y las portadas.',
    'Cuenta los datos reales del contexto: el #1 en escuchas y el #1 en guardados con su artista, el volumen y si sube o baja, el artista y el sello más activos, el BPM medio y la tonalidad más usada si están. Explica en una frase que las escuchas son solo las de optimalbreaks.com y que cada «+» es un voto. Si `period` es WEEK, son los temas que salen la semana que viene (adelantos): no hables de escuchas pasadas.',
    'Cierra preguntando cuál fue su tema del periodo o si falta alguno.',
  ].join('\n'),
}
const KIND_EN: Record<Kind, string> = {
  track: [
    'One specific track we recommend (reel with its animated artwork). Sell why it is worth a listen: energy, style, when it works in a set.',
    'The video carries a big sticker with the track status (`releaseStatus` in the context) and the caption must match it:',
    '· coming_soon (COMING SOON): not out yet. Build anticipation, say when it drops and how many days are left, invite people to save the reel for release day. Never say it can already be bought or streamed in full.',
    '· new_release (NEW RELEASE): out recently (days in `daysSinceRelease`). It is new: it is in our New Releases, invite people to listen, save it and play it in their sets.',
    '· archive_pick (ARCHIVE PICK): months or years old. An archive pick: why it still works today, the year it came out, ask whether people played or danced to it back then. Do not sell it as new.',
    '· no releaseStatus: a recommendation without a date; do not talk about new or archive.',
  ].join('\n'),
  set: 'A DJ set recorded live at a festival or event. Convey the live set with the facts you have: festival or event, city, date, who played it and whether it is a free MP3 download (`freeDownload`) or can be streamed in full. If it downloads, say so near the top: that is what gets saved most.',
  top100: 'The Optimal Breaks community Top 100: the tracks users saved the most (the video counts down from 10 to 1). Highlight the #1 and spark debate about the ranking.',
  week: "This week's new breakbeat releases (New Releases) curated by Optimal Breaks. Highlight the volume and a few names, and invite people to dig into the selection.",
  blog: 'An Optimal Breaks blog article. Make people want to read it with a hook about the topic, without giving everything away.',
  events:
    "The next 14 days of breakbeat events. The video opens with “you're gonna miss them”, then shows each night's poster, date, city and lineup, five seconds each. Name a few with city and day. Ask which one people are going to.",
  digest: [
    "The data recap of a fortnight or a quarter of breakbeat releases (Optimal Breaks Top Releases). The 60 s video shows, scene by scene: how many tracks, artists and labels came out (and the change vs the previous period), the 5 most played on the site, the 5 most saved with the «+», the artists and labels that released the most, community Top 100 stars with new music, the average BPM and the covers.",
    'Tell the real facts from the context: the #1 by plays and the #1 by saves with their artist, the volume and whether it is up or down, the busiest artist and label, the average BPM and top key if present. Explain in one sentence that plays only count on optimalbreaks.com and every «+» is a vote. If `period` is WEEK, these are next week’s releases (previews): do not talk about past plays.',
    'Close by asking what their track of the period was or what is missing.',
  ].join('\n'),
}

const DEFAULT_TAGS: Record<Kind, string[]> = {
  track: ['#breakbeat', '#breaks', '#newmusic', '#electronicmusic', '#dj'],
  set: ['#breakbeat', '#djset', '#breaks', '#livemusic', '#electronicmusic'],
  top100: ['#breakbeat', '#breaks', '#top100', '#electronicmusic', '#dj'],
  week: ['#breakbeat', '#newmusic', '#newreleases', '#breaks', '#electronicmusic'],
  blog: ['#breakbeat', '#breaks', '#electronicmusic', '#musicnews', '#dj'],
  events: ['#breakbeat', '#rave', '#electronicmusic', '#festival', '#dj'],
  digest: ['#breakbeat', '#breaks', '#newreleases', '#newmusic', '#electronicmusic'],
}

function norm(s: string): string {
  return s
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/gi, '')
    .toLowerCase()
}

/** Nombres que no pueden ir como hashtag: artistas, sellos, festivales, la propia web. */
function bannedNames(ctx: Record<string, unknown>): string[] {
  const out = new Set<string>(['optimalbreaks'])
  const add = (v: unknown) => {
    if (typeof v === 'string') {
      for (const part of v.split(/,|&|·|\/| vs\.? | b2b | x | feat\.? | ft\.? /i)) {
        const n = norm(part)
        if (n.length >= 3) out.add(n)
      }
    } else if (Array.isArray(v)) v.forEach(add)
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>
      add(o.name)
      add(o.place)
      add(o.city)
      add(o.lineup)
      add(o.artists)
      add(o.artist)
      add(o.label)
    }
  }
  for (const k of ['artists', 'artist', 'label', 'labels', 'festival', 'edition', 'eventName', 'tracks', 'rows', 'highlights', 'events', 'lineup', 'place', 'names', 'mostPlayed', 'mostSaved', 'topArtists', 'topLabels', 'communityStars', 'newToCatalogue']) add(ctx[k])
  return [...out]
}

/** Quita hashtags del cuerpo, filtra los prohibidos y deja ≤5 en la última línea. */
function cleanCaption(raw: string, kind: Kind, ctx: Record<string, unknown>, platform: Platform, url: string, es: boolean): string {
  const banned = bannedNames(ctx)
  const tags: string[] = []
  const body = raw
    .replace(/#[\p{L}\p{N}_]+/gu, (m) => {
      tags.push(m.toLowerCase())
      return ''
    })
    .split('\n')
    .map((l) => l.replace(/[ \t]+$/g, '').replace(/ {2,}/g, ' '))
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  const ok: string[] = []
  for (const t of tags) {
    const n = norm(t)
    if (!n || n.length < 3) continue
    // El tag contiene un nombre prohibido (#djbrownie, #soundperfectbreakz…). Al revés no:
    // el sello «Break Beat Connection» no debe tumbar #breakbeat.
    if (banned.some((b) => n === b || (b.length >= 5 && n.includes(b)))) continue
    const tag = `#${n}`
    if (!ok.includes(tag)) ok.push(tag)
    if (ok.length === 5) break
  }
  for (const d of DEFAULT_TAGS[kind]) {
    if (ok.length >= 3) break
    if (!ok.includes(d)) ok.push(d)
  }
  let text = body
  if (platform === 'facebook' && url && !text.includes(url)) text += `\n\n👉 ${url}`
  if (platform === 'instagram' && !/bio\b/i.test(text)) text += `\n\n${es ? '🔗 Enlace en la bio · Link in bio' : '🔗 Link in bio · Enlace en la bio'}`
  return `${text}\n\n${ok.slice(0, 5).join(' ')}`.trim()
}

export async function POST(request: NextRequest) {
  const auth = await requireAdminOrClaimedArtist()
  if (!auth.ok) return auth.response
  const key = process.env.OPENAI_API_KEY?.trim()
  if (!key) return NextResponse.json({ error: 'Falta OPENAI_API_KEY' }, { status: 500 })

  let body: { kind?: string; platform?: string; lang?: string; url?: string; context?: unknown }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }
  const kind = KINDS.find((k) => k === body.kind)
  if (!kind) return NextResponse.json({ error: 'kind no válido' }, { status: 400 })
  if (auth.role !== 'admin' && kind !== 'track' && kind !== 'set') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  const platform: Platform = body.platform === 'facebook' ? 'facebook' : 'instagram'
  const es = body.lang !== 'en'
  const url = typeof body.url === 'string' ? body.url.slice(0, 300) : ''
  const ctx = body.context && typeof body.context === 'object' ? (body.context as Record<string, unknown>) : {}
  const ctxJson = JSON.stringify(ctx).slice(0, 6000)
  const today = madridCalendarDate()
  // Un tema admite pie largo: Instagram indexa el texto para su buscador y un
  // pie con contexto retiene más. Tope de Instagram: 2.200 caracteres.
  const long = kind === 'track' || kind === 'digest'
  const factsEs =
    kind === 'digest'
      ? 'las cifras del periodo, los #1 en escuchas y en guardados, quién y qué sello sacó más, y el BPM'
      : 'artistas, sello, fecha, cuántos días faltan o lleva fuera'
  const factsEn =
    kind === 'digest'
      ? 'the period figures, the #1 by plays and by saves, the busiest artist and label, and the BPM'
      : 'artists, label, date, days to go or days out'

  const system = es
    ? [
        'Eres el community manager de Optimal Breaks, la web de referencia del breakbeat (breaks, nu skool, florida breaks, UK bass…).',
        `Escribes el texto (pie) de un vídeo para ${platform === 'instagram' ? 'un reel de Instagram' : 'un post de Facebook'}.`,
        'Objetivo: que el algoritmo lo distribuya: que la gente se pare, lo lea, comente, lo guarde y lo comparta.',
        'Reglas:',
        '- Español de España, natural y cercano, con criterio de DJ y amante del breakbeat. Nada de tono publicitario ni frases hechas vacías. No empieces por «Compartimos».',
        '- Primera línea: gancho de máximo 90 caracteres que se entienda sola (es lo único visible antes de «… más»). Puede empezar con 1 emoji.',
        long
          ? `- Después, 3 párrafos cortos (1–3 frases cada uno, separados por una línea en blanco): los datos del contexto (${factsEs}), por qué escucharlo, y una línea para DJs con BPM y tonalidad si los hay. Usa de forma natural palabras que la gente busca en Instagram (breakbeat, breaks, nu skool, DJ set, rave, nuevo tema…). No inventes datos que no estén en el contexto (ni remezclas, ni historia, ni premios); lo que digas del sonido, en términos generales del género.`
          : '- Después 2–3 párrafos cortos (separados por una línea en blanco) con datos concretos del contexto (fechas, BPM, ciudad, festival, número de temas, puestos, nombres…). Usa de forma natural palabras que la gente busca en Instagram (breakbeat, breaks, DJ set, rave, nuevos lanzamientos…). No inventes nada que no esté en el contexto (ni ambiente, ni público, ni anécdotas).',
        '- Una línea que invite a interactuar de forma concreta para esta publicación (una pregunta para comentar, guardar para el finde, etiquetar a alguien…).',
        `- Bilingüe: todo lo anterior, en español, ocupa ${long ? '1.100–1.300' : '450–550'} caracteres. Después, una línea en blanco, una línea «🇬🇧 EN» y un bloque en inglés de ${long ? '500–600' : '450–550'} caracteres con su propio gancho, los datos clave y la pregunta, escrito para quien lee en inglés (no una traducción literal). Los mismos datos: nada que no esté en el español.`,
        platform === 'instagram'
          ? '- Enlace: una sola vez, al final, antes de los hashtags, exactamente «🔗 Enlace en la bio · Link in bio». Sin URL (en Instagram no es clicable).'
          : `- Enlace: una sola vez, al final, antes de los hashtags, esta URL tal cual en una línea propia: ${url}`,
        '- Puedes nombrar artistas y sellos en el texto, sin @ (las menciones las pone el admin).',
        '- Última línea: como mucho 5 hashtags, en minúsculas, separados por espacios. PROHIBIDOS hashtags con nombres de artistas, sellos, festivales, eventos o de Optimal Breaks. Solo términos genéricos de gran difusión relacionados con el contenido (género, escena, formato): p. ej. #breakbeat #breaks #djset #newmusic #electronicmusic #ravemusic #vinyl… Elige los de más alcance que encajen.',
        long
          ? '- En total, con hashtags, nunca más de 2.050 caracteres (Instagram corta en 2.200) y como mucho 7 emojis.'
          : '- En total, con hashtags, nunca más de 1.250 caracteres y como mucho 6 emojis.',
        'Responde SOLO JSON: {"caption": string}',
      ].join('\n')
    : [
        'You are the social media manager of Optimal Breaks, the go-to breakbeat website (breaks, nu skool, florida breaks, UK bass…).',
        `You write the caption of a video for ${platform === 'instagram' ? 'an Instagram reel' : 'a Facebook post'}.`,
        'Goal: get the algorithm to push it: people stop, read, comment, save and share.',
        'Rules:',
        '- Natural English with a DJ’s taste. No ad-speak, no empty clichés. Do not start with “Sharing”.',
        '- First line: a hook of max 90 characters that works on its own (it is all people see before “… more”). May start with 1 emoji.',
        long
          ? `- Then 3 short paragraphs (1–3 sentences each, separated by a blank line): the facts from the context (${factsEn}), why to listen, and a line for DJs with BPM and key if present. Work in naturally the words people search on Instagram (breakbeat, breaks, nu skool, DJ set, rave, new track…). Never invent facts not in the context (no remixes, history or awards); describe the sound only in general genre terms.`
          : '- Then 2–3 short paragraphs (separated by a blank line) with concrete facts from the context (dates, BPM, city, festival, number of tracks, positions, names…). Work in naturally the words people search on Instagram (breakbeat, breaks, DJ set, rave, new releases…). Never invent anything not in the context (no vibe, crowd or anecdotes).',
        '- One line inviting interaction, specific to this post (a question to comment, save it for the weekend, tag someone…).',
        `- Bilingual: everything above, in English, takes ${long ? '1,100–1,300' : '450–550'} characters. Then a blank line, a line «🇪🇸 ES» and a block in Spanish from Spain of ${long ? '500–600' : '450–550'} characters with its own hook, the key facts and the question, written for Spanish readers (not a literal translation). Same facts: nothing that is not in the English.`,
        platform === 'instagram'
          ? '- Link: once, at the end, before the hashtags, exactly «🔗 Link in bio · Enlace en la bio». No URL (not clickable on Instagram).'
          : `- Link: once, at the end, before the hashtags, this URL as-is on its own line: ${url}`,
        '- You may name artists and labels in the text, without @ (the admin adds the tags).',
        '- Last line: at most 5 lowercase hashtags separated by spaces. NEVER hashtags with artist, label, festival, event or Optimal Breaks names. Only generic high-reach terms related to the content (genre, scene, format): e.g. #breakbeat #breaks #djset #newmusic #electronicmusic #ravemusic #vinyl… Pick the highest-reach ones that fit.',
        long
          ? '- In total, with hashtags, never over 2,050 characters (Instagram cuts at 2,200) and at most 7 emojis.'
          : '- In total, with hashtags, never over 1,250 characters and at most 6 emojis.',
        'Reply ONLY JSON: {"caption": string}',
      ].join('\n')

  const user = `${es ? 'Tipo de publicación' : 'Post type'}: ${(es ? KIND_ES : KIND_EN)[kind]}\n${es ? 'Fecha de hoy' : 'Today'}: ${today}\n${es ? 'Contexto (datos reales)' : 'Context (real data)'}:\n${ctxJson}`

  const model = resolveOpenAiModel('OPENAI_SHARE_CAPTION_MODEL')
  const payload = openAiChatCompletionsBody({
    model,
    messages: [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    responseFormat: { type: 'json_object' },
    maxCompletionTokens: 4000,
    temperature: 0.8,
  })
  if (isGpt5Family(model)) payload.reasoning_effort = 'low'

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(50_000),
    })
    if (!res.ok) {
      const t = await res.text()
      console.error('[share-caption] OpenAI', res.status, t.slice(0, 400))
      return NextResponse.json({ error: `OpenAI ${res.status}` }, { status: 502 })
    }
    const j = (await res.json()) as { choices?: { message?: { content?: string } }[] }
    const content = j.choices?.[0]?.message?.content || ''
    let caption = ''
    try {
      caption = String((JSON.parse(content) as { caption?: unknown }).caption || '')
    } catch {
      caption = content
    }
    caption = caption.trim()
    if (!caption) return NextResponse.json({ error: 'Respuesta vacía' }, { status: 502 })
    return NextResponse.json({ caption: cleanCaption(caption, kind, ctx, platform, url, es), model })
  } catch (err) {
    console.error('[share-caption]', err)
    return NextResponse.json({ error: 'No se pudo generar el texto' }, { status: 502 })
  }
}
