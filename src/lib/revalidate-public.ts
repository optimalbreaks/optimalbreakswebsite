import { revalidateTag } from 'next/cache'

/** Data Cache tag para lecturas de `/charts` (New Releases + 40 Breaks + vinyl). */
export const PUBLIC_CHARTS_CACHE_TAG = 'public-charts'

export function revalidatePublicCharts(): void {
  revalidateTag(PUBLIC_CHARTS_CACHE_TAG)
}
