// ============================================
// Admin: importación de New Releases desde URLs Beatport (/release/ o /track/).
// Un /release/ mete todos sus temas. Un /track/ mete solo ese. Si Cloudflare
// tapa la ficha, la respuesta lista el fallo y el chat no lo da por guardado.
// ============================================

import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin, requireCatalogEditor } from '@/lib/admin-auth'
import { createServiceSupabase, fetchAllRows } from '@/lib/supabase-admin'
import { revalidatePublicCharts } from '@/lib/revalidate-public'
import {
  chartEditionWeekMondayFromPublish,
  canonicalBeatportCatalogUrl,
  dedupeKeyForFeaturedLink,
  isBeatportTrackOrReleaseUrl,
  parseBeatportImportLines,
} from '@/lib/beatport-next-data-tracks'
import { trackDisplayIdentityKey } from '@/lib/track-canonical-key'
import { createBeatportPageLoader } from '@/lib/beatport-genre-import'

export const maxDuration = 300

const MAX_URLS = 50
const FEAT_MAX_SORT = 200

type EditionState = {
  editionId: string
  keys: Set<string>
  nextSort: number
}

function sleep(ms: number) {
  return new Promise((r) => setTimeout(r, ms))
}

function isoWeekDate(s: string): string | null {
  return chartEditionWeekMondayFromPublish(s.trim())
}

async function ensureEditionId(
  sb: ReturnType<typeof createServiceSupabase>,
  weekDate: string,
  createIfMissing: boolean,
): Promise<string> {
  const { data: edition, error: edErr } = await sb
    .from('chart_editions')
    .select('id')
    .eq('week_date', weekDate)
    .maybeSingle()
  if (edErr) throw new Error(edErr.message)
  if (edition?.id) return edition.id as string

  if (!createIfMissing) {
    throw new Error(`No existe chart_editions para week_date=${weekDate}`)
  }

  const title = `40 Breaks Vitales — ${weekDate}`
  const { data: inserted, error: insErr } = await sb
    .from('chart_editions')
    .insert({
      week_date: weekDate,
      title,
      description_en: `The 40 breakbeat tracks defining the week of ${weekDate}.`,
      description_es: `Los 40 temas de breakbeat que definen la semana del ${weekDate}.`,
      sources: [],
      is_published: true,
      published_at: new Date().toISOString(),
    })
    .select('id')
    .single()

  if (insErr || !inserted?.id) throw new Error(insErr?.message || 'Insert chart_edition falló')
  return inserted.id as string
}

async function loadEditionState(
  sb: ReturnType<typeof createServiceSupabase>,
  weekDate: string,
  createEdition: boolean,
): Promise<EditionState> {
  const editionId = await ensureEditionId(sb, weekDate, createEdition)
  const { data: rows, error } = await fetchAllRows<{ link_url?: string; sort_order?: number }>((from, to) =>
    sb
      .from('chart_featured_tracks')
      .select('link_url, sort_order')
      .eq('chart_edition_id', editionId)
      .order('id', { ascending: true })
      .range(from, to),
  )
  if (error) throw new Error(error.message)
  const keys = new Set<string>()
  for (const r of rows || []) {
    const k = dedupeKeyForFeaturedLink(String((r as { link_url?: string }).link_url || ''))
    if (k) keys.add(k)
  }
  const maxSo =
    rows && rows.length
      ? Math.max(...rows.map((r) => Number((r as { sort_order?: number }).sort_order || 0)))
      : 0
  return { editionId, keys, nextSort: maxSo + 1 }
}

