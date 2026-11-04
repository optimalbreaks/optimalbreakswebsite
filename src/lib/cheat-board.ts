// Tablero admin /trampas. Solo cuentas ya marcadas (artista, claim, familiar, sello).
// Un «+» o una escucha entra si el tema acredita ese nombre, o si el sello del
// tema es el sello marcado. No borra filas y no ficha a nadie.

import { normalizeArtistKey, slugLookupKeys } from '@/lib/artist-slug-map'
import {
  isArtistSelfCreditSave,
  loadLabelCreditSkipMap,
  loadSelfCreditSkipMap,
  shouldSkipLabelSave,
  type LabelCreditSkipMap,
  type SelfCreditSkipMap,
} from '@/lib/artist-self-credit'
import { normalizeTrackCanonicalUrl } from '@/lib/track-canonical-key'
import { createServiceSupabase, fetchAllRows } from '@/lib/supabase-admin'
import type { SavedChartTrackSnapshot } from '@/types/database'

type ServiceClient = ReturnType<typeof createServiceSupabase>

export type CheatMarkKind = 'artista' | 'claim' | 'familiar' | 'sello'

export type CheatMark = {
  kind: CheatMarkKind
  name: string
}

export type CheatTrack = {
  key: string
  title: string
  artists: string
  label: string | null
  votes: number
  plays: number
  why: string[]
  lastAt: string | null
}

export type CheatPerson = {
  userId: string
  name: string
  email: string | null
  username: string | null
  marks: CheatMark[]
  nameVotes: number
  nameVoteTracks: number
  namePlays: number
  namePlayTracks: number
  labelVotes: number
  labelVoteTracks: number
  labelPlays: number
  labelPlayTracks: number
  otherVotes: number
  otherPlays: number
  unresolved: number
  score: number
  tracks: CheatTrack[]
}

export type CheatBoard = {
  people: CheatPerson[]
  accounts: number
  nameVotes: number
  namePlays: number
  labelVotes: number
  labelPlays: number
}

type Meta = {
  title: string
  artists: string
  mixName: string | null
  label: string | null
}

type NameMark = CheatMark & { keys: Set<string> }

type Bag = {
  names: NameMark[]
  labels: NameMark[]
}

type SaveRow = {
  id: string
  user_id: string
  track_source: 'chart' | 'featured' | 'vinyl' | 'beatport_top'
  track_id: string
  canonical_url: string | null
  snapshot: SavedChartTrackSnapshot | null
  created_at: string
}

type PlayRow = {
  id: string
  user_id: string
  canonical_key: string
  created_at: string
}

type CatalogRow = {
  id: string
  title: string
  mix_name: string | null
  artists: unknown
  label: string | null
  link_url?: string | null
  beatport_url?: string | null
  youtube_url?: string | null
}

const SAVE_SELECT = 'id, user_id, track_source, track_id, canonical_url, snapshot, created_at'

function artistsLine(a: unknown): string {
  if (typeof a === 'string') return a.trim()
  if (!Array.isArray(a)) return ''
  return a
    .map((x) => (x && typeof x === 'object' ? (x as { name?: string }).name : x))
    .map((x) => String(x || '').trim())
    .filter(Boolean)
    .join(', ')
}

function nameKeys(raw: string | null | undefined): Set<string> {
  const key = normalizeArtistKey(raw || '')
  return key ? new Set([key]) : new Set()
}

function labelKeys(raw: string | null | undefined): Set<string> {
  const set = new Set<string>()
  for (const key of slugLookupKeys(raw || '', { labelSuffixes: true })) {
    if (key) set.add(key)
    const spaced = normalizeArtistKey(key)
    if (spaced) set.add(spaced)
  }
  return set
}

function addName(bags: Map<string, Bag>, kind: CheatMarkKind, userId: string, name: string, keys: Set<string>) {
  if (!keys.size || !name.trim()) return
  let row = bags.get(userId)
  if (!row) {
    row = { names: [], labels: [] }
    bags.set(userId, row)
  }
  const mark: NameMark = { kind, name: name.trim(), keys }
  if (kind === 'sello') row.labels.push(mark)
  else row.names.push(mark)
}

