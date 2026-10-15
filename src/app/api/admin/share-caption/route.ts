// ============================================
// OPTIMAL BREAKS — Texto del post para los vídeos R/F
// Admin: todos los tipos. Artista con ficha reclamada: solo tema y sesión.
//
// POST { kind, platform, lang, url, context } → { caption }
//   kind: 'track' | 'set' | 'top100' | 'week' | 'blog'
//   platform: 'instagram' (enlace en la bio) | 'facebook' (URL en el texto)
//
// Lo escribe GPT‑5.6 (OPENAI_SHARE_CAPTION_MODEL u OPENAI_MODEL) con un tono
// distinto para cada tipo de publicación, pensado para el algoritmo de
// Instagram: gancho en la primera línea, datos concretos, llamada a comentar o
// guardar y, como mucho, 5 hashtags genéricos de gran difusión. Nunca hashtags
// de artistas, sellos o festivales: esos los etiqueta el admin a mano (se
// filtran también aquí por si el modelo se los salta).
// Si falla, el cliente usa el texto de plantilla (`share-track.ts`).
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAdminOrClaimedArtist } from '@/lib/admin-auth'
import { isGpt5Family, openAiChatCompletionsBody, resolveOpenAiModel } from '@/lib/openai-editorial'

export const runtime = 'nodejs'
export const maxDuration = 60

type Kind = 'track' | 'set' | 'top100' | 'week' | 'blog'
type Platform = 'instagram' | 'facebook'

const KIND_ES: Record<Kind, string> = {
  track:
    'Un tema concreto que recomendamos (reel con su portada animada). Vende por qué merece la pena escucharlo: energía, estilo, para qué momento de una sesión.',
  set:
    'Una sesión (DJ set) grabada en directo en un festival o evento. Transmite el directo: sitio, ambiente, quién la pinchó y si se puede descargar o escuchar entera.',
  top100:
    'El Top 100 de la comunidad Optimal Breaks: los temas que más han guardado los usuarios (el vídeo es una cuenta atrás del 10 al 1). Destaca el #1 y provoca debate sobre el ranking.',
  week:
    'Los nuevos lanzamientos (New Releases) de breakbeat de la semana seleccionados por Optimal Breaks. Destaca el volumen y algunos nombres, e invita a descubrir la selección.',
  blog:
    'Un artículo del blog de Optimal Breaks. Da ganas de leerlo con un gancho sobre el tema del artículo, sin contarlo todo.',
}
const KIND_EN: Record<Kind, string> = {
  track: 'One specific track we recommend (reel with its animated artwork). Sell why it is worth a listen: energy, style, when it works in a set.',
  set: 'A DJ set recorded live at a festival or event. Convey the live vibe: venue, crowd, who played it, and whether it can be downloaded or streamed in full.',
  top100: 'The Optimal Breaks community Top 100: the tracks users saved the most (the video counts down from 10 to 1). Highlight the #1 and spark debate about the ranking.',
  week: "This week's new breakbeat releases (New Releases) curated by Optimal Breaks. Highlight the volume and a few names, and invite people to dig into the selection.",
  blog: 'An Optimal Breaks blog article. Make people want to read it with a hook about the topic, without giving everything away.',
}

