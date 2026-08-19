-- ============================================
-- OPTIMAL BREAKS — Artistas verificados + Solicitudes de booking
-- ============================================
-- Ver docs/GUIA_IMPLEMENTACION_BOOKINGS.md (§4). Dos tablas nuevas
-- (artist_claims, booking_requests), una tabla de moderación
-- (booking_sender_bans) y dos columnas en artists (claimed_by,
-- accepts_bookings).
--
-- Notas de seguridad:
--   * `artists` NO recibe política de UPDATE para usuarios (decisión §2.22):
--     el toggle accepts_bookings se escribe por API con service role.
--   * `claimed_by` es fuente de verdad del vínculo; NUNCA viaja a superficies
--     públicas (decisión §2.24): la ficha gatea el botón con accepts_bookings.
--   * El ban de remitentes vive en su propia tabla (no en profiles) porque la
--     política "Users update own profile" permitiría auto-desbanearse. Se
--     gestiona con service role y se comprueba en la API del POST de bookings.
-- ============================================

-- =============================================
-- 1) Columnas en artists
-- =============================================
ALTER TABLE public.artists
  ADD COLUMN IF NOT EXISTS claimed_by UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS accepts_bookings BOOLEAN NOT NULL DEFAULT FALSE;

COMMENT ON COLUMN public.artists.claimed_by IS
  'Usuario verificado que recibe las solicitudes de booking de esta ficha. Fuente de verdad del vínculo. NO exponer en superficies públicas.';
COMMENT ON COLUMN public.artists.accepts_bookings IS
  'Si TRUE (implica claim aprobado), la ficha pública muestra el botón SOLICITAR BOOKING. Lo alterna el artista vía API con service role.';

-- =============================================
-- 2) artist_claims — cola de verificación
-- =============================================
CREATE TABLE IF NOT EXISTS public.artist_claims (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('claim_existing', 'request_new')),
  -- claim_existing: ficha del catálogo que el usuario reclama
  artist_id UUID REFERENCES public.artists(id) ON DELETE SET NULL,
  -- request_new: URLs aportadas por el solicitante
  proposed_name TEXT DEFAULT '',
  beatport_url TEXT DEFAULT '',
  youtube_url TEXT DEFAULT '',
  soundcloud_url TEXT DEFAULT '',
  instagram_url TEXT DEFAULT '',
  message TEXT DEFAULT '',
  -- 'artist' (soy yo) | 'manager' | 'agency'
  relationship TEXT NOT NULL DEFAULT 'artist'
    CHECK (relationship IN ('artist', 'manager', 'agency')),
  status TEXT NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'approved', 'rejected', 'cancelled', 'revoked')),
  admin_notes TEXT DEFAULT '',
  resolved_at TIMESTAMPTZ,
  resolved_by UUID REFERENCES public.profiles(id)
);

-- Una sola solicitud pendiente por usuario
CREATE UNIQUE INDEX IF NOT EXISTS uniq_pending_claim_per_user
  ON public.artist_claims(user_id) WHERE status = 'pending';
-- Una ficha no puede estar reclamada-aprobada por dos cuentas
CREATE UNIQUE INDEX IF NOT EXISTS uniq_approved_claim_per_artist
  ON public.artist_claims(artist_id) WHERE status = 'approved';
CREATE INDEX IF NOT EXISTS idx_artist_claims_user ON public.artist_claims(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_artist_claims_status ON public.artist_claims(status, created_at DESC);

DROP TRIGGER IF EXISTS artist_claims_updated_at ON public.artist_claims;
CREATE TRIGGER artist_claims_updated_at
  BEFORE UPDATE ON public.artist_claims
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- 3) booking_requests — solicitudes de booking
-- =============================================
CREATE TABLE IF NOT EXISTS public.booking_requests (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  event_date DATE,
  city TEXT NOT NULL,
  venue TEXT DEFAULT '',
  event_type TEXT DEFAULT '',
  budget_range TEXT DEFAULT '',
  message TEXT NOT NULL,
  contact_email TEXT NOT NULL,
  contact_phone TEXT DEFAULT '',
  status TEXT NOT NULL DEFAULT 'new'
    CHECK (status IN ('new', 'read', 'replied', 'accepted', 'declined', 'closed')),
  -- Moderación separada del ciclo de vida: ocultar no destruye el estado
  hidden_by_admin BOOLEAN NOT NULL DEFAULT FALSE,
  admin_notes TEXT DEFAULT ''
);