function remember(map: Map<string, Meta>, key: string, meta: Meta) {
  const k = key.replace(/\/$/, '')
  if (!k || !meta.title) return
  const prev = map.get(k)
  if (!prev) {
    map.set(k, meta)
    return
  }
  map.set(k, {
    title: prev.title || meta.title,
    artists: prev.artists || meta.artists,
    mixName: prev.mixName || meta.mixName,
    label: prev.label || meta.label,
  })
}

function metaFromCatalog(row: CatalogRow): Meta {
  return {
    title: (row.title || '').trim(),
    artists: artistsLine(row.artists),
    mixName: row.mix_name || null,
    label: row.label || null,
  }
}

function metaFromSnapshot(snap: SavedChartTrackSnapshot | null): Meta | null {
  const title = (snap?.title || '').trim()
  if (!title) return null
  return {
    title,
    artists: artistsLine(snap?.artists),
    mixName: snap?.mix_name || null,
    label: snap?.label || null,
  }
}

async function rowsIn<T>(
  ids: string[],
  run: (chunk: string[]) => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
): Promise<T[]> {
  const unique = [...new Set(ids.filter(Boolean))]
  const out: T[] = []
  for (let i = 0; i < unique.length; i += 40) {
    const { data, error } = await run(unique.slice(i, i + 40))
    if (error) throw new Error(error.message)
    out.push(...(data || []))
  }
  return out
}

async function indexCatalog(sb: ServiceClient, into: Map<string, Meta>, keys: string[]) {
  const urls: string[] = []
  const beatportIds: string[] = []
  const ytIds: string[] = []
  for (const key of keys) {
    if (!key || into.has(key)) continue
    if (key.startsWith('yt:')) ytIds.push(key.slice(3))
    else {
      urls.push(`https://${key}`, `https://${key}/`)
      const id = key.match(/\/(\d+)$/)?.[1]
      if (id) beatportIds.push(id)
    }
  }

  const take = (rows: CatalogRow[], field: 'link_url' | 'beatport_url' | 'youtube_url') => {
    for (const row of rows) {
      const meta = metaFromCatalog(row)
      const canon = normalizeTrackCanonicalUrl(row[field])
      if (canon) remember(into, canon, meta)
    }
  }

  take(
    await rowsIn<CatalogRow>(urls, (chunk) =>
      sb.from('chart_featured_tracks').select('id, title, mix_name, artists, label, link_url').in('link_url', chunk),
    ),
    'link_url',
  )
  take(
    await rowsIn<CatalogRow>(urls, (chunk) =>
      sb.from('chart_tracks').select('id, title, mix_name, artists, label, beatport_url').in('beatport_url', chunk),
    ),
    'beatport_url',
  )

  const knownBeatport = new Set<string>()
  for (const key of into.keys()) {
    const id = key.match(/\/(\d+)$/)?.[1]
    if (id) knownBeatport.add(id)
  }
  const missingIds = beatportIds.filter((id) => !knownBeatport.has(id))
  for (let i = 0; i < missingIds.length; i += 15) {
    const or = missingIds
      .slice(i, i + 15)
      .map((id) => `link_url.ilike.*/${id}*`)
      .join(',')
    const { data, error } = await sb
      .from('chart_featured_tracks')
      .select('id, title, mix_name, artists, label, link_url')
      .or(or)
    if (error) throw new Error(error.message)
    take((data || []) as CatalogRow[], 'link_url')
  }

  for (let i = 0; i < ytIds.length; i += 15) {
    const or = ytIds
      .slice(i, i + 15)
      .map((id) => `youtube_url.ilike.*${id}*`)
      .join(',')
    const { data, error } = await sb
      .from('chart_vinyl_tracks')
      .select('id, title, mix_name, artists, label, youtube_url')
      .or(or)
    if (error) throw new Error(error.message)
    take((data || []) as CatalogRow[], 'youtube_url')
  }
}

