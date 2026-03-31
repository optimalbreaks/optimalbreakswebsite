-- Krafty Kuts — A Golden Era Of Breakbeat Podcast (Rhythmandbreaks / YouTube)
INSERT INTO public.mixes (
  slug,
  title,
  artist_name,
  description_en,
  description_es,
  mix_type,
  year,
  duration_minutes,
  platform,
  video_url,
  embed_url,
  is_featured
) VALUES (
  'krafty-kuts-golden-era-breakbeat-podcast',
  'Krafty Kuts — A Golden Era Of Breakbeat Podcast',
  'Krafty Kuts',
  'Breakbeat podcast with Krafty Kuts on the Rhythmandbreaks YouTube channel: a golden-era breaks perspective in long form.',
  'Podcast / sesión de breakbeat con Krafty Kuts en el canal Rhythmandbreaks (YouTube): mirada a la era dorada del breaks en formato largo.',
  'podcast',
  2018,
  NULL,
  'youtube',
  'https://youtu.be/9grBdczd89M',
  'https://youtu.be/9grBdczd89M',
  TRUE
)
ON CONFLICT (slug) DO UPDATE SET
  title = EXCLUDED.title,
  artist_name = EXCLUDED.artist_name,
  description_en = EXCLUDED.description_en,
  description_es = EXCLUDED.description_es,
  mix_type = EXCLUDED.mix_type,
  year = EXCLUDED.year,
  duration_minutes = EXCLUDED.duration_minutes,
  platform = EXCLUDED.platform,
  video_url = EXCLUDED.video_url,
  embed_url = EXCLUDED.embed_url,
  is_featured = EXCLUDED.is_featured;
