-- Preview + metadatos opcionales (todo manual en JSON)
ALTER TABLE public.chart_featured_tracks
  ADD COLUMN IF NOT EXISTS mix_name TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS bpm SMALLINT,
  ADD COLUMN IF NOT EXISTS music_key TEXT NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS sample_url TEXT;

COMMENT ON COLUMN public.chart_featured_tracks.sample_url IS 'URL de audio para preview en página: idealmente geo-samples.beatport.com (pasa por /api/audio-proxy). Otras URLs se intentan en directo.';