function whyOf(userId: string, bag: Bag, meta: Meta, selfSkip: SelfCreditSkipMap, labelSkip: LabelCreditSkipMap): string[] {
  const why: string[] = []
  if (isArtistSelfCreditSave(selfSkip, userId, meta.artists, meta.mixName)) {
    for (const mark of bag.names) {
      const map: SelfCreditSkipMap = new Map([[userId, mark.keys]])
      if (isArtistSelfCreditSave(map, userId, meta.artists, meta.mixName)) {
        const label = mark.kind === 'familiar' ? `familiar de ${mark.name}` : mark.name
        if (!why.includes(label)) why.push(label)
      }
    }
    if (!why.length) why.push('su nombre')
  }
  if (shouldSkipLabelSave(labelSkip, userId, meta.label)) {
    for (const mark of bag.labels) {
      const map: LabelCreditSkipMap = new Map([[userId, mark.keys]])
      if (shouldSkipLabelSave(map, userId, meta.label) && !why.includes(`sello ${mark.name}`)) {
        why.push(`sello ${mark.name}`)
      }
    }
    if (!bag.labels.length) why.push('su sello')
  }
  return why
}

function touch(track: CheatTrack, at: string | null) {
  if (at && (!track.lastAt || at > track.lastAt)) track.lastAt = at
}

async function emailsOf(sb: ServiceClient, ids: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>()
  for (let i = 0; i < ids.length; i += 8) {
    const slice = ids.slice(i, i + 8)
    const rows = await Promise.all(
      slice.map(async (id) => {
        const { data } = await sb.auth.admin.getUserById(id)
        return [id, data.user?.email || ''] as const
      }),
    )
    for (const [id, email] of rows) if (email) out.set(id, email)
  }
  return out
}

