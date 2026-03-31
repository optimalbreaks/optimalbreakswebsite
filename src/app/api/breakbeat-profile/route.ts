import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import type { BreakbeatProfileStats } from '@/types/database'

// =============================================
// POST /api/breakbeat-profile
// Generates the user's breakbeat DNA profile
// =============================================

const OPENAI_MODEL = 'gpt-4o-mini'

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

function computeStats(
  artists: { styles: string[]; country: string; era: string; category: string }[],
  labels: { country: string; founded_year: number | null; is_active: boolean }[],
  events: { event_type: string; country: string; city: string; tags: string[] }[],
  mixes: { mix_type: string; year: number | null }[],
): BreakbeatProfileStats {
  const styleCounts: Record<string, number> = {}
  const countryCounts: Record<string, number> = {}
  const eraCounts: Record<string, number> = {}
  const catCounts: Record<string, number> = {}

  for (const a of artists) {
    for (const s of a.styles || []) styleCounts[s] = (styleCounts[s] || 0) + 1
    if (a.country) countryCounts[a.country] = (countryCounts[a.country] || 0) + 1
    if (a.era) eraCounts[a.era] = (eraCounts[a.era] || 0) + 1
    if (a.category) catCounts[a.category] = (catCounts[a.category] || 0) + 1
  }

  for (const l of labels) {
    if (l.country) countryCounts[l.country] = (countryCounts[l.country] || 0) + 1
    if (l.founded_year) {
      const decade = `${Math.floor(l.founded_year / 10) * 10}s`
      eraCounts[decade] = (eraCounts[decade] || 0) + 1
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
    }
  }

  const totalEras = Object.values(eraCounts).reduce((a, b) => a + b, 0) || 1
  const eraDistribution: Record<string, number> = {}
  for (const [era, count] of Object.entries(eraCounts)) {
    eraDistribution[era] = Math.round((count / totalEras) * 100) / 100
  }

  return {
    top_styles: topStyles,
    top_countries: topCountries,
    era_distribution: eraDistribution,
    category_breakdown: catCounts,
    event_profile: { festivals, club_nights: clubNights, countries: Array.from(eventCountries) },
    mix_taste: mixTaste,
    label_decades: labelDecades,
    total_data_points: artists.length + labels.length + events.length + mixes.length,
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

  const isEs = lang === 'es'
  const systemPrompt = isEs
    ? `Eres un analista experto en cultura breakbeat para Optimal Breaks. Interpretas gustos musicales con criterio real de escena, precisión y lenguaje claro. Hablas directamente al usuario en segunda persona. Tu tono es cercano pero analítico: nada promocional, nada grandilocuente, nada genérico. Prioriza patrones observables sobre adornos. No inventes artistas, sellos, eventos o escenas concretas si no están respaldados por los datos. Si haces una inferencia, debe ser prudente y razonable.`
    : `You are an expert analyst of breakbeat culture for Optimal Breaks. You interpret musical taste with real scene knowledge, precision and clear language. Speak directly to the user in the second person. Your tone is warm but analytical: never promotional, never overblown, never generic. Prioritize observable patterns over decoration. Do not invent specific artists, labels, events or scenes unless the data truly supports them. Any inference must be cautious and reasonable.`

  const userPrompt = isEs
    ? `Analiza este perfil breakbeatero y escribe:

1. Un ARQUETIPO corto (2-4 palabras), preciso y musicalmente creíble. Solo el nombre, sin explicación.

2. Un análisis de 3 párrafos cortos, dirigido al usuario, con un máximo de 900 caracteres en total.

OBJETIVO DEL ANÁLISIS:
- Explica qué subgéneros dominan realmente su gusto.
- Explica qué décadas pesan más y qué sugiere eso sobre su escucha.
- Interpreta si su perfil apunta más a crate digger, selector, clubber, festivalero, purista o ecléctico.
- Usa el patrón de mixes y eventos para reforzar la lectura.

REGLAS:
- Háblale siempre de tú a tú.
- No digas "este usuario".
- No metas chistes fáciles ni copy promocional.
- No inventes favoritos concretos.
- Si faltan datos, no fuerces conclusiones.
- Quiero una lectura seria de gustos, no un texto comercial.
- Debes mencionar explícitamente subgéneros y épocas dominantes.

DATOS DEL PERFIL:
- Subgéneros favoritos: ${stylesStr}
- Países dominantes: ${countriesStr}
- Eras/décadas: ${erasStr}
- Categorías de artistas: ${catsStr}
- Perfil de mixes: ${mixStr}
- Décadas de sellos: ${labelDecadesStr || 'sin datos'}
- Eventos: ${stats.event_profile.festivals} festivales, ${stats.event_profile.club_nights} club nights
- Países de eventos: ${eventCountriesStr || 'sin datos'}
- Total de datos: ${stats.total_data_points} elementos

Responde EXACTAMENTE en este formato JSON:
{"archetype": "...", "text": "..."}`
    : `Analyze this breakbeat profile and write:

1. A short ARCHETYPE (2-4 words), precise and musically credible. Just the name, no explanation.

2. A 3-paragraph analysis addressed directly to the user, with a maximum of 900 characters total.

ANALYSIS GOALS:
- Explain which subgenres genuinely dominate their taste.
- Explain which decades carry the most weight and what that suggests.
- Interpret whether the profile feels more like a crate digger, selector, clubber, festival-goer, purist or eclectic listener.
- Use the mix and event patterns to support the reading.

RULES:
- Always speak directly to the user.
- Do not say "this user".
- No cheap jokes and no promotional copy.
- Do not invent specific favorites.
- If the data is thin, do not force conclusions.
- This must read like a serious taste analysis, not marketing text.
- You must explicitly mention dominant subgenres and eras.

PROFILE DATA:
- Favorite subgenres: ${stylesStr}
- Dominant countries: ${countriesStr}
- Eras/decades: ${erasStr}
- Artist categories: ${catsStr}
- Mix profile: ${mixStr}
- Label decades: ${labelDecadesStr || 'no data'}
- Events: ${stats.event_profile.festivals} festivals, ${stats.event_profile.club_nights} club nights
- Event countries: ${eventCountriesStr || 'no data'}
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
        max_tokens: 550,
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

  const text = isEs
    ? `Por tu selección se ve que te tira sobre todo el ${topStyle.replace(/_/g, ' ')} y que tu centro de gravedad está en los ${topEra}. Eso sugiere una escucha bastante definida, con referencias fuertes en ${cName.es || 'tu eje principal'}. También aparece un sesgo ${eventBias}${topMix ? ` y un consumo de mixes más cercano a ${topMix.replace(/_/g, ' ')}` : ''}. No suenas a oyente casual: con ${stats.total_data_points} datos y peso en ${topCat.replace(/_/g, ' ')}, tu perfil apunta más a criterio que a picoteo.`
    : `Your selection shows a clear pull toward ${topStyle.replace(/_/g, ' ')} and a center of gravity in the ${topEra}. That suggests a fairly defined listening profile, with strong references in ${cName.en || 'your main axis'}. There is also a ${eventBias} bias${topMix ? ` and a mix pattern closer to ${topMix.replace(/_/g, ' ')}` : ''}. You do not read like a casual listener: with ${stats.total_data_points} data points and weight in ${topCat.replace(/_/g, ' ')}, your profile points more to discernment than random browsing.`

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
        ? supabase.from('artists').select('styles, country, era, category').in('id', artistIds)
        : { data: [] },
      labelIds.length > 0
        ? supabase.from('labels').select('country, founded_year, is_active').in('id', labelIds)
        : { data: [] },
      eventIds.length > 0
        ? supabase.from('events').select('event_type, country, city, tags').in('id', eventIds)
        : { data: [] },
      mixIds.length > 0
        ? supabase.from('mixes').select('mix_type, year').in('id', mixIds)
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
