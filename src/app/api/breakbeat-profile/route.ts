import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import type { BreakbeatProfileStats } from '@/types/database'
import { artistEraToReferenceYear, normalizeArtistEraToDecade } from '@/lib/breakbeat-profile-era'

// =============================================
// POST /api/breakbeat-profile
// Generates the user's breakbeat DNA profile
// =============================================

const OPENAI_MODEL = process.env.OPENAI_MODEL?.trim() || 'gpt-5.4'

type ArtistProfileInput = {
  name: string
  styles: string[]
  country: string
  era: string
  category: string
  essential_tracks: string[]
  recommended_mixes: string[]
  key_releases: { title: string; year?: number | null; note?: string }[]
}

type LabelProfileInput = {
  name: string
  country: string
  founded_year: number | null
  is_active: boolean
  key_artists: string[]
  key_releases: string[]
}

type EventProfileInput = {
  name: string
  event_type: string
  country: string
  city: string
  venue: string | null
  lineup: string[]
  date_start: string | null
  tags: string[]
}

type MixProfileInput = {
  title: string
  artist_name: string
  mix_type: string
  year: number | null
  platform?: string | null
  duration_minutes?: number | null
}

async function getAuthenticatedUser() {
  const cookieStore = await cookies()
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
  const key = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY)!

  const supabase = createServerClient<Database>(url, key, {
    cookies: {
      getAll() { return cookieStore.getAll() },
      setAll(cookiesToSet: { name: string; value: string; options: CookieOptions }[]) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options)
          )
        } catch { /* server component limitation */ }
      },
    },
  })

  const { data: { user } } = await supabase.auth.getUser()
  return { user, supabase }
}

function hashInputs(ids: string[]): string {
  const sorted = [...ids].sort().join(',')
  let h = 0
  for (let i = 0; i < sorted.length; i++) {
    h = ((h << 5) - h + sorted.charCodeAt(i)) | 0
  }
  return Math.abs(h).toString(36)
}

function takeUniqueNonEmpty(values: Array<string | null | undefined>, limit = 5): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const value of values) {
    const trimmed = String(value || '').trim()
    if (!trimmed) continue
    const key = trimmed.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(trimmed)
    if (out.length >= limit) break
  }
  return out
}

function inferSceneHints(args: {
  topStyles: { name: string; count: number; pct: number }[]
  topCountries: { name: string; count: number; pct: number }[]
  eraDistribution: Record<string, number>
  categoryBreakdown: Record<string, number>
}): string[] {
  const styles = new Set(args.topStyles.map((s) => s.name))
  const countries = new Set(args.topCountries.map((c) => c.name))
  const eras = new Set(Object.keys(args.eraDistribution))
  const hints: string[] = []

  const push = (hint: string) => {
    if (!hints.includes(hint)) hints.push(hint)
  }

  if (countries.has('UK')) {
    if (
      styles.has('nu_skool') ||
      styles.has('big_beat') ||
      styles.has('bassline') ||
      styles.has('progressive_breaks') ||
      styles.has('acid_breaks')
    ) {
      push('continuo británico de rave y breakbeat de club entre los 90 y los 2000')
    }
    if (styles.has('uk_garage') || styles.has('bass')) {
      push('eje UK garage, bass music y cultura soundsystem británica')
    }
  }

  if (countries.has('ES') || (args.categoryBreakdown.andalusian || 0) > 0) {
    push('escena andaluza de breaks y su circuito Cádiz-Sevilla/club-radio-coche')
  }

  if (countries.has('US')) {
    if (styles.has('florida_breaks')) {
      push('tradición Florida breaks y su lectura más de pista')
    }
    if (styles.has('electro') || eras.has('1980s')) {
      push('raíces electro, hip-hop temprano y primeras culturas del break en Nueva York')
    }
  }

  if (countries.has('AU')) {
    push('rama australiana del breakbeat de club y sus cruces con bass music')
  }

  if (styles.has('big_beat')) {
    push('big beat y cruce entre cultura de club, rock sampleado y breaks de finales de los 90')
  }

  if (styles.has('nu_skool')) {
    push('nu skool breaks como reformulación moderna del breakbeat clásico')
  }

  return hints.slice(0, 3)
}

function isStrongEnoughAnalysis(text: string): boolean {
  const normalized = text.trim()
  if (normalized.length < 1600) return false
  const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean)
  return paragraphs.length >= 5
}

function formatYearLabel(date: string | null | undefined): string {
  if (!date) return ''
  const year = date.slice(0, 4)
  return /^\d{4}$/.test(year) ? year : ''
}

function formatArtistRelease(release: { title: string; year?: number | null; note?: string } | null | undefined): string {
  if (!release?.title) return ''
  const year = release.year ? ` (${release.year})` : ''
  const note = release.note ? `, ${release.note}` : ''
  return `${release.title}${year}${note}`
}

function topPctEntries(obj: Record<string, number>, limit: number): Array<{ name: string; pct: number }> {
  return Object.entries(obj)
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([name, pct]) => ({ name, pct }))
}

