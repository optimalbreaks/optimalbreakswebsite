-- Escuchas agrupadas por tema y usuario, para no contar la del fichado,
-- el familiar o el reclamado en un tema que le acredita. El anónimo
-- (user_id null) sigue en su grupo y sí cuenta.

CREATE OR REPLACE FUNCTION public.track_play_user_counts_for_keys(p_keys text[])
RETURNS TABLE (canonical_key text, user_id uuid, play_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.canonical_key, e.user_id, COUNT(*)::bigint AS play_count
  FROM public.track_play_events e
  WHERE e.canonical_key = ANY(p_keys)
  GROUP BY e.canonical_key, e.user_id;
$$;

REVOKE ALL ON FUNCTION public.track_play_user_counts_for_keys(text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_play_user_counts_for_keys(text[]) TO service_role;
