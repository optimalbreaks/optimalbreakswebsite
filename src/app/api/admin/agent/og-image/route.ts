import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/admin-auth'
import { createServiceSupabase } from '@/lib/supabase-admin'

const TABLES = ['artists', 'events', 'labels', 'scenes', 'blog_posts'] as const
type OgTable = (typeof TABLES)[number]

const MAX_PROMPT = 4000
const OG_SIZE = '1536x1024'

const SCENE_IMAGE_SUFFIX =
  ' Formato panorámico 16:9, fotografía hiperrealista editorial, nitidez alta, sin texto legible ni logotipos ni marcas de agua. Personas solo anónimas, lejanas, de espaldas o desenfocadas. Evita subexponer: debe haber detalle en sombras. Sin collage gráfico, sin tipografía, sin pósters legibles.'

const SCENE_VISUAL_BY_SLUG: Record<string, string> = {
  'uk-breakbeat': `Sujeto:
Interior de warehouse rave británico o club underground londinense: stacks de sound system, humo ligero, luces láser cyan y magenta, vigas industriales, sensación de rave UK 1990s–2000s sin iconos turísticos obvios.

Ambiente y detalle:
Vinilos y fundas genéricas fuera de foco, cableado, atmósfera de Fabric/Camden/pirate radio — cultura soundsystem y breakbeat hardcore.`,
  'us-breaks': `Sujeto:
Club nocturno de Florida o costa oeste estadounidense: neón cálido, palmeras borrosas al fondo, energía electro-breaks y bass rave americana, sensación Orlando/Miami/Tampa sin carteles legibles.

Ambiente y detalle:
Luces de festival regional, bocinas potentes, ambiente húmedo nocturno típico de breaks estadounidenses.`,
  'andalusian-breakbeat': `Sujeto:
Noche andaluza en recinto multitudinario o plaza adaptada a sesión: calor mediterráneo, luces cálidas ámbar y rojo, multitud joven anónima de espaldas, sensación de fenómeno de masas Sevilla/Málaga/Cádiz 1992–2002.

Ambiente y detalle:
Arquitectura española borrosa al fondo, energía de radio club y cultura juvenil andaluza del breakbeat sin referencias a tragedias concretas.`,
  'australian-breaks': `Sujeto:
Festival o club australiano de breaks: estructura industrial al aire libre o hangar, luz crepuscular, sensación Perth/Melbourne/Sydney, Breakfest y escena persistente post-2001.

Ambiente y detalle:
Polvo en el aire, rig de luces robusto, mezcla entre paisaje oceánico distante y cultura de club australiana.`,
  'russian-eastern-europe': `Sujeto:
Warehouse o club de Moscú/San Petersburgo: arquitectura industrial soviética desenfocada, interior frío con contraste cálido de luces de pista, escena breaks ruso-oriental 2000s–presente.

Ambiente y detalle:
Radio club, comunidad online y festival dedicado sugeridos por equipamiento y multitud anónima, sin banderas ni símbolos políticos legibles.`,
  'latin-america-breaks': `Sujeto:
Rooftop o club latinoamericano nocturno (Ciudad de México, Bogotá o Buenos Aires sugeridos de forma genérica): luces vibrantes, mezcla digital-era y cultura de club local, escena emergente 2010s–presente.

Ambiente y detalle:
Laptop y mesa de mezclas en penumbra, skyline urbano latino desenfocado, conexión global con sonidos UK bass/breaks.`,
}

