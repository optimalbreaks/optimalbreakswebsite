// ============================================================================
// OPTIMAL BREAKS — Coordinador de reproducción (una sola fuente audible)
// ----------------------------------------------------------------------------
// En todo el sitio solo puede sonar UNA cosa a la vez. Conviven dos "mundos"
// de audio que deben excluirse mutuamente:
//
//   1. Embeds de YouTube en fila (iframe `LazyYouTubeEmbed`): vinilos en
//      /charts, Mis Tracks, Top 100 comunidad y tarjetas de /mixes. Cada
//      instancia tiene un `playSlotId` único. YouTube NO entra nunca en la
//      cola del reproductor de abajo (el iframe se cortaría al navegar); se
//      reproduce embebido en la propia fila, como en /mixes.
//
//   2. Reproductor global de abajo (`DeckAudioProvider`): preview de samples
//      Beatport/Bandcamp (`<audio>`), mixes (mp3 / SoundCloud) y el DJ deck.
//
// Reglas de exclusión (las dos direcciones):
//
//   • Abrir un YouTube  → `requestYouTubePlay(slot)`:
//       - cierra el embed de YouTube anterior (si lo había), y
//       - para el reproductor global (preview/mix/deck) vía el "stopper"
//         que registra `DeckAudioProvider`.
//
//   • Arrancar/retomar algo en el reproductor global → `stopAllYouTube()`:
//       lo llama `DeckAudioProvider` en cada punto de arranque (playPreview,
//       loadAndPlayPreviewAt, togglePreview-resume, playMix, deck y el
//       handler de `ob-audio-claim`). Cierra el iframe de YouTube activo.
//
// Estado (módulo singleton, vive mientras la pestaña esté abierta):
//   - `activePlayId`      : slot del YouTube que está sonando (o null).
//   - `activeStop`        : cómo desmontar ese iframe.
//   - `stopGlobalPlayback`: cómo silenciar preview/mix/deck (lo registra el
//                           provider; null si aún no está montado).
//   - `listeners`         : filas suscritas para resetear su botón ▶ cuando
//                           otra fuente toma el relevo.
// ============================================================================

type StopFn = () => void

/** Slot del embed de YouTube actualmente activo (o null si ninguno). */
let activePlayId: string | null = null
/** Cómo desmontar el iframe del slot activo. */
let activeStop: StopFn | null = null
/** Cómo silenciar el reproductor global (preview/mix/deck). Lo registra el provider. */
let stopGlobalPlayback: StopFn | null = null
/** Filas suscritas: reciben el slot activo (o null) para sincronizar su botón ▶. */
const listeners = new Set<(activeId: string | null) => void>

function notify(activeId: string | null) {
  listeners.forEach((l) => l(activeId))
}

/** Desmonta el iframe de YouTube activo (si lo hay) y avisa a las filas. */
function stopYouTubeEmbedIfAny(): void {
  if (activeStop) {
    try { activeStop() } catch { /* iframe ya destruido */ }
    activeStop = null
  }
  if (activePlayId !== null) {
    activePlayId = null
    notify(null)
  }
}

/** Silencia preview/mix/deck si el provider está montado. */
function stopGlobalPlaybackIfAny(): void {
  if (stopGlobalPlayback) {
    try { stopGlobalPlayback() } catch { /* provider no montado */ }
  }
}

/**
 * `DeckAudioProvider` registra aquí cómo silenciar preview/mix/deck. Se llama
 * cuando un YouTube toma el relevo. Pasa `null` al desmontarse el provider.
 */
export function registerGlobalPlaybackStopper(stop: StopFn | null): void {
  stopGlobalPlayback = stop
}

/**
 * Mundo global → YouTube. Lo invoca `DeckAudioProvider` en cada arranque de
 * preview/mix/deck para cerrar cualquier iframe de YouTube que estuviera
 * sonando. No toca el reproductor de abajo (ese es quien llama).
 */
export function stopAllYouTube(): void {
  stopYouTubeEmbedIfAny()
}

/**
 * Pide el slot de reproducción de YouTube (lo llama la fila al pulsar ▶, antes
 * de montar el iframe). Excluye ambos mundos: para el reproductor global y
 * cierra el embed de YouTube anterior. Luego notifica para que el resto de
 * filas reseteen su botón.
 */
export function requestYouTubePlay(playId: string): void {
  if (!playId) return
  if (activePlayId === playId) return
  stopGlobalPlaybackIfAny()
  stopYouTubeEmbedIfAny()
  activePlayId = playId
  notify(playId)
}

/**
 * El iframe ya montado registra cómo pararse. Refuerza la exclusión: vuelve a
 * silenciar el mundo global y cierra cualquier otro embed que no sea este
 * (cubre el caso `autoplay` donde se monta sin pasar por `requestYouTubePlay`).
 */
export function registerYouTubeEmbed(playId: string, stop: StopFn): void {
  if (!playId) return
  stopGlobalPlaybackIfAny()
  if (activePlayId !== playId && activeStop) {
    try { activeStop() } catch { /* no-op */ }
  }
  activePlayId = playId
  activeStop = stop
  notify(playId)
}

/** La fila cierra su propio YouTube (segundo clic en ▶ = pausar/ocultar). */
export function releaseYouTubePlay(playId: string): void {
  if (activePlayId !== playId) return
  activePlayId = null
  activeStop = null
  notify(null)
}

/** El embed se desmonta (cleanup de React). Libera el slot si era el activo. */
export function unregisterYouTubeEmbed(playId: string): void {
  if (activePlayId !== playId) return
  activePlayId = null
  activeStop = null
  notify(null)
}

/**
 * Las filas se suscriben para sincronizar su botón ▶ (`showPlayer` /
 * `openYoutubeKey`): cuando el slot activo deja de ser el suyo (otra fila u
 * otra fuente tomó el relevo, o se recibe `null`), cierran su embed.
 * Devuelve la función de baja.
 */
export function subscribeYouTubePlay(listener: (activeId: string | null) => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}
