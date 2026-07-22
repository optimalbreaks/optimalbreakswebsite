'use client'

import { useEffect, useState } from 'react'

/**
 * Diferencia entre el borde inferior del layout viewport y el del visual
 * viewport (en píxeles CSS). En navegador normal y la mayoría de PWAs vale 0;
 * en iOS standalone (PWA) tras lock/unlock o tras compartir un enlace a otra
 * app (Facebook / WhatsApp / Web Share) y volver, los dos viewports pueden
 * desincronizarse y dejar elementos `position: fixed; bottom: 0` "flotando"
 * en mitad de la pantalla. Este offset lo compensa.
 *
 * Implementación:
 * - Escucha `resize` / `scroll` de `visualViewport`, `pageshow`, `focus` y
 *   `visibilitychange` para captar todos los "despertares" del WebView.
 * - Tras un cambio de visibilidad o foco iOS suele tardar 1–2 frames en
 *   reportar las medidas reales: programamos varias re-mediciones (≈80, 250,
 *   600, 1200 ms) además del rAF inmediato.
 * - **Filtro anti-overlay:** mientras la hoja nativa de compartir (Web Share)
 *   u otro overlay del SO está encima, el WebView reporta un visual viewport
 *   encogido de forma transitoria. Sin filtro, ese `resize` aplicaba un
 *   offset de cientos de píxeles y la barra subía hasta media pantalla.
 *   Ignoramos mediciones con la página oculta o con un desfase >40% de la
 *   altura (eso nunca es el desfase real de la home-bar/lock, es un overlay).
 * - **Auto-curación:** al volver de la hoja de compartir, iOS a veces NO
 *   emite `visibilitychange`/`focus` (el documento nunca se marcó oculto) ni
 *   un nuevo `resize` del visualViewport, así que el offset podía quedarse
 *   congelado y la barra flotando para siempre. Mientras `offset > 0`,
 *   re-medimos en un intervalo corto hasta que vuelva a 0: aunque no llegue
 *   ningún evento, la barra recupera su sitio sola.
 *
 * Devuelve un entero ≥0 listo para sumar a un `bottom` CSS.
 */
export function useViewportBottomOffset(): number {
  const [offset, setOffset] = useState(0)

  useEffect(() => {
    if (typeof window === 'undefined' || !window.visualViewport) return
    const vv = window.visualViewport
    let raf = 0
    const timeouts: number[] = []
    let healInterval: number | null = null

    const measure = () => {
      // Con la página oculta (app switch real) las métricas no son fiables;
      // al volver, `visibilitychange`/`pageshow` disparan la re-medición.
      if (document.hidden) return
      const diff = window.innerHeight - (vv.height + vv.offsetTop)
      // Desfase gigante = overlay nativo (share sheet, teclado, selector del
      // SO) encima del WebView. Es transitorio: no lo aplicamos, porque el
      // desfase real tras lock/unlock es de decenas de píxeles como mucho.
      if (diff > window.innerHeight * 0.4) return
      const next = diff > 0.5 ? Math.round(diff) : 0
      setOffset(next)
      // Auto-curación: con offset aplicado, sigue midiendo por si el evento
      // de restauración del viewport nunca llega (iOS tras Web Share).
      if (next > 0 && healInterval === null) {
        healInterval = window.setInterval(measure, 400)
      } else if (next === 0 && healInterval !== null) {
        window.clearInterval(healInterval)
        healInterval = null
      }
    }

    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    const updateDeferred = () => {
      update()
      ;[80, 250, 600, 1200].forEach((ms) => {
        const id = window.setTimeout(measure, ms)
        timeouts.push(id)
      })
    }

    const onVisibility = () => {
      if (!document.hidden) updateDeferred()
    }

    update()
    vv.addEventListener('resize', update)
    vv.addEventListener('scroll', update)
    window.addEventListener('pageshow', updateDeferred)
    window.addEventListener('focus', updateDeferred)
    window.addEventListener('orientationchange', updateDeferred)
    document.addEventListener('visibilitychange', onVisibility)

    return () => {
      cancelAnimationFrame(raf)
      timeouts.forEach((id) => clearTimeout(id))
      if (healInterval !== null) window.clearInterval(healInterval)
      vv.removeEventListener('resize', update)
      vv.removeEventListener('scroll', update)
      window.removeEventListener('pageshow', updateDeferred)
      window.removeEventListener('focus', updateDeferred)
      window.removeEventListener('orientationchange', updateDeferred)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [])

  return offset
}
