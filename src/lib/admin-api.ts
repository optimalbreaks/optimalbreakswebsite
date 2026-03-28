const BASE = '/api/admin'

export interface ListResponse<T = Record<string, unknown>> {
  data: T[]
  count: number
  page: number
  limit: number
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
