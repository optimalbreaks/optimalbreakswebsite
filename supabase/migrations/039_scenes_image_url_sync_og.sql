-- Sincroniza image_url con la OG ya generada en Storage (el listado /es/scenes leía solo image_url → /public/images/scenes/…).
UPDATE public.scenes
SET image_url = og_image_url
WHERE og_image_url IS NOT NULL
  AND btrim(og_image_url) <> '';
