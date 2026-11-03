// ============================================
// OPTIMAL BREAKS — Vídeos R/F de página (Top 100, New Releases, artículo del blog, agenda)
//
// Solo admins. Mismo motor que los reels de temas (`encodeCanvasVideo` en
// `reel-renderer.ts`): Canvas 2D + WebCodecs, todo en el navegador. Sin audio,
// salvo el resumen de /topreleases (n.º 1 de la lista) y el artículo de álbum
// (primer corte con preview): suena el fragmento elegido.
// El diseño y la animación están en `page-reel-design.ts`.
//
// Las carátulas llegan como URL de origen (Beatport, Supabase…) y el canvas no
// puede leerlas sin CORS, así que se piden ya recortadas como data URL a
// `/api/admin/share-reel-images` (una sola llamada por vídeo, con caché para
// que R y F seguidos no las descarguen dos veces). Los carteles de eventos
// piden `mode: 'poster'` para no recortar el flyer.
// ============================================

import { animAlbum, animBlog, animDay, animEvents, animFortnight, animTop, animWeek, blogHighlightFrom, dayCardSeconds, dayReelDuration, DAY_INTRO, DUR, eventsReelDuration, FORTNIGHT_DUR, type EventsAnim, type Img } from './page-reel-design'

export type EventsReelEvent = {
  name: string
  /** YYYY-MM-DD */
  date: string
  dateEnd: string | null
  place: string
  lineup: string[]
  postponed: boolean
  image: string | null
}

export type EventsReelInput = {
  es: boolean
  from: string
  until: string
  extra: number
  events: EventsReelEvent[]
}
import { encodeCanvasVideo, type ReelFormat, type ReelResult } from './reel-renderer'
import { loadShareAudio, SHARE_AUDIO_RATE, suggestSegmentStart, type ShareAudioSegment } from './share-audio'

export type PageReelKind = 'top100' | 'week' | 'blog'

export type PageReelInput =
  | {
      kind: 'top100'
      rows: { pos: number; title: string; artists: string; label: string; saves: number; artwork: string | null }[]
    }
  | {
      kind: 'week'
      /** YYYY-MM-DD (lunes de la edición). */
      weekDate: string
      count: number
      tracks: { title: string; artists: string; label: string; artwork: string | null }[]
    }
  | {
      kind: 'blog'
      title: string
      /** ISO de publicación. */
      date: string | null
      tags: string[]
      artwork: string | null
      tracks: { title: string; meta: string; artists?: string; artwork?: string | null; bpm?: number | null }[]
      artist: string
      label: string
      excerpt: string
      /**
       * Artículo con tracklist de álbum: mismo molde que /topreleases (`animAlbum`, 60 s).
       * Preview del primer corte con audio, para el selector de R/F.
       */
      albumAudio?: FortnightReelInput['audio']
      /** Artículo quincenal: vídeo de datos (`animFortnight`) en vez del de artículo. */
      fortnight?: FortnightReelInput
      /** Artículo de agenda: reel de carteles (`animEvents`). */
      agenda?: EventsReelInput
      /** Artículo del día: texto de entrada y una card por tema de la selección, sonando. */
      day?: DayReelInput
    }

export type DayReelTrack = {
  title: string
  artists: string
  label: string
  artwork: string | null
  /** URL del mismo origen. Vacío = la card sale muda. */
  audio: string | null
}
export type DayReelInput = {
  es: boolean
  /** «3 NOV 2026», ya formateado. */
  date: string
  /** true = `picks` es la selección editorial. false = son los temas del día. */
  selection: boolean
  outCount: number
  picks: DayReelTrack[]
  rest: { artwork: string | null }[]
}

