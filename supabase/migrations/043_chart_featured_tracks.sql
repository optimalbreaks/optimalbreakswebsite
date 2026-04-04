-- ============================================
-- OPTIMAL BREAKS — Nuevos lanzamientos (picks editoriales por semana)
-- Datos 100 % manuales (JSON → script UPSERT). Sin scraping.
-- ============================================

CREATE TABLE IF NOT EXISTS public.chart_featured_tracks (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  chart_edition_id UUID NOT NULL REFERENCES public.chart_editions(id) ON DELETE CASCADE,
  sort_order SMALLINT NOT NULL CHECK (sort_order >= 1 AND sort_order <= 50),
  title TEXT NOT NULL,
  artists JSONB NOT NULL DEFAULT '[]',
  label TEXT NOT NULL DEFAULT '',
  platform TEXT NOT NULL DEFAULT 'other',
  link_url TEXT NOT NULL,
  link_label TEXT NOT NULL DEFAULT '',
  artwork_url TEXT,
  release_year SMALLINT,
  note_en TEXT NOT NULL DEFAULT '',
  note_es TEXT NOT NULL DEFAULT '',
  UNIQUE (chart_edition_id, sort_order)
);

CREATE INDEX idx_chart_featured_tracks_edition ON public.chart_featured_tracks(chart_edition_id, sort_order);

ALTER TABLE public.chart_featured_tracks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Public read chart_featured_tracks for published editions"
  ON public.chart_featured_tracks FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.chart_editions e
      WHERE e.id = chart_featured_tracks.chart_edition_id AND e.is_published = true
    )
  );
