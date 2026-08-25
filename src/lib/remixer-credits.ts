/**
 * Remixer = productor de la versión breakbeat.
 * Beatport guarda el original en `artists[]` y el remixer en `remixers[]` /
 * `mix_name` («Jem Haynes Remix»). Aquí el remixer es crédito de artista.
 */

function splitCreditLine(artists: string): string[] {
  const names = String(artists || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const out: string[] = []
  for (const n of names) {
    const parts = n.split(/\s+(?:&|and|x|vs\.?)\s+/i).map((s) => s.trim()).filter(Boolean)
    if (parts.length) out.push(...parts)
    else if (n) out.push(n)
  }
  return out
}

const GENERIC_MIX_TOKENS = new Set([
  'original',
  'extended',
  'radio',
  'club',
  'instrumental',
  'vocal',
  'edit',
  'vip',
  'remix',
  'remixes',
  'mix',
  'version',
  'breakbeat',
  'breaks',
  'break',
  'dub',
  'jungle',
  'house',
  'techno',
  'bass',
  'uk bass',
  'dnb',
  'drum and bass',
  'intro',
  'outro',
  'rework',
  'bootleg',
  'flip',
])

function isGenericMixToken(name: string): boolean {
  const k = name.trim().toLowerCase()
  if (!k) return true
  if (GENERIC_MIX_TOKENS.has(k)) return true
  if (/^\d{4}$/.test(k)) return true
  return false
}

/** Nombres del remixer a partir de `mix_name` (vacío si es Original Mix / VIP / Breakbeat Remix). */
export function extractRemixerNames(mixName: string | null | undefined): string[] {
  const raw = (mixName || '').trim()
  if (!raw || !/remix/i.test(raw)) return []

  let s = raw.replace(/\(\s*(intro|outro)\s*\)\s*$/i, '').trim()
  if (/^\(.+\)$/.test(s)) s = s.slice(1, -1).trim()
  s = s
    .replace(
      /\s*(?:\d{4}\s+)?(?:extended\s+|club\s+|radio\s+|vip\s+|breakbeat\s+|breaks\s+|break\s+|dub\s+|dnb\s+|drum\s*(?:and|&)\s*bass\s+|uk\s*bass\s+)?remix(?:es)?(?:\s*\([^)]*\))?\s*$/i,
      '',
    )
    .trim()
  s = s.replace(/\s+(extended|club|radio|vip|breakbeat|breaks|dnb)$/i, '').trim()
  s = s.replace(/\s+\d{4}$/, '').trim()
  s = s.replace(/['']s$/i, '').trim()

  if (!s || isGenericMixToken(s)) return []

  const names: string[] = []
  const seen = new Set<string>()
  for (const part of splitCreditLine(s)) {
    const name = part.trim()
    if (name.length < 2 || isGenericMixToken(name)) continue
    const key = name.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    names.push(name)
  }
  return names
}

export type NamedCredit = { name: string; [k: string]: unknown }

export function mergeArtistCreditObjects<T extends { name?: string }>(
  artists: T[] | null | undefined,
  extraNames: string[],
): T[] {
  const out: T[] = []
  const seen = new Set<string>()
  const push = (name: string, extra?: T) => {
    const n = name.trim()
    if (!n) return
    const key = n.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push(({ ...(extra || {}), name: n } as T))
  }
  for (const a of artists || []) {
    if (a?.name) push(a.name, a)
  }
  for (const n of extraNames) push(n)
  return out
}

/** `artists[]` + remixers Beatport + nombres parseados de `mix_name`. */
export function collectBeatportArtistCredits(t: {
  artists?: { name?: string }[] | null
  remixers?: { name?: string }[] | null
  mix_name?: string | null
}): { name: string }[] {
  const fromFields = [
    ...(t.artists || []),
    ...(t.remixers || []),
  ]
    .map((a) => ({ name: (a?.name || '').trim() }))
    .filter((x) => x.name)
  const merged = mergeArtistCreditObjects(fromFields, extractRemixerNames(t.mix_name))
  return merged.length ? merged : [{ name: 'Unknown' }]
}

export function artistsLineWithRemixers(
  artistsLine: string | null | undefined,
  mixName: string | null | undefined,
): string {
  const extras = extractRemixerNames(mixName)
  if (!extras.length) return (artistsLine || '').trim()
  const base = (artistsLine || '').trim()
  const seen = new Set(
    splitCreditLine(base).map((n) => n.toLowerCase()),
  )
  const add = extras.filter((n) => !seen.has(n.toLowerCase()))
  if (!add.length) return base
  return base ? `${base}, ${add.join(', ')}` : add.join(', ')
}