/** Si el mismo tema ya está archivado como SoundCloud, se actualiza esa fila. */
async function upgradeSoundCloudFiling(
  sb: ReturnType<typeof createServiceSupabase>,
  pick: {
    title: string
    mix_name: string
    artists: { name: string }[]
    label: string
    platform: string
    link_url: string
    link_label: string
    artwork_url: string
    sample_url: string
    bpm: number | null
    music_key: string
    release_year: number | null
    release_date: string | null
    note_en: string
    note_es: string
  },
  state: EditionState,
): Promise<boolean> {
  const want = trackDisplayIdentityKey(pick.title, pick.mix_name, pick.artists)
  if (!want) return false
  const { data: rows, error } = await sb
    .from('chart_featured_tracks')
    .select('id, title, mix_name, artists, chart_edition_id, sort_order')
    .eq('platform', 'soundcloud')
    .ilike('title', pick.title)
    .limit(20)
  if (error || !rows?.length) return false
  const row = rows.find((r) => trackDisplayIdentityKey(r.title, r.mix_name, r.artists) === want)
  if (!row?.id) return false
  const sameEdition = row.chart_edition_id === state.editionId
  if (!sameEdition && state.nextSort > FEAT_MAX_SORT) return false
  const sortOrder = sameEdition ? row.sort_order : state.nextSort
  const { error: upErr } = await sb
    .from('chart_featured_tracks')
    .update({
      chart_edition_id: state.editionId,
      sort_order: sortOrder,
      title: pick.title,
      mix_name: pick.mix_name || '',
      artists: pick.artists as unknown as never,
      label: pick.label || '',
      platform: pick.platform,
      link_url: pick.link_url,
      link_label: pick.link_label,
      artwork_url: pick.artwork_url || null,
      sample_url: pick.sample_url || null,
      bpm: pick.bpm,
      music_key: pick.music_key || '',
      release_year: pick.release_year,
      release_date: pick.release_date,
      note_en: pick.note_en,
      note_es: pick.note_es,
    })
    .eq('id', row.id)
  if (upErr) return false
  if (!sameEdition) state.nextSort++
  return true
}

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  const { data, error } = await sb
    .from('chart_editions')
    .select('id, week_date, title')
    .order('week_date', { ascending: false })
    .limit(80)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ editions: data || [] })
}

