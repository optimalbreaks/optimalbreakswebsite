-- =============================================
-- ORGANIZATIONS + RAVEART
-- =============================================

CREATE TABLE IF NOT EXISTS public.organizations (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  slug TEXT UNIQUE NOT NULL,
  name TEXT NOT NULL,
  country TEXT NOT NULL DEFAULT '',
  base_city TEXT,
  founded_year INTEGER,
  description_en TEXT NOT NULL DEFAULT '',
  description_es TEXT NOT NULL DEFAULT '',
  image_url TEXT,
  website TEXT,
  socials JSONB NOT NULL DEFAULT '{}'::jsonb,
  roles TEXT[] NOT NULL DEFAULT '{}',
  is_active BOOLEAN DEFAULT TRUE,
  is_featured BOOLEAN DEFAULT FALSE,
  CONSTRAINT organizations_roles_check CHECK (
    roles <@ ARRAY['label', 'promoter', 'booking', 'media', 'community']::TEXT[]
  )
);

CREATE INDEX IF NOT EXISTS idx_organizations_slug ON public.organizations(slug);
CREATE INDEX IF NOT EXISTS idx_organizations_roles ON public.organizations USING GIN(roles);

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'organizations'
      AND policyname = 'Public read organizations'
  ) THEN
    CREATE POLICY "Public read organizations"
      ON public.organizations
      FOR SELECT
      USING (true);
  END IF;
END $$;

ALTER TABLE public.labels
  ADD COLUMN IF NOT EXISTS organization_id UUID;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS promoter_organization_id UUID;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'labels_organization_id_fkey'
  ) THEN
    ALTER TABLE public.labels
      ADD CONSTRAINT labels_organization_id_fkey
      FOREIGN KEY (organization_id)
      REFERENCES public.organizations(id)
      ON DELETE SET NULL;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'events_promoter_organization_id_fkey'
  ) THEN
    ALTER TABLE public.events
      ADD CONSTRAINT events_promoter_organization_id_fkey
      FOREIGN KEY (promoter_organization_id)
      REFERENCES public.organizations(id)
      ON DELETE SET NULL;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_labels_organization_id ON public.labels(organization_id);
CREATE INDEX IF NOT EXISTS idx_events_promoter_organization_id ON public.events(promoter_organization_id);