type FortnightReelTrack = { title: string; artists: string; value: number; artwork: string | null }
export type FortnightReelInput = {
  period?: 'FORTNIGHT' | 'MONTH' | 'QUARTER' | 'WEEK'
  from: string
  until: string
  totals: { tracks: number; artists: number; labels: number; releases: number; prev: number }
  covers: string[]
  played: FortnightReelTrack[]
  voted: FortnightReelTrack[]
  artists: { name: string; tracks: number; releases: number }[]
  stars: { rank: number; name: string; track: string; image: string | null }[]
  labels: { name: string; tracks: number }[]
  bpm: number | null
  prevBpm: number | null
  bands: { band: string; count: number }[]
  key: string | null
  debutTotal: number
  debut: string[]
  /** Audio del n.º 1 de la lista (mismo origen) para el selector de fragmento de R/F. */
  audio?: { src: string; key: string; label: string; seconds: number; title: string; artists: string; artwork: string | null } | null
}

/** Volumen del fragmento por fotograma (0..1): mueve el ecualizador del reproductor. */
function audioEnvelope(seg: ShareAudioSegment, dur: number, fps: number): Float32Array {
  const b = seg.buffer
  const sr = b.sampleRate
  const from = Math.max(0, Math.min(seg.start, b.duration - dur))
  const data = b.getChannelData(0)
  const out = new Float32Array(Math.round(dur * fps))
  const win = Math.round(sr / fps)
  let max = 0
  for (let k = 0; k < out.length; k++) {
    const s0 = Math.round((from + k / fps) * sr)
    let sum = 0
    let n = 0
    for (let j = s0; j < Math.min(data.length, s0 + win); j += 4) {
      sum += data[j] * data[j]
      n++
    }
    out[k] = n ? Math.sqrt(sum / n) : 0
    if (out[k] > max) max = out[k]
  }
  if (max > 0) for (let k = 0; k < out.length; k++) out[k] /= max
  return out
}

const imageCache = new Map<string, Promise<Img | null>>()

function loadImg(src: string): Promise<Img | null> {
  return new Promise((resolve) => {
    const im = new Image()
    im.onload = () => resolve(im)
    im.onerror = () => resolve(null)
    im.src = src
  })
}

/** Carátulas como imágenes listas para el canvas (null si no se pudo). `poster` no recorta. */
async function loadArtworks(urls: (string | null)[], mode: 'cover' | 'poster' = 'cover'): Promise<(Img | null)[]> {
  const cacheKey = (u: string) => (mode === 'poster' ? `poster:${u}` : u)
  const pending = [...new Set(urls.filter((u): u is string => !!u && !imageCache.has(cacheKey(u))))]
  // La API corta a 16 URLs por petición (MAX_URLS en share-reel-images).
  for (let start = 0; start < pending.length; start += 16) {
    const batch = pending.slice(start, start + 16)
    const req = fetch('/api/admin/share-reel-images', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(mode === 'poster' ? { urls: batch, mode: 'poster' } : { urls: batch }),
    })
      .then((r) => (r.ok ? r.json() : { images: [] }))
      .then((j: { images?: (string | null)[] }) => j.images || [])
      .catch(() => [] as (string | null)[])
    batch.forEach((u, i) => {
      imageCache.set(
        cacheKey(u),
        req.then((list) => (list[i] ? loadImg(list[i] as string) : null)),
      )
    })
  }
  return Promise.all(urls.map((u) => (u ? imageCache.get(cacheKey(u)) || Promise.resolve(null) : Promise.resolve(null))))
}

async function loadFonts() {
  if (typeof document === 'undefined' || !document.fonts) return
  await Promise.all([
    document.fonts.load("900 60px Unbounded"),
    document.fonts.load("700 30px 'Courier Prime'"),
    document.fonts.load("400 30px 'Courier Prime'"),
  ]).catch(() => undefined)
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']
/** «12 Oct 2026» (los vídeos van en inglés, como los de los temas). */
export function reelDateLabel(iso: string | null | undefined): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return ''
  return `${Number(m[3])} ${MONTHS[Number(m[2]) - 1]} ${m[1]}`
}

/** Un lanzamiento con varios remixes ocupa una sola portada en la estantería. */
function dedupeReleases<T extends { title: string; label: string }>(tracks: T[]): T[] {
  const seen = new Set<string>()
  return tracks.filter((t) => {
    const k = `${t.label}|${t.title.replace(/\s*\(.*\)\s*$/, '')}`.toLowerCase()
    if (seen.has(k)) return false
    seen.add(k)
    return true
  })
}

