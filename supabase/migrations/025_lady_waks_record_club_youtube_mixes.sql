-- Lady Waks — Record Club / live (LadyWaksRadio, YouTube)
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
    'lady-waks-record-club-851-2025-09-19',
    'Lady Waks — Record Club #851 (19 Sept 2025)',
    'Lady Waks',
    'Record Club #851 with Lady Waks on LadyWaksRadio (19 September 2025). Long-form breaks selection from the flagship series.',
    'Record Club #851 con Lady Waks en LadyWaksRadio (19 de septiembre de 2025). Selección de breaks en formato largo de la serie insignia.',
    'radio_show',
    2025,
    NULL,
    'youtube',
    'https://youtu.be/XFCC7JNQsXQ',
    'https://youtu.be/XFCC7JNQsXQ',
    TRUE
  ),
  (
    'lady-waks-live-mix-november-2024',
    'Lady Waks — Live Mix (November 2024)',
    'Lady Waks',
    'Lady Waks live mix session published November 2024 (LadyWaksRadio).',
    'Sesión live mix de Lady Waks publicada en noviembre de 2024 (LadyWaksRadio).',
    'youtube_session',
    2024,
    NULL,
    'youtube',
    'https://youtu.be/vZt1FXu-3Ko',
    'https://youtu.be/vZt1FXu-3Ko',
    TRUE
  ),
  (
    'lady-waks-record-club-877-2026-03-27',
    'Lady Waks — Record Club #877 (27 Mar 2026)',
    'Lady Waks',
    'Record Club #877 with Lady Waks on LadyWaksRadio (27 March 2026).',
    'Record Club #877 con Lady Waks en LadyWaksRadio (27 de marzo de 2026).',
    'radio_show',
    2026,
    NULL,
    'youtube',
    'https://youtu.be/fIv94l1akAg',
    'https://youtu.be/fIv94l1akAg',
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
