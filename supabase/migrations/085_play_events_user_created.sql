-- Lectura del ADN por usuario: reproducciones de temas y de mixes.
-- Las tablas siguen sin política SELECT para authenticated; el perfil
-- las lee con service role, filtrando user_id. El índice parcial evita
-- el seq scan de los plays anónimos (user_id NULL).

CREATE INDEX IF NOT EXISTS idx_track_play_events_user_created
  ON public.track_play_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_mix_play_events_user_created
  ON public.mix_play_events (user_id, created_at DESC)
  WHERE user_id IS NOT NULL;
