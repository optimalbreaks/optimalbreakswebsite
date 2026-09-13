-- Audio completo alojado por Optimal Breaks en chart_featured_tracks
-- Permite que un artista ceda la pista entera para streaming gratuito en la web.
-- Nulo = solo preview de Beatport/Bandcamp; relleno = streaming completo.
ALTER TABLE public.chart_featured_tracks
  ADD COLUMN IF NOT EXISTS full_audio_url TEXT;

COMMENT ON COLUMN public.chart_featured_tracks.full_audio_url IS 'Audio completo alojado por Optimal Breaks (MP3/WebM). Nulo = solo preview de Beatport/Bandcamp. Cuando está relleno se muestra el badge "FULL AUDIO" y el player reproduce el tema entero.';
