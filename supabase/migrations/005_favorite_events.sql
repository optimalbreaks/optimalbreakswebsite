-- ============================================
-- OPTIMAL BREAKS — Favorite events (corazón) separado de asistencia
-- El corazón ya no escribe en event_attendance (wishlist).
-- ============================================

CREATE TABLE IF NOT EXISTS public.favorite_events (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  event_id UUID REFERENCES public.events(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, event_id)
);

CREATE INDEX IF NOT EXISTS idx_fav_events_user ON public.favorite_events(user_id);
CREATE INDEX IF NOT EXISTS idx_fav_events_event ON public.favorite_events(event_id);

ALTER TABLE public.favorite_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own favorite_events" ON public.favorite_events FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users insert own favorite_events" ON public.favorite_events FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users delete own favorite_events" ON public.favorite_events FOR DELETE USING (auth.uid() = user_id);

CREATE POLICY "Public count favorite_events"
  ON public.favorite_events
  FOR SELECT
  USING (true);

-- Conteo público de interesados sin duplicar usuarios en ambas tablas
CREATE OR REPLACE FUNCTION public.event_engaged_user_count(eid uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COUNT(*)::int FROM (
    SELECT user_id FROM public.event_attendance WHERE event_id = eid
    UNION
    SELECT user_id FROM public.favorite_events WHERE event_id = eid
  ) t;
$$;

GRANT EXECUTE ON FUNCTION public.event_engaged_user_count(uuid) TO anon, authenticated;
