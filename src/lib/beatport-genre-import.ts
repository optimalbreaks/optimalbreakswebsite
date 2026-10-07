/**
 * Pase diario: temas nuevos del género Breaks en Beatport.
 * Desde el 8 oct 2026. Top 100 del tablero → chart_featured_tracks.
 * El resto queda en chart_import_queue (pending) para el admin.
 */
import { normalizeArtistKey } from '@/lib/artist-slug-map'
import { splitArtistCreditsForRanking } from '@/lib/artist-self-credit'
import {
  chartEditionWeekMondayFromPublish,
  dedupeKeyForFeaturedLink,
  extractNextData,
  fetchBeatportPageHtml,
  findAllTracksFromNextData,
  pickFromTrackBlob,
  type BeatportPickInput,
} from '@/lib/beatport-next-data-tracks'
import { loadTopArtistKeys } from '@/lib/community-top-artists'
import { extractRemixerNames } from '@/lib/remixer-credits'
import { revalidatePublicCharts } from '@/lib/revalidate-public'
import { createServiceSupabase, fetchAllRows } from '@/lib/supabase-admin'
import type { ChartFeaturedArtist, ChartImportVia } from '@/types/database'

/** Primer día que entra en la cola. Hasta el 7 oct 2026 el catálogo ya está al día. */
export const BEATPORT_IMPORT_FROM = '2026-10-08'

const GENRE_TRACKS =
  'https://www.beatport.com/genre/breaks-breakbeat-uk-bass/9/tracks'
const PER_PAGE = 150
const MAX_PAGES = 6

export type GenreImportResult = {
  ok: boolean
  skipped?: string
  seen: number
  queued: number
  auto_approved: number
  skipped_known: number
  error?: string
}

type EditionState = { id: string; nextSort: number; keys: Set<string> }

function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

export function madridHour(): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date())
  return Number(h)
}

function beatportIdFromLink(url: string): string {
  const m = String(url || '').match(/\/track\/[^/]+\/(\d+)/i)
  return m ? m[1] : ''
}

function genreTracksUrl(page: number): string {
  const q = new URLSearchParams({
    page: String(page),
    per_page: String(PER_PAGE),
    publish_date: `${BEATPORT_IMPORT_FROM}:`,
  })
  return `${GENRE_TRACKS}?${q.toString()}`
}

function tracksFromNext(nd: unknown, pageUrl: string): { count: number; tracks: BeatportPickInput[] } {
  const queries =
    (nd as { props?: { pageProps?: { dehydratedState?: { queries?: { queryKey?: unknown[]; state?: { data?: { count?: number; results?: Record<string, unknown>[] } } }[] } } } })
      ?.props?.pageProps?.dehydratedState?.queries || []
  const q = queries.find((item) => Array.isArray(item.queryKey) && item.queryKey[0] === 'tracks')
  const data = q?.state?.data
  const results = Array.isArray(data?.results) ? data.results : []
  const tracks: BeatportPickInput[] = []
  for (const raw of results) {
    const release = (raw.release as Record<string, unknown> | undefined) || {}
    const label =
      (raw.label as { name?: string } | undefined) ||
      (release.label as { name?: string } | undefined)
    const normalized = {
      ...raw,
      release: { ...release, ...(label ? { label } : {}) },
    }
    const pick = pickFromTrackBlob(normalized)
    if (pick?.title && pick.release_date && pick.release_date >= BEATPORT_IMPORT_FROM) tracks.push(pick)
  }
  if (!tracks.length) {
    const parsed = findAllTracksFromNextData(
      nd as Parameters<typeof findAllTracksFromNextData>[0],
      pageUrl,
    ).filter((p) => p.release_date && p.release_date >= BEATPORT_IMPORT_FROM)
    return { count: Number(data?.count) || parsed.length, tracks: parsed }
  }
  return { count: Number(data?.count) || tracks.length, tracks }
}

async function readGenrePageFetch(url: string): Promise<{ count: number; tracks: BeatportPickInput[] } | null> {
  try {
    const html = await fetchBeatportPageHtml(url)
    if (!html.includes('__NEXT_DATA__')) return null
    const nd = extractNextData(html)
    if (!nd) return null
    return tracksFromNext(nd, url)
  } catch {
    return null
  }
}

