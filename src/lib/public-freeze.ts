/**
 * Congelación de rankings públicos (25 oct 2026, migración 097).
 *
 * Un reel de Instagram no puede decir «X es el nº 1» y que quien entra justo
 * después vea otro orden. Dos casos:
 *   · Artículo de quincena/trimestre: 72 h desde `published_at`, sin hacer nada.
 *     El del mes no: se publica con el mes abierto y sigue en directo.
 *   · «Congela los tops»: fila en `top_freezes` (`scripts/top-freeze.mjs`).
 * La primera petición calcula en directo y guarda la foto; las demás leen esa
 * misma (números y orden juntos). Votos y escuchas se siguen guardando y
 * salen cuando acaba la congelación. Si algo falla, el llamador sigue en vivo.
 */
import { unstable_cache } from 'next/cache'
import { PUBLIC_CATALOG_CACHE_TAG } from '@/lib/revalidate-public'
import { createServiceSupabase } from '@/lib/supabase-admin'
import type { FreezeJson } from '@/types/database'

export const ARTICLE_FREEZE_MS = 72 * 60 * 60 * 1000

export type PublicFreeze = {
  /** `page:<id>` o `article:<slug>`: espacio de nombres de sus fotos. */
  key: string
  until: string
}

/** Congelación de la página en curso, o null. Se nota en ≤ 60 s. */
export async function getActivePageFreeze(): Promise<PublicFreeze | null> {
  let row: { id: number; until: string } | null = null
  try {
    row = await unstable_cache(
      async () => {
        const { data, error } = await createServiceSupabase()
          .from('top_freezes')
          .select('id, until')
          .is('ended_at', null)
          .gt('until', new Date().toISOString())
          .order('frozen_at', { ascending: false })
          .limit(1)
        if (error) throw new Error(error.message)
        return (data?.[0] as { id: number; until: string } | undefined) ?? null
      },
      ['top-freeze-active'],
      { revalidate: 60, tags: [PUBLIC_CATALOG_CACHE_TAG] },
    )()
  } catch (err) {
    console.warn('[public-freeze]', err instanceof Error ? err.message : err)
    return null
  }
  if (!row || Date.parse(row.until) <= Date.now()) return null
  return { key: `page:${row.id}`, until: row.until }
}

/** Las 72 h que siguen a la publicación de un artículo. */
export function articleFreeze(slug: string, publishedAt: string | null | undefined): PublicFreeze | null {
  const at = publishedAt ? Date.parse(publishedAt) : NaN
  if (!slug || slug.startsWith('mes-breakbeat-') || !Number.isFinite(at)) return null
  const until = at + ARTICLE_FREEZE_MS
  const now = Date.now()
  if (now < at || now >= until) return null
  return { key: `article:${slug}`, until: new Date(until).toISOString() }
}

/** Foto de `item` en esa congelación. La primera petición la guarda; gana la primera que llega. */
export async function frozenSnapshot<T>(
  freeze: PublicFreeze,
  item: string,
  compute: () => Promise<T>,
): Promise<{ data: T; capturedAt: string }> {
  return unstable_cache(
    async () => {
      const sb = createServiceSupabase()
      const read = async () => {
        const { data, error } = await sb
          .from('public_freeze_snapshots')
          .select('data, captured_at')
          .eq('freeze_key', freeze.key)
          .eq('item_key', item)
          .maybeSingle()
        if (error) throw new Error(error.message)
        return data as { data: FreezeJson; captured_at: string } | null
      }
      let hit = await read()
      if (!hit) {
        const fresh = await compute()
        const { error } = await sb
          .from('public_freeze_snapshots')
          .upsert(
            { freeze_key: freeze.key, item_key: item, data: fresh as unknown as FreezeJson },
            { onConflict: 'freeze_key,item_key', ignoreDuplicates: true },
          )
        if (error) throw new Error(error.message)
        hit = await read()
        if (!hit) throw new Error(`foto ${freeze.key}/${item} no guardada`)
      }
      return { data: hit.data as unknown as T, capturedAt: hit.captured_at }
    },
    ['public-freeze', freeze.key, item],
    { revalidate: 3600, tags: [PUBLIC_CATALOG_CACHE_TAG] },
  )()
}
