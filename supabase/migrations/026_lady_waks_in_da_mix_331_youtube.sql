-- Lady Waks — In Da Mix #331 (2015), YouTube archive (LadyWaksRadio)
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
  'lady-waks-in-da-mix-331-2015-05-19',
  'Lady Waks — In Da Mix #331 (19 May 2015) feat. Quest & Lexani',
  'Lady Waks',
  'In Da Mix #331 from 19 May 2015 on LadyWaksRadio, with special guests Quest and Lexani — classic episode from the long-running breaks radio series.',
  'In Da Mix #331 del 19 de mayo de 2015 en LadyWaksRadio, con invitados Quest y Lexani — episodio clásico de la serie de radio breaks.',
  'radio_show',
  2015,
  NULL,
  'youtube',
  'https://youtu.be/ks9DOyVrxcA',
  'https://youtu.be/ks9DOyVrxcA',
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
