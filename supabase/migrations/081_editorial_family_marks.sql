-- ============================================
-- OPTIMAL BREAKS — Familiar de un artista fichado o reclamado
-- ============================================
-- Cuenta que no es el artista, pero vota su catálogo (primo, pareja,
-- círculo). El editor marca la cuenta + el nombre de crédito del artista.
-- Esos «+» no suman a ESE nombre en el Top de artistas. El resto de
-- créditos del tema sí (colabs). Mis Tracks y el Top 100 de canciones
-- no cambian. No escribe claimed_by ni abre bookings. No es un fichaje
-- de artista: la cuenta sigue siendo usuario normal en la columna Artista.
--
-- Solo service role. Igual que editorial_artist_marks.
-- ============================================

CREATE TABLE IF NOT EXISTS public.editorial_family_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  artist_key TEXT NOT NULL,
  artist_name TEXT NOT NULL DEFAULT '',
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE (user_id, artist_key)
);

COMMENT ON TABLE public.editorial_family_marks IS
  'Familiar de un artista fichado o reclamado: sus «+» no acreditan ese nombre en el Top de artistas. No es claim ni bookings.';
COMMENT ON COLUMN public.editorial_family_marks.artist_key IS
  'Nombre de crédito del artista al que no debe votar (normalizeArtistKey).';

CREATE INDEX IF NOT EXISTS idx_editorial_family_marks_user
  ON public.editorial_family_marks(user_id);

ALTER TABLE public.editorial_family_marks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.editorial_family_marks FROM anon, authenticated;
