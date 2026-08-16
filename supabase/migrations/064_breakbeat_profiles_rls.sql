-- ============================================
-- OPTIMAL BREAKS — RLS on breakbeat_profiles
-- ============================================
-- El ADN breakbeatero es por usuario (dashboard Overview). Lectura/escritura
-- solo del dueño. El cliente (`useBreakbeatProfile`) y POST /api/breakbeat-profile
-- usan el JWT del usuario (anon key + cookies), no service_role: las políticas
-- deben permitir SELECT/INSERT/UPDATE a `authenticated` con auth.uid() = user_id.
--
-- CREATE TABLE IF NOT EXISTS cubre entornos nuevos; en producción la tabla
-- ya existía sin RLS (lint de Supabase). ENABLE + policies son el arreglo.
-- Docs: docs/USER_ENGAGEMENT.md (*Breakbeat DNA*), README.md (SQL migrations 064).
-- ============================================

CREATE TABLE IF NOT EXISTS public.breakbeat_profiles (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  analysis_text_en TEXT DEFAULT '',
  analysis_text_es TEXT DEFAULT '',
  archetype_en TEXT DEFAULT '',
  archetype_es TEXT DEFAULT '',
  stats JSONB DEFAULT '{}'::jsonb,
  input_hash TEXT DEFAULT '',
  generated_by TEXT DEFAULT 'rules'
    CHECK (generated_by IN ('rules', 'openai', 'manual')),
  UNIQUE (user_id)
);

DROP TRIGGER IF EXISTS breakbeat_profiles_updated_at ON public.breakbeat_profiles;
CREATE TRIGGER breakbeat_profiles_updated_at
  BEFORE UPDATE ON public.breakbeat_profiles
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

ALTER TABLE public.breakbeat_profiles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users read own breakbeat profile" ON public.breakbeat_profiles;
DROP POLICY IF EXISTS "Users insert own breakbeat profile" ON public.breakbeat_profiles;
DROP POLICY IF EXISTS "Users update own breakbeat profile" ON public.breakbeat_profiles;
DROP POLICY IF EXISTS "Users delete own breakbeat profile" ON public.breakbeat_profiles;

-- (SELECT auth.uid()) inicia el plan una vez por consulta (lint de Supabase).
CREATE POLICY "Users read own breakbeat profile"
  ON public.breakbeat_profiles
  FOR SELECT
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users insert own breakbeat profile"
  ON public.breakbeat_profiles
  FOR INSERT
  TO authenticated
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users update own breakbeat profile"
  ON public.breakbeat_profiles
  FOR UPDATE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id)
  WITH CHECK ((SELECT auth.uid()) = user_id);

CREATE POLICY "Users delete own breakbeat profile"
  ON public.breakbeat_profiles
  FOR DELETE
  TO authenticated
  USING ((SELECT auth.uid()) = user_id);

-- TRUNCATE no pasa por RLS: quitar privilegios de tabla a anon y TRUNCATE a authenticated.
REVOKE ALL ON TABLE public.breakbeat_profiles FROM anon;
REVOKE TRUNCATE, REFERENCES, TRIGGER ON TABLE public.breakbeat_profiles FROM authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON TABLE public.breakbeat_profiles TO authenticated;
-- service_role bypassa RLS; postgres conserva ownership.
