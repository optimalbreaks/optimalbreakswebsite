/**
 * Pase diario a las 12:05 (Madrid), desde el 8 oct 2026.
 * El aviso lo da pg_cron (migración 090); este módulo es el trabajo, en GitHub Actions.
 * No recorre todos los artistas de la web.
 * 1. Fichas de los 140 primeros del tablero en Beatport, cualquier género → se publican.
 * 2. Listado de Breaks → lo que no entró por 1 ni estaba ya, a la cola pendiente
 *    (o publicado si en los créditos va uno de esos 140).
 * Un id de Beatport que ya está en el catálogo, en la cola o en el paso 1 no se vuelve a meter.
 * Tampoco la misma canción (título + versión + artistas) resubida con otro id.
 */
import { normalizeArtistKey } from '@/lib/artist-slug-map'
import { splitArtistCreditsForRanking } from '@/lib/artist-self-credit'
import {
  chartEditionWeekMondayFromPublish,
  dedupeKeyForFeaturedLink,
  extractNextData,
  canonicalBeatportCatalogUrl,
  fetchBeatportPageHtml,
  findAllTracksFromNextData,
  pickFromTrackBlob,
  resolveTracksFromBeatportHtml,
  type BeatportPickInput,
} from '@/lib/beatport-next-data-tracks'
import { loadTopArtistKeys } from '@/lib/community-top-artists'
import { extractRemixerNames } from '@/lib/remixer-credits'
import { revalidatePublicCatalog, revalidatePublicCharts } from '@/lib/revalidate-public'
import { createServiceSupabase, fetchAllRows } from '@/lib/supabase-admin'
import { fetchAllPagesParallel } from '@/lib/supabase-paginate'
import { trackDisplayIdentityKey } from '@/lib/track-canonical-key'
import type { ChartFeaturedArtist, ChartImportVia } from '@/types/database'

/** Primer día que entra en la cola. Hasta el 7 oct 2026 el catálogo ya está al día. */
export const BEATPORT_IMPORT_FROM = '2026-10-08'

const GENRE_TRACKS =
  'https://www.beatport.com/genre/breaks-breakbeat-uk-bass/9/tracks'
const PER_PAGE = 150
const MAX_PAGES = 6
/**
 * Misma pausa que al pegar enlaces (`BEATPORT_BATCH_PAUSE_MS` en
 * `scripts/_append-batch-nr-from-releases.mjs`). Sin ella el Chrome del pase
 * encadena páginas y Cloudflare contesta 403.
 */
const BEATPORT_PAGE_PAUSE_MS = Math.max(
  0,
  Number.parseInt(String(process.env.BEATPORT_BATCH_PAUSE_MS || '4000').trim(), 10) || 4000,
)

function pauseBetweenBeatportPages(): Promise<void> {
  if (BEATPORT_PAGE_PAUSE_MS <= 0) return Promise.resolve()
  return new Promise((resolve) => setTimeout(resolve, BEATPORT_PAGE_PAUSE_MS))
}
/** Página de Beatport de otra persona. No bajar su catálogo. */
const SKIP_BEATPORT_IDS = new Set(['186585'])

export type GenreImportResult = {
  ok: boolean
  skipped?: string
  seen: number
  queued: number
  auto_approved: number
  skipped_known: number
  error?: string
  /** La página no trae temas desde el 8 oct. No es un fallo: se sigue. */
  empty?: boolean
  /** Temas que tiene el listado entero (página que manda el favorito). */
  listing_total?: number
}

type EditionState = { id: string; nextSort: number; keys: Set<string> }

export function madridToday(): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Madrid',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date())
}

