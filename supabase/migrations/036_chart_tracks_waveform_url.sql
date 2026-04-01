ALTER TABLE public.chart_tracks
  ADD COLUMN IF NOT EXISTS waveform_url TEXT;