function buildSceneImagePrompt(row: Record<string, unknown>): string {
  const nameEn = (row.name_en || row.name_es || 'Scene') as string
  const country = (row.country || '') as string
  const region = (row.region || '') as string
  const era = (row.era || '') as string
  const slug = (row.slug || '') as string
  const place = [region, country].filter(Boolean).join(', ')
  const visual =
    SCENE_VISUAL_BY_SLUG[slug] ||
    `Sujeto:
Escena nocturna de club breakbeat en ${place || 'un territorio concreto'}, atmósfera auténtica de cultura de pista y memoria local.

Ambiente y detalle:
Luces de cabina, humo ligero, equipo de DJ anónimo, multitud desenfocada de espaldas.`

  return `Imagen fotográfica hiperrealista de calidad editorial para la escena territorial de breakbeat "${nameEn}"${place ? ` (${place})` : ''}${era ? `, era ${era}` : ''}.

${visual}

Encuadre y composición:
Plano amplio cinematográfico 16:9, profundidad de campo selectiva, composición equilibrada para tarjeta editorial web de archivo musical.

Iluminación y color:
Iluminación documental de nightlife con contraste realista y color grading cinematográfico acorde al territorio.

Estilo:
Fotoperiodismo musical, hiperrealismo editorial, sensación de cultura de club, archivo vivo y memoria de escena.${SCENE_IMAGE_SUFFIX}`
}

const SELECT: Record<OgTable, string> = {
  artists: 'slug, name, name_display, country, styles, era, og_image_url',
  events: 'slug, name, city, country, venue, event_type, date_start, og_image_url',
  labels: 'slug, name, country, founded_year, og_image_url',
  scenes: 'slug, name_en, name_es, country, region, era, og_image_url',
  blog_posts: 'slug, title_en, title_es, category, og_image_url',
}

function buildPrompt(table: OgTable, row: Record<string, unknown>): string {
  const site = 'OPTIMAL BREAKS'
  const url = 'www.optimalbreaks.com'
  const palette = 'cream/beige (#e8dcc8) background, deep black (#1a1a1a), vivid red (#d62828), optional cyan (#00b4d8) or yellow (#f0c808)'
  const base = `Style: Bold neo-brutalist editorial, raw punk zine aesthetic. Palette: ${palette}. Add "${site}" small bottom-left, "${url}" bottom-right. No photographs of real people. Bold typography only.`

  switch (table) {
    case 'artists': {
      const name = (row.name_display || row.name) as string
      const styles = ((row.styles as string[]) || []).join(', ') || 'breakbeat'
      return `Create a 1200×630 social media preview for breakbeat artist "${name}". ${name} as dominant text. Visual refs: ${styles}, era ${row.era || '?'}, origin ${row.country || '?'}. Vinyl record motifs, turntable elements. ${base}`
    }
    case 'events': {
      const loc = [row.venue, row.city, row.country].filter(Boolean).join(', ')
      return `Create a 1200×630 gig poster social preview for breakbeat event "${row.name}". Event name as bold headline. Location: ${loc}. Type: ${row.event_type}. Sound system motifs, warehouse vibes. ${base}`
    }
    case 'labels': {
      return `Create a 1200×630 social preview for breakbeat record label "${row.name}". Label name as dominant element. Origin: ${row.country || '?'}${row.founded_year ? `, est. ${row.founded_year}` : ''}. Vinyl stacks, press stamps. ${base}`
    }
    case 'scenes': {
      return buildSceneImagePrompt(row)
    }
    case 'blog_posts': {
      const title = (row.title_en || row.title_es) as string
      return `Create a 1200×630 editorial social preview for article "${title}". Title as magazine-style headline. Category: ${row.category || 'article'}. Zine culture, collage. ${base}`
    }
  }
}

