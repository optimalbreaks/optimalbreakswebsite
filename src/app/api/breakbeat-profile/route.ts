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

  const isEs = lang === 'es'
  const systemPrompt = isEs
    ? `Eres un crítico musical experto en breakbeat con personalidad, humor y nostalgia. Escribes para Optimal Breaks, un archivo cultural del breakbeat. Tu tarea es analizar los gustos del usuario y hablarle DIRECTAMENTE A ÉL en segunda persona ("tú eres", "veo que te gusta"). Tu tono es apasionado, cercano, de "colega", y con referencias culturales reales del breakbeat (artistas, sellos, raves, épocas). Nunca suenas genérico ni hablas de él en tercera persona.`
    : `You are an expert breakbeat music critic with personality, humor and nostalgia. You write for Optimal Breaks, a breakbeat cultural archive. Your task is to analyze the user's taste and speak DIRECTLY TO THEM in the second person ("you are", "I see you like"). Your tone is passionate, warm, "mate-like", and full of real breakbeat cultural references (artists, labels, raves, eras). Never sound generic or talk about them in the third person.`

  const userPrompt = isEs
    ? `Analiza este perfil breakbeatero y escribe:

1. Un ARQUETIPO corto (3-5 palabras máximo, ej: "Purista del Nu Skool", "Arqueólogo del Florida Breaks", "Animal del Bassline", "Ecléctico sin remedio"). Solo el nombre, sin explicación.

2. Un análisis de 3-4 párrafos cortos (máx 600 caracteres total) dirigiéndote directamente al usuario ("Tú eres...", "Por tus datos veo que..."). Describe su personalidad breakbeatera basándote en los datos. Sé específico con las referencias (inventa qué artistas o sellos concretos encajan con esos datos). Incluye algo de humor. ¡No hables de "este usuario"! Habla con él.

DATOS DEL PERFIL:
- Subgéneros favoritos: ${stylesStr}
- Países dominantes: ${countriesStr}
- Eras/décadas: ${erasStr}
- Categorías de artistas: ${catsStr}
- Perfil de mixes: ${mixStr}
- Eventos: ${stats.event_profile.festivals} festivales, ${stats.event_profile.club_nights} club nights
- Total de datos: ${stats.total_data_points} elementos

Responde EXACTAMENTE en este formato JSON:
{"archetype": "...", "text": "..."}`
    : `Analyze this breakbeat profile and write:

1. A short ARCHETYPE (3-5 words max, e.g.: "Nu Skool Purist", "Florida Breaks Archaeologist", "Bassline Animal", "Hopeless Eclectic"). Just the name, no explanation.

2. A 3-4 short paragraph analysis (max 600 chars total) talking DIRECTLY to the user ("You are...", "I see from your profile that..."). Describe their breakbeat personality based on the data. Be specific with references (invent which real artists or labels fit that data). Include some humor. Do not talk about "this user", talk to them!

PROFILE DATA:
- Favorite subgenres: ${stylesStr}
- Dominant countries: ${countriesStr}
- Eras/decades: ${erasStr}
- Artist categories: ${catsStr}
- Mix profile: ${mixStr}
- Events: ${stats.event_profile.festivals} festivals, ${stats.event_profile.club_nights} club nights
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
        temperature: 0.85,
        max_tokens: 500,
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
    ? `Tu ADN breakbeatero tiene un sello inconfundible: ${topStyle.replace(/_/g, ' ')} con raíces en ${cName.es}. Tus gustos se mueven sobre todo por la era de los ${topEra}, y eso dice mucho de ti. Con ${stats.total_data_points} datos en tu perfil, está claro que no eres un oyente casual — esto va en serio.`
    : `Your breakbeat DNA has an unmistakable stamp: ${topStyle.replace(/_/g, ' ')} with roots in ${cName.en}. Your taste gravitates around the ${topEra} era, and that says a lot about you. With ${stats.total_data_points} data points in your profile, you're clearly not a casual listener — this is serious business.`

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
