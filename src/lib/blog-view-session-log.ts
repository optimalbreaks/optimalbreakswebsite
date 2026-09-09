/**
 * Una lectura por artículo y pestaña (sessionStorage), al abrir la ficha.
 * El listado cacheado no escribe; el POST va a /api/blog-view.
 */
const STORAGE_KEY = 'ob_blog_views_v1'
const inFlight = new Set<string>()

export function logBlogViewOncePerBrowserSession(slug: string): void {
  if (typeof window === 'undefined' || !slug) return
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY)
    const arr: string[] = raw ? JSON.parse(raw) : []
    if (arr.includes(slug)) return
  } catch {
    return
  }
  if (inFlight.has(slug)) return
  inFlight.add(slug)

  void fetch('/api/blog-view', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ slug }),
  })
    .then((r) => {
      if (!r.ok) return
      try {
        const raw = sessionStorage.getItem(STORAGE_KEY)
        const arr: string[] = raw ? JSON.parse(raw) : []
        if (!arr.includes(slug)) {
          arr.push(slug)
          sessionStorage.setItem(STORAGE_KEY, JSON.stringify(arr))
        }
      } catch {
        /* ignore */
      }
    })
    .catch(() => {})
    .finally(() => {
      inFlight.delete(slug)
    })
}
