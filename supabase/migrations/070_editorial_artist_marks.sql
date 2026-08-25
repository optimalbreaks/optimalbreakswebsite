-- ============================================
-- OPTIMAL BREAKS — Fichaje editorial de artista (fase 2, sin bookings)
-- ============================================
-- Tres niveles de cuenta:
--   1) Usuario normal — saves cuentan en Top artistas y Top 100.
--   2) Marcado editorial (esta tabla) — sus «+» en créditos de ESE
--      nombre no suman al Top artistas. Mis Tracks y Top 100 canciones
--      no cambian. NO escribe claimed_by ni accepts_bookings.
--   3) Claim aprobado (artists.claimed_by) — misma exclusión de auto-voto
--      + puede abrir bookings (accepts_bookings, interruptor del artista).
--
-- Solo service role (admin / ranking). Igual que booking_sender_bans:
-- sin políticas RLS para authenticated/anon.
-- ============================================

CREATE TABLE IF NOT EXISTS public.editorial_artist_marks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  -- Clave normalizada del crédito (p. ej. «afghan headspin», «gruv42»).
  artist_key TEXT NOT NULL,
  -- Nombre tal como lo marcó el editor (para el panel).
  artist_name TEXT NOT NULL DEFAULT '',
  -- Ficha de catálogo si existe; el auto-voto funciona igual sin ella.
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  created_by UUID REFERENCES public.profiles(id),
  UNIQUE (user_id, artist_key)
);

COMMENT ON TABLE public.editorial_artist_marks IS
  'Fichaje editorial: esta cuenta es este artista para no auto-votarse en el Top de artistas. No habilita bookings.';
COMMENT ON COLUMN public.editorial_artist_marks.artist_key IS
  'Nombre de crédito normalizado (misma función que normalizeArtistKey en la app).';

CREATE INDEX IF NOT EXISTS idx_editorial_artist_marks_user
  ON public.editorial_artist_marks(user_id);

ALTER TABLE public.editorial_artist_marks ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.editorial_artist_marks FROM anon, authenticated;