const DEFAULT_TAGS: Record<Kind, string[]> = {
  track: ['#breakbeat', '#breaks', '#newmusic', '#electronicmusic', '#dj'],
  set: ['#breakbeat', '#djset', '#breaks', '#livemusic', '#electronicmusic'],
  top100: ['#breakbeat', '#breaks', '#top100', '#electronicmusic', '#dj'],
  week: ['#breakbeat', '#newmusic', '#newreleases', '#breaks', '#electronicmusic'],
  blog: ['#breakbeat', '#breaks', '#electronicmusic', '#musicnews', '#dj'],
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
      add(o.artists)
      add(o.artist)
      add(o.label)
    }
  }
  for (const k of ['artists', 'artist', 'label', 'labels', 'festival', 'edition', 'eventName', 'tracks', 'rows', 'highlights']) add(ctx[k])
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
  if (platform === 'instagram' && !/bio\b/i.test(text)) text += `\n\n${es ? '🔗 Enlace en la bio.' : '🔗 Link in bio.'}`
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
  const kind = (['track', 'set', 'top100', 'week', 'blog'] as const).find((k) => k === body.kind)
  if (!kind) return NextResponse.json({ error: 'kind no válido' }, { status: 400 })
  if (auth.role !== 'admin' && kind !== 'track' && kind !== 'set') {
    return NextResponse.json({ error: 'Sin permisos' }, { status: 403 })
  }
  const platform: Platform = body.platform === 'facebook' ? 'facebook' : 'instagram'
  const es = body.lang !== 'en'
  const url = typeof body.url === 'string' ? body.url.slice(0, 300) : ''
  const ctx = body.context && typeof body.context === 'object' ? (body.context as Record<string, unknown>) : {}
  const ctxJson = JSON.stringify(ctx).slice(0, 6000)
  const today = new Date().toISOString().slice(0, 10)

  const system = es
    ? [
        'Eres el community manager de Optimal Breaks, la web de referencia del breakbeat (breaks, nu skool, florida breaks, UK bass…).',
        `Escribes el texto (pie) de un vídeo para ${platform === 'instagram' ? 'un reel de Instagram' : 'un post de Facebook'}.`,
        'Objetivo: que el algoritmo lo distribuya: que la gente se pare, lo lea, comente, lo guarde y lo comparta.',
        'Reglas:',
        '- Español de España, natural y cercano, con criterio de DJ y amante del breakbeat. Nada de tono publicitario ni frases hechas vacías. No empieces por «Compartimos».',
        '- Primera línea: gancho de máximo 90 caracteres que se entienda sola (es lo único visible antes de «… más»). Puede empezar con 1 emoji.',
        '- Después 2–4 líneas cortas con datos concretos del contexto (fechas, BPM, ciudad, festival, número de temas, puestos…). No inventes nada que no esté en el contexto.',
        '- Una línea que invite a interactuar de forma concreta para esta publicación (una pregunta para comentar, guardar para el finde, etiquetar a alguien…).',
        platform === 'instagram'
          ? '- Enlace: una línea que diga que el enlace está en la bio. Sin URL (en Instagram no es clicable).'
          : `- Enlace: incluye esta URL tal cual en una línea propia: ${url}`,
        '- Puedes nombrar artistas y sellos en el texto, sin @ (las menciones las pone el admin).',
        '- Última línea: como mucho 5 hashtags, en minúsculas, separados por espacios. PROHIBIDOS hashtags con nombres de artistas, sellos, festivales, eventos o de Optimal Breaks. Solo términos genéricos de gran difusión relacionados con el contenido (género, escena, formato): p. ej. #breakbeat #breaks #djset #newmusic #electronicmusic #ravemusic #vinyl… Elige los de más alcance que encajen.',
        '- Máximo 900 caracteres en total y como mucho 4 emojis.',
        'Responde SOLO JSON: {"caption": string}',
      ].join('\n')
    : [
        'You are the social media manager of Optimal Breaks, the go-to breakbeat website (breaks, nu skool, florida breaks, UK bass…).',
        `You write the caption of a video for ${platform === 'instagram' ? 'an Instagram reel' : 'a Facebook post'}.`,
        'Goal: get the algorithm to push it: people stop, read, comment, save and share.',
        'Rules:',
        '- Natural English with a DJ’s taste. No ad-speak, no empty clichés. Do not start with “Sharing”.',
        '- First line: a hook of max 90 characters that works on its own (it is all people see before “… more”). May start with 1 emoji.',
        '- Then 2–4 short lines with concrete facts from the context (dates, BPM, city, festival, number of tracks, positions…). Never invent anything not in the context.',
        '- One line inviting interaction, specific to this post (a question to comment, save it for the weekend, tag someone…).',
        platform === 'instagram'
          ? '- Link: one line saying the link is in bio. No URL (not clickable on Instagram).'
          : `- Link: include this URL as-is on its own line: ${url}`,
        '- You may name artists and labels in the text, without @ (the admin adds the tags).',
        '- Last line: at most 5 lowercase hashtags separated by spaces. NEVER hashtags with artist, label, festival, event or Optimal Breaks names. Only generic high-reach terms related to the content (genre, scene, format): e.g. #breakbeat #breaks #djset #newmusic #electronicmusic #ravemusic #vinyl… Pick the highest-reach ones that fit.',
        '- Max 900 characters in total and at most 4 emojis.',
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
