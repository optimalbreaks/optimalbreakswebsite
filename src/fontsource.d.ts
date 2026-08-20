declare module '*.woff2' {
  const src: string
  export default src
}

// CSS global (p. ej. @fontsource) cargado con import() dinámico en
// DeferredFonts: Next solo declara *.module.css, sin esto tsc da TS2307.
declare module '*.css'