function writeAudioWindow(dest: AudioBuffer, destAt: number, src: AudioBuffer, startSec: number, dur: number) {
  const sr = dest.sampleRate
  const from = Math.round(Math.max(0, startSec) * src.sampleRate)
  const n = Math.round(dur * sr)
  const fadeIn = Math.round(0.08 * sr)
  const fadeOut = Math.round(0.35 * sr)
  const at = Math.round(destAt * sr)
  for (let c = 0; c < dest.numberOfChannels; c++) {
    const s = src.getChannelData(Math.min(c, src.numberOfChannels - 1))
    const d = dest.getChannelData(c)
    const len = Math.min(n, Math.max(0, s.length - from), Math.max(0, d.length - at))
    for (let i = 0; i < len; i++) {
      let g = 1
      if (i < fadeIn) g *= i / fadeIn
      const tail = len - 1 - i
      if (tail < fadeOut) g *= tail / Math.max(1, fadeOut)
      d[at + i] = s[from + i] * g
    }
  }
}

/** Une el tramo más alto de cada tema de la selección, uno detrás de otro, tras la intro muda. */
async function stitchDayAudio(picks: DayReelTrack[], intro: number, cardSec: number, total: number): Promise<{
  segment: ShareAudioSegment | null
  envs: (Float32Array | null)[]
}> {
  const envs: (Float32Array | null)[] = picks.map(() => null)
  const loaded: ({ buffer: AudioBuffer; start: number } | null)[] = []
  let any = false
  for (const p of picks) {
    if (!p.audio || !p.audio.startsWith('/')) {
      loaded.push(null)
      continue
    }
    try {
      const buffer = await loadShareAudio(p.audio)
      loaded.push({ buffer, start: suggestSegmentStart(buffer, cardSec) })
      any = true
    } catch {
      loaded.push(null)
    }
  }
  if (!any) return { segment: null, envs }
  const ctx = new AudioContext({ sampleRate: SHARE_AUDIO_RATE })
  void ctx.resume()
  const buffer = ctx.createBuffer(2, Math.max(1, Math.ceil(total * SHARE_AUDIO_RATE)), SHARE_AUDIO_RATE)
  loaded.forEach((clip, i) => {
    if (!clip) return
    writeAudioWindow(buffer, intro + i * cardSec, clip.buffer, clip.start, cardSec)
    envs[i] = audioEnvelope({ buffer: clip.buffer, start: clip.start }, cardSec, 30)
  })
  return { segment: { buffer, start: 0, ctx }, envs }
}

async function renderDayReel(
  day: DayReelInput,
  format: ReelFormat,
  onProgress?: (ratio: number) => void,
): Promise<ReelResult> {
  const W = format === 'horizontal' ? 1920 : 1080
  const H = format === 'horizontal' ? 1080 : 1920
  await loadFonts()
  const picks = day.picks.slice(0, 5)
  const rest = day.rest.slice(0, 8)
  const cardSec = dayCardSeconds(picks.length)
  const total = dayReelDuration(picks.length, rest.length > 0)
  const urls = [...picks.map((p) => p.artwork), ...rest.map((r) => r.artwork)]
  const [imgs, audio] = await Promise.all([
    loadArtworks(urls),
    stitchDayAudio(picks, DAY_INTRO, cardSec, total),
  ])
  const cards = picks.map((p, i) => ({
    title: p.title,
    artists: p.artists,
    label: p.label,
    img: imgs[i] ?? null,
    env: audio.envs[i] ?? null,
  }))
  const restImgs = rest.map((_, i) => imgs[picks.length + i] ?? null)
  const data = {
    es: day.es,
    date: day.date,
    selection: day.selection,
    outCount: day.outCount,
    cards,
    rest: restImgs,
  }
  return encodeCanvasVideo(W, H, total, 30, (c, t) => animDay(c, W, H, data, t), onProgress, audio.segment)
}

