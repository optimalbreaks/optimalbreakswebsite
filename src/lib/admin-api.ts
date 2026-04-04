const BASE = '/api/admin'

/** Coincide con el tope en `api/admin/[table]/route.ts` (Math.min(100, …)). */
export const ADMIN_LIST_PAGE_MAX = 100

export interface ListResponse<T = Record<string, unknown>> {
  data: T[]
  count: number
  page: number
  limit: number
}

export function normalizeAdminRouteParam(
  param: string | string[] | undefined,
): string {
  if (param == null) return ''
  return Array.isArray(param) ? (param[0] ?? '') : param
}

export async function adminList<T = Record<string, unknown>>(
  table: string,
  opts: { page?: number; limit?: number; search?: string; order?: string; dir?: string } = {},
): Promise<ListResponse<T>> {
  const params = new URLSearchParams()
  if (opts.page) params.set('page', String(opts.page))
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.search) params.set('search', opts.search)
  if (opts.order) params.set('order', opts.order)
  if (opts.dir) params.set('dir', opts.dir)
  const res = await fetch(`${BASE}/${table}?${params}`)
  if (!res.ok) throw new Error((await res.json()).error || res.statusText)
  return res.json()
}

/**
 * Varias peticiones con límite ≤ ADMIN_LIST_PAGE_MAX hasta encontrar la fila por `id`.
 */
export async function adminGetRowById<T extends { id: string }>(
  table: string,
  rowId: string,
  opts: { search?: string; order?: string; dir?: string } = {},
): Promise<T | null> {
  if (!rowId) return null
  const limit = ADMIN_LIST_PAGE_MAX
  let page = 1
  for (;;) {
    const res = await adminList<T>(table, { ...opts, page, limit })
    const found = res.data.find((row) => row.id === rowId)
    if (found) return found
    if (res.data.length === 0) return null
    const fetched = (page - 1) * limit + res.data.length
    if (fetched >= res.count) return null
    if (res.data.length < limit) return null
    page += 1
  }
}

/**
 * Todas las filas de la tabla, paginando con el límite del servidor.
 */
export async function adminListAll<T = Record<string, unknown>>(
  table: string,
  opts: { search?: string; order?: string; dir?: string } = {},
): Promise<T[]> {
  const limit = ADMIN_LIST_PAGE_MAX
  const all: T[] = []
  let page = 1
  let total = 0
  for (;;) {
    const res = await adminList<T>(table, { ...opts, page, limit })
    if (page === 1) total = res.count
    all.push(...res.data)
    if (res.data.length === 0) break
    if (all.length >= total) break
    page += 1
  }
  return all
}

export async function adminCreate<T = Record<string, unknown>>(
  table: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${BASE}/${table}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.json()).error || res.statusText)
  return res.json()
}

export async function adminUpdate<T = Record<string, unknown>>(
  table: string,
  body: Record<string, unknown>,
): Promise<T> {
  const res = await fetch(`${BASE}/${table}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  if (!res.ok) throw new Error((await res.json()).error || res.statusText)
  return res.json()
}

export async function adminDelete(table: string, id: string): Promise<void> {
  const res = await fetch(`${BASE}/${table}?id=${id}`, { method: 'DELETE' })
  if (!res.ok) throw new Error((await res.json()).error || res.statusText)
}

/** Traduce name_es/description_es → EN (OpenAI, inglés neutro) y persiste en `scenes`. */
export async function adminTranslateScene(opts: {
  id?: string
  slug?: string
  force?: boolean
}): Promise<{ ok: boolean; row: Record<string, unknown> }> {
  const res = await fetch(`${BASE}/translate-scene`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(opts),
  })
  let data: { error?: string; ok?: boolean; row?: Record<string, unknown> } = {}
  try {
    data = await res.json()
  } catch {
    /* empty */
  }
  if (!res.ok) throw new Error(data.error || res.statusText)
  return { ok: Boolean(data.ok), row: data.row ?? {} }
}

// --- Usuarios (Auth + profiles; no usa /api/admin/[table]) ---

export type AdminUserRow = {
  id: string
  email: string
  display_name: string | null
  username: string | null
  role: 'user' | 'admin'
  created_at: string
  last_sign_in_at: string | null
}

export async function adminListUsers(opts: {
  page?: number
  limit?: number
  search?: string
} = {}): Promise<ListResponse<AdminUserRow>> {
  const params = new URLSearchParams()
  if (opts.page) params.set('page', String(opts.page))
  if (opts.limit) params.set('limit', String(opts.limit))
  if (opts.search) params.set('search', opts.search)
  const res = await fetch(`${BASE}/users?${params}`)
  if (!res.ok) throw new Error((await res.json()).error || res.statusText)
  return res.json()
}

export async function adminGetUserDetail(id: string): Promise<{
  id: string
  email: string
  last_sign_in_at: string | null
  created_at: string
  profile: Record<string, unknown> | null
}> {
  const res = await fetch(`${BASE}/users/${id}`)
  if (!res.ok) throw new Error((await res.json()).error || res.statusText)
  return res.json()
}

export async function adminUpdateUserRole(id: string, role: 'user' | 'admin'): Promise<Record<string, unknown>> {
  const res = await fetch(`${BASE}/users/${id}`, {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ role }),
  })
  if (!res.ok) throw new Error((await res.json()).error || res.statusText)
  return res.json()
}
