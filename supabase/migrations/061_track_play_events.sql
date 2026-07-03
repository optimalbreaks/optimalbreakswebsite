-- ============================================
-- OPTIMAL BREAKS — Reproducciones de pistas (charts / previews / YouTube)
-- Desempate del Top de la comunidad cuando empatan en votos (saves).
-- ============================================

CREATE TABLE IF NOT EXISTS public.track_play_events (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  canonical_key TEXT NOT NULL,
  user_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_track_play_events_key ON public.track_play_events(canonical_key);
CREATE INDEX IF NOT EXISTS idx_track_play_events_created ON public.track_play_events(created_at DESC);

ALTER TABLE public.track_play_events ENABLE ROW LEVEL SECURITY;

-- Sin políticas: anon/authenticated no leen/escriben; service_role bypassa RLS.

CREATE OR REPLACE FUNCTION public.track_play_counts_for_keys(p_keys text[])
RETURNS TABLE (canonical_key text, play_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.canonical_key, COUNT(*)::bigint AS play_count
  FROM public.track_play_events e
  WHERE e.canonical_key = ANY(p_keys)
  GROUP BY e.canonical_key;
$$;

REVOKE ALL ON FUNCTION public.track_play_counts_for_keys(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_play_counts_for_keys(text[]) TO service_role;