export async function renderPageReel(
  input: PageReelInput,
  format: ReelFormat,
  onProgress?: (ratio: number) => void,
  audio?: ShareAudioSegment | null,
): Promise<ReelResult> {
  const W = format === 'horizontal' ? 1920 : 1080
  const H = format === 'horizontal' ? 1080 : 1920
  await loadFonts()
  let draw: (c: CanvasRenderingContext2D, t: number) => void

  if (input.kind === 'top100') {
    const rows = input.rows.slice(0, 10)
    const imgs = await loadArtworks(rows.map((r) => r.artwork))
    const data = rows.map((r, i) => ({ ...r, img: imgs[i] }))
    draw = (c, t) => animTop(c, W, H, data, t)
  } else if (input.kind === 'week') {
    // Estantería (9) + «up next»: primeras portadas distintas, en el orden de la web.
    const uniq = dedupeReleases(input.tracks).slice(0, 11)
    const imgs = await loadArtworks(uniq.map((t) => t.artwork))
    const tracks = uniq.map((t, i) => ({ title: t.title, artists: t.artists, label: t.label, img: imgs[i] }))
    const week = reelDateLabel(input.weekDate)
    draw = (c, t) => animWeek(c, W, H, { week, count: input.count, tracks }, t)
  } else if (input.day && input.day.picks.length > 0) {
    return renderDayReel(input.day, format, onProgress)
  } else if (input.fortnight) {
    const f = input.fortnight
    const urls = [
      ...f.covers,
      ...f.played.map((r) => r.artwork),
      ...f.voted.map((r) => r.artwork),
      ...f.stars.map((s) => s.image),
      audio && f.audio ? f.audio.artwork : null,
    ]
    const imgs = await loadArtworks(urls)
    let k = 0
    const next = () => imgs[k++] ?? null
    const covers = f.covers.map(next)
    const track = (r: FortnightReelTrack) => ({ title: r.title, artists: r.artists, value: r.value, img: next() })
    const played = f.played.map(track)
    const voted = f.voted.map(track)
    const stars = f.stars.map((s) => ({ rank: s.rank, name: s.name, track: s.track, img: next() }))
    // Reproductor del pie: solo si el vídeo lleva audio.
    const playing =
      audio && f.audio
        ? { title: f.audio.title, artists: f.audio.artists, img: next(), env: audioEnvelope(audio, FORTNIGHT_DUR, 30) }
        : null
    const short = (iso: string) => reelDateLabel(iso).replace(/ \d{4}$/, '').toUpperCase()
    const data = { ...f, range: `${short(f.from)} — ${short(f.until)}`, covers, played, voted, stars, playing }
    const draw = (c: CanvasRenderingContext2D, t: number) => animFortnight(c, W, H, data, t)
    return encodeCanvasVideo(W, H, FORTNIGHT_DUR, 30, draw, onProgress, audio)
  } else if (input.agenda) {
    return renderEventsReel(input.agenda, format, onProgress)
  } else if (input.tracks.length > 0) {
    const urls = [
      ...input.tracks.map((t) => t.artwork || null),
      audio && input.albumAudio ? input.albumAudio.artwork : null,
    ]
    const imgs = await loadArtworks(urls)
    let k = 0
    const next = () => imgs[k++] ?? null
    const tracks = input.tracks.map((t) => ({
      title: t.title,
      artists: t.artists || input.artist,
      bpm: t.bpm ?? null,
      img: next(),
    }))
    const playing =
      audio && input.albumAudio
        ? {
            title: input.albumAudio.title,
            artists: input.albumAudio.artists,
            img: next(),
            env: audioEnvelope(audio, FORTNIGHT_DUR, 30),
          }
        : null
    const data = { title: input.title, artist: input.artist, label: input.label, tracks, playing }
    const draw = (c: CanvasRenderingContext2D, t: number) => animAlbum(c, W, H, data, t)
    return encodeCanvasVideo(W, H, FORTNIGHT_DUR, 30, draw, onProgress, audio)
  } else {
    const [img] = await loadArtworks([input.artwork])
    const data = {
      title: input.title,
      highlightFrom: blogHighlightFrom(input.title),
      date: reelDateLabel(input.date),
      tags: input.tags.map((t) => t.toUpperCase()),
      img,
      tracks: input.tracks,
      artist: input.artist,
      label: input.label,
      excerpt: input.excerpt,
    }
    draw = (c, t) => animBlog(c, W, H, data, t)
  }

  return encodeCanvasVideo(W, H, DUR, 30, draw, onProgress, audio)
}

