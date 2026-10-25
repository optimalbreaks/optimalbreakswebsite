/**
 * Diagnóstico TEMPORAL del reproductor (oct 2026): por qué la lista se para
 * en segundo plano / pantalla bloqueada en algunos móviles (Samsung S23…).
 * Anónimo: sin usuario, sin cookies; `sid` aleatorio por pestaña. Lo recibe
 * `/api/player-diag` → tabla `player_diagnostics` (migración 096, 30 días).
 * Se envía con `sendBeacon`, que sale aunque la página se oculte o se
 * congele justo después. Nunca lanza: si falla, se pierde la línea y ya.
 */

type DiagValue = string | number | boolean | null
export type DiagData = Record<string, DiagValue | undefined>

type DiagEvent = { seq: number; ts: number; ev: string; hidden: boolean; d?: Record<string, DiagValue> }

const ENDPOINT = '/api/player-diag'
const MAX_PER_SESSION = 4000
const BATCH = 30
const FLUSH_DELAY_MS = 3000
/** Eventos tras los que puede congelarse la página: se mandan ya. */
const FLUSH_NOW = new Set([
  'ended', 'error', 'play_err', 'watchdog', 'watchdog_give_up', 'hidden', 'freeze', 'pagehide',
  'interrupted', 'stop', 'ms_next', 'ms_prev', 'stuck',
])

let sid = ''
let seq = 0
let sent = 0
const buffer: DiagEvent[] = []
let timer: ReturnType<typeof setTimeout> | null = null
let installed = false
let platform: 'ios' | 'android' | 'desktop' | 'other' = 'other'
let standalone = false

function init(): boolean {
  if (typeof window === 'undefined') return false
  if (installed) return true
  installed = true
  try {
    sid = sessionStorage.getItem('ob_diag_sid') || ''
    if (!sid) {
      sid = (crypto.randomUUID?.() || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`)
      sessionStorage.setItem('ob_diag_sid', sid)
    }
  } catch {
    sid = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`
  }
  const ua = navigator.userAgent || ''
  if (/iP(hone|ad|od)/i.test(ua) || (navigator.platform === 'MacIntel' && (navigator.maxTouchPoints || 0) > 1)) platform = 'ios'
  else if (/Android/i.test(ua)) platform = 'android'
  else if (/Windows|Macintosh|Linux|CrOS/i.test(ua)) platform = 'desktop'
  try {
    standalone =
      window.matchMedia('(display-mode: standalone)').matches ||
      (navigator as Navigator & { standalone?: boolean }).standalone === true
  } catch { /* no-op */ }

  // Ciclo de vida de la página: si Samsung/Android la congela, aquí se ve.
  document.addEventListener('visibilitychange', () => {
    playerDiag(document.hidden ? 'hidden' : 'visible')
  })
  document.addEventListener('freeze', () => playerDiag('freeze'))
  document.addEventListener('resume', () => playerDiag('resume'))
  window.addEventListener('pagehide', () => playerDiag('pagehide'))
  window.addEventListener('online', () => playerDiag('online'))
  window.addEventListener('offline', () => playerDiag('offline'))
  return true
}

function flush(): void {
  if (timer) { clearTimeout(timer); timer = null }
  if (buffer.length === 0) return
  const events = buffer.splice(0, BATCH)
  const payload = JSON.stringify({
    sid,
    platform,
    standalone,
    ua: (navigator.userAgent || '').slice(0, 300),
    events,
  })
  try {
    const ok = typeof navigator.sendBeacon === 'function' &&
      navigator.sendBeacon(ENDPOINT, new Blob([payload], { type: 'text/plain' }))
    if (!ok) {
      void fetch(ENDPOINT, { method: 'POST', body: payload, keepalive: true, headers: { 'Content-Type': 'text/plain' } })
        .catch(() => {})
    }
  } catch { /* no-op */ }
  if (buffer.length > 0) flush()
}

/** Apunta un evento del reproductor. Barato; se puede llamar en cualquier listener. */
export function playerDiag(ev: string, data?: DiagData): void {
  try {
    if (!init()) return
    if (sent >= MAX_PER_SESSION) return
    sent += 1
    let d: Record<string, DiagValue> | undefined
    if (data) {
      d = {}
      for (const [k, v] of Object.entries(data)) if (v !== undefined) d[k] = v
    }
    buffer.push({ seq: seq++, ts: Date.now(), ev, hidden: document.hidden, d })
    if (FLUSH_NOW.has(ev) || buffer.length >= BATCH) flush()
    else if (!timer) timer = setTimeout(flush, FLUSH_DELAY_MS)
  } catch { /* el diagnóstico nunca rompe el reproductor */ }
}

/** Foto del `<audio>` para adjuntar a un evento. */
export function audioDiag(a: HTMLAudioElement | null | undefined): DiagData {
  if (!a) return { el: false }
  let bufEnd: number | null = null
  try {
    const b = a.buffered
    if (b && b.length) bufEnd = b.end(b.length - 1)
  } catch { /* no-op */ }
  const src = a.getAttribute('src') || ''
  return {
    rs: a.readyState,
    ns: a.networkState,
    paused: a.paused,
    ended: a.ended,
    t: Number.isFinite(a.currentTime) ? a.currentTime : null,
    dur: Number.isFinite(a.duration) ? a.duration : null,
    buf: bufEnd,
    err: a.error ? a.error.code : null,
    src: src ? (src.startsWith('blob:') ? 'blob' : src.split('?')[0].slice(0, 80)) : null,
  }
}
