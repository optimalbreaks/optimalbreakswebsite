-- =============================================
-- EVENTS — galería extra (horario, hoja de info, flyers secundarios)
-- El cartel de portada sigue en image_url (listados, OG, hero).
-- =============================================

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS gallery_urls TEXT[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.events.gallery_urls IS
  'Imágenes extra del evento (horario, hoja de información, flyers secundarios). El cartel de portada sigue en image_url.';

-- Apaño previo: socials.schedule_image / socials.horarios (p. ej. Floridance Fest).
UPDATE public.events
SET gallery_urls = (
  SELECT COALESCE(array_agg(u ORDER BY ord), '{}')
  FROM (
    SELECT DISTINCT ON (u) u, ord
    FROM (
      SELECT NULLIF(btrim(socials->>'schedule_image'), '') AS u, 1 AS ord
      UNION ALL
      SELECT NULLIF(btrim(socials->>'horarios'), ''), 2
    ) src
    WHERE u IS NOT NULL
    ORDER BY u, ord
  ) d
)
WHERE COALESCE(cardinality(gallery_urls), 0) = 0
  AND (
    COALESCE(btrim(socials->>'schedule_image'), '') <> ''
    OR COALESCE(btrim(socials->>'horarios'), '') <> ''
  );

-- Cartel de horarios ya en el repo, nunca cableado a la ficha.
UPDATE public.events
SET
  gallery_urls = CASE
    WHEN '/images/events/summer-festival-2026-horarios.webp' = ANY (gallery_urls)
      THEN gallery_urls
    ELSE array_append(gallery_urls, '/images/events/summer-festival-2026-horarios.webp')
  END,
  socials = CASE
    WHEN COALESCE(btrim(socials->>'schedule_image'), '') <> '' THEN socials
    ELSE socials || jsonb_build_object(
      'schedule_image',
      '/images/events/summer-festival-2026-horarios.webp'
    )
  END
WHERE slug = 'raveart-summer-2026';