async function generateAndUpload(
  table: OgTable,
  slug: string,
  prompt: string,
): Promise<string> {
  const openaiKey = process.env.OPENAI_API_KEY?.trim()
  if (!openaiKey) throw new Error('OPENAI_API_KEY no configurada')

  const model = process.env.OG_IMAGE_MODEL?.trim() || 'gpt-image-2'

  const genRes = await fetch('https://api.openai.com/v1/images/generations', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${openaiKey}`,
    },
    body: JSON.stringify({
      model,
      prompt: prompt.slice(0, MAX_PROMPT),
      size: OG_SIZE,
      quality: 'medium',
      output_format: 'png',
      n: 1,
    }),
  })

  if (!genRes.ok) {
    const errText = await genRes.text()
    throw new Error(`OpenAI ${genRes.status}: ${errText}`)
  }

  const genData = await genRes.json()
  const b64: string | undefined = genData.data?.[0]?.b64_json
  if (!b64) throw new Error('OpenAI devolvió respuesta sin imagen')

  const buf = Buffer.from(b64, 'base64')
  const objectPath = `og/${table}/${slug}.png`
  const sb = createServiceSupabase()

  const { error: upErr } = await sb.storage.from('media').upload(objectPath, buf, {
    contentType: 'image/png',
    upsert: true,
  })
  if (upErr) throw new Error(`Storage: ${upErr.message}`)

  const base = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()?.replace(/\/$/, '')
  return `${base}/storage/v1/object/public/media/${objectPath}`
}

/**
 * GET /api/admin/agent/og-image?table=artists&queue=missing
 * Lista entidades sin og_image_url.
 */
export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const table = request.nextUrl.searchParams.get('table') as OgTable | null
  if (!table || !TABLES.includes(table)) {
    return NextResponse.json(
      { error: `table requerido: ${TABLES.join(', ')}` },
      { status: 400 },
    )
  }

  const sb = createServiceSupabase()
  const { data, error } = await sb
    .from(table)
    .select('slug, name' + (table === 'blog_posts' ? ', title_en' : '') + (table === 'scenes' ? ', name_en' : ''))
    .is('og_image_url', null)
    .limit(200)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  const items = (data || []).map((r) => {
    const row = r as unknown as Record<string, unknown>
    return {
      slug: row.slug,
      name: row.name || row.title_en || row.name_en,
    }
  })

  return NextResponse.json({ table, missing: items.length, items })
}

/**
 * POST /api/admin/agent/og-image
 * { table, slug, force? } → OpenAI generate → Storage → UPDATE og_image_url
 */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request)
  if (!auth.ok) return auth.response

  const body = await request.json()
  const { table, slug, force } = body as {
    table?: string
    slug?: string
    force?: boolean
  }

  if (!table || !TABLES.includes(table as OgTable)) {
    return NextResponse.json(
      { error: `table inválido: ${TABLES.join(', ')}` },
      { status: 400 },
    )
  }
  if (!slug) {
    return NextResponse.json({ error: 'slug requerido' }, { status: 400 })
  }

  const tbl = table as OgTable
  const sb = createServiceSupabase()

  const { data: row, error: fetchErr } = await sb
    .from(tbl)
    .select(SELECT[tbl])
    .eq('slug', slug)
    .maybeSingle()

  if (fetchErr) return NextResponse.json({ error: fetchErr.message }, { status: 500 })
  if (!row) return NextResponse.json({ error: `No existe ${tbl}/${slug}` }, { status: 404 })

  const rowRecord = row as unknown as Record<string, unknown>
  const existing = rowRecord.og_image_url as string | null
  if (existing && !force) {
    return NextResponse.json({
      slug,
      og_image_url: existing,
      skipped: true,
      message: 'Ya tiene og_image_url (usa force: true para regenerar)',
    })
  }

  const prompt = buildPrompt(tbl, rowRecord)

  let publicUrl: string
  try {
    publicUrl = await generateAndUpload(tbl, slug, prompt)
  } catch (e) {
    return NextResponse.json(
      { error: `Generación: ${e instanceof Error ? e.message : e}` },
      { status: 502 },
    )
  }

  const updateRow =
    tbl === 'scenes'
      ? { og_image_url: publicUrl, image_url: publicUrl }
      : { og_image_url: publicUrl }

  const { error: dbErr } = await sb.from(tbl).update(updateRow).eq('slug', slug)

  return NextResponse.json({
    slug,
    og_image_url: publicUrl,
    ...(tbl === 'scenes' ? { image_url: publicUrl } : {}),
    saved: !dbErr,
    dbError: dbErr?.message,
    promptLength: prompt.length,
  })
}