function topYearEntries(obj: Record<string, number> | undefined, limit: number): Array<{ year: string; pct: number }> {
  return Object.entries(obj || {})
    .filter(([, pct]) => pct > 0)
    .sort(([, a], [, b]) => b - a)
    .slice(0, limit)
    .map(([year, pct]) => ({ year, pct }))
}

function pctLabel(pct: number): string {
  return `${Math.round(pct * 100)}%`
}

function computeStats(
  artists: ArtistProfileInput[],
  labels: LabelProfileInput[],
  events: EventProfileInput[],
  mixes: MixProfileInput[],
): BreakbeatProfileStats {
  const styleCounts: Record<string, number> = {}
  const countryCounts: Record<string, number> = {}
  const eraCounts: Record<string, number> = {}
  const yearCounts: Record<number, number> = {}
  const catCounts: Record<string, number> = {}
  const maxYear = new Date().getFullYear() + 1

  const bumpYear = (y: number) => {
    if (!Number.isFinite(y) || y < 1970 || y > maxYear) return
    yearCounts[y] = (yearCounts[y] || 0) + 1
  }

  for (const a of artists) {
    for (const s of a.styles || []) styleCounts[s] = (styleCounts[s] || 0) + 1
    if (a.country) countryCounts[a.country] = (countryCounts[a.country] || 0) + 1
    if (a.era) {
      const eraBucket = normalizeArtistEraToDecade(a.era) || a.era.trim()
      eraCounts[eraBucket] = (eraCounts[eraBucket] || 0) + 1
      const refY = artistEraToReferenceYear(a.era)
      if (refY != null) bumpYear(refY)
    }
    if (a.category) catCounts[a.category] = (catCounts[a.category] || 0) + 1
  }

  for (const l of labels) {
    if (l.country) countryCounts[l.country] = (countryCounts[l.country] || 0) + 1
    if (l.founded_year) {
      const decade = `${Math.floor(l.founded_year / 10) * 10}s`
      eraCounts[decade] = (eraCounts[decade] || 0) + 1
      bumpYear(l.founded_year)
    }
  }

  const labelDecades: Record<string, number> = {}
  for (const l of labels) {
    if (l.founded_year) {
      const decade = `${Math.floor(l.founded_year / 10) * 10}s`
      labelDecades[decade] = (labelDecades[decade] || 0) + 1
    }
  }

  const totalStyles = Object.values(styleCounts).reduce((a, b) => a + b, 0) || 1
  const topStyles = Object.entries(styleCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 8)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / totalStyles) * 100) / 100 }))

  const totalCountries = Object.values(countryCounts).reduce((a, b) => a + b, 0) || 1
  const topCountries = Object.entries(countryCounts)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([name, count]) => ({ name, count, pct: Math.round((count / totalCountries) * 100) / 100 }))

  let festivals = 0, clubNights = 0
  const eventCountries: Set<string> = new Set()
  for (const ev of events) {
    if (ev.event_type === 'festival') festivals++
    if (ev.event_type === 'club_night') clubNights++
    if (ev.country) eventCountries.add(ev.country)
  }

  const mixTaste: Record<string, number> = {}
  for (const m of mixes) {
    const t = m.mix_type || 'unknown'
    mixTaste[t] = (mixTaste[t] || 0) + 1
    if (m.year) {
      const decade = `${Math.floor(m.year / 10) * 10}s`
      eraCounts[decade] = (eraCounts[decade] || 0) + 1
      bumpYear(m.year)
    }
  }

  const totalEras = Object.values(eraCounts).reduce((a, b) => a + b, 0) || 1
  const eraDistribution: Record<string, number> = {}
  for (const [era, count] of Object.entries(eraCounts)) {
    eraDistribution[era] = Math.round((count / totalEras) * 100) / 100
  }

  const totalYear = Object.values(yearCounts).reduce((a, b) => a + b, 0) || 1
  const yearDistribution: Record<string, number> = {}
  for (const [y, count] of Object.entries(yearCounts)) {
    yearDistribution[y] = Math.round((count / totalYear) * 100) / 100
  }

  const sceneHints = inferSceneHints({
    topStyles,
    topCountries,
    eraDistribution,
    categoryBreakdown: catCounts,
  })

  const sampleArtistReleases = takeUniqueNonEmpty(
    artists.flatMap((a) => (a.key_releases || []).map((r) => formatArtistRelease(r))),
    8,
  )
  const sampleTracks = takeUniqueNonEmpty(
    artists.flatMap((a) => a.essential_tracks || []),
    8,
  )
  const sampleRecommendedMixes = takeUniqueNonEmpty(
    artists.flatMap((a) => a.recommended_mixes || []),
    6,
  )
  const sampleLabelReleases = takeUniqueNonEmpty(
    labels.flatMap((l) => l.key_releases || []),
    8,
  )
  const sampleLabelArtists = takeUniqueNonEmpty(
    labels.flatMap((l) => l.key_artists || []),
    8,
  )
  const sampleEventLineup = takeUniqueNonEmpty(
    events.flatMap((e) => e.lineup || []),
    8,
  )
  const sampleEventContexts = takeUniqueNonEmpty(
    events.map((e) => [e.name, e.city, e.venue || '', formatYearLabel(e.date_start)].filter(Boolean).join(' — ')),
    6,
  )
  const sampleMixContexts = takeUniqueNonEmpty(
    mixes.map((m) => [m.artist_name, m.title, m.year ? String(m.year) : ''].filter(Boolean).join(' — ')),
    6,
  )
  const dominantEras = topPctEntries(eraDistribution, 5)
  const dominantYears = topYearEntries(yearDistribution, 6)

  return {
    top_styles: topStyles,
    top_countries: topCountries,
    era_distribution: eraDistribution,
    year_distribution: yearDistribution,
    category_breakdown: catCounts,
    event_profile: { festivals, club_nights: clubNights, countries: Array.from(eventCountries) },
    mix_taste: mixTaste,
    label_decades: labelDecades,
    total_data_points: artists.length + labels.length + events.length + mixes.length,
    sample_artists: takeUniqueNonEmpty(artists.map((a) => a.name), 6),
    sample_labels: takeUniqueNonEmpty(labels.map((l) => l.name), 5),
    sample_events: takeUniqueNonEmpty(events.map((e) => e.name), 4),
    sample_mixes: takeUniqueNonEmpty(mixes.map((m) => m.title), 4),
    sample_tracks: sampleTracks,
    sample_artist_releases: sampleArtistReleases,
    sample_label_releases: sampleLabelReleases,
    sample_label_artists: sampleLabelArtists,
    sample_recommended_mixes: sampleRecommendedMixes,
    sample_event_lineup: sampleEventLineup,
    sample_event_contexts: sampleEventContexts,
    sample_mix_contexts: sampleMixContexts,
    dominant_eras: dominantEras,
    dominant_years: dominantYears,
    scene_hints: sceneHints,
  }
}

