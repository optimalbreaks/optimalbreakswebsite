'use client'

import { useEffect } from 'react'

/** Fuentes fuera del CSS bloqueante inicial (Special Elite, Courier, Darker Grotesque, Unbounded 400). */
export default function DeferredFonts() {
  useEffect(() => {
    // Literales: `import(variable)` no lo resuelve Webpack y en local
    // explota el overlay (Cannot find module '@fontsource/…').
    void import('@fontsource/special-elite/400.css')

    const load = () => {
      void import('@fontsource/unbounded/400.css')
      void import('@fontsource/courier-prime/400.css')
      void import('@fontsource/courier-prime/700.css')
      void import('@fontsource/darker-grotesque/400.css')
      void import('@fontsource/darker-grotesque/700.css')
      void import('@fontsource/darker-grotesque/900.css')
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
