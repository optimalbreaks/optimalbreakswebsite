-- ============================================
-- OPTIMAL BREAKS — Vinilos semanales (curación editorial desde Discogs)
-- Datos 100 % manuales (JSON → script UPSERT). Preview vía YouTube embed.
-- ============================================

CREATE TABLE IF NOT EXISTS public.chart_vinyl_tracks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  chart_edition_id UUID NOT NULL REFERENCES public.chart_editions(id) ON DELETE CASCADE,
  sort_order SMALLINT NOT NULL CHECK (sort_order >= 1 AND sort_order <= 200),
  title TEXT NOT NULL,
  mix_name TEXT NOT NULL DEFAULT '',
  artists JSONB NOT NULL DEFAULT '[]',
  label TEXT NOT NULL DEFAULT '',
  catalog_number TEXT NOT NULL DEFAULT '',
  year SMALLINT,
  format TEXT NOT NULL DEFAULT '',
  discogs_url TEXT NOT NULL,
  youtube_url TEXT,
  artwork_url TEXT,
  note_en TEXT NOT NULL DEFAULT '',
  note_es TEXT NOT NULL DEFAULT '',
  UNIQUE (chart_edition_id, sort_order)
);

CREATE INDEX idx_chart_vinyl_tracks_edition ON public.chart_vinyl_tracks(chart_edition_id, sort_order);

ALTER TABLE public.chart_vinyl_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read chart_vinyl_tracks for published editions"
  ON public.chart_vinyl_tracks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chart_editions e
      WHERE e.id = chart_vinyl_tracks.chart_edition_id AND e.is_published = true
    )
  );