async function generateAIText(stats: BreakbeatProfileStats, lang: 'es' | 'en'): Promise<{
  text: string
  archetype: string
  method: 'openai' | 'rules'
}> {
  const apiKey = process.env.OPENAI_API_KEY
  if (!apiKey) return generateRulesText(stats, lang)

  const stylesStr = stats.top_styles.map(s => `${s.name} (${Math.round(s.pct * 100)}%)`).join(', ')
  const countriesStr = stats.top_countries.map(c => `${c.name} (${Math.round(c.pct * 100)}%)`).join(', ')
  const erasStr = Object.entries(stats.era_distribution)
    .sort(([, a], [, b]) => b - a)
    .map(([era, pct]) => `${era}: ${Math.round(pct * 100)}%`)
    .join(', ')
  const yearsStr = Object.entries(stats.year_distribution || {})
    .filter(([, pct]) => pct > 0)
    .sort(([a], [b]) => parseInt(a, 10) - parseInt(b, 10))
    .map(([y, pct]) => `${y}: ${Math.round(pct * 100)}%`)
    .join(', ')
  const catsStr = Object.entries(stats.category_breakdown)
    .sort(([, a], [, b]) => b - a)
    .map(([cat, n]) => `${cat}: ${n}`)
    .join(', ')
  const mixStr = Object.entries(stats.mix_taste)
    .sort(([, a], [, b]) => b - a)
    .map(([t, n]) => `${t}: ${n}`)
    .join(', ')
  const labelDecadesStr = Object.entries(stats.label_decades)
    .sort(([, a], [, b]) => b - a)
    .map(([era, n]) => `${era}: ${n}`)
    .join(', ')
  const eventCountriesStr = stats.event_profile.countries.join(', ')
  const sampleArtistsStr = stats.sample_artists?.join(', ') || ''
  const sampleLabelsStr = stats.sample_labels?.join(', ') || ''
  const sampleEventsStr = stats.sample_events?.join(', ') || ''
  const sampleMixesStr = stats.sample_mixes?.join(', ') || ''
  const tracksStr = stats.sample_tracks?.join(', ') || ''
  const artistReleasesStr = stats.sample_artist_releases?.join(', ') || ''
  const labelReleasesStr = stats.sample_label_releases?.join(', ') || ''
  const labelArtistsStr = stats.sample_label_artists?.join(', ') || ''
  const recommendedMixesStr = stats.sample_recommended_mixes?.join(', ') || ''
  const eventLineupStr = stats.sample_event_lineup?.join(', ') || ''
  const eventContextsStr = stats.sample_event_contexts?.join(', ') || ''
  const mixContextsStr = stats.sample_mix_contexts?.join(', ') || ''
  const dominantErasStr = (stats.dominant_eras || [])
    .map((d) => `${d.name} (${pctLabel(d.pct)})`)
    .join(', ')
  const dominantYearsStr = (stats.dominant_years || [])
    .map((d) => `${d.year} (${pctLabel(d.pct)})`)
    .join(', ')
  const sceneHintsStr = stats.scene_hints?.join(' | ') || ''

  const isEs = lang === 'es'
  const systemPrompt = isEs
    ? `Eres un analista experto en cultura breakbeat para Optimal Breaks. Tu trabajo no es escribir copy bonito sino una lectura seria, concreta y verificable del gusto del usuario. Hablas directamente al usuario en segunda persona. Tono: cercano, culto, analítico, nada promocional ni grandilocuente. Cada afirmación interpretativa debe apoyarse en evidencia visible en los datos: subgéneros, décadas, años, artistas, tracks, releases, sellos, eventos, lineups o mixes. Evita la abstracción vacía. No uses fórmulas como "hay raíces", "hay evolución", "hay mutaciones", "se nota una trayectoria" o equivalentes si no las desarrollas inmediatamente con nombres, años, décadas o escenas concretas. Si faltan pruebas en un área, dilo con naturalidad y pasa a otra. Si aparecen tracks o releases, cítalos explícitamente.`
    : `You are an expert analyst of breakbeat culture for Optimal Breaks. Your job is not to write pretty copy but a serious, concrete and evidence-based reading of the user's taste. Speak directly to the user in the second person. Tone: close, cultured, analytical, never promotional or overblown. Every interpretive claim must be grounded in visible evidence from the data: subgenres, decades, years, artists, tracks, releases, labels, events, lineups or mixes. Avoid empty abstraction. Do not use formulas such as "there are roots", "there is evolution", "there are mutations", "there is a trajectory" or similar unless you immediately unpack them with concrete names, years, decades or scenes. If evidence is thin in one area, say so naturally and move to another. If tracks or releases are present, cite them explicitly.`

  const userPrompt = isEs
    ? `Analiza este perfil breakbeatero y escribe:

1. Un ARQUETIPO corto (2-4 palabras), preciso y musicalmente creíble. Solo el nombre, sin explicación.

2. Un análisis largo, dirigido al usuario, de 6 párrafos exactos. No escatimes en longitud: apunta normalmente a 1800-3200 caracteres y, si los datos dan para más, puedes extenderte.

OBJETIVO DEL ANÁLISIS:
- Explica qué subgéneros dominan realmente su gusto.
- Explica qué décadas y qué años pesan más y qué sugiere eso sobre su escucha.
- Interpreta si su perfil apunta más a crate digger, selector, clubber, festivalero, purista o ecléctico.
- Usa el patrón de mixes y eventos para reforzar la lectura.
- Conecta el gusto con escenas o continuidades breakbeat reconocibles cuando los datos lo permitan.
- Si hay nombres concretos en los datos, menciónalos varias veces como evidencia y no te quedes en abstracciones.
- Traza una lectura temporal: de dónde parece venir ese gusto, cuáles podrían ser sus raíces y hacia qué mutaciones del breakbeat o bass se proyecta.
- Habla del papel de artistas, tracks, releases, sellos, escenas locales, circuitos de club, radio o cultura rave si aparecen respaldados por los datos.

REGLAS:
- Háblale siempre de tú a tú.
- No digas "este usuario".
- No metas chistes fáciles ni copy promocional.
- No inventes favoritos concretos ni escenas si no están respaldados por los datos.
- Si faltan datos, no fuerces conclusiones.
- Quiero una lectura seria de gustos, no un texto comercial.
- Debes mencionar explícitamente subgéneros, épocas dominantes y años dominantes cuando existan.
- Debes mencionar al menos una escena, geografía o continuidad cultural si el perfil da pie a ello.
- Debes mencionar artistas, sellos, eventos o mixes concretos varias veces cuando existan datos.
- Si existen tracks, releases o lineups, debes citar algunos explícitamente.
- Cada párrafo, salvo el último, debe incluir al menos un nombre propio, una década o un año concreto.
- Estructura obligatoria de los 6 párrafos:
  1) subgéneros + geografía principal;
  2) décadas y años dominantes;
  3) artistas + tracks/releases;
  4) sellos + catálogos + key artists/key releases;
  5) mixes + eventos + lineups + contexto de pista;
  6) síntesis final del perfil y del arquetipo.
- No entregues un texto corto o vago: si no llegas a 1600 caracteres, la respuesta es inválida.
- No pongas un máximo práctico de longitud si el contexto es rico.

DATOS DEL PERFIL:
- Subgéneros favoritos: ${stylesStr}
- Países dominantes: ${countriesStr}
- Eras/décadas: ${erasStr}
- Décadas dominantes resumidas: ${dominantErasStr || 'sin datos'}
- Años (histograma: artistas→año referencia por década, sellos/mixes→año exacto): ${yearsStr || 'sin datos'}
- Años dominantes resumidos: ${dominantYearsStr || 'sin datos'}
- Categorías de artistas: ${catsStr}
- Perfil de mixes: ${mixStr}
- Décadas de sellos: ${labelDecadesStr || 'sin datos'}
- Eventos: ${stats.event_profile.festivals} festivales, ${stats.event_profile.club_nights} club nights
- Países de eventos: ${eventCountriesStr || 'sin datos'}
- Artistas guardados o favoritos (muestra): ${sampleArtistsStr || 'sin datos'}
- Tracks esenciales detectados: ${tracksStr || 'sin datos'}
- Releases clave de artistas: ${artistReleasesStr || 'sin datos'}
- Sellos guardados o favoritos (muestra): ${sampleLabelsStr || 'sin datos'}
- Key artists de sellos: ${labelArtistsStr || 'sin datos'}
- Key releases de sellos: ${labelReleasesStr || 'sin datos'}
- Eventos guardados/asistencias (muestra): ${sampleEventsStr || 'sin datos'}
- Contexto de eventos: ${eventContextsStr || 'sin datos'}
- Lineups vistos en eventos: ${eventLineupStr || 'sin datos'}
- Mixes guardados (muestra): ${sampleMixesStr || 'sin datos'}
- Mixes recomendados desde artistas: ${recommendedMixesStr || 'sin datos'}
- Contexto de mixes: ${mixContextsStr || 'sin datos'}
- Pistas de escena inferibles desde los datos: ${sceneHintsStr || 'sin datos suficientes'}
- Total de datos: ${stats.total_data_points} elementos

Responde EXACTAMENTE en este formato JSON:
{"archetype": "...", "text": "..."}`
    : `Analyze this breakbeat profile and write:

1. A short ARCHETYPE (2-4 words), precise and musically credible. Just the name, no explanation.

2. A long analysis addressed directly to the user, in exactly 6 paragraphs. Do not be afraid of length: normally aim for 1800-3200 characters and, if the data supports it, you may go longer.

ANALYSIS GOALS:
- Explain which subgenres genuinely dominate their taste.
- Explain which decades and which years carry the most weight and what that suggests.
- Interpret whether the profile feels more like a crate digger, selector, clubber, festival-goer, purist or eclectic listener.
- Use the mix and event patterns to support the reading.
- Connect the taste to recognizable breakbeat scenes or continuities whenever the data supports it.
- If concrete names are available, mention them repeatedly as evidence instead of staying abstract.
- Build a temporal reading: where that taste seems to come from, what its roots are, and which later breakbeat or bass mutations it points toward.
- Discuss the role of artists, tracks, releases, labels, local scenes, club circuits, radio culture or rave culture whenever the data supports it.

RULES:
- Always speak directly to the user.
- Do not say "this user".
- No cheap jokes and no promotional copy.
- Do not invent specific favorites or scenes not supported by the data.
- If the data is thin, do not force conclusions.
- This must read like a serious taste analysis, not marketing text.
- You must explicitly mention dominant subgenres, dominant eras and dominant years when available.
- You must mention at least one scene, geography or cultural continuity when the profile supports it.
- You must mention artists, labels, events or mixes by name several times when data exists.
- If tracks, releases or lineups exist, you must cite some of them explicitly.
- Every paragraph except the last must contain at least one proper name, decade or concrete year.
- Mandatory 6-paragraph structure:
  1) subgenres + main geography;
  2) dominant decades and years;
  3) artists + tracks/releases;
  4) labels + catalog logic + key artists/key releases;
  5) mixes + events + lineups + dancefloor context;
  6) final synthesis of the profile and the archetype.
- Do not return a short or vague text: if it is below 1600 characters, it is invalid.
- Do not impose a practical upper limit when the context is rich.

PROFILE DATA:
- Favorite subgenres: ${stylesStr}
- Dominant countries: ${countriesStr}
- Eras/decades: ${erasStr}
- Dominant eras summary: ${dominantErasStr || 'no data'}
- Years (histogram: artists→reference year per decade, labels/mixes→exact year): ${yearsStr || 'no data'}
- Dominant years summary: ${dominantYearsStr || 'no data'}
- Artist categories: ${catsStr}
- Mix profile: ${mixStr}
- Label decades: ${labelDecadesStr || 'no data'}
- Events: ${stats.event_profile.festivals} festivals, ${stats.event_profile.club_nights} club nights
- Event countries: ${eventCountriesStr || 'no data'}
- Saved/favorite artists (sample): ${sampleArtistsStr || 'no data'}
- Essential tracks detected: ${tracksStr || 'no data'}
- Artist key releases: ${artistReleasesStr || 'no data'}
- Saved/favorite labels (sample): ${sampleLabelsStr || 'no data'}
- Label key artists: ${labelArtistsStr || 'no data'}
- Label key releases: ${labelReleasesStr || 'no data'}
- Saved/attended events (sample): ${sampleEventsStr || 'no data'}
- Event contexts: ${eventContextsStr || 'no data'}
- Event lineups: ${eventLineupStr || 'no data'}
- Saved mixes (sample): ${sampleMixesStr || 'no data'}
- Recommended mixes from artists: ${recommendedMixesStr || 'no data'}
- Mix contexts: ${mixContextsStr || 'no data'}
- Scene hints inferred from the data: ${sceneHintsStr || 'not enough data'}
- Total data: ${stats.total_data_points} items

Reply EXACTLY in this JSON format:
{"archetype": "...", "text": "..."}`

  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.45,
        max_tokens: 1800,
      }),
    })

    if (!res.ok) {
      console.warn('[breakbeat-profile] OpenAI error:', res.status, await res.text())
      return generateRulesText(stats, lang)
    }

    const data = await res.json()
    const raw = data.choices?.[0]?.message?.content?.trim() || ''

    const jsonMatch = raw.match(/\{[\s\S]*\}/)
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0])
      if (!isStrongEnoughAnalysis(parsed.text || '')) {
        return generateRulesText(stats, lang)
      }
      return {
        text: parsed.text || '',
        archetype: parsed.archetype || '',
        method: 'openai',
      }
    }

    return generateRulesText(stats, lang)
  } catch (err) {
    console.warn('[breakbeat-profile] OpenAI call failed:', err)
    return generateRulesText(stats, lang)
  }
}

