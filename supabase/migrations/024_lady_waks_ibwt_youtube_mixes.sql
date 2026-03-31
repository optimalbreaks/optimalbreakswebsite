-- Lady Waks — IBWT / INPULSE (YouTube)
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
) VALUES
  (
    'lady-waks-live-ibwt-23rd-anniversary',
    'Lady Waks — Live @ IBWT 23rd Anniversary (Breaks & DnB)',
    'Lady Waks',
    'Lady Waks live set at the 23rd anniversary of In Beat We Trust (IBWT): breaks and drum & bass festival context (INPULSE Events).',
    'Set en vivo de Lady Waks en el 23.º aniversario de In Beat We Trust (IBWT): breaks y drum & bass (INPULSE Events).',
    'youtube_session',
    2023,
    NULL,
    'youtube',
    'https://youtu.be/cbQ0jDYeWA4',
    'https://youtu.be/cbQ0jDYeWA4',
    TRUE
  ),
  (
    'lady-waks-kingdom-of-bass-ibwt-2025',
    'Lady Waks — Kingdom of Bass @ IBWT (22 Feb 2025)',
    'Lady Waks',
    'Lady Waks at Kingdom of Bass, 22 February 2025 — In Beat We Trust / LadyWaksRadio.',
    'Lady Waks en Kingdom of Bass, 22 de febrero de 2025 — In Beat We Trust / LadyWaksRadio.',
    'youtube_session',
    2025,
    NULL,
    'youtube',
    'https://youtu.be/5JDwVfomx-Q',
    'https://youtu.be/5JDwVfomx-Q',
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
