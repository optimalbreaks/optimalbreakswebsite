// Dashboard admin de awards (BreaksPoll interno).
// El voto es el «+» de saved_chart_tracks, el mismo que alimenta el Top 100.
//
// Dos universos, como en community-monthly:
// - Temas: listas públicas, orden por usuarios únicos. El auto-voto SÍ cuenta.
// - Artistas / sellos / países: skip de fichaje, claim, familiar y marca de sello.
// Modo `raw` quita esos skips y mete también las listas privadas (auditoría).

import { displayArtistImageUrl } from '@/lib/artist-public-portrait'
import {
  buildFullArtistSlugMap,
  buildFullLabelSlugMap,
  normalizeArtistKey,
  slugLookupKeys,
} from '@/lib/artist-slug-map'
import {
  loadLabelCreditSkipMap,
  loadSelfCreditSkipMap,
  shouldSkipArtistSelfCredit,
  shouldSkipLabelSave,
  splitArtistCreditsForRanking,
  type LabelCreditSkipMap,
  type SelfCreditSkipMap,
} from '@/lib/artist-self-credit'
import { extractRemixerNames } from '@/lib/remixer-credits'
import { countryIsoCodesFromCode, countryNameFromCode } from '@/lib/seo'
import { createServiceSupabase, fetchAllRows, selectByIds } from '@/lib/supabase-admin'

export type AwardsAxis = 'release' | 'save'
export type AwardsMode = 'public' | 'raw'

/** Lo justo para sonar en el reproductor global o en un embed de YouTube. */
export type AwardPlayback = {
  key: string
  title: string
  artist: string
  mix_name: string | null
  label: string | null
  artwork_url: string | null
  /** Src del <audio> (preview de tienda, Bandcamp o exclusiva). Null si solo hay vídeo. */
  src: string | null
  youtube_id: string | null
}

export type AwardEntry = {
  rank: number
  title: string
  detail: string | null
  save_count: number
  unique_users: number
  unique_tracks: number | null
  slug: string | null
  kind: 'track' | 'artist' | 'label' | 'country'
  country: string | null
  image_url: string | null
  play: AwardPlayback | null
}

export type AwardCategory = {
  id: string
  title: string
  hint: string
  entries: AwardEntry[]
}

export type AwardCountry = {
  iso: string
  name: string
  save_count: number
  artist_count: number
  unique_users: number
}

export type AwardReleaseYear = {
  year: number | null
  label: string
  save_count: number
  unique_tracks: number
  top_title: string | null
  image_url: string | null
  play: AwardPlayback | null
}

export type AwardGap = {
  name: string
  save_count: number
  note: string
}

export type AwardsBoard = {
  year: number | null
  axis: AwardsAxis
  mode: AwardsMode
  years: number[]
  edition: {
    saves: number
    tracks: number
    users: number
    categories: AwardCategory[]
    countries: AwardCountry[]
  }
  release_years: AwardReleaseYear[]
  release_years_hint: string
  coverage: {
    saves: number
    orphan_saves: number
    tracks: number
    tracks_with_year: number
    tracks_without_year: number
    credit_events: number
    credit_events_with_country: number
    aggregator_saves: number
    missing_country: AwardGap[]
    unmatched_labels: AwardGap[]
  }
}

const NOMINEES = 5
const GAPS = 8
const BREAKTHROUGH_MIN = 2

const AGGREGATOR_KEYS = new Set([
  'distrokid',
  'tunecore',
  'cd baby',
  'amuse',
  'routenote',
  'united masters',
  'unitedmasters',
  'artistfy',
  'create music group',
])

type ServiceClient = ReturnType<typeof createServiceSupabase>
type ChartTrackSource = 'chart' | 'featured' | 'vinyl' | 'beatport_top'

type SavedRow = {
  user_id: string
  track_source: ChartTrackSource
  track_id: string
  canonical_url: string | null
  snapshot: Record<string, unknown> | null
  created_at: string | null
}

type PlayKind = 'beatport' | 'bandcamp' | 'youtube'

type PlayBits = {
  artwork_url: string | null
  sample_url: string | null
  full_audio_url: string | null
  external_url: string | null
  youtube_url: string | null
  kind: PlayKind
}

type SourceMeta = {
  title: string
  mix_name: string | null
  artists: string
  label: string | null
  release_year: number | null
  canonical_key: string
  play: PlayBits
}

type CatalogHit = {
  slug: string
  name: string
  country: string | null
  image_url: string | null
}

type SaveFact = {
  userId: string
  canonicalKey: string
  title: string
  mixName: string | null
  artists: string
  label: string | null
  releaseYear: number | null
  saveYear: number | null
  savedAt: string | null
  isRemix: boolean
  isSpanish: boolean
  credits: { key: string; name: string }[]
  labelCredit: { key: string; raw: string } | null
  aggregator: boolean
  play: PlayBits
}

