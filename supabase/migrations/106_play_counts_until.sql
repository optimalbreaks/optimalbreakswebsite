-- Escuchas de un tema hasta un instante. Sirve para reconstruir el Top 100
-- tal como estaba cuando se grabó un reel (el desempate es por escuchas).

CREATE OR REPLACE FUNCTION public.track_play_user_counts_until(p_keys text[], p_until timestamptz)
RETURNS TABLE (canonical_key text, user_id uuid, play_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT e.canonical_key, e.user_id, COUNT(*)::bigint AS play_count
  FROM public.track_play_events e
  WHERE e.canonical_key = ANY(p_keys)
    AND e.created_at <= p_until
  GROUP BY e.canonical_key, e.user_id;
$$;

REVOKE ALL ON FUNCTION public.track_play_user_counts_until(text[], timestamptz) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.track_play_user_counts_until(text[], timestamptz) TO service_role;
