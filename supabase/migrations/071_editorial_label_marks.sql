-- ============================================
-- OPTIMAL BREAKS — Fichaje editorial de sello
-- (conducta en el Top de artistas, no dueño legal)
-- ============================================
-- Cuando el editor marca una cuenta + un sello, los «+» de esa cuenta
-- en temas cuyo `label` coincide con ese sello no acreditan a NADIE
-- en el tablero de artistas. Mis Tracks y el Top 100 de canciones
-- no cambian. No infiere dueño: vale un label manager, un artista del
-- roster o cualquier cuenta con dumping errático del catálogo.
--
-- Independiente de editorial_artist_marks (se pueden combinar).
-- Solo service role (admin / ranking). Igual que editorial_artist_marks:
-- sin políticas RLS para authenticated/anon.
-- ============================================

CREATE TABLE IF NOT EXISTS public.editorial_label_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Clave normalizada del sello (p. ej. «dirty kitchen rave»).
  label_key TEXT NOT NULL,
  -- Nombre tal como lo marcó el editor (como aparece en credits de track).
  label_name TEXT NOT NULL DEFAULT '',
  -- Ficha de catálogo si existe; el skip funciona igual sin ella.
  label_id UUID REFERENCES public.labels(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE (user_id, label_key)
);

COMMENT ON TABLE public.editorial_label_marks IS
  'Fichaje editorial: esta cuenta no acredita el roster de este sello en el Top de artistas. No implica dueño ni bookings.';
COMMENT ON COLUMN public.editorial_label_marks.label_key IS
  'Nombre de sello normalizado (misma función que normalizeArtistKey / slugLookupKeys con sufijos Records).';

CREATE INDEX IF NOT EXISTS idx_editorial_label_marks_user
  ON public.editorial_label_marks(user_id);

ALTER TABLE public.editorial_label_marks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.editorial_label_marks FROM anon, authenticated;