async function openBrowserReader(): Promise<{
  read: (url: string) => Promise<{ count: number; tracks: BeatportPickInput[] }>
  close: () => Promise<void>
}> {
  const { chromium } = await import('playwright-core')
  const browser = process.env.VERCEL
    ? await (async () => {
        const mod = await import('@sparticuz/chromium')
        const bin = mod.default ?? mod
        bin.setGraphicsMode = false
        return chromium.launch({
          args: bin.args,
          executablePath: await bin.executablePath(),
          headless: true,
        })
      })()
    : await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox'],
      })
  return {
    read: async (url) => {
      const ctx = await browser.newContext({
        userAgent:
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        locale: 'en-US',
        viewport: { width: 1366, height: 800 },
      })
      try {
        const page = await ctx.newPage()
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 90000 })
        const deadline = Date.now() + 35000
        while (Date.now() < deadline) {
          const has = await page.evaluate(() => !!document.querySelector('script#__NEXT_DATA__')).catch(() => false)
          if (has) break
          await page.waitForTimeout(1200)
        }
        const nd = await page.evaluate(() => {
          const el = document.querySelector('script#__NEXT_DATA__')
          if (!el?.textContent) return null
          return JSON.parse(el.textContent) as unknown
        })
        if (!nd) throw new Error('Beatport no devolvió la lista (challenge o página vacía)')
        return tracksFromNext(nd, url)
      } finally {
        await ctx.close()
      }
    },
    close: () => browser.close(),
  }
}

function matchesTop100(pick: BeatportPickInput, keys: Set<string>): boolean {
  const names = new Set<string>()
  for (const artist of pick.artists) {
    const key = normalizeArtistKey(artist.name)
    if (key) names.add(key)
    for (const part of splitArtistCreditsForRanking(artist.name)) {
      const k = normalizeArtistKey(part)
      if (k) names.add(k)
    }
  }
  for (const remixer of extractRemixerNames(pick.mix_name)) {
    const k = normalizeArtistKey(remixer)
    if (k) names.add(k)
  }
  for (const key of names) {
    if (keys.has(key)) return true
  }
  return false
}

async function loadKnownIds(sb: ReturnType<typeof createServiceSupabase>): Promise<Set<string>> {
  const [featured, queued] = await Promise.all([
    fetchAllRows<{ link_url: string | null }>((from, to) =>
      sb.from('chart_featured_tracks').select('link_url').order('id', { ascending: true }).range(from, to),
    ),
    fetchAllRows<{ beatport_track_id: string }>((from, to) =>
      sb
        .from('chart_import_queue')
        .select('beatport_track_id')
        .order('created_at', { ascending: true })
        .range(from, to),
    ),
  ])
  if (featured.error) throw new Error(featured.error.message)
  if (queued.error) throw new Error(queued.error.message)
  const ids = new Set<string>()
  for (const row of featured.data) {
    const id = beatportIdFromLink(row.link_url || '')
    if (id) ids.add(id)
  }
  for (const row of queued.data) {
    if (row.beatport_track_id) ids.add(row.beatport_track_id)
  }
  return ids
}

