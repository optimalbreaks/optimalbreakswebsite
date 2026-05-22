'use client'

import { useEffect } from 'react'

/** Fuentes fuera del CSS bloqueante inicial (Special Elite, Courier, Darker Grotesque, Unbounded 400). */
export default function DeferredFonts() {
  useEffect(() => {
    const loadCss = (specifier: string) => {
      void import(specifier)
    }

    // Cuerpo / prose: fuera del layout crítico pero lo pedimos enseguida tras hidratar.
    loadCss('@fontsource/special-elite/400.css')

    const load = () => {
      loadCss('@fontsource/unbounded/400.css')
      loadCss('@fontsource/courier-prime/400.css')
      loadCss('@fontsource/courier-prime/700.css')
      loadCss('@fontsource/darker-grotesque/400.css')
      loadCss('@fontsource/darker-grotesque/700.css')
      loadCss('@fontsource/darker-grotesque/900.css')
    }

    const win = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number
    }

    if (win.requestIdleCallback) {
      win.requestIdleCallback(load, { timeout: 2500 })
    } else {
      setTimeout(load, 200)
    }
  }, [])

  return null
}
