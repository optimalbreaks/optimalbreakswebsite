-- ============================================
-- OPTIMAL BREAKS — Admin Role on profiles
-- Run after 003_user_system.sql
-- ============================================

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

-- Set your admin email here before running:
-- UPDATE public.profiles SET role = 'admin'
-- WHERE id = (SELECT id FROM auth.users WHERE email = 'tu-email@ejemplo.com' LIMIT 1);
