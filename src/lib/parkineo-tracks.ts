// ============================================
// OPTIMAL BREAKS — Parkineo, temas propios
// Cajón distinto de las sesiones. MP3 de 1 a 15 minutos,
// bucket privado, cola de admin, voto que no entra en el Top 100.
// ============================================

import { parkineoSlugBase } from '@/lib/parkineo'

export const PARKINEO_TRACK_BUCKET = 'parkineo-tracks'
export const PARKINEO_TRACK_MAX_BYTES = 25 * 1024 * 1024
export const PARKINEO_TRACK_MIN_SECONDS = 60
export const PARKINEO_TRACK_MAX_SECONDS = 15 * 60

export const PARKINEO_TRACK_PUBLIC_COLUMNS =
  'id, slug, artist_name, title, duration_seconds, published_at, cycle'

export type ParkineoTrackPublic = {
  id: string
  slug: string
  artist_name: string
  title: string
  duration_seconds: number
  published_at: string | null
  cycle: string | null
}

export type ParkineoTrackLang = 'es' | 'en'

export type ParkineoTrackErrorCode =
  | 'name'
  | 'title'
  | 'confirm'
  | 'file'
  | 'too_big'
  | 'pending_exists'
  | 'too_short'
  | 'too_long'
  | 'not_mp3'
  | 'duration_unknown'
  | 'unreachable'

const COPY: Record<ParkineoTrackLang, Record<ParkineoTrackErrorCode, string>> = {
  es: {
    name: 'El nombre tiene que tener entre 2 y 60 caracteres.',
    title: 'El título tiene que tener entre 2 y 120 caracteres.',
    confirm: 'Marca que el tema es tuyo, que es breakbeat y que podemos publicarlo si entra.',
    file: 'Hace falta un MP3.',
    too_big: 'El MP3 puede pesar como mucho 25 MB.',
    pending_exists: 'Ya tienes un tema en cola. Cuando lo escuchemos podrás mandar otro.',
    too_short: 'Tiene que durar al menos un minuto.',
    too_long: '15 minutos o menos. Si dura más, es una sesión: mándala con el enlace.',
    not_mp3: 'Solo MP3. Un WAV o un enlace no entran en este cajón.',
    duration_unknown: 'No hemos podido leer la duración de ese MP3.',
    unreachable: 'No hemos podido leer el archivo. Vuelve a mandarlo.',
  },
  en: {
    name: 'The name must be between 2 and 60 characters.',
    title: 'The title must be between 2 and 120 characters.',
    confirm: 'Tick that the track is yours, that it is breakbeat, and that we may publish it if it goes in.',
    file: 'An MP3 is required.',
    too_big: 'The MP3 can be 25 MB at most.',
    pending_exists: 'You already have a track in the queue. You can send another once we have listened.',
    too_short: 'It has to last at least a minute.',
    too_long: '15 minutes or less. Longer than that is a session: send it with a link.',
    not_mp3: 'MP3 only. A WAV or a link does not belong in this box.',
    duration_unknown: 'We could not read the length of that MP3.',
    unreachable: 'We could not read the file. Send it again.',
  },
}

export function parkineoTrackMessage(code: ParkineoTrackErrorCode, lang: ParkineoTrackLang): string {
  return COPY[lang][code]
}

/** Semestre de publicación en hora de Madrid: `2026-S1` (ene–jun) o `2026-S2` (jul–dic). */
export function parkineoTrackCycle(date = new Date()): string {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: 'numeric',
  }).formatToParts(date)
  const year = parts.find((p) => p.type === 'year')?.value || String(date.getUTCFullYear())
  const month = Number(parts.find((p) => p.type === 'month')?.value || '1')
  return `${year}-S${month <= 6 ? '1' : '2'}`
}

export function parkineoTrackCycleLabel(cycle: string | null | undefined, es: boolean): string | null {
  const m = String(cycle || '').match(/^(\d{4})-S([12])$/)
  if (!m) return null
  if (es) return m[2] === '1' ? `${m[1]} · 1er semestre` : `${m[1]} · 2º semestre`
  return m[2] === '1' ? `${m[1]} · 1st half` : `${m[1]} · 2nd half`
}

export function formatTrackLength(seconds: number): string {
  const s = Math.max(0, Math.round(seconds))
  const m = Math.floor(s / 60)
  const r = s % 60
  return `${m}:${String(r).padStart(2, '0')}`
}

export function parkineoTrackSlug(artistName: string, title: string): string {
  return parkineoSlugBase(artistName, title)
}