function generateRulesText(stats: BreakbeatProfileStats, lang: 'es' | 'en'): {
  text: string; archetype: string; method: 'rules'
} {
  const isEs = lang === 'es'
  const topStyle = stats.top_styles[0]?.name || 'breakbeat'
  const topCountry = stats.top_countries[0]?.name || ''
  const topEra = Object.entries(stats.era_distribution).sort(([, a], [, b]) => b - a)[0]?.[0] || ''
  const topCat = Object.entries(stats.category_breakdown).sort(([, a], [, b]) => b - a)[0]?.[0] || ''
  const topMix = Object.entries(stats.mix_taste).sort(([, a], [, b]) => b - a)[0]?.[0] || ''
  const eventBias =
    stats.event_profile.club_nights > stats.event_profile.festivals
      ? (isEs ? 'club' : 'club')
      : stats.event_profile.festivals > stats.event_profile.club_nights
        ? (isEs ? 'festival' : 'festival')
        : (isEs ? 'equilibrado' : 'balanced')

  const archetypes: Record<string, { en: string; es: string }> = {
    nu_skool: { en: 'Nu Skool Purist', es: 'Purista del Nu Skool' },
    bassline: { en: 'Bassline Addict', es: 'Adicto al Bassline' },
    acid_breaks: { en: 'Acid Breaks Head', es: 'Cabeza Acid Breaks' },
    florida_breaks: { en: 'Florida Breaks Archaeologist', es: 'Arqueólogo del Florida Breaks' },
    big_beat: { en: 'Big Beat Maniac', es: 'Maníaco del Big Beat' },
    electro: { en: 'Electro Breaks Explorer', es: 'Explorador del Electro Breaks' },
    progressive_breaks: { en: 'Progressive Voyager', es: 'Viajero del Progressive Breaks' },
  }

  const fallback = { en: 'Breakbeat Eclectic', es: 'Ecléctico del Breakbeat' }
  const arch = archetypes[topStyle] || fallback
  const archetype = isEs ? arch.es : arch.en

  const countryNames: Record<string, { en: string; es: string }> = {
    UK: { en: 'the UK', es: 'Reino Unido' },
    US: { en: 'the US', es: 'Estados Unidos' },
    ES: { en: 'Spain', es: 'España' },
    AU: { en: 'Australia', es: 'Australia' },
  }
  const cName = countryNames[topCountry] || { en: topCountry, es: topCountry }
  const topStyles = stats.top_styles
    .slice(0, 3)
    .map((s) => s.name.replace(/_/g, ' '))
    .join(isEs ? ', ' : ', ')
  const topEras = Object.entries(stats.era_distribution)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 3)
    .map(([era, pct]) => `${era} (${pctLabel(pct)})`)
    .join(', ')
  const topYears = (stats.dominant_years || [])
    .slice(0, 4)
    .map((d) => `${d.year} (${pctLabel(d.pct)})`)
    .join(', ')
  const sampleArtists = stats.sample_artists?.slice(0, 3).join(', ') || ''
  const sampleLabels = stats.sample_labels?.slice(0, 2).join(', ') || ''
  const sampleEvents = stats.sample_events?.slice(0, 2).join(', ') || ''
  const sampleMixes = stats.sample_mixes?.slice(0, 2).join(', ') || ''
  const sampleTracks = stats.sample_tracks?.slice(0, 4).join(', ') || ''
  const artistReleases = stats.sample_artist_releases?.slice(0, 4).join(', ') || ''
  const labelReleases = stats.sample_label_releases?.slice(0, 4).join(', ') || ''
  const labelArtists = stats.sample_label_artists?.slice(0, 4).join(', ') || ''
  const recommendedMixes = stats.sample_recommended_mixes?.slice(0, 3).join(', ') || ''
  const eventLineup = stats.sample_event_lineup?.slice(0, 5).join(', ') || ''
  const eventContexts = stats.sample_event_contexts?.slice(0, 3).join(', ') || ''
  const mixContexts = stats.sample_mix_contexts?.slice(0, 3).join(', ') || ''
  const sceneHints = stats.scene_hints?.slice(0, 2).join(isEs ? '; ' : '; ') || ''
  const mixLabel = topMix ? topMix.replace(/_/g, ' ') : (isEs ? 'sesiones guardadas' : 'saved mixes')
  const categoryLabel = topCat ? topCat.replace(/_/g, ' ') : (isEs ? 'artistas' : 'artists')

  const text = isEs
    ? `Lo primero que se ve en tu ADN breakbeatero es un eje concreto entre ${topStyles || topStyle.replace(/_/g, ' ')}, con un peso geográfico claro de ${cName.es || 'tu geografía principal'}. No hace falta hablar en abstracto porque la cronología ya marca una dirección: ${topEras || topEra}${topYears ? `, y con años muy visibles como ${topYears}` : ''}. ${sceneHints ? `Eso encaja además con ${sceneHints}.` : 'Aunque no todos los detalles estén cerrados, sí hay una línea de escena reconocible.'}\n\nCuando aterrizas en nombres, el mapa gana precisión. Si en tus artistas aparecen ${sampleArtists || 'varios nombres concretos'}, y además asoman cortes o referencias como ${sampleTracks || artistReleases || 'releases señalados en tus favoritos'}, tu perfil no se queda en “te gusta el breakbeat”: habla de qué parte del breakbeat te tira y desde qué tipo de material entras. ${artistReleases ? `Releases como ${artistReleases} sirven para fijar ese gusto en momentos y catálogos concretos.` : 'Aunque no siempre haya releases detallados, la selección de artistas ya dibuja un canon reconocible.'}\n\nLos sellos también ayudan a leer el criterio. ${sampleLabels ? `Cuando guardas sellos como ${sampleLabels},` : 'Cuando el peso de los sellos entra en juego,'} la escucha parece menos impulsiva y más de catálogo. ${labelArtists ? `Si alrededor de esos sellos orbitan nombres como ${labelArtists},` : ''} ${labelReleases ? `y releases como ${labelReleases},` : ''} se entiende mejor si tu oído va hacia una lógica más rave noventera, más nu skool de 2000s o más híbrida entre club y bass posterior.\n\nLa parte de mixes y pista también aterriza mucho la lectura. ${sampleMixes ? `No es lo mismo guardar ${sampleMixes}` : 'No es lo mismo fijarse en ciertos mixes'}${mixContexts ? `, especialmente si aparecen contextos como ${mixContexts}` : ''}, porque ahí ya se ve si valoras sesiones tipo ${mixLabel}, radio, selección larga o energía de club directa. ${sampleEvents ? `Y si además aparecen eventos como ${sampleEvents}` : 'Si la huella de eventos existe'}, ${eventContexts ? `con contextos como ${eventContexts}` : ''}${eventLineup ? ` y lineups donde entran ${eventLineup}` : ''}, la lectura sale del archivo y pisa sala, festival o circuito real.\n\nEn conjunto, te acercas a un perfil ${eventBias}${topMix ? ` con afinidad clara por ${mixLabel}` : ''}, probablemente entre selector y digger, pero no por postureo sino por cómo se cruzan décadas, nombres y formatos. Con ${stats.total_data_points} datos y peso en ${categoryLabel}, tu gusto no se apoya solo en una etiqueta amplia: se deja leer en años concretos, en artistas concretos, en sellos concretos y en material concreto.`
    : `The first thing your breakbeat DNA shows is a concrete axis between ${topStyles || topStyle.replace(/_/g, ' ')}, with a clear geographical weight from ${cName.en || 'your main geography'}. There is no need to stay abstract because the timeline already points somewhere specific: ${topEras || topEra}${topYears ? `, with very visible years such as ${topYears}` : ''}. ${sceneHints ? `That also fits with ${sceneHints}.` : 'Even if every detail is not fully closed, there is still a recognizable scene line behind it.'}\n\nOnce you land on names, the map becomes much sharper. If your artists include ${sampleArtists || 'several concrete names'}, and tracks or references such as ${sampleTracks || artistReleases || 'specific releases in your favorites'} also show up, the profile stops meaning only “you like breakbeat” and starts showing which branch of breakbeat pulls you in and through what material. ${artistReleases ? `Releases such as ${artistReleases} help pin that taste to concrete moments and catalogues.` : 'Even when release data is thinner, the artist selection already sketches a recognisable canon.'}\n\nLabels also make the reading more exact. ${sampleLabels ? `When you save labels such as ${sampleLabels},` : 'When label weight enters the picture,'} the listening feels less impulsive and more catalogue-driven. ${labelArtists ? `If those labels connect to names like ${labelArtists},` : ''} ${labelReleases ? `and releases such as ${labelReleases},` : ''} it becomes easier to see whether your ear leans toward a 90s rave logic, a 2000s nu skool logic, or a hybrid bridge between club breaks and later bass mutations.\n\nThe mix and dancefloor layer grounds the reading even more. ${sampleMixes ? `Saving mixes like ${sampleMixes}` : 'Paying attention to particular mixes'}${mixContexts ? `, especially when contexts such as ${mixContexts} appear,` : ','} already tells us whether you value long-form selection, radio framing, classic set energy or direct club pressure. ${sampleEvents ? `And if events such as ${sampleEvents} also appear` : 'If event traces also appear'}${eventContexts ? `, with contexts like ${eventContexts}` : ''}${eventLineup ? ` and lineups including ${eventLineup}` : ''}, the profile clearly moves from archive listening into real rooms, festivals and live circuits.\n\nOverall, you lean toward a ${eventBias} profile${topMix ? ` with a clear affinity for ${mixLabel}` : ''}, probably somewhere between selector and digger, but not as a vague archetype: the evidence sits in decades, years, names and formats. With ${stats.total_data_points} data points and strong weight in ${categoryLabel}, your taste is readable through concrete years, concrete artists, concrete labels and concrete listening material.`

  return { text, archetype, method: 'rules' }
}