type TrackAgg = {
  key: string
  title: string
  mixName: string | null
  artists: string
  label: string | null
  year: number | null
  isRemix: boolean
  isSpanish: boolean
  save_count: number
  users: Set<string>
  last: string
  play: PlayBits
}

type PersonAgg = {
  key: string
  name: string
  save_count: number
  users: Set<string>
  tracks: Set<string>
}

function artistsLine(a: unknown): string {
  if (typeof a === 'string') return a.trim()
  if (!Array.isArray(a)) return ''
  return a
    .map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x))
    .filter(Boolean)
    .join(', ')
}

function normalizeUrl(u: string | null | undefined): string {
  const s = (u || '').trim().toLowerCase()
  if (!s) return ''
  const ytMatch = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-z0-9_-]{11})/i)
  if (ytMatch) return `yt:${ytMatch[1]}`
  try {
    const url = new URL(s)
    return `${url.host}${url.pathname.replace(/\/$/, '')}`
  } catch {
    return s.replace(/[?#].*$/, '').replace(/\/$/, '')
  }
}

function strOrNull(v: unknown): string | null {
  return typeof v === 'string' && v.trim() ? v.trim() : null
}

function youtubeIdOf(url: string | null | undefined): string | null {
  const s = (url || '').trim()
  if (!s) return null
  const m = s.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|v\/|shorts\/))([a-zA-Z0-9_-]{11})/i)
  if (m) return m[1]
  return /^[a-zA-Z0-9_-]{11}$/.test(s) ? s : null
}

const COVER_PROXY_HOSTS = new Set([
  'geo-media.beatport.com',
  'i.discogs.com',
  'i.ytimg.com',
  'img.youtube.com',
])

/** Carátula usable en un `<img>`: Beatport, Discogs y YouTube pasan por el proxy (si no, 403). */
function coverUrl(play: PlayBits): string | null {
  const art = (play.artwork_url || '').trim()
  if (art) return proxiedCover(art)
  const yt = youtubeIdOf(play.youtube_url)
  if (!yt) return null
  return proxiedCover(`https://i.ytimg.com/vi/${yt}/hqdefault.jpg`)
}

function proxiedCover(url: string): string {
  if (url.startsWith('/')) return url
  try {
    const host = new URL(url).hostname.toLowerCase()
    if (COVER_PROXY_HOSTS.has(host)) {
      return `/api/og/image-proxy?src=${encodeURIComponent(url)}`
    }
  } catch { /* se deja la URL tal cual */ }
  return url
}

function playRank(p: PlayBits): number {
  if (p.full_audio_url) return 4
  if (p.sample_url || (p.kind === 'bandcamp' && p.external_url)) return 3
  if (p.youtube_url || p.kind === 'youtube') return 1
  return 0
}

function fillPlay(primary: PlayBits, extra: PlayBits | null | undefined): PlayBits {
  if (!extra) return primary
  const winner = playRank(extra) > playRank(primary) ? extra : primary
  const loser = winner === extra ? primary : extra
  return {
    artwork_url: winner.artwork_url || loser.artwork_url,
    sample_url: winner.sample_url || loser.sample_url,
    full_audio_url: winner.full_audio_url || loser.full_audio_url,
    external_url: winner.external_url || loser.external_url,
    youtube_url: winner.youtube_url || loser.youtube_url,
    kind: winner.kind,
  }
}

function previewSrc(play: PlayBits): string | null {
  const full = (play.full_audio_url || '').trim()
  if (full.startsWith('/api/audio/')) return full
  if (play.kind === 'bandcamp' && play.external_url) {
    return `/api/bandcamp-preview?track=${encodeURIComponent(play.external_url)}`
  }
  const sample = (play.sample_url || '').trim()
  if (!sample) return null
  try {
    const host = new URL(sample).hostname.toLowerCase()
    if (host === 'geo-samples.beatport.com' || host === 'geo-media.beatport.com') {
      return `/api/audio-proxy?url=${encodeURIComponent(sample)}`
    }
  } catch { /* url cruda */ }
  return sample
}

function toPlayback(
  key: string,
  title: string,
  artist: string,
  mix: string | null,
  label: string | null,
  play: PlayBits,
): AwardPlayback | null {
  const src = previewSrc(play)
  const yt = youtubeIdOf(play.youtube_url) || (key.startsWith('yt:') ? key.slice(3) : null)
  if (!src && !yt) return null
  return {
    key,
    title: title || 'Sin título',
    artist,
    mix_name: mix,
    label,
    artwork_url: coverUrl(play),
    src,
    youtube_id: src ? null : yt,
  }
}

function releaseYearOf(year: unknown, releaseDate: unknown): number | null {
  if (typeof releaseDate === 'string') {
    const m = releaseDate.trim().match(/^(\d{4})/)
    if (m) {
      const y = Number(m[1])
      if (y >= 1950 && y <= 2100) return y
    }
  }
  if (typeof year === 'number' && year >= 1950 && year <= 2100) return year
  if (typeof year === 'string' && /^\d{4}$/.test(year.trim())) {
    const y = Number(year)
    if (y >= 1950 && y <= 2100) return y
  }
  return null
}

