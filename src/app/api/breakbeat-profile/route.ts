import { NextRequest, NextResponse } from 'next/server'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'
import type { BreakbeatProfileStats } from '@/types/database'

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
}

type LabelProfileInput = {
  name: string
  country: string
  founded_year: number | null
  is_active: boolean
}

type EventProfileInput = {
  name: string
  event_type: string
  country: string
  city: string
  tags: string[]
}

type MixProfileInput = {
  title: string
  mix_type: string
  year: number | null
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
  if (normalized.length < 1400) return false
  const paragraphs = normalized.split(/\n\s*\n/).filter(Boolean)
  return paragraphs.length >= 4
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

  const sceneHints = inferSceneHints({
    topStyles,
    topCountries,
    eraDistribution,
    categoryBreakdown: catCounts,
  })

  return {
    top_styles: topStyles,
    top_countries: topCountries,
    era_distribution: eraDistribution,
    category_breakdown: catCounts,
    event_profile: { festivals, club_nights: clubNights, countries: Array.from(eventCountries) },
    mix_taste: mixTaste,
    label_decades: labelDecades,
    total_data_points: artists.length + labels.length + events.length + mixes.length,
    sample_artists: takeUniqueNonEmpty(artists.map((a) => a.name), 6),
    sample_labels: takeUniqueNonEmpty(labels.map((l) => l.name), 5),
    sample_events: takeUniqueNonEmpty(events.map((e) => e.name), 4),
    sample_mixes: takeUniqueNonEmpty(mixes.map((m) => m.title), 4),
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
  const sceneHintsStr = stats.scene_hints?.join(' | ') || ''

  const isEs = lang === 'es'
  const systemPrompt = isEs
    ? `Eres un analista experto en cultura breakbeat para Optimal Breaks. Interpretas gustos musicales con criterio real de escena, precisión y lenguaje claro. Hablas directamente al usuario en segunda persona. Tu tono es cercano pero analítico: nada promocional, nada grandilocuente, nada genérico. Prioriza patrones observables sobre adornos. Conecta subgéneros, épocas, geografías y lógicas de escena. Si el contexto incluye nombres concretos de artistas, sellos, eventos o mixes, puedes citarlos como ejemplos del gusto del usuario; si no aparecen en los datos, no los inventes. Si haces una inferencia, debe ser prudente y razonable.`
    : `You are an expert analyst of breakbeat culture for Optimal Breaks. You interpret musical taste with real scene knowledge, precision and clear language. Speak directly to the user in the second person. Your tone is warm but analytical: never promotional, never overblown, never generic. Connect subgenres, eras, geographies and scene logic. If the context includes concrete artist, label, event or mix names, you may cite them as examples of the user's taste; if they are not in the data, do not invent them. Any inference must be cautious and reasonable.`

  const userPrompt = isEs
    ? `Analiza este perfil breakbeatero y escribe:

1. Un ARQUETIPO corto (2-4 palabras), preciso y musicalmente creíble. Solo el nombre, sin explicación.

2. Un análisis largo, dirigido al usuario, de 5 a 7 párrafos. No escatimes en longitud: apunta normalmente a 1400-2600 caracteres y, si los datos dan para más, puedes extenderte.

OBJETIVO DEL ANÁLISIS:
- Explica qué subgéneros dominan realmente su gusto.
- Explica qué décadas pesan más y qué sugiere eso sobre su escucha.
- Interpreta si su perfil apunta más a crate digger, selector, clubber, festivalero, purista o ecléctico.
- Usa el patrón de mixes y eventos para reforzar la lectura.
- Conecta el gusto con escenas o continuidades breakbeat reconocibles cuando los datos lo permitan.
- Si hay nombres concretos en los datos, menciona algunos como ejemplos y no te quedes en abstracciones.
- Traza una lectura temporal: de dónde parece venir ese gusto, cuáles podrían ser sus raíces y hacia qué mutaciones del breakbeat o bass se proyecta.
- Habla del papel de artistas, sellos, escenas locales, circuitos de club, radio o cultura rave si aparecen respaldados por los datos.

REGLAS:
- Háblale siempre de tú a tú.
- No digas "este usuario".
- No metas chistes fáciles ni copy promocional.
- No inventes favoritos concretos ni escenas si no están respaldados por los datos.
- Si faltan datos, no fuerces conclusiones.
- Quiero una lectura seria de gustos, no un texto comercial.
- Debes mencionar explícitamente subgéneros y épocas dominantes.
- Debes mencionar al menos una escena, geografía o continuidad cultural si el perfil da pie a ello.
- Debes mencionar artistas, sellos, eventos o mixes concretos varias veces cuando existan datos.
- Estructura la lectura con progresión histórica: origen o raíz, desarrollo, evolución y situación actual del gusto.
- No entregues un texto corto o vago: si no llegas a 1400 caracteres, la respuesta es inválida.
- No pongas un máximo práctico de longitud si el contexto es rico.

DATOS DEL PERFIL:
- Subgéneros favoritos: ${stylesStr}
- Países dominantes: ${countriesStr}
- Eras/décadas: ${erasStr}
- Categorías de artistas: ${catsStr}
- Perfil de mixes: ${mixStr}
- Décadas de sellos: ${labelDecadesStr || 'sin datos'}
- Eventos: ${stats.event_profile.festivals} festivales, ${stats.event_profile.club_nights} club nights
- Países de eventos: ${eventCountriesStr || 'sin datos'}
- Artistas guardados o favoritos (muestra): ${sampleArtistsStr || 'sin datos'}
- Sellos guardados o favoritos (muestra): ${sampleLabelsStr || 'sin datos'}
- Eventos guardados/asistencias (muestra): ${sampleEventsStr || 'sin datos'}
- Mixes guardados (muestra): ${sampleMixesStr || 'sin datos'}
- Pistas de escena inferibles desde los datos: ${sceneHintsStr || 'sin datos suficientes'}
- Total de datos: ${stats.total_data_points} elementos

Responde EXACTAMENTE en este formato JSON:
{"archetype": "...", "text": "..."}`
    : `Analyze this breakbeat profile and write:

1. A short ARCHETYPE (2-4 words), precise and musically credible. Just the name, no explanation.

2. A long analysis addressed directly to the user, in 5 to 7 paragraphs. Do not be afraid of length: normally aim for 1400-2600 characters and, if the data supports it, you may go longer.

ANALYSIS GOALS:
- Explain which subgenres genuinely dominate their taste.
- Explain which decades carry the most weight and what that suggests.
- Interpret whether the profile feels more like a crate digger, selector, clubber, festival-goer, purist or eclectic listener.
- Use the mix and event patterns to support the reading.
- Connect the taste to recognizable breakbeat scenes or continuities whenever the data supports it.
- If concrete names are available, mention some of them as examples instead of staying abstract.
- Build a temporal reading: where that taste seems to come from, what its roots are, and which later breakbeat or bass mutations it points toward.
- Discuss the role of artists, labels, local scenes, club circuits, radio culture or rave culture whenever the data supports it.

RULES:
- Always speak directly to the user.
- Do not say "this user".
- No cheap jokes and no promotional copy.
- Do not invent specific favorites or scenes not supported by the data.
- If the data is thin, do not force conclusions.
- This must read like a serious taste analysis, not marketing text.
- You must explicitly mention dominant subgenres and eras.
- You must mention at least one scene, geography or cultural continuity when the profile supports it.
- You must mention artists, labels, events or mixes by name several times when data exists.
- Structure the reading historically: origin or roots, development, evolution and current profile.
- Do not return a short or vague text: if it is below 1400 characters, it is invalid.
- Do not impose a practical upper limit when the context is rich.

PROFILE DATA:
- Favorite subgenres: ${stylesStr}
- Dominant countries: ${countriesStr}
- Eras/decades: ${erasStr}
- Artist categories: ${catsStr}
- Mix profile: ${mixStr}
- Label decades: ${labelDecadesStr || 'no data'}
- Events: ${stats.event_profile.festivals} festivals, ${stats.event_profile.club_nights} club nights
- Event countries: ${eventCountriesStr || 'no data'}
- Saved/favorite artists (sample): ${sampleArtistsStr || 'no data'}
- Saved/favorite labels (sample): ${sampleLabelsStr || 'no data'}
- Saved/attended events (sample): ${sampleEventsStr || 'no data'}
- Saved mixes (sample): ${sampleMixesStr || 'no data'}
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
    .map(([era]) => era)
    .join(', ')
  const sampleArtists = stats.sample_artists?.slice(0, 3).join(', ') || ''
  const sampleLabels = stats.sample_labels?.slice(0, 2).join(', ') || ''
  const sampleEvents = stats.sample_events?.slice(0, 2).join(', ') || ''
  const sampleMixes = stats.sample_mixes?.slice(0, 2).join(', ') || ''
  const sceneHints = stats.scene_hints?.slice(0, 2).join(isEs ? '; ' : '; ') || ''
  const mixLabel = topMix ? topMix.replace(/_/g, ' ') : (isEs ? 'sesiones guardadas' : 'saved mixes')
  const categoryLabel = topCat ? topCat.replace(/_/g, ' ') : (isEs ? 'artistas' : 'artists')

  const text = isEs
    ? `Lo primero que se ve en tu ADN breakbeatero es un eje muy claro entre ${topStyles || topStyle.replace(/_/g, ' ')}. No suena a gusto aleatorio ni a escucha superficial: hay un centro de gravedad reconocible en los ${topEras || topEra}, con bastante peso de ${cName.es || 'tu geografía principal'}, así que tu perfil parece construido desde referencias de escena más que desde hits sueltos. Tu escucha parece empezar en una base histórica bastante reconocible y luego abrirse a derivaciones posteriores sin perder del todo el hilo del breakbeat.\n\nEso importa porque no estás marcando solo géneros, sino una trayectoria. Si te tiran esos estilos y décadas, no solo buscas pegada: también te interesa cómo evolucionan los breaks, cómo cambia la relación entre batería rota y bajo, y cómo una misma lógica pasa del rave, el electro o el big beat a formas más modernas de bass music. ${sceneHints ? `Aquí asoman pistas bastante claras de ${sceneHints}.` : 'Aunque el mapa no sea cerradísimo, sí hay una lógica de escena reconocible detrás de tu selección.'}\n\nCuando aparecen nombres concretos como ${sampleArtists || 'tus artistas guardados'}, ${sampleLabels ? `junto a sellos como ${sampleLabels}` : 'más el peso de tus sellos favoritos'}, tu perfil deja de ser abstracto y empieza a contar una historia. Ahí es donde se ve mejor el origen del gusto: artistas, catálogos y escenas que funcionan como anclas, no como referencias sueltas. ${sampleMixes ? `Si además guardas mixes como ${sampleMixes},` : 'Si además tus mixes guardados pesan de verdad,'} la lectura se vuelve todavía más clara, porque confirma que no te interesa solo el tema individual sino también el relato que construye un selector.\n\n${sampleEvents ? `La presencia de eventos como ${sampleEvents}` : 'Incluso si la huella de eventos es más ligera'} ayuda a medir cómo se proyecta ese gusto hacia la pista y hacia la cultura viva. Según el equilibrio entre festivales y club nights, no pareces tanto un oyente pasivo como alguien que distingue contextos: qué suena mejor en club, qué conecta con una tradición rave más amplia y qué funciona como actualización contemporánea de esa memoria.\n\nPor mezcla general, te acercas más a un perfil ${eventBias}${topMix ? ` con atención real a ${mixLabel}` : ''}, probablemente entre selector y digger, pero sin cerrar la puerta a lo ecléctico. Con ${stats.total_data_points} datos y peso en ${categoryLabel}, tu gusto parece apoyarse tanto en los orígenes como en la evolución del breakbeat: hay raíces, hay desarrollo, hay mutaciones y hay una búsqueda bastante consciente de identidad sonora.`
    : `The first thing your breakbeat DNA shows is a very clear axis between ${topStyles || topStyle.replace(/_/g, ' ')}. This does not read as random taste or shallow browsing: there is a recognizable center of gravity in the ${topEras || topEra}, with plenty of weight from ${cName.en || 'your main geography'}, so your profile feels built from scene references rather than isolated hits. Your listening seems to begin from a fairly recognizable historical base and then open up to later mutations without losing the thread of breakbeat itself.\n\nThat matters because you are not only picking genres, but tracing a trajectory. If those styles and decades dominate your profile, you are not only after impact: you also seem drawn to how breaks evolve, how the relationship between broken rhythm and bass pressure shifts over time, and how one logic can move from rave, electro or big beat into more modern bass mutations. ${sceneHints ? `There are fairly clear signs here of ${sceneHints}.` : 'Even if the map is not totally closed, there is still a recognizable scene logic behind your picks.'}\n\nWhen concrete names such as ${sampleArtists || 'your saved artists'} appear${sampleLabels ? `, together with labels like ${sampleLabels}` : ''}, the profile stops feeling abstract and starts telling a story. That is where the roots of the taste become visible: artists, catalogues and scenes acting as anchors rather than scattered references. ${sampleMixes ? `If you also save mixes like ${sampleMixes},` : 'If saved mixes also carry real weight,'} the reading becomes even clearer, because it shows you care not only about individual tracks but also about the arc a selector builds.\n\n${sampleEvents ? `The presence of events like ${sampleEvents}` : 'Even if event data is lighter'} helps measure how that taste projects onto the dancefloor and into living culture. Depending on the balance between festivals and club nights, you do not read like a passive listener so much as someone who distinguishes contexts: what works in clubs, what connects to a broader rave tradition, and what feels like a contemporary update of that memory.\n\nOverall, you lean toward a ${eventBias} profile${topMix ? ` with real attention to ${mixLabel}` : ''}, probably somewhere between selector and digger without losing an eclectic side. With ${stats.total_data_points} data points and strong weight in ${categoryLabel}, your taste seems grounded in both the origins and the evolution of breakbeat: there are roots, there is development, there are mutations, and there is a fairly conscious search for sonic identity.`

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
        ? supabase.from('artists').select('name, styles, country, era, category').in('id', artistIds)
        : { data: [] },
      labelIds.length > 0
        ? supabase.from('labels').select('name, country, founded_year, is_active').in('id', labelIds)
        : { data: [] },
      eventIds.length > 0
        ? supabase.from('events').select('name, event_type, country, city, tags').in('id', eventIds)
        : { data: [] },
      mixIds.length > 0
        ? supabase.from('mixes').select('title, mix_type, year').in('id', mixIds)
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
