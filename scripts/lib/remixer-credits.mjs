/**
 * Copia operativa de src/lib/remixer-credits.ts para scripts .mjs.
 * Remixer = crédito de artista (versión breakbeat).
 */

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

function isGenericMixToken(name) {
  const k = String(name || '').trim().toLowerCase()
  if (!k) return true
  if (GENERIC_MIX_TOKENS.has(k)) return true
  if (/^\d{4}$/.test(k)) return true
  return false
}

function splitCreditLine(artists) {
  const names = String(artists || '')
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  const out = []
  for (const n of names) {
    const parts = n.split(/\s+(?:&|and|x|vs\.?)\s+/i).map((s) => s.trim()).filter(Boolean)
    if (parts.length) out.push(...parts)
    else if (n) out.push(n)
  }
  return out
}

export function extractRemixerNames(mixName) {
  const raw = String(mixName || '').trim()
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

  const names = []
  const seen = new Set()
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

export function mergeArtistCreditObjects(artists, extraNames) {
  const out = []
  const seen = new Set()
  const push = (name, extra) => {
    const n = String(name || '').trim()
    if (!n) return
    const key = n.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ ...(extra || {}), name: n })
  }
  for (const a of artists || []) {
    if (a?.name) push(a.name, a)
  }
  for (const n of extraNames || []) push(n)
  return out
}

export function collectBeatportArtistCredits(t) {
  const fromFields = [...(t.artists || []), ...(t.remixers || [])]
    .map((a) => ({ name: (a?.name || '').trim() }))
    .filter((x) => x.name)
  const merged = mergeArtistCreditObjects(fromFields, extractRemixerNames(t.mix_name))
  return merged.length ? merged : [{ name: 'Unknown' }]
}