/** Hay un pase terminado y correcto con fecha de Madrid de hoy. */
export async function hasOkImportRunToday(): Promise<boolean> {
  const sb = createServiceSupabase()
  const today = madridToday()
  const { data, error } = await sb
    .from('chart_import_runs')
    .select('started_at')
    .eq('ok', true)
    .not('finished_at', 'is', null)
    .order('started_at', { ascending: false })
    .limit(8)
  if (error) throw new Error(error.message)
  return (data ?? []).some((row) => {
    const started = row.started_at ? new Date(row.started_at) : null
    if (!started || Number.isNaN(started.getTime())) return false
    const day = new Intl.DateTimeFormat('en-CA', {
      timeZone: 'Europe/Madrid',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).format(started)
    return day === today
  })
}

/** Día de la semana en Madrid: 0 domingo … 5 viernes … 6 sábado. */
export function madridWeekday(): number {
  const name = new Intl.DateTimeFormat('en-US', { timeZone: 'Europe/Madrid', weekday: 'short' }).format(new Date())
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(name)
}

/**
 * Cuántos primeros del tablero de artistas lee el pase (ficha Beatport, cualquier género).
 * El tablero público sigue siendo el Top 100. El 15 oct 2026 se subió de 100 a 140:
 * hasta ahí los créditos siguen en la misma franja que el puesto 100.
 */
export const FOLLOW_BOARD_LIMIT = 140

/** Fuera del corte, pero el pase lee su ficha y publica sus créditos. 15 oct 2026: Dubaxface y AceNoise. */
const EXTRA_FOLLOW_NAMES = ['Dubaxface', 'AceNoise']

async function loadFollowKeys(sb: ReturnType<typeof createServiceSupabase>): Promise<Set<string>> {
  const keys = await loadTopArtistKeys(sb, FOLLOW_BOARD_LIMIT)
  for (const name of EXTRA_FOLLOW_NAMES) {
    const key = normalizeArtistKey(name)
    if (key) keys.add(key)
  }
  return keys
}

/** Las fichas de esos artistas se leen los sábados: el viernes Cloudflare bloquea más y el sábado ya recoge los lanzamientos del viernes. */
export const TOP100_ARTISTS_WEEKDAY = 6

export function madridHour(): number {
  const h = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Europe/Madrid',
    hour: 'numeric',
    hourCycle: 'h23',
  }).format(new Date())
  return Number(h)
}

function shortImportError(raw: string): string {
  if (/libnss3\.so/.test(raw)) {
    return 'El navegador del servidor no ha arrancado (falta libnss3). Beatport no se ha leído.'
  }
  const line = raw.split('\n').map((s) => s.trim()).find(Boolean) || raw
  return line.length > 240 ? `${line.slice(0, 237)}…` : line
}

function beatportIdFromLink(url: string): string {
  const m = String(url || '').match(/\/track\/[^/]+\/(\d+)/i)
  return m ? m[1] : ''
}

function genreTracksUrl(page: number, fromDate: string): string {
  const q = new URLSearchParams({
    page: String(page),
    per_page: String(PER_PAGE),
    publish_date: `${fromDate}:`,
  })
  return `${GENRE_TRACKS}?${q.toString()}`
}

function artistTracksUrl(slug: string, id: string, fromDate: string, page: number): string {
  const q = new URLSearchParams({
    page: String(page),
    per_page: String(PER_PAGE),
    publish_date: `${fromDate}:`,
  })
  return `https://www.beatport.com/artist/${slug}/${id}/tracks?${q.toString()}`
}

