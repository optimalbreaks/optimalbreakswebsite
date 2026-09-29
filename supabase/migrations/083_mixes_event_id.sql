-- Sesiones grabadas en un evento concreto (una edición de festival, una fiesta).
-- La ficha /events/<slug> y la serie /festivals/<serie> listan sus sesiones;
-- /mixes/<slug> enlaza de vuelta al evento.
ALTER TABLE public.mixes
  ADD COLUMN IF NOT EXISTS event_id uuid REFERENCES public.events(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS mixes_event_id_idx ON public.mixes (event_id) WHERE event_id IS NOT NULL;