CREATE INDEX IF NOT EXISTS idx_booking_requests_artist ON public.booking_requests(artist_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_booking_requests_sender ON public.booking_requests(sender_id, created_at DESC);
-- Una solicitud "viva" (new/read) por remitente y artista
CREATE UNIQUE INDEX IF NOT EXISTS uniq_live_booking_per_sender_artist
  ON public.booking_requests(sender_id, artist_id) WHERE status IN ('new', 'read');

DROP TRIGGER IF EXISTS booking_requests_updated_at ON public.booking_requests;
CREATE TRIGGER booking_requests_updated_at
  BEFORE UPDATE ON public.booking_requests
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- =============================================
-- 4) booking_sender_bans — moderación (solo service role)
-- =============================================
CREATE TABLE IF NOT EXISTS public.booking_sender_bans (
  user_id UUID PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  reason TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES public.profiles(id)
);

-- =============================================
-- 5) RLS
-- =============================================
ALTER TABLE public.artist_claims ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.booking_sender_bans ENABLE ROW LEVEL SECURITY;

-- ---- artist_claims: solo el dueño (admin usa service role, bypassa RLS) ----
DROP POLICY IF EXISTS "Users read own claims" ON public.artist_claims;
DROP POLICY IF EXISTS "Users insert own claims" ON public.artist_claims;
DROP POLICY IF EXISTS "Users cancel own pending claims" ON public.artist_claims;

CREATE POLICY "Users read own claims"
  ON public.artist_claims FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users insert own claims"
  ON public.artist_claims FOR INSERT TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id AND status = 'pending');

-- El usuario solo puede tocar sus claims pendientes (para cancelarlas).
-- La transición a approved/rejected/revoked la hace admin con service role.
CREATE POLICY "Users cancel own pending claims"
  ON public.artist_claims FOR UPDATE TO authenticated
  USING ((SELECT auth.uid()) = user_id AND status = 'pending')
  WITH CHECK ((SELECT auth.uid()) = user_id AND status IN ('pending', 'cancelled'));

-- ---- booking_requests ----
DROP POLICY IF EXISTS "Sender reads own booking requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Sender creates booking requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Sender deletes own new booking requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Artist reads received booking requests" ON public.booking_requests;
DROP POLICY IF EXISTS "Artist updates received booking requests" ON public.booking_requests;

-- Remitente: ve las suyas
CREATE POLICY "Sender reads own booking requests"
  ON public.booking_requests FOR SELECT TO authenticated
  USING ((SELECT auth.uid()) = sender_id);

-- Remitente: crea, solo hacia artistas abiertos a booking. El ban y los
-- límites anti-abuso se comprueban en la API (service role).
CREATE POLICY "Sender creates booking requests"
  ON public.booking_requests FOR INSERT TO authenticated
  WITH CHECK (
    (SELECT auth.uid()) = sender_id
    AND status = 'new'
    AND EXISTS (
      SELECT 1 FROM public.artists a
      WHERE a.id = artist_id AND a.accepts_bookings = TRUE
    )
  );

-- Remitente: cancela (borra) mientras la solicitud siga en 'new'
CREATE POLICY "Sender deletes own new booking requests"
  ON public.booking_requests FOR DELETE TO authenticated
  USING ((SELECT auth.uid()) = sender_id AND status = 'new');

-- Artista vinculado: ve las recibidas no ocultas
CREATE POLICY "Artist reads received booking requests"
  ON public.booking_requests FOR SELECT TO authenticated
  USING (
    hidden_by_admin = FALSE
    AND artist_id IN (
      SELECT id FROM public.artists WHERE claimed_by = (SELECT auth.uid())
    )
  );

-- Artista vinculado: actualiza estado de las recibidas no ocultas
CREATE POLICY "Artist updates received booking requests"
  ON public.booking_requests FOR UPDATE TO authenticated
  USING (
    hidden_by_admin = FALSE
    AND artist_id IN (
      SELECT id FROM public.artists WHERE claimed_by = (SELECT auth.uid())
    )
  )
  WITH CHECK (
    artist_id IN (
      SELECT id FROM public.artists WHERE claimed_by = (SELECT auth.uid())
    )
  );

-- ---- booking_sender_bans: sin políticas → denegado a usuarios; service role gestiona ----

-- =============================================
-- 6) Grants (service_role bypassa RLS; postgres conserva ownership)
-- =============================================
REVOKE ALL ON TABLE public.artist_claims FROM anon;
REVOKE ALL ON TABLE public.booking_requests FROM anon;
REVOKE ALL ON TABLE public.booking_sender_bans FROM anon, authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.artist_claims FROM authenticated;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.booking_requests FROM authenticated;
GRANT SELECT, INSERT, UPDATE ON TABLE public.artist_claims TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.booking_requests TO authenticated;