export async function POST(request: NextRequest) {
  const auth = await requireCatalogEditor(request)
  if (!auth.ok) return auth.response

  let sb: ReturnType<typeof createServiceSupabase>
  try {
    sb = createServiceSupabase()
  } catch {
    return NextResponse.json({ error: 'Servidor no configurado' }, { status: 503 })
  }

  let body: {
    urls_text?: string
    default_week_date?: string | null
    create_edition_if_missing?: boolean
    pause_ms?: number
  }
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'JSON inválido' }, { status: 400 })
  }

  const urlsText = typeof body.urls_text === 'string' ? body.urls_text : ''
  const defaultWeekRaw = body.default_week_date ?? null
  const fallback_week_date = defaultWeekRaw ? isoWeekDate(String(defaultWeekRaw)) : null
  const createEdition = !!body.create_edition_if_missing
  const pauseMs = Math.min(6000, Math.max(800, Number(body.pause_ms) || 2200))

  const items = parseBeatportImportLines(urlsText)
  if (!items.length) {
    return NextResponse.json({ error: 'No hay URLs Beatport válidas' }, { status: 400 })
  }

  const beatportUrls = items.filter((i) =>
    isBeatportTrackOrReleaseUrl(i.url.replace(/^http:\/\//i, 'https://')),
  )
  if (!beatportUrls.length) {
    return NextResponse.json(
      {
        error:
          'Solo se aceptan URLs de Beatport (rutas /release/… o /track/…, con o sin /es/ u otro idioma en la ruta).',
      },
      { status: 400 },
    )
  }

  if (beatportUrls.length > MAX_URLS) {
    return NextResponse.json({ error: `Máximo ${MAX_URLS} URLs por petición (evita timeouts).` }, { status: 400 })
  }

  const editionCache = new Map<string, EditionState>()
  const pages = createBeatportPageLoader()
  const getEditionState = async (weekDate: string) => {
    if (!isoWeekDate(weekDate)) {
      throw new Error(`week_date inválido: ${weekDate}`)
    }
    if (editionCache.has(weekDate)) return editionCache.get(weekDate) as EditionState
    const state = await loadEditionState(sb, weekDate, createEdition)
    editionCache.set(weekDate, state)
    return state
  }

  const added: {
    url: string
    title: string
    week_date: string
    week_source: 'linea' | 'beatport' | 'respaldo'
    link_url: string
  }[] = []
  const skipped_multi: { url: string; count: number; titles: string[] }[] = []
  const skipped_dupe: { url: string; title?: string }[] = []
  const failed: { url: string; reason: string }[] = []

  for (let i = 0; i < beatportUrls.length; i++) {
    const { week_date_override, url } = beatportUrls[i]
    try {
      const normalized = canonicalBeatportCatalogUrl(url)
      const tracks = await pages.load(normalized)
      const wantedId = normalized.match(/\/track\/[^/]+\/(\d+)/i)?.[1] || ''
      const picked = wantedId
        ? tracks.filter((t) => /\/(\d+)$/.test(t.link_url) && t.link_url.endsWith(`/${wantedId}`))
        : tracks
      if (!picked.length) {
        failed.push({
          url,
          reason: wantedId
            ? 'Ese tema no salió en la ficha de Beatport'
            : 'Sin pistas (__NEXT_DATA__ vacío o no parseable)',
        })
      } else {
        for (const pick of picked) {
          const key = dedupeKeyForFeaturedLink(pick.link_url)
          let targetWeek: string | null = week_date_override ? isoWeekDate(week_date_override) : null
          let weekSource: 'linea' | 'beatport' | 'respaldo' = 'linea'

          if (!targetWeek) {
            targetWeek = chartEditionWeekMondayFromPublish(pick.release_date)
            weekSource = 'beatport'
          }
          if (!targetWeek && fallback_week_date) {
            targetWeek = fallback_week_date
            weekSource = 'respaldo'
          }
          if (!targetWeek) {
            failed.push({
              url: pick.link_url,
              reason:
                'Beatport no devolvió fecha de publicación; rellena «Semana de respaldo» o usa «YYYY-MM-DD URL» en la línea.',
            })
            continue
          }
          const state = await getEditionState(targetWeek)
          if (state.keys.has(key)) {
            skipped_dupe.push({ url: pick.link_url, title: pick.title })
            continue
          }
          const upgraded = await upgradeSoundCloudFiling(sb, pick, state)
          if (upgraded) {
            state.keys.add(key)
            added.push({
              url,
              week_date: targetWeek,
              week_source: weekSource,
              title: pick.title,
              link_url: pick.link_url,
            })
            continue
          }
          if (state.nextSort > FEAT_MAX_SORT) {
            failed.push({
              url: pick.link_url,
              reason: `La semana ${targetWeek} ya tiene sort_order máximo (${FEAT_MAX_SORT})`,
            })
            continue
          }
          const { error: insErr } = await sb.from('chart_featured_tracks').insert({
            chart_edition_id: state.editionId,
            sort_order: state.nextSort,
            title: pick.title,
            mix_name: pick.mix_name || '',
            artists: pick.artists as unknown as never,
            label: pick.label || '',
            platform: pick.platform,
            link_url: pick.link_url,
            link_label: pick.link_label,
            artwork_url: pick.artwork_url || null,
            sample_url: pick.sample_url || null,
            bpm: pick.bpm,
            music_key: pick.music_key || '',
            release_year: pick.release_year,
            release_date: pick.release_date,
            spotify_url: null,
            tidal_url: null,
            note_en: pick.note_en,
            note_es: pick.note_es,
          })
          if (insErr) {
            failed.push({ url: pick.link_url, reason: insErr.message })
          } else {
            state.keys.add(key)
            state.nextSort++
            added.push({
              url,
              week_date: targetWeek,
              week_source: weekSource,
              title: pick.title,
              link_url: pick.link_url,
            })
          }
        }
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      failed.push({ url, reason: msg })
    }

    if (i + 1 < beatportUrls.length && pauseMs > 0) {
      await sleep(pauseMs)
    }
  }

  await pages.close()

  if (added.length > 0) {
    revalidatePublicCharts()
  }

  return NextResponse.json({
    ok: true,
    summary: {
      procesadas: beatportUrls.length,
      insertadas: added.length,
      saltadas_multi: skipped_multi.length,
      saltadas_duplicado: skipped_dupe.length,
      fallidas: failed.length,
    },
    added,
    skipped_multi,
    skipped_dupe,
    failed,
  })
}