function tracksFromNext(nd: unknown, pageUrl: string, fromDate: string): { count: number; tracks: BeatportPickInput[] } {
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
    if (pick?.title && pick.release_date && pick.release_date >= fromDate) tracks.push(pick)
  }
  if (!tracks.length) {
    const parsed = findAllTracksFromNextData(
      nd as Parameters<typeof findAllTracksFromNextData>[0],
      pageUrl,
    ).filter((p) => p.release_date && p.release_date >= fromDate)
    return { count: Number(data?.count) || parsed.length, tracks: parsed }
  }
  return { count: Number(data?.count) || tracks.length, tracks }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label} no respondió en ${Math.round(ms / 1000)} s`)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => {
    if (timer) clearTimeout(timer)
  })
}

async function readGenrePageFetch(url: string, fromDate: string): Promise<{ count: number; tracks: BeatportPickInput[] } | null> {
  try {
    const html = await fetchBeatportPageHtml(url)
    if (!html.includes('__NEXT_DATA__')) return null
    const nd = extractNextData(html)
    if (!nd) return null
    return tracksFromNext(nd, url, fromDate)
  } catch {
    return null
  }
}

async function openBrowserReader(): Promise<{
  read: (url: string, fromDate: string) => Promise<{ count: number; tracks: BeatportPickInput[] }>
  readTracks: (url: string) => Promise<BeatportPickInput[]>
  close: () => Promise<void>
}> {
  const { chromium } = await import('playwright-core')
  const browser = process.env.VERCEL
    ? await (async () => {
        // Fluid Compute no pone AWS_LAMBDA_JS_RUNTIME. Sin eso, Chromium 131
        // no descomprime al2023.tar.br y el binario muere por libnss3.so.
        const runtime = process.env.AWS_LAMBDA_JS_RUNTIME || ''
        if (!runtime.includes('20.x') && !runtime.includes('22.x')) {
          process.env.AWS_LAMBDA_JS_RUNTIME = 'nodejs22.x'
        }
        const { existsSync, rmSync } = await import('node:fs')
        if (existsSync('/tmp/chromium') && !existsSync('/tmp/al2023/lib/libnss3.so')) {
          rmSync('/tmp/chromium', { force: true })
        }
        const mod = await import('@sparticuz/chromium')
        const bin = mod.default ?? mod
        bin.setGraphicsMode = false
        // Sparticuz mete `--single-process` (vale para Puppeteer) y
        // `--headless='shell'` con comillas. Playwright con eso arranca el
        // proceso y lo cierra antes del primer contexto.
        const args = (bin.args as string[]).filter(
          (arg) => arg !== '--single-process' && !arg.startsWith('--headless'),
        )
        return chromium.launch({
          args: [...args, '--headless=new', '--disable-blink-features=AutomationControlled'],
          executablePath: await bin.executablePath(),
          headless: false,
        })
      })()
    : await chromium.launch({
        channel: 'chrome',
        headless: true,
        args: ['--disable-blink-features=AutomationControlled', '--disable-dev-shm-usage', '--no-sandbox'],
      })
  async function readNextData(url: string, gotoMs: number, waitMs: number): Promise<unknown> {
    const ctx = await browser.newContext({
      userAgent:
        'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      locale: 'en-US',
      viewport: { width: 1366, height: 800 },
    })
    const page = await ctx.newPage()
    try {
      await page.goto(url, { waitUntil: 'domcontentloaded', timeout: gotoMs })
      const deadline = Date.now() + waitMs
      while (Date.now() < deadline) {
        const has = await page.evaluate(() => !!document.querySelector('script#__NEXT_DATA__')).catch(() => false)
        if (has) break
        await page.waitForTimeout(1200)
      }
      if (url.includes('/search')) {
        const searchDeadline = Date.now() + 12000
        while (Date.now() < searchDeadline) {
          const ready = await page
            .evaluate(() => {
              const el = document.querySelector('script#__NEXT_DATA__')
              return !!el?.textContent?.includes('"track_id"')
            })
            .catch(() => false)
          if (ready) break
          await page.waitForTimeout(400)
        }
      }
      const nd = await page.evaluate(() => {
        const el = document.querySelector('script#__NEXT_DATA__')
        if (!el?.textContent) return null
        return JSON.parse(el.textContent) as unknown
      })
      if (!nd) throw new Error('Beatport no devolvió la ficha (challenge o página vacía)')
      return nd
    } finally {
      await page.close().catch(() => undefined)
      await ctx.close().catch(() => undefined)
    }
  }
  return {
    read: async (url, fromDate) => {
      const nd = await readNextData(url, 90000, 35000)
      return tracksFromNext(nd, url, fromDate)
    },
    readTracks: async (url: string) => {
      let nd: unknown
      try {
        nd = await readNextData(url, 45000, 35000)
      } catch {
        nd = await readNextData(url, 45000, 20000)
      }
      return findAllTracksFromNextData(
        nd as Parameters<typeof findAllTracksFromNextData>[0],
        url,
      )
    },
    close: () => browser.close(),
  }
}

/**
 * Lee pistas de una URL de Beatport. Primero el HTML (rápido). Si Cloudflare
 * responde 403, abre Chrome una sola vez y reutiliza el navegador.
 * El chat y el import de New Releases lo necesitan: el fetch pelado no pasa.
 */
export function createBeatportPageLoader(): {
  load: (url: string) => Promise<BeatportPickInput[]>
  close: () => Promise<void>
} {
  let session: Awaited<ReturnType<typeof openBrowserReader>> | null = null
  return {
    async load(url: string) {
      const target = canonicalBeatportCatalogUrl(url)
      try {
        const html = await fetchBeatportPageHtml(target)
        const tracks = resolveTracksFromBeatportHtml(html, target)
        if (tracks.length) return tracks
      } catch {
        /* 403 u otro bloqueo: sigue el navegador */
      }
      if (!session) session = await openBrowserReader()
      return session.readTracks(target)
    },
    async close() {
      if (session) await session.close()
      session = null
    },
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

type KnownTracks = {
  /** Ids de Beatport ya en catálogo o en la cola. */
  ids: Set<string>
  /**
   * Misma canción con otro id: título + versión + artistas (`trackDisplayIdentityKey`).
   * Thierry D volvió a subir en octubre 14 cortes que ya estaban desde abril–agosto;
   * el id era nuevo y la cola los dio por nuevos (8 oct 2026).
   */
  identities: Set<string>
}

async function loadKnownTracks(sb: ReturnType<typeof createServiceSupabase>): Promise<KnownTracks> {
  type Credit = { title: string | null; mix_name: string | null; artists: unknown }
  const [featured, queued] = await Promise.all([
    fetchAllRows<Credit & { link_url: string | null }>((from, to) =>
      sb
        .from('chart_featured_tracks')
        .select('link_url, title, mix_name, artists')
        .order('id', { ascending: true })
        .range(from, to),
    ),
    fetchAllRows<Credit & { beatport_track_id: string }>((from, to) =>
      sb
        .from('chart_import_queue')
        .select('beatport_track_id, title, mix_name, artists')
        .order('created_at', { ascending: true })
        .range(from, to),
    ),
  ])
  if (featured.error) throw new Error(featured.error.message)
  if (queued.error) throw new Error(queued.error.message)
  const ids = new Set<string>()
  const identities = new Set<string>()
  const remember = (row: Credit) => {
    const key = trackDisplayIdentityKey(row.title, row.mix_name, row.artists)
    if (key) identities.add(key)
  }
  for (const row of featured.data) {
    const id = beatportIdFromLink(row.link_url || '')
    if (id) ids.add(id)
    remember(row)
  }
  for (const row of queued.data) {
    if (row.beatport_track_id) ids.add(row.beatport_track_id)
    remember(row)
  }
  return { ids, identities }
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

/** Fichas de Beatport de los 140 primeros. Un id, una página. Sin DJ Tokyo (id mezclado). */
async function followedBeatportArtists(
  sb: ReturnType<typeof createServiceSupabase>,
  topKeys: Set<string>,
): Promise<{ slug: string; id: string }[]> {
  const rows = await fetchAllPagesParallel<{
    slug: string
    name: string | null
    name_display: string | null
    beatport_id: number | null
  }>(
    () => sb.from('artists').select('id', { count: 'exact', head: true }).not('beatport_id', 'is', null),
    (from, to) =>
      sb
        .from('artists')
        .select('slug, name, name_display, beatport_id')
        .not('beatport_id', 'is', null)
        .order('slug', { ascending: true })
        .range(from, to),
  )
  const out = new Map<string, { slug: string; id: string }>()
  const want = (name: string | null | undefined) => {
    if (!name) return false
    const key = normalizeArtistKey(name)
    if (key && topKeys.has(key)) return true
    return splitArtistCreditsForRanking(name).some((part) => topKeys.has(normalizeArtistKey(part)))
  }
  for (const row of rows) {
    if (!row.beatport_id || !row.slug) continue
    const id = String(row.beatport_id)
    if (SKIP_BEATPORT_IDS.has(id)) continue
    if (!want(row.name) && !want(row.name_display) && !want(row.slug.replace(/-/g, ' '))) continue
    out.set(id, { slug: row.slug, id })
  }
  if (topKeys.has('vazteria x')) out.set('227121', { slug: 'vazteria-x', id: '227121' })
  return [...out.values()]
}

/** Página 1 de temas de los 140 primeros, más los fichados aparte (Dubaxface, AceNoise). El favorito pide la 2 y la 3 si hace falta. */
export async function top100ArtistTrackPageUrls(): Promise<string[]> {
  const sb = createServiceSupabase()
  const keys = await loadFollowKeys(sb)
  const artists = await followedBeatportArtists(sb, keys)
  return artists.map((artist) => artistTracksUrl(artist.slug, artist.id, BEATPORT_IMPORT_FROM, 1))
}

/** Una ficha /artist/…/tracks de los 140 primeros publica todos los temas nuevos, como la vía 1 del pase. */
async function publishesWholeArtistPage(
  sb: ReturnType<typeof createServiceSupabase>,
  url: string,
  keys: Set<string>,
): Promise<boolean> {
  let id = ''
  try {
    const match = new URL(url).pathname.match(/\/artist\/[^/]+\/(\d+)\/tracks\/?$/i)
    if (!match?.[1]) return false
    id = match[1]
  } catch {
    return false
  }
  if (SKIP_BEATPORT_IDS.has(id)) return false
  if (id === '227121') return keys.has('vazteria x')
  const { data } = await sb
    .from('artists')
    .select('slug, name, name_display')
    .eq('beatport_id', Number(id))
    .limit(1)
  const row = data?.[0]
  if (!row) return false
  const want = (name: string | null | undefined) => {
    if (!name) return false
    const key = normalizeArtistKey(name)
    if (key && keys.has(key)) return true
    return splitArtistCreditsForRanking(name).some((part) => keys.has(normalizeArtistKey(part)))
  }
  return want(row.name) || want(row.name_display) || want(row.slug?.replace(/-/g, ' '))
}

const STOPPED_BY_EDITOR = 'Parado por el editor.'

function pickLabel(pick: BeatportPickInput): string {
  const who = (pick.artists || []).map((a) => a?.name).filter(Boolean).join(', ')
  const mix = pick.mix_name ? ` (${pick.mix_name})` : ''
  return `${who || '—'} — ${pick.title}${mix}`
}

/** «Parar» de la ventana cierra la fila del pase; el pase lo ve entre página y página. */
async function importRunStopped(sb: ReturnType<typeof createServiceSupabase>, runId: string): Promise<boolean> {
  const { data } = await sb.from('chart_import_runs').select('finished_at').eq('id', runId).maybeSingle()
  return Boolean(data?.finished_at)
}

/** Para cualquier pase abierto (el de este botón o el de GitHub). Lo ya guardado se queda. */
export async function stopOpenImportRuns(): Promise<number> {
  const sb = createServiceSupabase()
  const { data, error } = await sb
    .from('chart_import_runs')
    .update({ finished_at: new Date().toISOString(), ok: false, error: STOPPED_BY_EDITOR })
    .is('finished_at', null)
    .select('id')
  if (error) throw new Error(error.message)
  return data?.length ?? 0
}

export async function runBeatportGenreImport(opts: {
  trigger: 'cron' | 'manual'
  userId?: string | null
  /** Fichas de los 140 primeros desde esta fecha, cualquier género. El cron usa el 8 oct. */
  artistSince?: string
  /**
   * Tiempo máximo leyendo Beatport. En Vercel la función muere a los 300 s y,
   * si la matan, el pase queda abierto y sin nada escrito (9 oct 2026). Con
   * presupuesto se para antes, guarda lo leído y deja constancia de que fue parcial.
   * El pase completo corre en GitHub Actions, sin este límite.
   */
  budgetMs?: number
  /**
   * Leer las fichas de los 140 primeros. Por defecto solo los sábados: cada ficha
   * es una página más para Cloudflare y el 14 oct 2026 nos cerró la puerta.
   * El listado de Breaks se lee todos los días.
   */
  artists?: boolean
  /** Cada paso del pase, para la ventana de «Traer ahora». */
  log?: (line: string) => void
}): Promise<GenreImportResult> {
  const say = (line: string) => {
    console.log(line)
    opts.log?.(line)
  }
  const startedAt = Date.now()
  const readArtists = opts.artists ?? (Boolean(opts.artistSince) || madridWeekday() === TOP100_ARTISTS_WEEKDAY)
  const outOfTime = () => opts.budgetMs != null && Date.now() - startedAt > opts.budgetMs
  const sb = createServiceSupabase()
  const empty = { seen: 0, queued: 0, auto_approved: 0, skipped_known: 0 }
  const genreFrom = opts.artistSince || BEATPORT_IMPORT_FROM
  const doGenre = Boolean(opts.artistSince) || madridToday() >= BEATPORT_IMPORT_FROM
  const artistFrom = opts.artistSince || (doGenre ? BEATPORT_IMPORT_FROM : '')

  if (!doGenre && !artistFrom) {
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
    say('Ya hay un pase en marcha (GitHub o este botón). Páralo o espera a que acabe.')
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
  let partial: string | null = null
  const stopped = async () => {
    if (!(await importRunStopped(sb, run.id))) return false
    partial = STOPPED_BY_EDITOR
    say('Parado por el editor. Lo leído hasta aquí queda guardado.')
    return true
  }
  try {
    say(readArtists ? `Pase con listado de Breaks y fichas de los ${FOLLOW_BOARD_LIMIT} primeros.` : `Pase con el listado de Breaks (las fichas de los ${FOLLOW_BOARD_LIMIT} primeros, los sábados).`)
    if (BEATPORT_PAGE_PAUSE_MS > 0) {
      say(`Pausa de ${BEATPORT_PAGE_PAUSE_MS / 1000} s entre páginas de Beatport.`)
    }
    const known = await loadKnownTracks(sb)
    const fresh: BeatportPickInput[] = []
    const fromArtist = new Set<string>()
    const take = (pick: BeatportPickInput, auto: boolean) => {
      const id = beatportIdFromLink(pick.link_url)
      if (!id) return
      const identity = trackDisplayIdentityKey(pick.title, pick.mix_name, pick.artists)
      if (known.ids.has(id) || (identity && known.identities.has(identity))) {
        result.skipped_known += 1
        known.ids.add(id)
        return
      }
      known.ids.add(id)
      if (identity) known.identities.add(identity)
      fresh.push(pick)
      if (auto) fromArtist.add(id)
    }
    const rankKeys = await loadFollowKeys(sb)
    const cache = new Map<string, EditionState>()
    const noteProgress = async () => {
      await sb
        .from('chart_import_runs')
        .update({
          seen: result.seen,
          queued: result.queued,
          auto_approved: result.auto_approved,
          skipped_known: result.skipped_known,
        })
        .eq('id', run.id)
    }
    const persistFresh = async (label: string) => {
      if (!fresh.length) return
      const batch = fresh.splice(0)
      for (const pick of batch) {
        const id = beatportIdFromLink(pick.link_url)
        if (fromArtist.has(id) || matchesTop100(pick, rankKeys)) {
          const pub = await publishFeaturedPick(sb, cache, pick)
          await rememberQueue(sb, pick, 'approved', 'auto_top100', opts.userId ?? null)
          if (pub === 'inserted') {
            result.auto_approved += 1
            published += 1
            say(`  Publicado: ${pickLabel(pick)}`)
          }
        } else {
          await rememberQueue(sb, pick, 'pending', null, null)
          result.queued += 1
          say(`  Por aprobar: ${pickLabel(pick)}`)
        }
      }
      say(`${label}: en cola ${result.queued}, publicados ${result.auto_approved}, ya conocidos ${result.skipped_known}`)
      await noteProgress()
    }
    let browser: Awaited<ReturnType<typeof openBrowserReader>> | null = null
    const dropBrowser = async () => {
      const dying = browser
      browser = null
      if (!dying) return
      await Promise.race([
        dying.close().catch(() => undefined),
        new Promise((resolve) => setTimeout(resolve, 5000)),
      ])
    }
    const readLimited = async (url: string, fromDate: string) => {
      if (!browser) browser = await withTimeout(openBrowserReader(), 30_000, 'Chrome')
      try {
        return await withTimeout(browser.read(url, fromDate), 40_000, 'Beatport')
      } catch (err) {
        await dropBrowser()
        throw err
      }
    }
    let beatportReads = 0
    const paceBeatport = async () => {
      beatportReads += 1
      if (beatportReads === 1) return
      await pauseBetweenBeatportPages()
    }
    try {
      // El listado de Breaks es lo que llena «por aprobar». Se lee y se guarda
      // antes del Top 100: el 14 oct 2026 el pase se quedó en las fichas, GitHub
      // lo cortó a los 40 min y la cola salió vacía porque el guardado era al final.
      if (doGenre) {
        say('Listado de Breaks')
        let total = Infinity
        for (let page = 1; page <= MAX_PAGES && (page - 1) * PER_PAGE < total; page++) {
          if (outOfTime()) {
            partial = partial || `Tiempo agotado en la página ${page} del listado de Breaks. El pase de GitHub lo completa.`
            break
          }
          if (await stopped()) break
          const url = genreTracksUrl(page, genreFrom)
          say(`Breaks página ${page}: leyendo…`)
          await paceBeatport()
          let payload = await withTimeout(readGenrePageFetch(url, genreFrom), 12_000, 'Fetch de Breaks').catch(() => null)
          if (!payload) {
            say(`Breaks página ${page}: Beatport no contesta a la lectura directa; pruebo con Chrome (hasta 40 s)…`)
            await paceBeatport()
            try {
              payload = await readLimited(url, genreFrom)
            } catch (err) {
              say(`Breaks página ${page}: ${err instanceof Error ? err.message : err}`)
              await paceBeatport()
              try {
                payload = await readLimited(url, genreFrom)
              } catch (err2) {
                say(`Breaks página ${page} (2º intento): ${err2 instanceof Error ? err2.message : err2}`)
                partial = partial || 'El listado de Breaks no respondió.'
                break
              }
            }
          }
          say(`Breaks página ${page}: ${payload.tracks.length} temas`)
          total = payload.count
          result.seen += payload.tracks.length
          const before = fresh.length
          for (const pick of payload.tracks) take(pick, false)
          if (!payload.tracks.length || payload.tracks.length < PER_PAGE) break
          if (fresh.length === before) break
        }
        await persistFresh('Breaks')
      }
      if (artistFrom && !readArtists) say(`Fichas de los ${FOLLOW_BOARD_LIMIT} primeros: hoy no toca (solo los sábados).`)
      if (artistFrom && readArtists && !outOfTime() && partial !== STOPPED_BY_EDITOR) {
        const followed = await followedBeatportArtists(sb, rankKeys)
        say(`Los ${FOLLOW_BOARD_LIMIT} primeros con ficha Beatport: ${followed.length}`)
        let artistsRead = 0
        for (const artist of followed) {
          if (outOfTime()) {
            partial = `Tiempo agotado: leídas ${artistsRead} de ${followed.length} fichas. El pase de GitHub lo completa.`
            break
          }
          if (await stopped()) break
          artistsRead += 1
          say(`Ficha ${artistsRead}/${followed.length} ${artist.slug}`)
          let total = Infinity
          for (let page = 1; page <= 3 && (page - 1) * PER_PAGE < total; page++) {
            const url = artistTracksUrl(artist.slug, artist.id, artistFrom, page)
            let payload: { count: number; tracks: BeatportPickInput[] }
            await paceBeatport()
            try {
              payload = await readLimited(url, artistFrom)
            } catch (err) {
              say(`  salto ${artist.slug}: ${err instanceof Error ? err.message : err}`)
              break
            }
            total = payload.count
            result.seen += payload.tracks.length
            const before = fresh.length
            for (const pick of payload.tracks) take(pick, true)
            if (!payload.tracks.length || payload.tracks.length < PER_PAGE) break
            if (fresh.length === before) break
          }
          if (fresh.length) await persistFresh(artist.slug)
        }
      }
    } finally {
      await dropBrowser()
    }
    // Parcial = lo leído se guarda, pero el pase no cuenta como completo.
    result.ok = !partial
    if (partial) result.error = partial
  } catch (e) {
    result.ok = false
    result.error = shortImportError(e instanceof Error ? e.message : String(e))
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

  if (published > 0) await revalidateAfterPublish()
  return result
}

// Un tema publicado se ve en /charts (tag public-charts) y en «En Optimal
// Breaks» de la ficha del artista y del sello (tag public-catalog). Las dos.
async function revalidateAfterPublish() {
  try {
    revalidatePublicCharts()
    revalidatePublicCatalog()
  } catch {
    const secret = (process.env.REVALIDATE_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || '').trim()
    if (secret) {
      await fetch('https://www.optimalbreaks.com/api/revalidate', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ secret, catalog: true }),
      }).catch(() => undefined)
    }
  }
}

/**
 * Listado de Breaks que abre el editor en su Chrome, 150 por página. Empieza
 * dos días antes del último pase que sí leyó temas (margen para lo que Beatport
 * sube con fecha atrasada), nunca antes del 8 oct 2026: si pasan dos semanas
 * sin importar, no se pierde ningún día.
 */
export async function breaksListingUrlForEditor(): Promise<string> {
  const sb = createServiceSupabase()
  const { data } = await sb
    .from('chart_import_runs')
    .select('started_at')
    .eq('ok', true)
    .gt('seen', 0)
    .order('started_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  let from = BEATPORT_IMPORT_FROM
  if (data?.started_at) {
    const day = new Date(Date.parse(data.started_at))
    day.setUTCDate(day.getUTCDate() - 2)
    const iso = day.toISOString().slice(0, 10)
    if (iso > from) from = iso
  }
  return genreTracksUrl(1, from)
}

/**
 * Página de Beatport que el editor manda desde su propio Chrome con el botón
 * de favoritos (14 oct 2026: Cloudflare cerró la puerta al pase automático).
 * La lee él, que pasa la verificación. El listado de Breaks se reparte como el pase:
 * Uno de los 140 primeros en los créditos → publicado; el resto → «Por aprobar».
 * Una ficha de temas de uno de esos artistas publica todos los temas nuevos.
 */
export async function ingestBeatportPage(opts: {
  url: string
  nextData: unknown
  userId: string | null
  log?: (line: string) => void
}): Promise<GenreImportResult> {
  const say = (line: string) => opts.log?.(line)
  const empty = { seen: 0, queued: 0, auto_approved: 0, skipped_known: 0 }
  let host = ''
  try {
    host = new URL(opts.url).hostname
  } catch {
    /* url mala */
  }
  if (!/(^|\.)beatport\.com$/i.test(host)) {
    return { ok: false, error: 'Esa página no es de Beatport.', ...empty }
  }
  const { tracks, count } = tracksFromNext(opts.nextData, opts.url, BEATPORT_IMPORT_FROM)
  if (!tracks.length) {
    return {
      ok: true,
      empty: true,
      error: 'En esa página no hay temas publicados desde el 8 oct 2026.',
      listing_total: count,
      ...empty,
    }
  }

  const sb = createServiceSupabase()
  const { data: run, error: runErr } = await sb
    .from('chart_import_runs')
    .insert({ trigger: 'manual', ok: false })
    .select('id')
    .single()
  if (runErr || !run?.id) {
    return { ok: false, error: runErr?.message || 'No se pudo abrir el pase', ...empty }
  }

  const result: GenreImportResult = { ok: false, ...empty, seen: tracks.length, listing_total: count }
  let published = 0
  let wasStopped = false
  try {
    say(`Página de Beatport recibida: ${tracks.length} temas desde el 8 oct.`)
    const known = await loadKnownTracks(sb)
    const rankKeys = await loadFollowKeys(sb)
    const publishAll = await publishesWholeArtistPage(sb, opts.url, rankKeys)
    const cache = new Map<string, EditionState>()
    for (const [i, pick] of tracks.entries()) {
      if (i > 0 && i % 25 === 0 && (await importRunStopped(sb, run.id))) {
        wasStopped = true
        say('Parado por el editor. Lo leído hasta aquí queda guardado.')
        break
      }
      const id = beatportIdFromLink(pick.link_url)
      if (!id) continue
      const identity = trackDisplayIdentityKey(pick.title, pick.mix_name, pick.artists)
      if (known.ids.has(id) || (identity && known.identities.has(identity))) {
        result.skipped_known += 1
        continue
      }
      known.ids.add(id)
      if (identity) known.identities.add(identity)
      if (publishAll || matchesTop100(pick, rankKeys)) {
        const pub = await publishFeaturedPick(sb, cache, pick)
        await rememberQueue(sb, pick, 'approved', 'auto_top100', opts.userId)
        if (pub === 'inserted') {
          result.auto_approved += 1
          published += 1
          say(`  Publicado: ${pickLabel(pick)}`)
        }
      } else {
        await rememberQueue(sb, pick, 'pending', null, null)
        result.queued += 1
        say(`  Por aprobar: ${pickLabel(pick)}`)
      }
    }
    if (result.skipped_known) say(`Ya estaban en la web o en la cola: ${result.skipped_known}.`)
    result.ok = !wasStopped
    if (wasStopped) result.error = STOPPED_BY_EDITOR
  } catch (e) {
    result.error = shortImportError(e instanceof Error ? e.message : String(e))
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

  if (published > 0) await revalidateAfterPublish()
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
  // Sin el tag del catálogo, la ficha del artista tardaba hasta 5 min en
  // enseñar el tema que /charts ya mostraba (Dub Elements, 9 oct 2026).
  revalidatePublicCharts()
  revalidatePublicCatalog()
  return { ok: true }
}