function saveYearOf(created: string | null): number | null {
  if (!created) return null
  const t = Date.parse(created)
  if (!Number.isFinite(t)) return null
  return new Date(t).getUTCFullYear()
}

function isAggregator(name: string): boolean {
  const key = normalizeArtistKey(name)
  if (!key) return false
  if (AGGREGATOR_KEYS.has(key)) return true
  for (const agg of AGGREGATOR_KEYS) {
    if (key.startsWith(`${agg} `)) return true
  }
  return false
}

function isSpain(country: string | null | undefined): boolean {
  return countryIsoCodesFromCode(country).includes('es')
}

function resolveSlug(raw: string, map: Record<string, string>, label = false): string | null {
  for (const key of slugLookupKeys(raw, label ? { labelSuffixes: true } : undefined)) {
    const slug = map[key]
    if (slug) return slug
  }
  return null
}

function snapshotMeta(s: SavedRow): SourceMeta | null {
  const snap = (s.snapshot || {}) as Record<string, unknown>
  const title = String(snap.title || '').trim()
  if (!title) return null
  const snapYoutube = strOrNull(snap.youtube_url) || ''
  const beatport = strOrNull(snap.beatport_url) || s.canonical_url
  const external = s.track_source === 'vinyl' ? snapYoutube || s.canonical_url : beatport
  const canonical_key =
    s.track_source === 'vinyl'
      ? normalizeUrl(snapYoutube || s.canonical_url) || `t:vinyl:${s.track_id}`
      : normalizeUrl(beatport) || `t:${s.track_source}:${s.track_id}`
  const sample = strOrNull(snap.sample_url)
  const full = strOrNull(snap.full_audio_url)
  const kind: PlayKind =
    s.track_source === 'vinyl' || (!sample && !full && (snapYoutube || canonical_key.startsWith('yt:')))
      ? 'youtube'
      : /bandcamp\.com/i.test(external || '')
        ? 'bandcamp'
        : 'beatport'
  return {
    title,
    mix_name: strOrNull(snap.mix_name),
    artists: artistsLine(snap.artists),
    label: strOrNull(snap.label),
    release_year: releaseYearOf(snap.year, snap.release_date),
    canonical_key,
    play: {
      artwork_url: strOrNull(snap.artwork_url),
      sample_url: sample,
      full_audio_url: full,
      external_url: external,
      youtube_url: snapYoutube || null,
      kind,
    },
  }
}

function creditNames(artists: string, mixName: string | null): { key: string; name: string }[] {
  const credited = new Map<string, string>()
  for (const artistName of splitArtistCreditsForRanking(artists || '')) {
    const key = normalizeArtistKey(artistName)
    if (key && !credited.has(key)) credited.set(key, artistName.trim())
  }
  for (const remixer of extractRemixerNames(mixName)) {
    const key = normalizeArtistKey(remixer)
    if (key && !credited.has(key)) credited.set(key, remixer.trim())
  }
  return Array.from(credited.entries()).map(([key, name]) => ({ key, name }))
}

function inEdition(fact: SaveFact, year: number | null, axis: AwardsAxis): boolean {
  if (year == null) return true
  if (axis === 'release') return fact.releaseYear === year
  return fact.saveYear === year
}

function sortTracks(rows: TrackAgg[]): TrackAgg[] {
  return rows.sort(
    (a, b) =>
      b.users.size - a.users.size ||
      b.save_count - a.save_count ||
      (b.last || '').localeCompare(a.last || '') ||
      (a.title || '').localeCompare(b.title || '', 'es'),
  )
}

function sortPeople(rows: PersonAgg[]): PersonAgg[] {
  return rows.sort(
    (a, b) =>
      b.save_count - a.save_count ||
      b.users.size - a.users.size ||
      b.tracks.size - a.tracks.size ||
      a.name.localeCompare(b.name, 'es'),
  )
}

function tracksOf(facts: SaveFact[]): TrackAgg[] {
  const map = new Map<string, TrackAgg>()
  for (const f of facts) {
    let row = map.get(f.canonicalKey)
    if (!row) {
      row = {
        key: f.canonicalKey,
        title: f.title || 'Sin título',
        mixName: f.mixName,
        artists: f.artists,
        label: f.label,
        year: f.releaseYear,
        isRemix: f.isRemix,
        isSpanish: f.isSpanish,
        save_count: 0,
        users: new Set(),
        last: f.savedAt || '',
        play: f.play,
      }
      map.set(f.canonicalKey, row)
    }
    row.save_count += 1
    row.users.add(f.userId)
    if (f.savedAt && f.savedAt > row.last) row.last = f.savedAt
    if (!row.mixName && f.mixName) row.mixName = f.mixName
    if (!row.label && f.label) row.label = f.label
    if (!row.year && f.releaseYear) row.year = f.releaseYear
    if (!row.artists && f.artists) row.artists = f.artists
    if (f.isRemix) row.isRemix = true
    if (f.isSpanish) row.isSpanish = true
    row.play = fillPlay(row.play, f.play)
  }
  return sortTracks(Array.from(map.values()))
}