INSERT INTO public.organizations (
  slug,
  name,
  country,
  base_city,
  founded_year,
  description_en,
  description_es,
  website,
  socials,
  roles,
  is_active,
  is_featured
) VALUES (
  'raveart',
  'Raveart',
  'Spain',
  'Seville',
  2002,
  'Andalusian organization focused on breakbeat and drum and bass culture. Over more than two decades it has built a recognizable ecosystem around festivals, bookings and label activity, with Summer and Winter editions that connect local scenes with international lineups.',
  'Organizacion andaluza centrada en la cultura breakbeat y drum and bass. En mas de dos decadas ha construido un ecosistema reconocible de festivales, booking y actividad discografica, con ediciones Summer y Winter que conectan la escena local con lineups internacionales.',
  'https://www.raveart.es/',
  jsonb_build_object(
    'records', 'https://www.raveart.es/records/',
    'tickets', 'https://www.raveart.es/entradas/',
    'instagram', 'https://www.instagram.com/raveartrecords/',
    'facebook', 'https://www.facebook.com/profile.php?id=100063636604015',
    'beatport', 'https://www.beatport.com/label/raveart-records/16251',
    'soundcloud', 'https://soundcloud.com/user-609516183'
  ),
  ARRAY['promoter', 'label']::TEXT[],
  TRUE,
  TRUE
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  country = EXCLUDED.country,
  base_city = EXCLUDED.base_city,
  founded_year = EXCLUDED.founded_year,
  description_en = EXCLUDED.description_en,
  description_es = EXCLUDED.description_es,
  website = EXCLUDED.website,
  socials = EXCLUDED.socials,
  roles = EXCLUDED.roles,
  is_active = EXCLUDED.is_active,
  is_featured = EXCLUDED.is_featured;

WITH raveart_org AS (
  SELECT id
  FROM public.organizations
  WHERE slug = 'raveart'
)
INSERT INTO public.labels (
  slug,
  name,
  country,
  founded_year,
  description_en,
  description_es,
  website,
  key_artists,
  key_releases,
  is_active,
  is_featured,
  organization_id
)
SELECT
  'raveart-records',
  'Raveart Records',
  'Spain',
  NULL,
  'Label arm of the Raveart universe. It extends the brand beyond events and into releases, social channels and digital platforms linked from the public Records section.',
  'Brazo discografico del universo Raveart. Lleva la marca mas alla de los eventos hacia lanzamientos, redes y plataformas digitales enlazadas desde su seccion publica de Records.',
  'https://www.raveart.es/records/',
  ARRAY[]::TEXT[],
  ARRAY[]::TEXT[],
  TRUE,
  TRUE,
  raveart_org.id
FROM raveart_org
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  country = EXCLUDED.country,
  founded_year = EXCLUDED.founded_year,
  description_en = EXCLUDED.description_en,
  description_es = EXCLUDED.description_es,
  website = EXCLUDED.website,
  key_artists = EXCLUDED.key_artists,
  key_releases = EXCLUDED.key_releases,
  is_active = EXCLUDED.is_active,
  is_featured = EXCLUDED.is_featured,
  organization_id = EXCLUDED.organization_id;

WITH raveart_org AS (
  SELECT id
  FROM public.organizations
  WHERE slug = 'raveart'
)
INSERT INTO public.events (
  slug,
  name,
  description_en,
  description_es,
  event_type,
  date_start,
  date_end,
  location,
  city,
  country,
  venue,
  website,
  lineup,
  is_featured,
  promoter_organization_id
)
SELECT
  source.slug,
  source.name,
  source.description_en,
  source.description_es,
  source.event_type,
  source.date_start,
  source.date_end,
  source.location,
  source.city,
  source.country,
  source.venue,
  source.website,
  source.lineup,
  source.is_featured,
  raveart_org.id
FROM raveart_org
CROSS JOIN (
  VALUES
    (
      'raveart-summer-festival-2019',
      'Raveart Summer Festival 2019',
      'A large summer gathering in Alcala de Guadaira that positioned Raveart as a national reference for breaks and drum and bass. Three stages, pool party and a broad mix of UK garage, breakbeat and DnB talent.',
      'Gran cita veraniega en Alcala de Guadaira que consolido a Raveart como referencia nacional del breaks y el drum and bass. Tres escenarios, pool party y una mezcla amplia de UK garage, breakbeat y DnB.',
      'past_iconic',
      DATE '2019-07-13',
      NULL::DATE,
      'Hacienda El Chaparrejo, Alcala de Guadaira, Seville',
      'Alcala de Guadaira',
      'Spain',
      'Hacienda El Chaparrejo',
      'https://houseandujar.com/2019/07/07/raveart-summer-festival-2019-sevilla-13-julio/',
      ARRAY['Deekline', 'Conducta', 'Freestylers', 'Soulecta', 'Huda Hudia', 'Colombo'],
      TRUE
    ),
    (
      'raveart-winter-festival-2020',
      'Raveart Winter Festival 2020',
      'Winter edition in Granada with fifteen hours of breakbeat and drum and bass across three stages. Pendulum DJ Set, Stanton Warriors and Freestylers shared a lineup that helped define Raveart''s large-format identity.',
      'Edicion invernal en Granada con quince horas de breakbeat y drum and bass repartidas en tres escenarios. Pendulum DJ Set, Stanton Warriors y Freestylers compartieron un cartel que ayudo a definir la identidad de gran formato de Raveart.',
      'past_iconic',
      DATE '2020-03-07',
      NULL::DATE,
      'Complejo Embrujo, Granada',
      'Granada',
      'Spain',
      'Complejo Embrujo',
      'https://houseandujar.com/2020/03/03/cartel-completo-winter-festival-2020-granada-7-marzo/',
      ARRAY['Pendulum DJ Set', 'The Prototypes', 'Audio', 'Macky Gee', 'The Upbeats', 'Stanton Warriors'],
      FALSE
    ),
    (
      'raveart-summer-festival-2022',
      'Raveart Summer Festival 2022',
      'Return of the summer flagship in Seville with four stages and a bill split between breaks and drum and bass. It reinforced Raveart''s post-pandemic comeback with Dimension, Deekline and a strong Andalusian backbone.',
      'Regreso del buque insignia veraniego en Sevilla con cuatro escenarios y un cartel repartido entre breaks y drum and bass. Reforzo la vuelta de Raveart tras la pandemia con Dimension, Deekline y una fuerte columna andaluza.',
      'past_iconic',
      DATE '2022-07-02',
      NULL::DATE,
      'Hacienda El Chaparrejo, Alcala de Guadaira, Seville',
      'Alcala de Guadaira',
      'Spain',
      'Hacienda El Chaparrejo',
      'https://houseandujar.com/2022/06/26/raveart-volvera-a-congregar-lo-mejor-del-breaks-y-del-dnb-en-su-summer-festival-2022/',
      ARRAY['Deekline', 'The Brainkiller', 'Colombo', 'Anuschka', 'Shade K', 'Dimension'],
      FALSE
    ),
    (
      'raveart-winter-festival-2023',
      'Raveart Winter Festival 2023',
      'Twentieth anniversary winter gathering promoted by Raveart in Granada. Four stages and a heavyweight breakbeat cast underscored its status as one of Andalusia''s core broken-beat institutions.',
      'Encuentro invernal del vigesimo aniversario promovido por Raveart en Granada. Cuatro escenarios y un cartel de peso en breakbeat subrayaron su estatus como una de las instituciones base del ritmo roto en Andalucia.',
      'past_iconic',
      DATE '2023-03-04',
      NULL::DATE,
      'Complejo Embrujo, Granada',
      'Granada',
      'Spain',
      'Complejo Embrujo',
      'https://houseandujar.com/2023/02/27/todo-listo-para-la-nueva-edicion-del-winter-festival-de-raveart/',
      ARRAY['Deekline', 'Stanton Warriors', 'Freestylers', 'Plump DJs', 'Krafty Kuts', 'Andy C'],
      FALSE
    ),
    (
      'raveart-summer-festival-2023',
      'Raveart Summer Festival 2023',
      'Summer Festival 2023 brought four stages and fifteen hours of music to Alcala de Guadaira. Raveart combined classic breaks names with contemporary drum and bass headliners such as Netsky, Mefjus and The Prototypes.',
      'Summer Festival 2023 llevo cuatro escenarios y quince horas de musica a Alcala de Guadaira. Raveart mezclo nombres clasicos del breaks con headliners contemporaneos de drum and bass como Netsky, Mefjus y The Prototypes.',
      'past_iconic',
      DATE '2023-07-01',
      NULL::DATE,
      'Hacienda El Chaparrejo, Alcala de Guadaira, Seville',
      'Alcala de Guadaira',
      'Spain',
      'Hacienda El Chaparrejo',
      'https://houseandujar.com/2023/06/30/raveart-vuelve-a-reunir-lo-mejor-del-dnb-y-del-breaks-en-su-summer-fest/',
      ARRAY['Stanton Warriors', 'Freestylers', 'Multiply', 'Plump DJs', 'Netsky', 'Deekline'],
      TRUE
    ),
    (
      'raveart-winter-festival-2024',
      'Raveart Winter Festival 2024',
      'The 2024 winter edition in Granada paired major DnB names such as Pendulum DJ Set and Kanine with a high-level breakbeat selection led by Distortionz, Ed 209 and Citybox.',
      'La edicion invernal de 2024 en Granada combino grandes nombres del DnB como Pendulum DJ Set y Kanine con una seleccion de breakbeat de alto nivel liderada por Distortionz, Ed 209 y Citybox.',
      'past_iconic',
      DATE '2024-03-02',
      NULL::DATE,
      'Complejo Embrujo, Granada',
      'Granada',
      'Spain',
      'Complejo Embrujo',
      'https://houseandujar.com/2024/01/09/presentado-el-cartel-del-winter-festival-de-raveart-2024/',
      ARRAY['Pendulum DJ Set', 'Kanine', 'Ed Solo', 'Basstripper', 'Distortionz', 'Ed 209'],
      FALSE
    ),
    (
      'raveart-summer-festival-2024',
      'Raveart Summer Festival 2024',
      'Summer Festival 2024 confirmed Seville once again as a Raveart stronghold. The lineup tied together established breakbeat figures like Stanton Warriors and Atomic Hooligan with a hard-hitting DnB bill.',
      'Summer Festival 2024 confirmo de nuevo a Sevilla como plaza fuerte de Raveart. El cartel unio figuras consolidadas del breakbeat como Stanton Warriors y Atomic Hooligan con una programacion potente de DnB.',
      'past_iconic',
      DATE '2024-06-29',
      NULL::DATE,
      'Hacienda El Chaparrejo, Alcala de Guadaira, Seville',
      'Alcala de Guadaira',
      'Spain',
      'Hacienda El Chaparrejo',
      'https://houseandujar.com/2024/06/11/summer-festival-by-raveart-presenta-su-lineup-de-2024/',
      ARRAY['The Upbeats', 'Upgrade', 'Annix', 'Burr Oak', 'Stanton Warriors', 'Atomic Hooligan'],
      TRUE
    ),
    (
      'raveart-winter-festival-2025',
      'Raveart Winter Festival 2025',
      'Winter Festival 2025 extended Raveart''s Granada cycle with a lineup balancing Pendulum DJ Set, General Levy and Deekline with national breakbeat and DnB names. It kept the brand''s winter chapter active at large scale.',
      'Winter Festival 2025 prolonga el ciclo granadino de Raveart con un cartel que equilibra Pendulum DJ Set, General Levy y Deekline con nombres nacionales del breakbeat y el DnB. Mantiene vivo el capitulo invernal de la marca a gran escala.',
      'past_iconic',
      DATE '2025-03-08',
      NULL::DATE,
      'Complejo Embrujo, Granada',
      'Granada',
      'Spain',
      'Complejo Embrujo',
      'https://houseandujar.com/2025/02/06/ya-hay-cartel-completo-para-el-winter-festival-de-raveart/',
      ARRAY['Pendulum DJ Set', 'General Levy', 'Deekline', 'Freestylers', 'Ondamike', 'Firestar Soundsystem'],
      FALSE
    ),
    (
      'raveart-summer-festival-2025',
      'Raveart Summer Festival 2025',
      'The twenty-third anniversary summer edition presented four stages in Alcala de Guadaira with breakbeat as the dominant language. Stanton Warriors, Freq Nasty, Ed209 and Black Sun Empire placed Raveart at the center of the Andalusian festival season.',
      'La edicion veraniega del vigesimo tercer aniversario presento cuatro escenarios en Alcala de Guadaira con el breakbeat como lenguaje dominante. Stanton Warriors, Freq Nasty, Ed209 y Black Sun Empire situaron a Raveart en el centro de la temporada andaluza de festivales.',
      'past_iconic',
      DATE '2025-07-05',
      NULL::DATE,
      'Hacienda El Chaparrejo, Alcala de Guadaira, Seville',
      'Alcala de Guadaira',
      'Spain',
      'Hacienda El Chaparrejo',
      'https://houseandujar.com/2025/06/21/breakbeat-y-drum-bass-relucen-en-el-cartel-del-summer-fest-de-raveart/',
      ARRAY['Stanton Warriors', 'Freq Nasty', 'Ed209', 'Plump DJs', 'The Push', 'Black Sun Empire'],
      TRUE
    ),
    (
      'raveart-summer-2026',
      'Raveart Summer Festival 2026',
      'XXIV Anniversary Summer Festival: Saturday 4 July 2026 at Hacienda El Chaparrejo in Alcala de Guadaira (Seville / Sevilla area). Official poster and updates on raveart.es.',
      'Summer Festival del XXIV Aniversario: sábado 4 de julio de 2026 en Hacienda El Chaparrejo, Alcala de Guadaira (Sevilla). Cartel e información en raveart.es.',
      'upcoming',
      DATE '2026-07-04',
      NULL::DATE,
      'Hacienda El Chaparrejo, Alcala de Guadaira, Seville',
      'Alcala de Guadaira',
      'Spain',
      'Hacienda El Chaparrejo',
      'https://www.raveart.es/',
      ARRAY[]::TEXT[],
      TRUE
    )
) AS source(
  slug,
  name,
  description_en,
  description_es,
  event_type,
  date_start,
  date_end,
  location,
  city,
  country,
  venue,
  website,
  lineup,
  is_featured
)
ON CONFLICT (slug) DO UPDATE SET
  name = EXCLUDED.name,
  description_en = EXCLUDED.description_en,
  description_es = EXCLUDED.description_es,
  event_type = EXCLUDED.event_type,
  date_start = EXCLUDED.date_start,
  date_end = EXCLUDED.date_end,
  location = EXCLUDED.location,
  city = EXCLUDED.city,
  country = EXCLUDED.country,
  venue = EXCLUDED.venue,
  website = EXCLUDED.website,
  lineup = EXCLUDED.lineup,
  is_featured = EXCLUDED.is_featured,
  promoter_organization_id = EXCLUDED.promoter_organization_id;
