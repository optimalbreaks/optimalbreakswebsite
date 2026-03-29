-- Carteles en repositorio: public/images/events/
-- image_url como ruta absoluta del sitio (/images/...); SEO la resuelve con SITE_URL.

UPDATE public.events
SET image_url = '/images/events/raveart_retro_hallowen_2025.jpeg'
WHERE slug = 'raveart-retro-halloween-2025';

WITH raveart_org AS (
  SELECT id FROM public.organizations WHERE slug = 'raveart' LIMIT 1
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
  image_url,
  lineup,
  is_featured,
  promoter_organization_id
)
SELECT
  'raveart-winter-festival-2026',
  'Raveart Winter Festival 2026',
  'Winter Festival 2026 (Saturday 14 March) at Complejo Embrujo (Las Gabias, Granada area): four areas (Winter, 24 Aniversario, Raveart Records, Mass Bass). Poster and final details on Raveart channels.',
  'Winter Festival 2026 (sábado 14 de marzo) en Complejo Embrujo (Las Gabias, area de Granada): cuatro areas (Winter, 24 Aniversario, Raveart Records, Mass Bass). Cartel y detalles en canales de Raveart.',
  'past_iconic',
  DATE '2026-03-14',
  NULL::DATE,
  'Complejo Embrujo, Las Gabias, Granada',
  'Las Gabias',
  'Spain',
  'Complejo Embrujo',
  'https://www.raveart.es/',
  '/images/events/raveart_winter_2026.jpeg',
  ARRAY[]::TEXT[],
  TRUE,
  raveart_org.id
FROM raveart_org
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
  image_url = EXCLUDED.image_url,
  lineup = EXCLUDED.lineup,
  is_featured = EXCLUDED.is_featured,
  promoter_organization_id = EXCLUDED.promoter_organization_id;
