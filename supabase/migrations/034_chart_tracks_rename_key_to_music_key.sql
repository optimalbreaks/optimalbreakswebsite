-- Renombrar `key` → `music_key` (la palabra `key` rompe la inferencia de tipos de @supabase/supabase-js).
-- Idempotente: solo si la columna `key` aún existe (migraciones desde 033 con `key`).
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'chart_tracks'
      AND column_name = 'key'
  ) THEN
    ALTER TABLE public.chart_tracks RENAME COLUMN key TO music_key;
  END IF;
END $$;