const MON_ES = ['ENE', 'FEB', 'MAR', 'ABR', 'MAY', 'JUN', 'JUL', 'AGO', 'SEP', 'OCT', 'NOV', 'DIC']
const MON_EN = ['JAN', 'FEB', 'MAR', 'APR', 'MAY', 'JUN', 'JUL', 'AUG', 'SEP', 'OCT', 'NOV', 'DEC']
const WD_ES = ['DOM', 'LUN', 'MAR', 'MIÉ', 'JUE', 'VIE', 'SÁB']
const WD_EN = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function ymdParts(iso: string | null | undefined) {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso || '')
  if (!m) return null
  const y = Number(m[1])
  const mo = Number(m[2])
  const d = Number(m[3])
  const wd = new Date(y, mo - 1, d).getDay()
  return { y, mo, d, wd }
}

function shortDay(iso: string, es: boolean) {
  const p = ymdParts(iso)
  if (!p) return ''
  return `${p.d} ${(es ? MON_ES : MON_EN)[p.mo - 1]}`
}

function whenLabel(start: string, end: string | null, es: boolean) {
  const a = ymdParts(start)
  if (!a) return ''
  const wd = (es ? WD_ES : WD_EN)[a.wd]
  const mon = (es ? MON_ES : MON_EN)[a.mo - 1]
  const b = end && end.slice(0, 10) !== start.slice(0, 10) ? ymdParts(end) : null
  if (!b) return `${wd} ${a.d} ${mon}`
  const wdB = (es ? WD_ES : WD_EN)[b.wd]
  const monB = (es ? MON_ES : MON_EN)[b.mo - 1]
  if (a.mo === b.mo) return `${wd} ${a.d} — ${wdB} ${b.d} ${mon}`
  return `${wd} ${a.d} ${mon} — ${wdB} ${b.d} ${monB}`
}

/** Reel de la agenda: intro + 5 s por evento + cierre. Carteles sin recortar. */
export async function renderEventsReel(
  input: EventsReelInput,
  format: ReelFormat,
  onProgress?: (ratio: number) => void,
): Promise<ReelResult> {
  const W = format === 'horizontal' ? 1920 : 1080
  const H = format === 'horizontal' ? 1080 : 1920
  await loadFonts()
  const events = input.events.filter((e) => e.name.trim())
  const imgs = await loadArtworks(events.map((e) => e.image), 'poster')
  const es = input.es
  const range = `${shortDay(input.from, es)} — ${shortDay(input.until, es)}`
  const ticker = [
    es ? 'EVENTOS' : 'EVENTS',
    es ? 'PRÓXIMOS 14 DÍAS' : 'NEXT 14 DAYS',
    range,
    es ? `${events.length} CITAS` : `${events.length} NIGHTS`,
    es ? 'TE LOS VAS A PERDER' : "YOU'RE GONNA MISS THEM",
    ...events.map((e) => e.name.toUpperCase()),
    '',
  ].join(' · ')
  const data: EventsAnim = {
    es,
    range,
    extra: input.extra,
    ticker,
    cards: events.map((e, i) => ({
      name: e.name,
      when: whenLabel(e.date, e.dateEnd, es),
      place: e.place.toUpperCase(),
      lineup: e.lineup,
      postponed: e.postponed,
      img: imgs[i] ?? null,
    })),
  }
  return encodeCanvasVideo(W, H, eventsReelDuration(events.length), 30, (c, t) => animEvents(c, W, H, data, t), onProgress)
}