const BITRATE_V1_L1 = [0, 32, 64, 96, 128, 160, 192, 224, 256, 288, 320, 352, 384, 416, 448, 0]
const BITRATE_V1_L2 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 384, 0]
const BITRATE_V1_L3 = [0, 32, 40, 48, 56, 64, 80, 96, 112, 128, 160, 192, 224, 256, 320, 0]
const BITRATE_V2_L1 = [0, 32, 48, 56, 64, 80, 96, 112, 128, 144, 160, 176, 192, 224, 256, 0]
const BITRATE_V2_L3 = [0, 8, 16, 24, 32, 40, 48, 56, 64, 80, 96, 112, 128, 144, 160, 0]
const SR_V1 = [44100, 48000, 32000]
const SR_V2 = [22050, 24000, 16000]
const SR_V25 = [11025, 12000, 8000]

function frameLength(buf: Uint8Array, offset: number): { length: number; seconds: number } | null {
  if (offset + 4 > buf.length) return null
  if (buf[offset] !== 0xff || (buf[offset + 1] & 0xe0) !== 0xe0) return null
  const b1 = buf[offset + 1]
  const b2 = buf[offset + 2]
  const versionBits = (b1 >> 3) & 3
  const layerBits = (b1 >> 1) & 3
  const bitrateIdx = (b2 >> 4) & 0xf
  const srIdx = (b2 >> 2) & 3
  const padding = (b2 >> 1) & 1
  if (versionBits === 1 || layerBits === 0 || bitrateIdx === 0 || bitrateIdx === 15 || srIdx === 3) return null
  const mpeg1 = versionBits === 3
  const mpeg25 = versionBits === 0
  const layer = layerBits === 3 ? 1 : layerBits === 2 ? 2 : 3
  const bitrateTable = mpeg1
    ? layer === 1 ? BITRATE_V1_L1 : layer === 2 ? BITRATE_V1_L2 : BITRATE_V1_L3
    : layer === 1 ? BITRATE_V2_L1 : BITRATE_V2_L3
  const bitrate = bitrateTable[bitrateIdx]
  const sr = (mpeg1 ? SR_V1 : mpeg25 ? SR_V25 : SR_V2)[srIdx]
  if (!bitrate || !sr) return null
  const bps = bitrate * 1000
  let length: number
  let samples: number
  if (layer === 1) {
    length = Math.floor((12 * bps) / sr + padding) * 4
    samples = 384
  } else if (layer === 2 || mpeg1) {
    length = Math.floor((144 * bps) / sr) + padding
    samples = 1152
  } else {
    length = Math.floor((72 * bps) / sr) + padding
    samples = 576
  }
  if (length < 4) return null
  return { length, seconds: samples / sr }
}

/** Segundos de un MP3 (CBR o VBR) a partir de los frames. Null si no es legible. */
export function mp3DurationSeconds(buf: Uint8Array): number | null {
  let offset = 0
  if (
    buf.length >= 10 &&
    buf[0] === 0x49 &&
    buf[1] === 0x44 &&
    buf[2] === 0x33
  ) {
    const size = ((buf[6] & 0x7f) << 21) | ((buf[7] & 0x7f) << 14) | ((buf[8] & 0x7f) << 7) | (buf[9] & 0x7f)
    offset = 10 + size + ((buf[5] & 0x10) ? 10 : 0)
  }
  if (offset < 0 || offset >= buf.length) return null
  let end = buf.length
  if (
    end >= 128 &&
    buf[end - 128] === 0x54 &&
    buf[end - 127] === 0x41 &&
    buf[end - 126] === 0x47
  ) {
    end -= 128
  }
  let seconds = 0
  let frames = 0
  let guard = 0
  while (offset + 4 <= end && guard < end) {
    guard += 1
    const frame = frameLength(buf, offset)
    if (!frame || offset + frame.length > end) {
      offset += 1
      continue
    }
    const next = offset + frame.length
    const nextOk = next >= end - 1 || frameLength(buf, next) !== null
    if (!nextOk) {
      offset += 1
      continue
    }
    seconds += frame.seconds
    frames += 1
    offset = next
  }
  if (frames < 2 || !Number.isFinite(seconds) || seconds <= 0) return null
  return Math.round(seconds)
}

export function durationVerdict(seconds: number | null): ParkineoTrackErrorCode | null {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 'duration_unknown'
  if (seconds < PARKINEO_TRACK_MIN_SECONDS) return 'too_short'
  if (seconds > PARKINEO_TRACK_MAX_SECONDS) return 'too_long'
  return null
}

const PATH_RE = /^[0-9a-f-]{36}\/[0-9a-f-]{36}\.mp3$/i

export function parkineoTrackPath(userId: string, id: string): string {
  return `${userId}/${id}.mp3`
}

export function parkineoTrackPathOwned(userId: string, path: string): boolean {
  const clean = path.trim()
  if (!PATH_RE.test(clean)) return false
  return clean.toLowerCase().startsWith(`${userId.toLowerCase()}/`)
}