async function editionFor(
  sb: ReturnType<typeof createServiceSupabase>,
  cache: Map<string, EditionState>,
  week: string,
): Promise<EditionState> {
  const hit = cache.get(week)
  if (hit) return hit
  const { data: edition, error } = await sb.from('chart_editions').select('id').eq('week_date', week).maybeSingle()
  if (error) throw new Error(error.message)
  let editionId = edition?.id as string | undefined
  if (!editionId) {
    const { data: inserted, error: insErr } = await sb
      .from('chart_editions')
      .insert({
        week_date: week,
        title: `40 Breaks Vitales — ${week}`,
        description_en: `Weekly new releases for ${week}.`,
        description_es: `Novedades de la semana del ${week}.`,
        sources: [],
        is_published: true,
        published_at: new Date().toISOString(),
      })
      .select('id')
      .single()
    if (insErr || !inserted?.id) throw new Error(insErr?.message || 'No se pudo crear la semana')
    editionId = inserted.id as string
  }
  const { data: rows, error: rowErr } = await fetchAllRows<{ link_url?: string; sort_order?: number }>((from, to) =>
    sb
      .from('chart_featured_tracks')
      .select('link_url, sort_order')
      .eq('chart_edition_id', editionId)
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (rowErr) throw new Error(rowErr.message)
  const keys = new Set<string>()
  let maxSo = 0
  for (const r of rows) {
    const k = dedupeKeyForFeaturedLink(String(r.link_url || ''))
    if (k) keys.add(k)
    maxSo = Math.max(maxSo, Number(r.sort_order) || 0)
  }
  const state = { id: editionId, nextSort: maxSo + 1, keys }
  cache.set(week, state)
  return state
}

export async function publishFeaturedPick(
  sb: ReturnType<typeof createServiceSupabase>,
  cache: Map<string, EditionState>,
  pick: BeatportPickInput,
): Promise<'inserted' | 'duplicate'> {
  const week = chartEditionWeekMondayFromPublish(pick.release_date)
  if (!week) throw new Error('Sin fecha de lanzamiento')
  const state = await editionFor(sb, cache, week)
  const key = dedupeKeyForFeaturedLink(pick.link_url)
  if (state.keys.has(key)) return 'duplicate'
  const artists = pick.artists as ChartFeaturedArtist[]
  const { error } = await sb.from('chart_featured_tracks').insert({
    chart_edition_id: state.id,
    sort_order: state.nextSort,
    title: pick.title,
    mix_name: pick.mix_name || '',
    artists,
    label: pick.label || '',
    platform: 'beatport',
    link_url: pick.link_url,
    link_label: '',
    artwork_url: pick.artwork_url || null,
    sample_url: pick.sample_url || null,
    bpm: pick.bpm,
    music_key: pick.music_key || '',
    release_year: pick.release_year,
    release_date: pick.release_date,
    spotify_url: null,
    tidal_url: null,
    note_en: '',
    note_es: '',
  })
  if (error) {
    if (/duplicate|unique/i.test(error.message)) return 'duplicate'
    throw new Error(error.message)
  }
  state.keys.add(key)
  state.nextSort += 1
  return 'inserted'
}

async function rememberQueue(
  sb: ReturnType<typeof createServiceSupabase>,
  pick: BeatportPickInput,
  status: 'pending' | 'approved',
  via: ChartImportVia | null,
  userId: string | null,
): Promise<void> {
  const id = beatportIdFromLink(pick.link_url)
  const { error } = await sb.from('chart_import_queue').insert({
    beatport_track_id: id,
    link_url: pick.link_url,
    title: pick.title,
    mix_name: pick.mix_name || '',
    artists: pick.artists as ChartFeaturedArtist[],
    label: pick.label || '',
    artwork_url: pick.artwork_url || null,
    sample_url: pick.sample_url || null,
    bpm: pick.bpm,
    music_key: pick.music_key || '',
    release_date: pick.release_date,
    release_year: pick.release_year,
    status,
    via,
    decided_at: status === 'approved' ? new Date().toISOString() : null,
    decided_by: status === 'approved' ? userId : null,
  })
  if (error && !/duplicate|unique/i.test(error.message)) throw new Error(error.message)
}

export async function runBeatportGenreImport(opts: {
  trigger: 'cron' | 'manual'
  userId?: string | null
}): Promise<GenreImportResult> {
  const sb = createServiceSupabase()
  const empty = { seen: 0, queued: 0, auto_approved: 0, skipped_known: 0 }

  if (madridToday() < BEATPORT_IMPORT_FROM) {
    return { ok: true, skipped: 'before-start', ...empty }
  }

  const { data: openRun } = await sb
    .from('chart_import_runs')
    .select('id, started_at')
    .is('finished_at', null)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  if (openRun?.started_at && Date.now() - Date.parse(openRun.started_at) < 15 * 60 * 1000) {
    return { ok: true, skipped: 'already-running', ...empty }
  }

  const { data: run, error: runErr } = await sb
    .from('chart_import_runs')
    .insert({ trigger: opts.trigger, ok: false })
    .select('id')
    .single()
  if (runErr || !run?.id) {
    return { ok: false, error: runErr?.message || 'No se pudo abrir el pase', ...empty }
  }

  const result: GenreImportResult = { ok: false, ...empty }
  let published = 0
  try {
    const known = await loadKnownIds(sb)
    const fresh: BeatportPickInput[] = []
    let total = Infinity
    let browser: Awaited<ReturnType<typeof openBrowserReader>> | null = null
    try {
      for (let page = 1; page <= MAX_PAGES && (page - 1) * PER_PAGE < total; page++) {
        const url = genreTracksUrl(page)
        let payload = await readGenrePageFetch(url)
        if (!payload) {
          if (!browser) browser = await openBrowserReader()
          payload = await browser.read(url)
        }
        total = payload.count
        result.seen += payload.tracks.length
        let pageFresh = 0
        for (const pick of payload.tracks) {
          const id = beatportIdFromLink(pick.link_url)
          if (!id) continue
          if (known.has(id)) {
            result.skipped_known += 1
            continue
          }
          known.add(id)
          fresh.push(pick)
          pageFresh += 1
        }
        if (!payload.tracks.length || payload.tracks.length < PER_PAGE) break
        if (pageFresh === 0) break
      }
    } finally {
      await browser?.close()
    }

    if (fresh.length) {
      const topKeys = await loadTopArtistKeys(sb, 100)
      const cache = new Map<string, EditionState>()
      for (const pick of fresh) {
        if (matchesTop100(pick, topKeys)) {
          const pub = await publishFeaturedPick(sb, cache, pick)
          await rememberQueue(sb, pick, 'approved', 'auto_top100', opts.userId ?? null)
          if (pub === 'inserted') {
            result.auto_approved += 1
            published += 1
          }
        } else {
          await rememberQueue(sb, pick, 'pending', null, null)
          result.queued += 1
        }
      }
    }
    result.ok = true
  } catch (e) {
    result.ok = false
    result.error = e instanceof Error ? e.message : String(e)
  }

  await sb
    .from('chart_import_runs')
    .update({
      finished_at: new Date().toISOString(),
      ok: result.ok,
      seen: result.seen,
      queued: result.queued,
      auto_approved: result.auto_approved,
      skipped_known: result.skipped_known,
      error: result.error ?? null,
    })
    .eq('id', run.id)

  if (published > 0) revalidatePublicCharts()
  return result
}

export async function decideImport(
  id: string,
  action: 'approve' | 'discard' | 'restore',
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const sb = createServiceSupabase()
  const { data: row, error } = await sb.from('chart_import_queue').select('*').eq('id', id).maybeSingle()
  if (error) return { ok: false, error: error.message }
  if (!row) return { ok: false, error: 'No está en la cola' }

  if (action === 'restore') {
    if (row.status !== 'discarded') return { ok: false, error: 'Solo se recupera un descarte' }
    const { error: upErr } = await sb
      .from('chart_import_queue')
      .update({ status: 'pending', via: null, decided_at: null, decided_by: null })
      .eq('id', id)
    if (upErr) return { ok: false, error: upErr.message }
    return { ok: true }
  }

  if (row.status !== 'pending') return { ok: false, error: 'Ese tema ya está decidido' }

  if (action === 'discard') {
    const { error: upErr } = await sb
      .from('chart_import_queue')
      .update({
        status: 'discarded',
        via: 'admin',
        decided_at: new Date().toISOString(),
        decided_by: userId,
      })
      .eq('id', id)
    if (upErr) return { ok: false, error: upErr.message }
    return { ok: true }
  }

  const pick: BeatportPickInput = {
    title: row.title,
    mix_name: row.mix_name || '',
    artists: row.artists?.length ? row.artists : [{ name: 'Unknown' }],
    label: row.label || '',
    platform: 'beatport',
    link_url: row.link_url,
    link_label: '',
    artwork_url: row.artwork_url || '',
    sample_url: row.sample_url || '',
    bpm: row.bpm,
    music_key: row.music_key || '',
    release_year: row.release_year,
    release_date: row.release_date,
    note_en: '',
    note_es: '',
  }
  try {
    await publishFeaturedPick(sb, new Map(), pick)
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) }
  }
  const { error: upErr } = await sb
    .from('chart_import_queue')
    .update({
      status: 'approved',
      via: 'admin',
      decided_at: new Date().toISOString(),
      decided_by: userId,
    })
    .eq('id', id)
  if (upErr) return { ok: false, error: upErr.message }
  revalidatePublicCharts()
  return { ok: true }
}