export async function POST(request: NextRequest) {
  try {
    const { user, supabase } = await getAuthenticatedUser()
    if (!user) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
    }

    const body = await request.json().catch(() => ({}))
    const lang: 'es' | 'en' = body.lang === 'en' ? 'en' : 'es'

    // Fetch all user data in parallel
    const [favArtistsRes, favLabelsRes, attendanceRes, favEventsRes, savedMixesRes] = await Promise.all([
      supabase.from('favorite_artists').select('artist_id').eq('user_id', user.id),
      supabase.from('favorite_labels').select('label_id').eq('user_id', user.id),
      supabase.from('event_attendance').select('event_id, status').eq('user_id', user.id),
      supabase.from('favorite_events').select('event_id').eq('user_id', user.id),
      supabase.from('saved_mixes').select('mix_id').eq('user_id', user.id),
    ])

    const artistIds = favArtistsRes.data?.map((d: any) => d.artist_id) || []
    const labelIds = favLabelsRes.data?.map((d: any) => d.label_id) || []
    const eventIds = Array.from(new Set([
      ...(attendanceRes.data?.map((d: any) => d.event_id) || []),
      ...(favEventsRes.data?.map((d: any) => d.event_id) || []),
    ]))
    const mixIds = savedMixesRes.data?.map((d: any) => d.mix_id) || []

    const allIds = [...artistIds, ...labelIds, ...eventIds, ...mixIds]
    if (allIds.length < 3) {
      return NextResponse.json({
        error: lang === 'es'
          ? 'Necesitas al menos 3 favoritos para generar tu perfil breakbeatero'
          : 'You need at least 3 favorites to generate your breakbeat profile',
      }, { status: 400 })
    }

    const currentHash = hashInputs(allIds)

    // Fetch entity details in parallel
    const [artistsRes, labelsRes, eventsRes, mixesRes] = await Promise.all([
      artistIds.length > 0
        ? supabase.from('artists').select('name, styles, country, era, category, essential_tracks, recommended_mixes, key_releases').in('id', artistIds)
        : { data: [] },
      labelIds.length > 0
        ? supabase.from('labels').select('name, country, founded_year, is_active, key_artists, key_releases').in('id', labelIds)
        : { data: [] },
      eventIds.length > 0
        ? supabase.from('events').select('name, event_type, country, city, venue, lineup, date_start, tags').in('id', eventIds)
        : { data: [] },
      mixIds.length > 0
        ? supabase.from('mixes').select('title, artist_name, mix_type, year, platform, duration_minutes').in('id', mixIds)
        : { data: [] },
    ])

    const stats = computeStats(
      (artistsRes.data as any[]) || [],
      (labelsRes.data as any[]) || [],
      (eventsRes.data as any[]) || [],
      (mixesRes.data as any[]) || [],
    )

    // Generate text in both languages
    const [resultEs, resultEn] = await Promise.all([
      generateAIText(stats, 'es'),
      generateAIText(stats, 'en'),
    ])

    const payload = {
      user_id: user.id,
      stats: stats as any,
      analysis_text_es: resultEs.text,
      analysis_text_en: resultEn.text,
      archetype_es: resultEs.archetype,
      archetype_en: resultEn.archetype,
      input_hash: currentHash,
      generated_by: resultEs.method,
    }

    const { data: saved, error: saveErr } = await (supabase as any)
      .from('breakbeat_profiles')
      .upsert(payload, { onConflict: 'user_id' })
      .select()
      .single()

    if (saveErr) {
      console.error('[breakbeat-profile] Save error:', saveErr)
      return NextResponse.json({ ...payload, _saved: false })
    }

    return NextResponse.json(saved)
  } catch (err: any) {
    console.error('[breakbeat-profile] Unexpected error:', err)
    return NextResponse.json({ error: err.message || 'Internal error' }, { status: 500 })
  }
}
