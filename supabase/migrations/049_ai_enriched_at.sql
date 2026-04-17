-- ============================================
-- OPTIMAL BREAKS — IA: columnas de enriquecimiento (network)
-- Marca cuándo se han enriquecido las conexiones (related_artists,
-- labels_founded, key_artists, key_labels, etc.) con el agente GPT.
-- Idempotente: usa ADD COLUMN IF NOT EXISTS.
-- ============================================

ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS ai_enriched_at timestamptz;

ALTER TABLE public.labels
  ADD COLUMN IF NOT EXISTS ai_enriched_at timestamptz;

ALTER TABLE public.scenes
  ADD COLUMN IF NOT EXISTS ai_enriched_at timestamptz;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS ai_enriched_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_artists_ai_enriched_at ON public.artists (ai_enriched_at);
CREATE INDEX IF NOT EXISTS idx_labels_ai_enriched_at ON public.labels (ai_enriched_at);
CREATE INDEX IF NOT EXISTS idx_scenes_ai_enriched_at ON public.scenes (ai_enriched_at);
CREATE INDEX IF NOT EXISTS idx_events_ai_enriched_at ON public.events (ai_enriched_at);
