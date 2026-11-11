// ============================================
// OPTIMAL BREAKS — @ de Instagram para el pie de R/F
//
// Solo cuentas guardadas. Un artista, `artists.socials.instagram`. Un sello,
// la URL de Instagram de su ficha (`website`) o la de la organización vinculada.
// Sin ficha o sin perfil, no hay @ : mejor callar que etiquetar a otro.
// ============================================

import { splitLineupSlotNames, lineupCreditDisplayName } from '@/lib/artist-entity-match'
import {
  buildFullArtistSlugMap,
  buildFullLabelSlugMap,
  findArtistSlug,
  findLabelSlug,
  splitArtistDisplayLine,
} from '@/lib/artist-slug-map'
import { instagramMention } from '@/lib/share-caption'
import { createServiceSupabase, fetchAllRows } from '@/lib/supabase-admin'

type ArtistRow = { slug: string; name: string | null; name_display: string | null; socials: unknown }
type LabelRow = { slug: string; name: string | null; website: string | null; organization_id: string | null }
type OrgRow = { id: string; socials: unknown }

type Catalog = {
  at: number
  artistMap: Record<string, string>
  artistIg: Map<string, string>
  labelMap: Record<string, string>
  labelIg: Map<string, string>
}

let catalog: Catalog | null = null
const CATALOG_MS = 5 * 60 * 1000

function pushArtist(out: string[], raw: string) {
  const line = raw.trim()
  if (!line) return
  const credits = splitArtistDisplayLine(line)
  for (const credit of credits.length ? credits : [line]) {
    out.push(credit)
    for (const bit of splitLineupSlotNames(credit)) {
      const name = lineupCreditDisplayName(bit)
      if (name && name !== credit) out.push(name)
    }
  }
}

function pushLabel(out: string[], raw: string) {
  const line = raw.trim()
  if (!line) return
  out.push(line)
  for (const part of line.split(/\s*[/|,]\s*/)) {
    const name = part.trim()
    if (name && name !== line) out.push(name)
  }
}

const ARTIST_STRINGS = new Set(['artists', 'artist', 'lineup', 'newToCatalogue', 'debut'])
const ARTIST_LISTS = new Set(['topArtists', 'communityStars', 'stars'])
const LABEL_LISTS = new Set(['topLabels'])

/** Nombres que el pie puede citar, en el orden en que salen en el contexto. */
export function namesInCaptionContext(ctx: Record<string, unknown>): { artists: string[]; labels: string[] } {
  const artists: string[] = []
  const labels: string[] = []
  const walk = (value: unknown, key: string | null) => {
    if (typeof value === 'string') {
      if (key && ARTIST_STRINGS.has(key)) pushArtist(artists, value)
      else if (key === 'label') pushLabel(labels, value)
      return
    }
    if (Array.isArray(value)) {
      if (key && ARTIST_STRINGS.has(key)) {
        for (const item of value) if (typeof item === 'string') pushArtist(artists, item)
        return
      }
      if (key && ARTIST_LISTS.has(key)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') pushArtist(artists, item.name)
        }
        return
      }
      if (key && LABEL_LISTS.has(key)) {
        for (const item of value) {
          if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') pushLabel(labels, item.name)
        }
        return
      }
      for (const item of value) walk(item, key)
      return
    }
    if (value && typeof value === 'object') {
      for (const [k, v] of Object.entries(value)) walk(v, k)
    }
  }
  walk(ctx, null)
  return { artists, labels }
}

async function loadCatalog(): Promise<Catalog> {
  if (catalog && Date.now() - catalog.at < CATALOG_MS) return catalog
  const supabase = createServiceSupabase()
  const [artistRes, labelRes, orgRes] = await Promise.all([
    fetchAllRows<ArtistRow>((from, to) =>
      supabase.from('artists').select('slug, name, name_display, socials').order('slug', { ascending: true }).range(from, to),
    ),
    fetchAllRows<LabelRow>((from, to) =>
      supabase.from('labels').select('slug, name, website, organization_id').order('slug', { ascending: true }).range(from, to),
    ),
    fetchAllRows<OrgRow>((from, to) =>
      supabase.from('organizations').select('id, socials').order('id', { ascending: true }).range(from, to),
    ),
  ])
  if (artistRes.error) throw new Error(artistRes.error.message)
  if (labelRes.error) throw new Error(labelRes.error.message)
  if (orgRes.error) throw new Error(orgRes.error.message)

  const artistIg = new Map<string, string>()
  for (const row of artistRes.data) {
    const handle = instagramMention(row.socials)
    if (handle) artistIg.set(row.slug, handle)
  }
  const orgIg = new Map<string, string>()
  for (const row of orgRes.data) {
    const handle = instagramMention(row.socials)
    if (handle) orgIg.set(row.id, handle)
  }
  const labelIg = new Map<string, string>()
  for (const row of labelRes.data) {
    const fromSite = row.website ? instagramMention({ instagram: row.website }) : null
    const fromOrg = row.organization_id ? orgIg.get(row.organization_id) ?? null : null
    const handle = fromSite || fromOrg
    if (handle) labelIg.set(row.slug, handle)
  }
  catalog = {
    at: Date.now(),
    artistMap: buildFullArtistSlugMap(artistRes.data),
    artistIg,
    labelMap: buildFullLabelSlugMap(labelRes.data.map((r) => ({ slug: r.slug, name: r.name, name_display: null }))),
    labelIg,
  }
  return catalog
}

/** @ reales de los artistas y sellos nombrados en el contexto. Artistas primero. */
export async function captionInstagramMentions(ctx: Record<string, unknown>): Promise<string[]> {
  const { artists, labels } = namesInCaptionContext(ctx)
  if (!artists.length && !labels.length) return []
  const cat = await loadCatalog()
  const out: string[] = []
  const seen = new Set<string>()
  const add = (handle: string | null | undefined) => {
    if (!handle) return
    const key = handle.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(handle)
  }
  for (const name of artists) add(cat.artistIg.get(findArtistSlug(name, cat.artistMap) || ''))
  for (const name of labels) add(cat.labelIg.get(findLabelSlug(name, cat.labelMap) || ''))
  return out
}
