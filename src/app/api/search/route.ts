// ============================================
// OPTIMAL BREAKS — API: Global search (⌘K palette)
// Mezcla artists + labels + events + mixes + scenes + blog + organizations
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { createSimpleSupabase } from '@/lib/supabase'
import { displayArtistImageUrl } from '@/lib/artist-public-portrait'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

type Lang = 'es' | 'en'
type ResultType =
  | 'artist'
  | 'label'
  | 'event'
  | 'mix'
  | 'scene'
  | 'post'
  | 'organization'
  | 'track'

export interface SearchResult {
  type: ResultType
  id: string
  slug: string
  title: string
  subtitle: string
  image_url: string | null
  href: string
  /** Sólo para eventos: fecha inicio YYYY-MM-DD. UI la usa como chip de fecha. */
  date_start?: string | null
  /** Sólo para eventos: true si date_start >= hoy. UI pinta amarillo/rojo en base a esto. */
  is_upcoming?: boolean
}

/** Limita por IP (instancia) para parar curl/bots sin autenticación. */
const ipHits = new Map<string, number[]>()
const WINDOW_MS = 60_000
const MAX_PER_WINDOW = 120

function getClientIp(req: NextRequest): string {
  const xf = req.headers.get('x-forwarded-for')
  if (xf) return xf.split(',')[0]?.trim() || 'unknown'
  return req.headers.get('x-real-ip') || 'unknown'
}

function allowRate(ip: string): boolean {
  const now = Date.now()
  const arr = (ipHits.get(ip) || []).filter((t) => now - t < WINDOW_MS)
  if (arr.length >= MAX_PER_WINDOW) {
    ipHits.set(ip, arr)
    return false
  }
  arr.push(now)
  ipHits.set(ip, arr)
  return true
}

/** Escape para `ilike`: % y _ son comodines, el `,` rompe `.or()`. */
function escIlike(raw: string): string {
  return raw.replace(/[%_,]/g, ' ').trim()
}

function isValidLang(v: string | null): v is Lang {
  return v === 'es' || v === 'en'
}

function byType(
  out: SearchResult[],
  cap: number,
): SearchResult[] {
  const seen = new Set<string>()
  const result: SearchResult[] = []
  for (const r of out) {
    const k = `${r.type}:${r.slug}`
    if (seen.has(k)) continue
    seen.add(k)
    result.push(r)
    if (result.length >= cap) break
  }
  return result
}

