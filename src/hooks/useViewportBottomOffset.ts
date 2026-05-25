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
 *   600 ms) además del rAF inmediato.
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

    const measure = () => {
      const diff = window.innerHeight - (vv.height + vv.offsetTop)
      setOffset(diff > 0.5 ? Math.round(diff) : 0)
    }

    const update = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }

    const updateDeferred = () => {
      update()
      ;[80, 250, 600].forEach((ms) => {
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