function peopleOf(facts: SaveFact[], pick: (f: SaveFact) => { key: string; name: string }[]): PersonAgg[] {
  const map = new Map<string, PersonAgg>()
  for (const f of facts) {
    for (const c of pick(f)) {
      let row = map.get(c.key)
      if (!row) {
        row = { key: c.key, name: c.name, save_count: 0, users: new Set(), tracks: new Set() }
        map.set(c.key, row)
      }
      row.save_count += 1
      row.users.add(f.userId)
      row.tracks.add(f.canonicalKey)
      if (c.name.length > row.name.length) row.name = c.name
    }
  }
  return sortPeople(Array.from(map.values()))
}

function trackEntries(rows: TrackAgg[], n = NOMINEES): AwardEntry[] {
  return rows.slice(0, n).map((t, i) => {
    const mix = t.mixName ? ` (${t.mixName})` : ''
    const year = t.year ? String(t.year) : 'sin año'
    const who = t.artists ? `${t.artists}${mix}` : mix.replace(/^\s*/, '') || null
    return {
      rank: i + 1,
      title: t.title,
      detail: [who, year].filter(Boolean).join(' · ') || null,
      save_count: t.save_count,
      unique_users: t.users.size,
      unique_tracks: null,
      slug: null,
      kind: 'track' as const,
      country: null,
      image_url: coverUrl(t.play),
      play: toPlayback(t.key, t.title, t.artists, t.mixName, t.label, t.play),
    }
  })
}

function personEntries(
  rows: PersonAgg[],
  catalog: Map<string, CatalogHit>,
  kind: 'artist' | 'label',
  n = NOMINEES,
): AwardEntry[] {
  return rows.slice(0, n).map((p, i) => {
    const hit = catalog.get(p.key.startsWith('slug:') ? p.key.slice(5) : '') 
    const slug = p.key.startsWith('slug:') ? p.key.slice(5) : null
    const country = hit?.country || null
    const countryName = country ? countryNameFromCode(country, 'es') : null
    return {
      rank: i + 1,
      title: hit?.name || p.name,
      detail: countryName,
      save_count: p.save_count,
      unique_users: p.users.size,
      unique_tracks: p.tracks.size,
      slug,
      kind,
      country,
      image_url:
        kind === 'artist'
          ? displayArtistImageUrl(slug, hit?.image_url) || null
          : hit?.image_url && /^https?:\/\//.test(hit.image_url)
            ? hit.image_url
            : null,
      play: null,
    }
  })
}

function artistKeyFor(name: string, slugMap: Record<string, string>, bySlug: Map<string, CatalogHit>): string {
  const slug = resolveSlug(name, slugMap)
  if (slug && bySlug.has(slug)) return `slug:${slug}`
  return `name:${normalizeArtistKey(name)}`
}

function labelKeyFor(name: string, slugMap: Record<string, string>, bySlug: Map<string, CatalogHit>): string {
  const slug = resolveSlug(name, slugMap, true)
  if (slug && bySlug.has(slug)) return `slug:${slug}`
  return `name:${normalizeArtistKey(name)}`
}

