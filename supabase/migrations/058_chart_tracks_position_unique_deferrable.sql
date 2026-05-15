-- Permite reordenar las 40 filas de una edición sin choques en UNIQUE(edition, position):
-- varios UPDATE seguidos en la misma transacción (función PL/pgSQL) con restricción DEFERRABLE.

ALTER TABLE public.chart_tracks
  DROP CONSTRAINT IF EXISTS chart_tracks_chart_edition_id_position_key;

ALTER TABLE public.chart_tracks
  ADD CONSTRAINT chart_tracks_chart_edition_id_position_key
  UNIQUE (chart_edition_id, position)
  DEFERRABLE INITIALLY DEFERRED;

CREATE OR REPLACE FUNCTION public.apply_chart_tracks_row_updates(p_updates jsonb)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  elem jsonb;
BEGIN
  FOR elem IN SELECT value FROM jsonb_array_elements(p_updates)
  LOOP
    UPDATE public.chart_tracks
    SET
      chart_edition_id = (elem->>'chart_edition_id')::uuid,
      position = (elem->>'position')::smallint,
      title = COALESCE(elem->>'title', ''),
      mix_name = COALESCE(elem->>'mix_name', ''),
      artists = COALESCE(elem->'artists', '[]'::jsonb),
      label = COALESCE(elem->>'label', ''),
      bpm = CASE
        WHEN elem->>'bpm' IS NULL OR elem->>'bpm' = '' THEN NULL
        ELSE (elem->>'bpm')::smallint
      END,
      music_key = COALESCE(elem->>'music_key', ''),
      beatport_url = NULLIF(elem->>'beatport_url', ''),
      artwork_url = NULLIF(elem->>'artwork_url', ''),
      sample_url = NULLIF(elem->>'sample_url', ''),
      waveform_url = NULLIF(elem->>'waveform_url', ''),
      release_year = CASE
        WHEN elem->>'release_year' IS NULL OR elem->>'release_year' = '' THEN NULL
        ELSE (elem->>'release_year')::smallint
      END,
      release_date = CASE
        WHEN elem->>'release_date' IS NULL OR elem->>'release_date' = '' THEN NULL
        ELSE (elem->>'release_date')::date
      END,
      previous_position = CASE
        WHEN elem->>'previous_position' IS NULL OR elem->>'previous_position' = '' THEN NULL
        ELSE (elem->>'previous_position')::smallint
      END,
      weeks_in_chart = COALESCE((elem->>'weeks_in_chart')::smallint, 1)
    WHERE id = (elem->>'id')::uuid;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.apply_chart_tracks_row_updates(jsonb) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_chart_tracks_row_updates(jsonb) TO service_role;
