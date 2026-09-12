/**
 * Invalida la Data Cache pública en producción tras UPSERT editorial.
 * POST /api/revalidate — acepta service role o REVALIDATE_SECRET.
 */
import { loadEnvLocal } from './artist-upsert.mjs'

loadEnvLocal()

export async function pingPublicRevalidate({ artistSlug, blogSlug } = {}) {
  const secret = (
    process.env.REVALIDATE_SECRET ||
    process.env.SUPABASE_SERVICE_ROLE_KEY ||
    process.env.SUPABASE_SECRET_KEY ||
    ''
  ).trim()
  const base = (
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.VERCEL_URL ||
    'https://www.optimalbreaks.com'
  ).trim()
  if (!secret) {
    console.warn(
      '  ⚠ Sin REVALIDATE_SECRET / service role: la web pública sigue cacheada hasta el próximo deploy o ~5 min.',
    )
    return false
  }
  const origin = /^https?:\/\//i.test(base) ? base : `https://${base}`
  const url = `${origin.replace(/\/$/, '')}/api/revalidate`
  const body = { secret }
  if (blogSlug) body.blogSlug = String(blogSlug).trim()
  else if (artistSlug) body.artistSlug = String(artistSlug).trim()
  else body.catalog = true
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(body),
    })
    if (res.ok) {
      const json = await res.json().catch(() => ({}))
      const paths = Array.isArray(json.revalidated) ? json.revalidated : []
      if (blogSlug) {
        console.log(`  ↳ Caché web invalidada (blog ${blogSlug}${paths.length ? `: ${paths.join(', ')}` : ''}).`)
      } else if (artistSlug) {
        console.log(`  ↳ Caché web invalidada (artista ${artistSlug}${paths.length ? `: ${paths.join(', ')}` : ''}).`)
      } else {
        console.log('  ↳ Caché web pública invalidada (catálogo).')
      }
      return true
    }
    console.warn(
      `  ⚠ Revalidate HTTP ${res.status} — la ficha puede seguir mostrando datos viejos hasta un deploy.`,
    )
    return false
  } catch (e) {
    console.warn(`  ⚠ No se pudo invalidar caché web: ${e instanceof Error ? e.message : String(e)}`)
    return false
  }
}