export async function GET(request: NextRequest) {
  const ip = getClientIp(request)
  if (!allowRate(ip)) {
    return NextResponse.json({ error: 'rate_limited' }, { status: 429 })
  }

  const url = new URL(request.url)
  const qRaw = (url.searchParams.get('q') || '').trim()
  const langParam = url.searchParams.get('lang')
  const lang: Lang = isValidLang(langParam) ? langParam : 'es'

  if (!qRaw || qRaw.length < 2) {
    return NextResponse.json({ results: [] as SearchResult[] })
  }
  const q = escIlike(qRaw).slice(0, 80)
  if (!q) {
    return NextResponse.json({ results: [] as SearchResult[] })
  }
  const ilike = `%${q}%`
  const supabase = createSimpleSupabase()

  const base = (path: string) => `/${lang}${path}`

  // Hoy en formato YYYY-MM-DD (UTC). El buscador siempre carga futuros
  // y pasados, pero los pasados sólo se muestran si la búsqueda es
  // claramente "de eventos" (no hay ningún otro tipo de resultado) —
  // la regla se aplica al final, antes de responder.
  const todayIso = new Date().toISOString().slice(0, 10)

  const [
    artistsRes,
    labelsRes,
    eventsUpcomingRes,
    eventsPastRes,
    mixesRes,
    scenesRes,
    postsRes,
    orgsRes,
    chartTracksRes,
    chartFeaturedRes,
    chartVinylRes,
  ] = await Promise.all([
    supabase
      .from('artists')
      .select('id, slug, name, name_display, image_url, country, styles, category')
      .or(`name.ilike.${ilike},name_display.ilike.${ilike},slug.ilike.${ilike}`)
      .limit(12),
    supabase
      .from('labels')
      .select('id, slug, name, image_url, country, founded_year')
      .or(`name.ilike.${ilike},slug.ilike.${ilike}`)
      .limit(8),
    // EVENTOS FUTUROS: siempre se muestran. `lineup_text` es una columna
    // STORED GENERATED (migración 052) que aplana `lineup text[]` +
    // `stages[].lineup[]`, por eso buscar "plump djs" encuentra un evento
    // donde ese DJ figura en el cartel.
    supabase
      .from('events')
      .select('id, slug, name, image_url, city, country, date_start, event_type, lineup, stages')
      .or(
        `name.ilike.${ilike},slug.ilike.${ilike},city.ilike.${ilike},lineup_text.ilike.${ilike}`,
      )
      .gte('date_start', todayIso)
      .order('date_start', { ascending: true })
      .limit(12),
    // EVENTOS PASADOS: se cargan pero solo se devuelven cuando la
    // búsqueda es claramente "de eventos" (p.ej. "winter festival"):
    // si hay cualquier otro tipo de resultado (artista, track, sello…)
    // los pasados se descartan para no pervertir la búsqueda de música.
    supabase
      .from('events')
      .select('id, slug, name, image_url, city, country, date_start, event_type, lineup, stages')
      .or(
        `name.ilike.${ilike},slug.ilike.${ilike},city.ilike.${ilike},lineup_text.ilike.${ilike}`,
      )
      .lt('date_start', todayIso)
      .order('date_start', { ascending: false })
      .limit(10),
    supabase
      .from('mixes')
      .select('id, slug, title, artist_name, artist_id, image_url, year, platform, mix_type, video_url, embed_url')
      .or(`title.ilike.${ilike},artist_name.ilike.${ilike},slug.ilike.${ilike}`)
      .limit(8),
    supabase
      .from('scenes')
      .select('id, slug, name_en, name_es, image_url, country, region, era')
      .or(
        `name_en.ilike.${ilike},name_es.ilike.${ilike},slug.ilike.${ilike},country.ilike.${ilike},region.ilike.${ilike}`,
      )
      .limit(6),
    supabase
      .from('blog_posts')
      .select('id, slug, title_en, title_es, image_url, category, published_at, is_published')
      .eq('is_published', true)
      .or(`title_en.ilike.${ilike},title_es.ilike.${ilike},slug.ilike.${ilike}`)
      .order('published_at', { ascending: false })
      .limit(6),
    supabase
      .from('organizations')
      .select('id, slug, name, image_url, country, base_city')
      .or(`name.ilike.${ilike},slug.ilike.${ilike}`)
      .limit(4),
    // 40 Breaks Vitales (Beatport weekly chart). `artist_names_text` es la
    // denormalización STORED de `artists[].name` (migración 051) para que
    // `ilike` pille también el nombre del artista dentro del JSONB.
    // Orden: primero `chart_editions.week_date` DESC (edición más reciente
    // = la que /charts renderiza más arriba, garantizando que el deep-link
    // `#chart-row-<id>` encuentre el DOM), después `position` ASC. Así el
    // dedupe se queda con la fila VISIBLE más reciente del tema, no con
    // una edición antigua que no esté renderizada.
    supabase
      .from('chart_tracks')
      .select('id, title, mix_name, label, artwork_url, release_year, artists, position, chart_editions!inner(week_date)')
      .or(`title.ilike.${ilike},mix_name.ilike.${ilike},label.ilike.${ilike},artist_names_text.ilike.${ilike}`)
      .order('week_date', { referencedTable: 'chart_editions', ascending: false })
      .order('position', { ascending: true })
      .limit(40),
    // New Releases (semana "fenomenal"): igual, priorizar edición más reciente.
    supabase
      .from('chart_featured_tracks')
      .select('id, title, mix_name, label, artwork_url, release_year, artists, chart_editions!inner(week_date)')
      .or(`title.ilike.${ilike},mix_name.ilike.${ilike},label.ilike.${ilike},artist_names_text.ilike.${ilike}`)
      .order('week_date', { referencedTable: 'chart_editions', ascending: false })
      .limit(30),
    // Retro Vinyl Picks (Discogs)
    supabase
      .from('chart_vinyl_tracks')
      .select('id, title, mix_name, label, artwork_url, year, artists')
      .or(`title.ilike.${ilike},mix_name.ilike.${ilike},label.ilike.${ilike},artist_names_text.ilike.${ilike}`)
      .limit(20),
  ])

  const results: SearchResult[] = []

  for (const a of artistsRes.data || []) {
    const styles = Array.isArray(a.styles) ? a.styles.filter(Boolean).slice(0, 2) : []
    const subtitleParts = [a.country, styles.join(' · ')].filter(Boolean)
    results.push({
      type: 'artist',
      id: a.id,
      slug: a.slug,
      title: (a.name_display?.trim() || a.name || a.slug) as string,
      subtitle: subtitleParts.join(' — '),
      image_url: displayArtistImageUrl(a.slug, a.image_url ?? null) ?? null,
      href: base(`/artists/${a.slug}`),
    })
  }

  for (const l of labelsRes.data || []) {
    const parts = [l.country, l.founded_year ? `#${l.founded_year}` : null].filter(Boolean)
    results.push({
      type: 'label',
      id: l.id,
      slug: l.slug,
      title: (l.name || l.slug) as string,
      subtitle: parts.join(' — '),
      image_url: (l.image_url as string | null) ?? null,
      href: base(`/labels/${l.slug}`),
    })
  }

  // qLower: para hacer matching en el line-up del lado JS y poder mostrar
  // los DJs que coinciden en el subtítulo del resultado (mejor contexto).
  const qLower = qRaw.toLowerCase()

  // collectLineupNames aplana `lineup text[]` + `stages[].lineup[]` igual
  // que la función SQL events_lineup_to_text, pero en memoria para poder
  // destacar coincidencias.
  const collectLineupNames = (
    lineup: unknown,
    stages: unknown,
  ): string[] => {
    const out = new Set<string>()
    if (Array.isArray(lineup)) {
      for (const n of lineup) if (typeof n === 'string' && n.trim()) out.add(n)
    }
    if (Array.isArray(stages)) {
      for (const st of stages) {
        const sl = (st as { lineup?: unknown })?.lineup
        if (Array.isArray(sl)) {
          for (const n of sl) if (typeof n === 'string' && n.trim()) out.add(n)
        }
      }
    }
    return Array.from(out)
  }

  type EventRow = {
    id: string
    slug: string
    name: string | null
    image_url: string | null
    city: string | null
    country: string | null
    date_start: string | null
    event_type: string | null
    lineup?: unknown
    stages?: unknown
  }

  const buildEventResult = (e: EventRow, upcoming: boolean): SearchResult => {
    const place = [e.city, e.country].filter(Boolean).join(', ')
    // Si la búsqueda no hizo match en name/slug/city, muy probablemente
    // viene del line-up: destacamos los nombres coincidentes en el subtítulo
    // para que el usuario entienda por qué aparece este evento.
    const nameHit =
      (e.name || '').toLowerCase().includes(qLower) ||
      (e.slug || '').toLowerCase().includes(qLower) ||
      (e.city || '').toLowerCase().includes(qLower)
    let lineupHitText = ''
    if (!nameHit && qLower) {
      const matches = collectLineupNames(e.lineup, e.stages).filter((n) =>
        n.toLowerCase().includes(qLower),
      )
      if (matches.length > 0) {
        const shown = matches.slice(0, 2).join(', ')
        const rest = matches.length > 2 ? ` +${matches.length - 2}` : ''
        lineupHitText = `Line-up: ${shown}${rest}`
      }
    }
    // La fecha ya se pinta como chip con color en la UI (amarillo
    // futuro / rojo pasado), así que la omitimos del subtítulo.
    const parts = [place, lineupHitText].filter(Boolean)
    return {
      type: 'event',
      id: e.id,
      slug: e.slug,
      title: (e.name || e.slug) as string,
      subtitle: parts.join(' — '),
      image_url: (e.image_url as string | null) ?? null,
      href: base(`/events/${e.slug}`),
      date_start: e.date_start ?? null,
      is_upcoming: upcoming,
    }
  }

  // Futuros se añaden siempre.
  for (const e of (eventsUpcomingRes.data || []) as EventRow[]) {
    results.push(buildEventResult(e, true))
  }

  // Pasados los guardamos aparte: sólo se añaden al final si la búsqueda
  // es claramente "de eventos" (no hay ningún otro tipo de resultado).
  const pastEventResults: SearchResult[] = []
  for (const e of (eventsPastRes.data || []) as EventRow[]) {
    pastEventResults.push(buildEventResult(e, false))
  }

  // Para mixes sin portada propia: usa la foto del artista vinculado
  // y, como último recurso, la thumbnail de YouTube (video_url/embed_url).
  const mixesRows = (mixesRes.data || []) as Array<{
    id: string
    slug: string
    title: string
    artist_name: string
    artist_id: string | null
    image_url: string | null
    year: number | null
    platform: string | null
    mix_type: string | null
    video_url: string | null
    embed_url: string | null
  }>

  // El buscador siempre usa la foto del artista para mixes (ver bucle
  // abajo), asi que precargamos TODOS los artist_id presentes (no sólo
  // los mixes sin image_url).
  const mixArtistIds = Array.from(
    new Set(mixesRows.filter((m) => m.artist_id).map((m) => m.artist_id as string)),
  )
  const artistImageById = new Map<string, { slug: string; image_url: string | null }>()
  if (mixArtistIds.length) {
    const { data: artistFallbacks } = await supabase
      .from('artists')
      .select('id, slug, image_url')
      .in('id', mixArtistIds)
    for (const a of artistFallbacks || []) {
      artistImageById.set(a.id, { slug: a.slug, image_url: a.image_url ?? null })
    }
  }

  // Mixes sin artist_id resoluble: los buscamos por nombre en la tabla artists.
  const missingNames = Array.from(
    new Set(
      mixesRows
        .filter(
          (m) =>
            (!m.artist_id || !artistImageById.has(m.artist_id)) &&
            (m.artist_name || '').trim().length > 0,
        )
        .map((m) => (m.artist_name || '').trim().toLowerCase()),
    ),
  )
  const artistImageByLowerName = new Map<string, { slug: string; image_url: string | null }>()
  if (missingNames.length) {
    const orFilter = missingNames
      .slice(0, 12)
      .map((n) => `name.ilike.${escIlike(n)},name_display.ilike.${escIlike(n)}`)
      .join(',')
    if (orFilter) {
      const { data: rows } = await supabase
        .from('artists')
        .select('slug, name, name_display, image_url')
        .or(orFilter)
        .limit(24)
      for (const r of rows || []) {
        const keys = [r.name, r.name_display].filter(Boolean).map((s) => (s as string).toLowerCase())
        for (const k of keys) {
          if (!artistImageByLowerName.has(k)) {
            artistImageByLowerName.set(k, { slug: r.slug, image_url: r.image_url ?? null })
          }
        }
      }
    }
  }

  // Fallback visual para mixes (y otros resultados sin imagen):
  // disco de vinilo con logo OB. Mejor que un placeholder neutro o la
  // thumbnail de YouTube (que viene cross-origin con peor resolucion).
  const FALLBACK_IMAGE = '/images/disco_optimal_breaks.webp'

  for (const m of mixesRows) {
    const parts = [m.artist_name, m.year ? String(m.year) : null].filter(Boolean)
    // En el buscador, las portadas propias de mixes (SoundCloud, Mixcloud,
    // YouTube) se ignoran a proposito: vienen de dominios cross-origin
    // que next/image no sirve y el resultado era rotura visual. Usamos
    // siempre la foto del artista vinculado y, si no hay, el disco OB.
    let image: string | null = null
    if (m.artist_id) {
      const a = artistImageById.get(m.artist_id)
      image = displayArtistImageUrl(a?.slug, a?.image_url ?? null) ?? null
    }
    if (!image) {
      const key = (m.artist_name || '').trim().toLowerCase()
      const a = key ? artistImageByLowerName.get(key) : null
      image = displayArtistImageUrl(a?.slug, a?.image_url ?? null) ?? null
    }
    if (!image) image = FALLBACK_IMAGE
    results.push({
      type: 'mix',
      id: m.id,
      slug: m.slug,
      title: (m.title || m.slug) as string,
      subtitle: parts.join(' — '),
      image_url: image,
      // `?play=1` activa autoplay en MixesExplorer (clear filters + scroll +
      // playMix/autoplay del iframe). El hash usa `mix-<id>` en vez del slug
      // porque el id es estable y no colisiona con otros anchors.
      href: base(`/mixes?play=1#mix-${m.id}`),
    })
  }

  for (const s of scenesRes.data || []) {
    const title = (lang === 'es' ? s.name_es : s.name_en) || s.name_en || s.name_es || s.slug
    const parts = [s.region, s.country, s.era].filter(Boolean)
    results.push({
      type: 'scene',
      id: s.id,
      slug: s.slug,
      title: title as string,
      subtitle: parts.join(' — '),
      image_url: (s.image_url as string | null) ?? null,
      href: base(`/scenes/${s.slug}`),
    })
  }

  for (const p of postsRes.data || []) {
    const title = (lang === 'es' ? p.title_es : p.title_en) || p.title_en || p.title_es || p.slug
    const parts = [p.category, p.published_at ? p.published_at.slice(0, 4) : null].filter(Boolean)
    results.push({
      type: 'post',
      id: p.id,
      slug: p.slug,
      title: title as string,
      subtitle: parts.join(' — '),
      image_url: (p.image_url as string | null) ?? null,
      href: base(`/blog/${p.slug}`),
    })
  }

  for (const o of orgsRes.data || []) {
    const parts = [o.base_city, o.country].filter(Boolean)
    results.push({
      type: 'organization',
      id: o.id,
      slug: o.slug,
      title: (o.name || o.slug) as string,
      subtitle: parts.join(' — '),
      image_url: (o.image_url as string | null) ?? null,
      href: base(`/organizations/${o.slug}`),
    })
  }

  // ----------------------------------------------------------------
  // Chart tracks: 40 Breaks, New Releases y Retro Vinyl (página /charts).
  // El href lleva a /charts#chart-row-<id> (o #chart-vinyl-row-<id>);
  // ChartView detecta el hash al montar, expande el acordeón que toque
  // (semana o año) y hace scroll + highlight sobre la fila.
  // ----------------------------------------------------------------
  /**
   * Devuelve el primer nombre de artista del array JSONB, normalizado sin
   * acentos ni espacios extra. Sirve para deduplicar canciones: un mismo
   * tema registrado a veces como "Guau" y otras como "Guau, Lutolsky"
   * comparte `Guau` como primer artista y no genera filas duplicadas.
   */
  function firstArtistName(raw: unknown): string {
    if (!Array.isArray(raw)) return ''
    for (const a of raw) {
      if (typeof a === 'string' && a.trim()) return a.trim()
      if (a && typeof a === 'object') {
        const n = (a as { name?: unknown }).name
        if (typeof n === 'string' && n.trim()) return n.trim()
      }
    }
    return ''
  }

  function artistsToText(raw: unknown): string {
    if (!Array.isArray(raw)) return ''
    const names = raw
      .map((a) => {
        if (typeof a === 'string') return a
        if (a && typeof a === 'object') {
          const n = (a as { name?: unknown }).name
          return typeof n === 'string' ? n : ''
        }
        return ''
      })
      .map((s) => s.trim())
      .filter(Boolean)
    return names.join(', ')
  }

  const trackTypeLabel = {
    chart: lang === 'es' ? '40 BREAKS' : '40 BREAKS',
    featured: lang === 'es' ? 'NEW RELEASES' : 'NEW RELEASES',
    vinyl: lang === 'es' ? 'RETRO VINYL' : 'RETRO VINYL',
  }

  type TrackRow = {
    id: string
    title: string | null
    mix_name: string | null
    label: string | null
    artwork_url: string | null
    release_year?: number | null
    year?: number | null
    artists: unknown
  }

  // Una misma canción puede aparecer varias veces: en distintas ediciones
  // semanales (40 Breaks vitales cambia pero los temas se repiten varias
  // semanas) y, a veces, en más de un chart (también en New Releases).
  // Deduplicamos por firma `titulo|mix|artistas` normalizada, dando
  // prioridad al chart principal para elegir qué entrada se queda:
  //   1º chart_tracks (40 Breaks vitales) — más relevante
  //   2º chart_featured_tracks (New Releases)
  //   3º chart_vinyl_tracks (Retro Vinyl)
  // Los `for` se ejecutan en ese orden, así que el primero que entra
  // marca la clave y los siguientes con la misma firma se descartan.
  const seenTrackKeys = new Set<string>()
  const normForKey = (s: string) =>
    s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/\s+/g, ' ').trim()

  function pushTrack(
    row: TrackRow,
    kind: 'chart' | 'featured' | 'vinyl',
  ) {
    const title = (row.title || '').trim() || '—'
    const mix = (row.mix_name || '').trim()
    const fullTitle = mix ? `${title} (${mix})` : title
    const artistsText = artistsToText(row.artists)
    // Dedupe por titulo+mix+PRIMER artista (no todos). Una misma
    // cancion puede aparecer en distintas ediciones con feats variables
    // ("Guau" vs "Guau, Lutolsky"). Usando solo el primer artista, que
    // suele ser el principal, ambas se consideran la misma.
    const key = `${normForKey(title)}|${normForKey(mix)}|${normForKey(firstArtistName(row.artists))}`
    if (seenTrackKeys.has(key)) return
    seenTrackKeys.add(key)
    const yr = kind === 'vinyl' ? row.year : row.release_year
    const parts = [
      trackTypeLabel[kind],
      artistsText,
      row.label,
      yr ? String(yr) : null,
    ].filter(Boolean)
    const anchor = kind === 'vinyl' ? `chart-vinyl-row-${row.id}` : `chart-row-${row.id}`
    results.push({
      type: 'track',
      id: row.id,
      slug: row.id,
      title: fullTitle,
      subtitle: parts.join(' — '),
      image_url: (row.artwork_url as string | null) ?? null,
      // `?play=1` dispara autoplay en ChartView: para chart/featured arranca
      // `playFromIndex(...)` y para vinyl inyecta `autoplay=1` en el iframe
      // de YouTube de esa fila.
      href: `${base('/charts')}?play=1#${anchor}`,
    })
  }

  for (const t of (chartTracksRes.data || []) as TrackRow[]) pushTrack(t, 'chart')
  for (const t of (chartFeaturedRes.data || []) as TrackRow[]) pushTrack(t, 'featured')
  for (const t of (chartVinylRes.data || []) as TrackRow[]) pushTrack(t, 'vinyl')

  // Regla: los eventos pasados sólo aparecen cuando la búsqueda es
  // claramente "de eventos" (p.ej. "winter festival" → todos los
  // matches son eventos). Si hay cualquier otro tipo (artista, track,
  // mix, sello, etc.) los pasados se descartan: el buscador favorece
  // la acción y no debe pervertirse llenando de archivo antiguo las
  // búsquedas de música.
  const hasNonEventResults = results.some((r) => r.type !== 'event')
  if (!hasNonEventResults && pastEventResults.length > 0) {
    for (const p of pastEventResults) results.push(p)
  }

  const deduped = byType(results, 80)
  return NextResponse.json(
    { results: deduped },
    {
      headers: {
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=30',
      },
    },
  )
}
