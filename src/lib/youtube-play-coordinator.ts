/**
 * Un solo embed de YouTube sonando en la página. Al abrir otro (▶ en vinilo,
 * mix, Mis Tracks…), el anterior se desmonta para no dejar audio perdido
 * al hacer scroll entre años o secciones.
 */

type StopFn = () => void

let activePlayId: string | null = null
let activeStop: StopFn | null = null
const listeners = new Set<(activeId: string | null) => void>

function notify(activeId: string | null) {
  listeners.forEach((l) => l(activeId))
}

/** Pide el slot de reproducción (para ▶ en fila antes de montar el iframe). */
export function requestYouTubePlay(playId: string): void {
  if (!playId) return
  if (activePlayId === playId) return
  if (activeStop) {
    try { activeStop() } catch { /* iframe ya destruido */ }
    activeStop = null
  }
  activePlayId = playId
  notify(playId)
}

/** El embed montado registra cómo pararse cuando otro pide el slot. */
export function registerYouTubeEmbed(playId: string, stop: StopFn): void {
  if (!playId) return
  if (activePlayId !== playId && activeStop) {
    try { activeStop() } catch { /* no-op */ }
  }
  activePlayId = playId
  activeStop = stop
  notify(playId)
}

export function releaseYouTubePlay(playId: string): void {
  if (activePlayId !== playId) return
  activePlayId = null
  activeStop = null
  notify(null)
}

export function unregisterYouTubeEmbed(playId: string): void {
  if (activePlayId !== playId) return
  activePlayId = null
  activeStop = null
  notify(null)
}

/** Sincroniza estado de fila (showPlayer / openYoutubeKey) con el slot global. */
export function subscribeYouTubePlay(listener: (activeId: string | null) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
