-- Lady Waks — live stream @ 16 Tons, Moscow (LadyWaksRadio / YouTube)
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
  'lady-waks-live-stream-16-tonns',
  'Lady Waks — Live Stream @ 16 Tons (Moscow)',
  'Lady Waks',
  'Lady Waks live stream from 16 Tons (16TONNS), Moscow — club session archived on LadyWaksRadio.',
  'Live stream de Lady Waks desde 16 Tons (16TONNS), Moscú — sesión de club archivada en LadyWaksRadio.',
  'youtube_session',
  2021,
  NULL,
  'youtube',
  'https://youtu.be/bXXZ8hslyKo',
  'https://youtu.be/bXXZ8hslyKo',
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
