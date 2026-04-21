-- ================================================================
-- 052_events_lineup_text.sql
-- ----------------------------------------------------------------
-- Denormalización automática del line-up de eventos para búsquedas
-- ilike desde PostgREST (p.ej. "plump djs" debe encontrar el evento
-- aunque el nombre del DJ viva dentro del TEXT[] `lineup` o dentro
-- del JSONB `stages[].lineup[]`).
--
-- Columna generada `events.lineup_text` = TEXT plano con:
--   • Todos los nombres del array `lineup`
--   • Todos los nombres de todos los `stages[].lineup[]`
-- Concatenados con ", " y sin duplicados.
-- ================================================================

CREATE OR REPLACE FUNCTION public.events_lineup_to_text(
  lineup_arr  text[],
  stages_arr  jsonb
)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  WITH flat_lineup AS (
    SELECT unnest(COALESCE(lineup_arr, ARRAY[]::text[])) AS name
  ),
  flat_stages AS (
    SELECT jsonb_array_elements_text(stage -> 'lineup') AS name
    FROM jsonb_array_elements(COALESCE(stages_arr, '[]'::jsonb)) AS stage
    WHERE stage ? 'lineup'
      AND jsonb_typeof(stage -> 'lineup') = 'array'
  ),
  combined AS (
    SELECT name FROM flat_lineup
    UNION
    SELECT name FROM flat_stages
  )
  SELECT COALESCE(string_agg(DISTINCT name, ', '), '')
  FROM combined
  WHERE name IS NOT NULL AND btrim(name) <> ''
$$;

ALTER TABLE public.events
  ADD COLUMN IF NOT EXISTS lineup_text text
  GENERATED ALWAYS AS (public.events_lineup_to_text(lineup, stages)) STORED;

COMMENT ON COLUMN public.events.lineup_text IS
  'Denormalización automática: todos los nombres del line-up plano (lineup text[]) + los de stages[].lineup[] concatenados con ", ". Permite búsquedas ilike desde el buscador global.';