export async function loadCheatBoard(): Promise<CheatBoard> {
  const sb = createServiceSupabase()
  const [artistRes, familyRes, labelRes, claimRes, selfSkip, labelSkip] = await Promise.all([
    sb.from('editorial_artist_marks').select('user_id, artist_key, artist_name'),
    sb.from('editorial_family_marks').select('user_id, artist_key, artist_name'),
    sb.from('editorial_label_marks').select('user_id, label_key, label_name'),
    sb.from('artists').select('claimed_by, name, name_display, slug').not('claimed_by', 'is', null),
    loadSelfCreditSkipMap(sb),
    loadLabelCreditSkipMap(sb),
  ])
  const err = artistRes.error || familyRes.error || labelRes.error || claimRes.error
  if (err) throw new Error(err.message)

  const bags = new Map<string, Bag>()
  for (const row of artistRes.data || []) {
    const keys = nameKeys(row.artist_key)
    for (const k of nameKeys(row.artist_name)) keys.add(k)
    addName(bags, 'artista', row.user_id, row.artist_name, keys)
  }
  for (const row of familyRes.data || []) {
    const keys = nameKeys(row.artist_key)
    for (const k of nameKeys(row.artist_name)) keys.add(k)
    addName(bags, 'familiar', row.user_id, row.artist_name, keys)
  }
  for (const row of labelRes.data || []) {
    const keys = labelKeys(row.label_key)
    for (const k of labelKeys(row.label_name)) keys.add(k)
    addName(bags, 'sello', row.user_id, row.label_name, keys)
  }
  for (const row of claimRes.data || []) {
    if (!row.claimed_by) continue
    const keys = nameKeys(row.name)
    for (const k of nameKeys(row.name_display)) keys.add(k)
    for (const k of nameKeys((row.slug || '').replace(/-/g, ' '))) keys.add(k)
    addName(bags, 'claim', row.claimed_by, row.name || row.slug || 'Claim', keys)
  }

  const userIds = [...bags.keys()]
  if (!userIds.length) {
    return { people: [], accounts: 0, nameVotes: 0, namePlays: 0, labelVotes: 0, labelPlays: 0 }
  }

  const [saves, plays, profiles, emails] = await Promise.all([
    fetchAllRows<SaveRow>((from, to) =>
      sb.from('saved_chart_tracks').select(SAVE_SELECT).in('user_id', userIds).order('id').range(from, to),
    ).then((r) => {
      if (r.error) throw new Error(r.error.message)
      return r.data
    }),
    fetchAllRows<PlayRow>((from, to) =>
      sb.from('track_play_events').select('id, user_id, canonical_key, created_at').in('user_id', userIds).order('id').range(from, to),
    ).then((r) => {
      if (r.error) throw new Error(r.error.message)
      return r.data
    }),
    sb.from('profiles').select('id, display_name, username').in('id', userIds),
    emailsOf(sb, userIds),
  ])
  if (profiles.error) throw new Error(profiles.error.message)

  const byRef = new Map<string, Meta>()
  const byKey = new Map<string, Meta>()
  const chartIds: string[] = []
  const featIds: string[] = []
  const vinylIds: string[] = []
  for (const s of saves) {
    if (s.track_source === 'chart') chartIds.push(s.track_id)
    else if (s.track_source === 'featured') featIds.push(s.track_id)
    else if (s.track_source === 'vinyl') vinylIds.push(s.track_id)
  }
  const [charts, feats, vinyls] = await Promise.all([
    rowsIn<CatalogRow>(chartIds, (chunk) =>
      sb.from('chart_tracks').select('id, title, mix_name, artists, label, beatport_url').in('id', chunk),
    ),
    rowsIn<CatalogRow>(featIds, (chunk) =>
      sb.from('chart_featured_tracks').select('id, title, mix_name, artists, label, link_url').in('id', chunk),
    ),
    rowsIn<CatalogRow>(vinylIds, (chunk) =>
      sb.from('chart_vinyl_tracks').select('id, title, mix_name, artists, label, youtube_url').in('id', chunk),
    ),
  ])
  for (const row of charts) {
    const meta = metaFromCatalog(row)
    byRef.set(`chart:${row.id}`, meta)
    const canon = normalizeTrackCanonicalUrl(row.beatport_url)
    if (canon) remember(byKey, canon, meta)
  }
  for (const row of feats) {
    const meta = metaFromCatalog(row)
    byRef.set(`featured:${row.id}`, meta)
    const canon = normalizeTrackCanonicalUrl(row.link_url)
    if (canon) remember(byKey, canon, meta)
  }
  for (const row of vinyls) {
    const meta = metaFromCatalog(row)
    byRef.set(`vinyl:${row.id}`, meta)
    const canon = normalizeTrackCanonicalUrl(row.youtube_url)
    if (canon) remember(byKey, canon, meta)
  }
  for (const s of saves) {
    const snap = metaFromSnapshot(s.snapshot)
    const live = s.track_source === 'beatport_top' ? null : byRef.get(`${s.track_source}:${s.track_id}`)
    const meta = live
      ? {
          title: live.title || snap?.title || '',
          artists: live.artists || snap?.artists || '',
          mixName: live.mixName || snap?.mixName || null,
          label: live.label || snap?.label || null,
        }
      : snap
    if (!meta?.title) continue
    const canon =
      normalizeTrackCanonicalUrl(s.canonical_url) ||
      normalizeTrackCanonicalUrl(s.snapshot?.beatport_url) ||
      `t:${s.track_source}:${s.track_id}`
    remember(byKey, canon, meta)
  }

  const playKeys = [...new Set(plays.map((p) => normalizeTrackCanonicalUrl(p.canonical_key)).filter((k) => k && !byKey.has(k)))]
  await indexCatalog(sb, byKey, playKeys)

  const profileById = new Map((profiles.data || []).map((p) => [p.id, p]))
  const people: CheatPerson[] = []

  for (const userId of userIds) {
    const bag = bags.get(userId)!
    const tracks = new Map<string, CheatTrack>()
    let nameVotes = 0
    let namePlays = 0
    let labelVotes = 0
    let labelPlays = 0
    let otherVotes = 0
    let otherPlays = 0
    let unresolved = 0

    const ensure = (key: string, meta: Meta, why: string[]) => {
      let row = tracks.get(key)
      if (!row) {
        row = {
          key,
          title: meta.title || key,
          artists: meta.artists,
          label: meta.label,
          votes: 0,
          plays: 0,
          why,
          lastAt: null,
        }
        tracks.set(key, row)
      } else {
        for (const w of why) if (!row.why.includes(w)) row.why.push(w)
      }
      return row
    }

    for (const s of saves) {
      if (s.user_id !== userId) continue
      const snap = metaFromSnapshot(s.snapshot)
      const live = s.track_source === 'beatport_top' ? null : byRef.get(`${s.track_source}:${s.track_id}`)
      const meta = live
        ? {
            title: live.title || snap?.title || '',
            artists: live.artists || snap?.artists || '',
            mixName: live.mixName || snap?.mixName || null,
            label: live.label || snap?.label || null,
          }
        : snap
      if (!meta) {
        unresolved += 1
        continue
      }
      const why = whyOf(userId, bag, meta, selfSkip, labelSkip)
      const onName = why.some((w) => !w.startsWith('sello '))
      const onLabel = why.some((w) => w.startsWith('sello '))
      if (!onName && !onLabel) {
        otherVotes += 1
        continue
      }
      if (onName) nameVotes += 1
      else labelVotes += 1
      const key =
        normalizeTrackCanonicalUrl(s.canonical_url) ||
        normalizeTrackCanonicalUrl(s.snapshot?.beatport_url) ||
        `t:${s.track_source}:${s.track_id}`
      const track = ensure(key, meta, why)
      track.votes += 1
      touch(track, s.created_at)
    }

    for (const p of plays) {
      if (p.user_id !== userId) continue
      const key = normalizeTrackCanonicalUrl(p.canonical_key)
      const meta = key ? byKey.get(key) : undefined
      if (!key || !meta) {
        unresolved += 1
        continue
      }
      const why = whyOf(userId, bag, meta, selfSkip, labelSkip)
      const onName = why.some((w) => !w.startsWith('sello '))
      const onLabel = why.some((w) => w.startsWith('sello '))
      if (!onName && !onLabel) {
        otherPlays += 1
        continue
      }
      if (onName) namePlays += 1
      else labelPlays += 1
      const track = ensure(key, meta, why)
      track.plays += 1
      touch(track, p.created_at)
    }

    const list = [...tracks.values()].sort(
      (a, b) => b.plays - a.plays || b.votes - a.votes || a.title.localeCompare(b.title, 'es'),
    )
    const profile = profileById.get(userId)
    const email = emails.get(userId) || null
    const name = (profile?.display_name || '').trim() || email || 'Cuenta'
    people.push({
      userId,
      name,
      email,
      username: profile?.username || null,
      marks: [...bag.names, ...bag.labels].map(({ kind, name: markName }) => ({ kind, name: markName })),
      nameVotes,
      nameVoteTracks: list.filter((t) => t.votes > 0 && t.why.some((w) => !w.startsWith('sello '))).length,
      namePlays,
      namePlayTracks: list.filter((t) => t.plays > 0 && t.why.some((w) => !w.startsWith('sello '))).length,
      labelVotes,
      labelVoteTracks: list.filter((t) => t.votes > 0 && t.why.some((w) => w.startsWith('sello ')) && t.why.every((w) => w.startsWith('sello '))).length,
      labelPlays,
      labelPlayTracks: list.filter((t) => t.plays > 0 && t.why.some((w) => w.startsWith('sello ')) && t.why.every((w) => w.startsWith('sello '))).length,
      otherVotes,
      otherPlays,
      unresolved,
      score: nameVotes + namePlays + labelVotes + labelPlays,
      tracks: list,
    })
  }

  people.sort(
    (a, b) =>
      b.score - a.score ||
      b.nameVotes - a.nameVotes ||
      b.namePlays - a.namePlays ||
      a.name.localeCompare(b.name, 'es'),
  )

  return {
    people,
    accounts: people.length,
    nameVotes: people.reduce((n, p) => n + p.nameVotes, 0),
    namePlays: people.reduce((n, p) => n + p.namePlays, 0),
    labelVotes: people.reduce((n, p) => n + p.labelVotes, 0),
    labelPlays: people.reduce((n, p) => n + p.labelPlays, 0),
  }
}