export async function loadAwardsBoard(
  sb: ServiceClient,
  opts: { year: number | null; axis: AwardsAxis; mode: AwardsMode },
): Promise<AwardsBoard> {
  const { year, axis, mode } = opts

  const [savedRes, privateRes, selfSkip, labelSkip, artistRes, labelRes] = await Promise.all([
    fetchAllRows<SavedRow>((from, to) =>
      sb
        .from('saved_chart_tracks')
        .select('user_id, track_source, track_id, canonical_url, snapshot, created_at')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<{ id: string }>((from, to) =>
      sb
        .from('profiles')
        .select('id')
        .eq('is_tracks_public', false)
        .order('id', { ascending: true })
        .range(from, to),
    ),
    loadSelfCreditSkipMap(sb),
    loadLabelCreditSkipMap(sb),
    fetchAllRows<{ slug: string; name: string | null; name_display: string | null; country: string | null; image_url: string | null }>(
      (from, to) =>
        sb
          .from('artists')
          .select('slug, name, name_display, country, image_url')
          .order('id', { ascending: true })
          .range(from, to),
    ),
    fetchAllRows<{ slug: string; name: string | null; country: string | null; image_url: string | null }>((from, to) =>
      sb
        .from('labels')
        .select('slug, name, country, image_url')
        .order('id', { ascending: true })
        .range(from, to),
    ),
  ])

  const err = savedRes.error || privateRes.error || artistRes.error || labelRes.error
  if (err) throw new Error(err.message)

  const privateIds = new Set((privateRes.data || []).map((p) => p.id))
  const saved = (savedRes.data || []).filter((s) => mode === 'raw' || !privateIds.has(s.user_id))

  const artistRows = artistRes.data || []
  const labelRows = labelRes.data || []
  const artistSlugMap = buildFullArtistSlugMap(artistRows)
  const labelSlugMap = buildFullLabelSlugMap(
    labelRows.map((r) => ({ slug: r.slug, name: r.name, name_display: r.name })),
  )
  const artistBySlug = new Map<string, CatalogHit>()
  for (const row of artistRows) {
    artistBySlug.set(row.slug, {
      slug: row.slug,
      name: (row.name_display || row.name || row.slug).trim(),
      country: row.country,
      image_url: row.image_url,
    })
  }
  const labelBySlug = new Map<string, CatalogHit>()
  for (const row of labelRows) {
    labelBySlug.set(row.slug, {
      slug: row.slug,
      name: (row.name || row.slug).trim(),
      country: row.country,
      image_url: row.image_url,
    })
  }

  const facts = await hydrateFacts(sb, saved, {
    mode,
    selfSkip,
    labelSkip,
    artistSlugMap,
    labelSlugMap,
    artistBySlug,
    labelBySlug,
  })

  const years = new Set<number>()
  const now = new Date().getUTCFullYear()
  years.add(now)
  for (const f of facts) {
    if (f.releaseYear) years.add(f.releaseYear)
    if (f.saveYear) years.add(f.saveYear)
  }

  const editionFacts = facts.filter((f) => inEdition(f, year, axis))
  const prevFacts =
    year == null ? [] : facts.filter((f) => inEdition(f, year - 1, axis))

  const editionTracks = tracksOf(editionFacts)
  const editionArtists = peopleOf(editionFacts, (f) =>
    f.credits.map((c) => ({ key: artistKeyFor(c.name, artistSlugMap, artistBySlug), name: c.name })),
  )
  const editionLabels = peopleOf(editionFacts, (f) =>
    f.labelCredit ? [{ key: f.labelCredit.key, name: f.labelCredit.raw }] : [],
  )
  const prevArtists = peopleOf(prevFacts, (f) =>
    f.credits.map((c) => ({ key: artistKeyFor(c.name, artistSlugMap, artistBySlug), name: c.name })),
  )
  const prevByKey = new Map(prevArtists.map((a) => [a.key, a.save_count]))

  const spanishArtists = editionArtists.filter((a) => {
    const slug = a.key.startsWith('slug:') ? a.key.slice(5) : ''
    return isSpain(artistBySlug.get(slug)?.country)
  })
  const spanishLabels = editionLabels.filter((a) => {
    const slug = a.key.startsWith('slug:') ? a.key.slice(5) : ''
    return isSpain(labelBySlug.get(slug)?.country)
  })

  const breakthrough = year == null
    ? []
    : editionArtists.filter((a) => a.save_count >= BREAKTHROUGH_MIN && (prevByKey.get(a.key) || 0) === 0)

  const yearLabel = year == null ? 'todos los años' : String(year)
  const axisLabel = axis === 'release' ? 'año de lanzamiento' : 'año del «+»'

  const categories: AwardCategory[] = [
    {
      id: 'track',
      title: year == null ? 'Tema más votado' : 'Tema del año',
      hint: `Orden del Top 100 de canciones (usuarios únicos, luego «+»). ${yearLabel}, ${axisLabel}. El auto-voto cuenta.`,
      entries: trackEntries(editionTracks),
    },
    {
      id: 'remix',
      title: 'Remix del año',
      hint: 'El mismo corte, solo si el mix nombra un remixer. Original Mix y Breakbeat Remix genérico no entran.',
      entries: trackEntries(editionTracks.filter((t) => t.isRemix)),
    },
    {
      id: 'producer',
      title: 'Mejor productor',
      hint: 'Créditos del tablero de artistas, remixer incluido. En público no suma el auto-voto ni el volcado de un sello fichado.',
      entries: personEntries(editionArtists, artistBySlug, 'artist'),
    },
    {
      id: 'label',
      title: 'Mejor sello',
      hint: 'Un «+» acredita al sello del tema. DistroKid, TuneCore y agregadores no compiten. Hace falta que el nombre case con la ficha para salir como sello español.',
      entries: personEntries(editionLabels, labelBySlug, 'label'),
    },
    {
      id: 'artist_es',
      title: 'Artista español',
      hint: 'Mismo tablero, solo fichas cuyo país incluye España. Sin ficha o sin país no entra: sale abajo, en cobertura.',
      entries: personEntries(spanishArtists, artistBySlug, 'artist'),
    },
    {
      id: 'label_es',
      title: 'Sello español',
      hint: 'Sellos con ficha y país España. El string del tema tiene que resolver a esa ficha.',
      entries: personEntries(spanishLabels, labelBySlug, 'label'),
    },
    {
      id: 'track_es',
      title: 'Tema español',
      hint: 'Algún crédito (o el sello) resuelve a una ficha con país España.',
      entries: trackEntries(editionTracks.filter((t) => t.isSpanish)),
    },
  ]

  if (year != null) {
    categories.splice(4, 0, {
      id: 'breakthrough',
      title: 'Revelación',
      hint: `Al menos ${BREAKTHROUGH_MIN} créditos en ${year} y cero en ${year - 1}. Mismo eje (${axisLabel}) y las mismas exclusiones.`,
      entries: personEntries(breakthrough, artistBySlug, 'artist'),
    })
  }

  const countries = countriesOf(editionArtists, artistBySlug)
  const editionUsers = new Set<string>()
  for (const f of editionFacts) editionUsers.add(f.userId)

  const histogramFacts =
    axis === 'save' && year != null ? facts.filter((f) => f.saveYear === year) : facts
  const releaseYearsHint =
    axis === 'save' && year != null
      ? `De los «+» hechos en ${year}, de qué año es el tema.`
      : 'Todos los «+» de este modo, agrupados por año de lanzamiento. No cambia al elegir un año de edición con el eje de lanzamiento.'

  return {
    year,
    axis,
    mode,
    years: Array.from(years).sort((a, b) => b - a),
    edition: {
      saves: editionFacts.length,
      tracks: editionTracks.length,
      users: editionUsers.size,
      categories,
      countries,
    },
    release_years: releaseYearRows(histogramFacts),
    release_years_hint: releaseYearsHint,
    coverage: coverageOf(facts, saved.length, artistSlugMap, artistBySlug, labelSlugMap, labelBySlug),
  }
}

function countriesOf(artists: PersonAgg[], artistBySlug: Map<string, CatalogHit>): AwardCountry[] {
  type Bucket = { save_count: number; artists: Set<string>; users: Set<string> }
  const map = new Map<string, Bucket>()
  for (const a of artists) {
    const slug = a.key.startsWith('slug:') ? a.key.slice(5) : ''
    const country = slug ? artistBySlug.get(slug)?.country : null
    for (const iso of countryIsoCodesFromCode(country)) {
      let row = map.get(iso)
      if (!row) {
        row = { save_count: 0, artists: new Set(), users: new Set() }
        map.set(iso, row)
      }
      row.save_count += a.save_count
      row.artists.add(a.key)
      for (const u of a.users) row.users.add(u)
    }
  }
  return Array.from(map.entries())
    .map(([iso, b]) => ({
      iso: iso.toUpperCase() === 'GB' ? 'GB' : iso.toUpperCase(),
      name: countryNameFromCode(iso, 'es') || iso.toUpperCase(),
      save_count: b.save_count,
      artist_count: b.artists.size,
      unique_users: b.users.size,
    }))
    .sort(
      (a, b) =>
        b.save_count - a.save_count ||
        b.artist_count - a.artist_count ||
        a.name.localeCompare(b.name, 'es'),
    )
}

function releaseYearRows(facts: SaveFact[]): AwardReleaseYear[] {
  type YearTrack = {
    key: string
    title: string
    artist: string
    mix: string | null
    label: string | null
    users: Set<string>
    saves: number
    play: PlayBits
  }
  type Bucket = { saves: number; tracks: Map<string, YearTrack> }
  const map = new Map<number | null, Bucket>()
  for (const f of facts) {
    const y = f.releaseYear
    let row = map.get(y)
    if (!row) {
      row = { saves: 0, tracks: new Map() }
      map.set(y, row)
    }
    row.saves += 1
    let track = row.tracks.get(f.canonicalKey)
    if (!track) {
      track = {
        key: f.canonicalKey,
        title: f.title || 'Sin título',
        artist: f.artists,
        mix: f.mixName,
        label: f.label,
        users: new Set(),
        saves: 0,
        play: f.play,
      }
      row.tracks.set(f.canonicalKey, track)
    }
    track.saves += 1
    track.users.add(f.userId)
    track.play = fillPlay(track.play, f.play)
    if (!track.artist && f.artists) track.artist = f.artists
  }
  return Array.from(map.entries())
    .map(([year, b]) => {
      let top: YearTrack | null = null
      for (const t of b.tracks.values()) {
        if (
          !top ||
          t.users.size > top.users.size ||
          (t.users.size === top.users.size && t.saves > top.saves)
        ) {
          top = t
        }
      }
      return {
        year,
        label: year == null ? 'Sin año' : String(year),
        save_count: b.saves,
        unique_tracks: b.tracks.size,
        top_title: top?.title || null,
        image_url: top ? coverUrl(top.play) : null,
        play: top ? toPlayback(top.key, top.title, top.artist, top.mix, top.label, top.play) : null,
      }
    })
    .sort((a, b) => {
      if (a.year == null) return 1
      if (b.year == null) return -1
      return b.year - a.year
    })
}

function coverageOf(
  facts: SaveFact[],
  savedCount: number,
  artistSlugMap: Record<string, string>,
  artistBySlug: Map<string, CatalogHit>,
  labelSlugMap: Record<string, string>,
  labelBySlug: Map<string, CatalogHit>,
): AwardsBoard['coverage'] {
  const trackYears = new Map<string, number | null>()
  let creditEvents = 0
  let creditWithCountry = 0
  let aggregatorSaves = 0
  const missing = new Map<string, { name: string; save_count: number; note: string }>()
  const unmatched = new Map<string, { name: string; save_count: number }>()

  for (const f of facts) {
    if (!trackYears.has(f.canonicalKey)) trackYears.set(f.canonicalKey, f.releaseYear)
    else if (!trackYears.get(f.canonicalKey) && f.releaseYear) trackYears.set(f.canonicalKey, f.releaseYear)
    if (f.aggregator) aggregatorSaves += 1
    for (const c of f.credits) {
      creditEvents += 1
      const slug = resolveSlug(c.name, artistSlugMap)
      const hit = slug ? artistBySlug.get(slug) : undefined
      const country = hit?.country || null
      if (country && countryIsoCodesFromCode(country).length) {
        creditWithCountry += 1
        continue
      }
      const key = slug ? `slug:${slug}` : `name:${c.key}`
      const prev = missing.get(key)
      if (prev) prev.save_count += 1
      else {
        missing.set(key, {
          name: hit?.name || c.name,
          save_count: 1,
          note: slug ? 'Ficha sin país' : 'Sin ficha',
        })
      }
    }
    if (f.label && !f.aggregator) {
      const slug = resolveSlug(f.label, labelSlugMap, true)
      if (!slug || !labelBySlug.has(slug)) {
        const key = normalizeArtistKey(f.label)
        if (!key) continue
        const prev = unmatched.get(key)
        if (prev) {
          prev.save_count += 1
          if (f.label.length > prev.name.length) prev.name = f.label
        } else unmatched.set(key, { name: f.label, save_count: 1 })
      }
    }
  }

  let withYear = 0
  for (const y of trackYears.values()) if (y) withYear += 1

  const topMissing = Array.from(missing.values())
    .sort((a, b) => b.save_count - a.save_count || a.name.localeCompare(b.name, 'es'))
    .slice(0, GAPS)
  const topUnmatched = Array.from(unmatched.values())
    .sort((a, b) => b.save_count - a.save_count || a.name.localeCompare(b.name, 'es'))
    .slice(0, GAPS)
    .map((r) => ({ ...r, note: 'Sin ficha de sello' }))

  return {
    saves: facts.length,
    orphan_saves: Math.max(0, savedCount - facts.length),
    tracks: trackYears.size,
    tracks_with_year: withYear,
    tracks_without_year: trackYears.size - withYear,
    credit_events: creditEvents,
    credit_events_with_country: creditWithCountry,
    aggregator_saves: aggregatorSaves,
    missing_country: topMissing,
    unmatched_labels: topUnmatched,
  }
}

async function hydrateFacts(
  sb: ServiceClient,
  saved: SavedRow[],
  ctx: {
    mode: AwardsMode
    selfSkip: SelfCreditSkipMap
    labelSkip: LabelCreditSkipMap
    artistSlugMap: Record<string, string>
    labelSlugMap: Record<string, string>
    artistBySlug: Map<string, CatalogHit>
    labelBySlug: Map<string, CatalogHit>
  },
): Promise<SaveFact[]> {
  if (!saved.length) return []

  const chartIds = Array.from(new Set(saved.filter((s) => s.track_source === 'chart').map((s) => s.track_id)))
  const featIds = Array.from(new Set(saved.filter((s) => s.track_source === 'featured').map((s) => s.track_id)))
  const vinylIds = Array.from(new Set(saved.filter((s) => s.track_source === 'vinyl').map((s) => s.track_id)))

  const [chartRes, featRes, vinylRes] = await Promise.all([
    chartIds.length
      ? selectByIds<{ id: string; title: string; mix_name: string | null; artists: unknown; label: string | null; release_year: number | null; release_date: string | null; beatport_url: string | null; artwork_url: string | null; sample_url: string | null }>(
          chartIds,
          (chunk) =>
            sb
              .from('chart_tracks')
              .select('id, title, mix_name, artists, label, release_year, release_date, beatport_url, artwork_url, sample_url')
              .in('id', chunk),
        )
      : Promise.resolve({ data: [], error: null }),
    featIds.length
      ? selectByIds<{ id: string; title: string; mix_name: string | null; artists: unknown; label: string | null; release_year: number | null; release_date: string | null; link_url: string | null; platform: string | null; artwork_url: string | null; sample_url: string | null; full_audio_url: string | null }>(
          featIds,
          (chunk) =>
            sb
              .from('chart_featured_tracks')
              .select('id, title, mix_name, artists, label, release_year, release_date, link_url, platform, artwork_url, sample_url, full_audio_url')
              .in('id', chunk),
        )
      : Promise.resolve({ data: [], error: null }),
    vinylIds.length
      ? selectByIds<{ id: string; title: string; mix_name: string | null; artists: unknown; label: string | null; year: number | null; youtube_url: string | null; artwork_url: string | null }>(
          vinylIds,
          (chunk) =>
            sb
              .from('chart_vinyl_tracks')
              .select('id, title, mix_name, artists, label, year, youtube_url, artwork_url')
              .in('id', chunk),
        )
      : Promise.resolve({ data: [], error: null }),
  ])
  const lookupErr = chartRes.error || featRes.error || vinylRes.error
  if (lookupErr) throw new Error(lookupErr.message)

  const byRef = new Map<string, SourceMeta>()
  for (const c of chartRes.data || []) {
    byRef.set(`chart:${c.id}`, {
      title: c.title,
      mix_name: c.mix_name,
      artists: artistsLine(c.artists),
      label: c.label,
      release_year: releaseYearOf(c.release_year, c.release_date),
      canonical_key: normalizeUrl(c.beatport_url) || `t:chart:${c.id}`,
      play: {
        artwork_url: c.artwork_url,
        sample_url: c.sample_url,
        full_audio_url: null,
        external_url: c.beatport_url,
        youtube_url: null,
        kind: 'beatport',
      },
    })
  }
  for (const f of featRes.data || []) {
    const bandcamp = f.platform === 'bandcamp' || /bandcamp\.com/i.test(f.link_url || '')
    byRef.set(`featured:${f.id}`, {
      title: f.title,
      mix_name: f.mix_name,
      artists: artistsLine(f.artists),
      label: f.label,
      release_year: releaseYearOf(f.release_year, f.release_date),
      canonical_key: normalizeUrl(f.link_url) || `t:featured:${f.id}`,
      play: {
        artwork_url: f.artwork_url,
        sample_url: f.sample_url,
        full_audio_url: f.full_audio_url,
        external_url: f.link_url,
        youtube_url: null,
        kind: bandcamp ? 'bandcamp' : 'beatport',
      },
    })
  }
  for (const v of vinylRes.data || []) {
    byRef.set(`vinyl:${v.id}`, {
      title: v.title,
      mix_name: v.mix_name,
      artists: artistsLine(v.artists),
      label: v.label,
      release_year: releaseYearOf(v.year, null),
      canonical_key: normalizeUrl(v.youtube_url) || `t:vinyl:${v.id}`,
      play: {
        artwork_url: v.artwork_url,
        sample_url: null,
        full_audio_url: null,
        external_url: v.youtube_url,
        youtube_url: v.youtube_url,
        kind: 'youtube',
      },
    })
  }

  const facts: SaveFact[] = []
  for (const s of saved) {
    const live = byRef.get(`${s.track_source}:${s.track_id}`)
    const snap = snapshotMeta(s)
    const meta = !live
      ? snap
      : {
          ...live,
          mix_name: live.mix_name || snap?.mix_name || null,
          artists: live.artists || snap?.artists || '',
          label: live.label || snap?.label || null,
          release_year: live.release_year ?? snap?.release_year ?? null,
          play: fillPlay(live.play, snap?.play),
        }
    if (!meta || !meta.canonical_key) continue

    const names = creditNames(meta.artists, meta.mix_name)
    const skipLabel = ctx.mode === 'public' && shouldSkipLabelSave(ctx.labelSkip, s.user_id, meta.label)
    const credits = skipLabel
      ? []
      : names.filter((n) => ctx.mode === 'raw' || !shouldSkipArtistSelfCredit(ctx.selfSkip, s.user_id, n.name))

    const spanishArtist = names.some((n) => {
      const slug = resolveSlug(n.name, ctx.artistSlugMap)
      return isSpain(slug ? ctx.artistBySlug.get(slug)?.country : null)
    })
    const labelSlug = meta.label ? resolveSlug(meta.label, ctx.labelSlugMap, true) : null
    const spanishLabel = isSpain(labelSlug ? ctx.labelBySlug.get(labelSlug)?.country : null)
    const aggregator = !!(meta.label && isAggregator(meta.label))

    let labelCredit: SaveFact['labelCredit'] = null
    if (meta.label && !aggregator && !skipLabel) {
      const key = labelSlug && ctx.labelBySlug.has(labelSlug) ? `slug:${labelSlug}` : `name:${normalizeArtistKey(meta.label)}`
      if (key !== 'name:') labelCredit = { key, raw: meta.label }
    }

    facts.push({
      userId: s.user_id,
      canonicalKey: meta.canonical_key,
      title: meta.title,
      mixName: meta.mix_name,
      artists: meta.artists,
      label: meta.label,
      releaseYear: meta.release_year,
      saveYear: saveYearOf(s.created_at),
      savedAt: s.created_at,
      isRemix: extractRemixerNames(meta.mix_name).length > 0,
      isSpanish: spanishArtist || spanishLabel,
      credits,
      labelCredit,
      aggregator,
      play: meta.play,
    })
  }
  return facts
}
