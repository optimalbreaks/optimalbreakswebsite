// ============================================
// OPTIMAL BREAKS — Lectura paginada de PostgREST
// ----------------------------------------------
// Dos límites silenciosos que este helper evita:
//
//  1. Supabase/PostgREST devuelve como máximo `max_rows` filas por consulta
//     (1.000 por defecto). Un `select('*')` sin paginar sobre una tabla que
//     crece (events, mixes, artists…) pierde filas sin dar ningún error.
//  2. La Data Cache de Next NO guarda respuestas de más de 2 MB (solo avisa
//     en el log). Con bloques de 500 filas cada respuesta queda muy por
//     debajo, así que la caché sigue funcionando aunque la tabla crezca.
//
// Las consultas deben llevar un ORDER BY estable (p. ej. por `id`) para que
// las páginas no se solapen ni se salten filas.
// ============================================

export const SUPABASE_PAGE_SIZE = 500

/** Tope de seguridad: 200 páginas × 500 = 100.000 filas. */
const MAX_PAGES = 200

type PageResult = PromiseLike<{ data: unknown; error: { message: string } | null }>

/**
 * Lee todas las páginas en serie. `run(from, to)` debe devolver la consulta
 * con `.range(from, to)` aplicado.
 */
export async function fetchAllPages<T>(
  run: (from: number, to: number) => PageResult,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const out: T[] = []
  for (let page = 0; page < MAX_PAGES; page++) {
    const from = page * pageSize
    const { data, error } = await run(from, from + pageSize - 1)
    if (error) throw new Error(error.message)
    const rows = (data as T[] | null) ?? []
    out.push(...rows)
    if (rows.length < pageSize) break
  }
  return out
}

/**
 * Igual que `fetchAllPages` pero pide primero el total (`count: 'exact'`) y
 * descarga todas las páginas EN PARALELO: con tablas grandes pasa de N viajes
 * seguidos a ~2. `countRun()` debe devolver la misma consulta con
 * `select(..., { count: 'exact', head: true })`.
 */
export async function fetchAllPagesParallel<T>(
  countRun: () => PromiseLike<{ count: number | null; error: { message: string } | null }>,
  run: (from: number, to: number) => PageResult,
  pageSize = SUPABASE_PAGE_SIZE,
): Promise<T[]> {
  const { count, error } = await countRun()
  if (error || count == null) return fetchAllPages<T>(run, pageSize)
  const pages = Math.min(MAX_PAGES, Math.max(1, Math.ceil(count / pageSize)))
  const results = await Promise.all(
    Array.from({ length: pages }, (_, i) => run(i * pageSize, i * pageSize + pageSize - 1)),
  )
  const out: T[] = []
  for (const r of results) {
    if (r.error) throw new Error(r.error.message)
    out.push(...(((r.data as T[] | null) ?? [])))
  }
  // Si entre el conteo y la lectura entraron filas nuevas, la última página
  // vendrá llena: completamos en serie desde ahí.
  const last = results[results.length - 1]
  const lastLen = ((last?.data as T[] | null) ?? []).length
  if (lastLen === pageSize && pages < MAX_PAGES) {
    let from = pages * pageSize
    for (let p = pages; p < MAX_PAGES; p++) {
      const { data, error: e } = await run(from, from + pageSize - 1)
      if (e) throw new Error(e.message)
      const rows = (data as T[] | null) ?? []
      out.push(...rows)
      if (rows.length < pageSize) break
      from += pageSize
    }
  }
  return out
}
