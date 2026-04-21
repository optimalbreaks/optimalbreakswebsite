-- ============================================
-- OPTIMAL BREAKS — Saved chart tracks (Mis Tracks)
-- Tabla polimórfica para guardar tracks procedentes de:
--   - chart_tracks        (40 Breaks Vitales; audio vía Beatport sample_url)
--   - chart_featured_tracks (New Releases editoriales; link_url a Beatport)
--   - chart_vinyl_tracks  (Retro Vinyl Picks; preview por YouTube)
--
-- En lugar de una FK rígida, guardamos (track_source, track_id). La app
-- resuelve el JOIN a la tabla adecuada. Si el track se borra, una cron
-- puede limpiar huérfanos; mientras tanto el cliente maneja “no encontrado”.
-- ============================================

CREATE TABLE IF NOT EXISTS public.saved_chart_tracks (
  id         UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id    UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,

  -- De qué tabla de charts proviene este track guardado
  track_source TEXT NOT NULL CHECK (track_source IN ('chart','featured','vinyl')),

  -- UUID del track en su tabla origen (chart_tracks.id | chart_featured_tracks.id | chart_vinyl_tracks.id)
  track_id   UUID NOT NULL,

  created_at TIMESTAMPTZ DEFAULT NOW(),

  -- Un usuario no puede guardar el mismo track dos veces
  UNIQUE (user_id, track_source, track_id)
);

CREATE INDEX IF NOT EXISTS idx_sct_user    ON public.saved_chart_tracks(user_id);
CREATE INDEX IF NOT EXISTS idx_sct_source  ON public.saved_chart_tracks(track_source);
CREATE INDEX IF NOT EXISTS idx_sct_pair    ON public.saved_chart_tracks(track_source, track_id);

ALTER TABLE public.saved_chart_tracks ENABLE ROW LEVEL SECURITY;

-- RLS: cada usuario solo ve/modifica los suyos
DROP POLICY IF EXISTS "Users read own saved_chart_tracks"   ON public.saved_chart_tracks;
DROP POLICY IF EXISTS "Users insert own saved_chart_tracks" ON public.saved_chart_tracks;
DROP POLICY IF EXISTS "Users delete own saved_chart_tracks" ON public.saved_chart_tracks;

CREATE POLICY "Users read own saved_chart_tracks"
  ON public.saved_chart_tracks
  FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own saved_chart_tracks"
  ON public.saved_chart_tracks
  FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own saved_chart_tracks"
  ON public.saved_chart_tracks
  FOR DELETE
  USING (auth.uid() = user_id);
