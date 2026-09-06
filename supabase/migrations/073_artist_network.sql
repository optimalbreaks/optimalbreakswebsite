-- ============================================
-- OPTIMAL BREAKS — Red interna de artistas reclamados
-- ============================================
-- Agenda + mensajería 1:1 y grupos entre cuentas con artists.claimed_by.
-- Independiente de accepts_bookings. Escritura solo vía API (service role).
-- RLS activo sin políticas para anon/authenticated: el cliente no lee a pelo.
-- claimed_by no se expone en las APIs públicas de catálogo.
-- ============================================

CREATE TABLE IF NOT EXISTS public.artist_network_threads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  kind TEXT NOT NULL CHECK (kind IN ('dm', 'group')),
  title TEXT,
  dm_key TEXT,
  created_by UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  last_message_at TIMESTAMPTZ,
  last_message_preview TEXT NOT NULL DEFAULT '',
  last_sender_id UUID REFERENCES public.profiles(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT artist_network_threads_kind_chk CHECK (
    (kind = 'dm' AND dm_key IS NOT NULL)
    OR (kind = 'group' AND dm_key IS NULL AND coalesce(btrim(title), '') <> '')
  )
);

CREATE UNIQUE INDEX IF NOT EXISTS artist_network_threads_dm_key_uidx
  ON public.artist_network_threads (dm_key)
  WHERE kind = 'dm' AND dm_key IS NOT NULL;

CREATE INDEX IF NOT EXISTS artist_network_threads_updated_idx
  ON public.artist_network_threads (updated_at DESC);

COMMENT ON TABLE public.artist_network_threads IS
  'Hilos 1:1 y grupos de la red de artistas reclamados. Texto en claro; el staff lee por API admin.';

CREATE TABLE IF NOT EXISTS public.artist_network_members (
  thread_id UUID NOT NULL REFERENCES public.artist_network_threads(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  artist_id UUID NOT NULL REFERENCES public.artists(id) ON DELETE CASCADE,
  last_read_at TIMESTAMPTZ,
  joined_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (thread_id, user_id)
);

CREATE INDEX IF NOT EXISTS artist_network_members_user_idx
  ON public.artist_network_members (user_id, joined_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS artist_network_members_thread_artist_uidx
  ON public.artist_network_members (thread_id, artist_id);

COMMENT ON COLUMN public.artist_network_members.artist_id IS
  'Ficha reclamada con la que se sienta este usuario en el hilo (identidad visible).';

CREATE TABLE IF NOT EXISTS public.artist_network_messages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  thread_id UUID NOT NULL REFERENCES public.artist_network_threads(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  body TEXT NOT NULL CHECK (char_length(btrim(body)) > 0 AND char_length(body) <= 4000),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS artist_network_messages_thread_created_idx
  ON public.artist_network_messages (thread_id, created_at ASC);

DROP TRIGGER IF EXISTS artist_network_threads_updated_at ON public.artist_network_threads;
CREATE TRIGGER artist_network_threads_updated_at
  BEFORE UPDATE ON public.artist_network_threads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.artist_network_threads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_network_members ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.artist_network_messages ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.artist_network_threads FROM anon, authenticated;
REVOKE ALL ON TABLE public.artist_network_members FROM anon, authenticated;
REVOKE ALL ON TABLE public.artist_network_messages FROM anon, authenticated;

GRANT ALL ON TABLE public.artist_network_threads TO service_role;
GRANT ALL ON TABLE public.artist_network_members TO service_role;
GRANT ALL ON TABLE public.artist_network_messages TO service_role;
