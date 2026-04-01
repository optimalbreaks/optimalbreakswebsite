-- ============================================
-- OPTIMAL BREAKS — 40 Breaks Vitales (chart semanal)
-- Dos tablas: chart_editions (una por semana) y chart_tracks (40 tracks por edición)
-- ============================================

-- =============================================
-- CHART EDITIONS
-- =============================================
CREATE TABLE IF NOT EXISTS public.chart_editions (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  week_date DATE NOT NULL UNIQUE,
  title TEXT NOT NULL DEFAULT '',
  description_en TEXT NOT NULL DEFAULT '',
  description_es TEXT NOT NULL DEFAULT '',
  is_published BOOLEAN DEFAULT FALSE,
  published_at TIMESTAMPTZ,
  sources TEXT[] DEFAULT '{}'
);

CREATE INDEX idx_chart_editions_week ON public.chart_editions(week_date DESC);
CREATE INDEX idx_chart_editions_published ON public.chart_editions(is_published, week_date DESC);

-- =============================================
-- CHART TRACKS
-- =============================================
CREATE TABLE IF NOT EXISTS public.chart_tracks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  chart_edition_id UUID REFERENCES public.chart_editions(id) ON DELETE CASCADE NOT NULL,
  position SMALLINT NOT NULL CHECK (position >= 1 AND position <= 40),
  title TEXT NOT NULL,
  mix_name TEXT NOT NULL DEFAULT '',
  artists JSONB NOT NULL DEFAULT '[]',
  label TEXT NOT NULL DEFAULT '',
  bpm SMALLINT,
  key TEXT NOT NULL DEFAULT '',
  beatport_url TEXT,
  artwork_url TEXT,
  sample_url TEXT,
  previous_position SMALLINT,
  weeks_in_chart SMALLINT NOT NULL DEFAULT 1,
  UNIQUE(chart_edition_id, position)
);

CREATE INDEX idx_chart_tracks_edition ON public.chart_tracks(chart_edition_id);
CREATE INDEX idx_chart_tracks_position ON public.chart_tracks(chart_edition_id, position);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
ALTER TABLE public.chart_editions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.chart_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read published chart_editions"
  ON public.chart_editions FOR SELECT USING (is_published = true);

CREATE POLICY "Public read chart_tracks"
  ON public.chart_tracks FOR SELECT USING (true);
