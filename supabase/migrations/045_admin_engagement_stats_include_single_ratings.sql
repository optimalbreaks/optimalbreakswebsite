-- Incluir eventos/artistas con al menos 1 valoración en el panel admin (antes: HAVING >= 2).
CREATE OR REPLACE FUNCTION public.admin_engagement_stats(p_limit integer DEFAULT 25)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT jsonb_build_object(
    'mix_plays_summary', (
      SELECT jsonb_build_object(
        'all_time', (SELECT COUNT(*)::bigint FROM public.mix_play_events),
        'last_7d', (
          SELECT COUNT(*)::bigint FROM public.mix_play_events
          WHERE created_at >= NOW() - INTERVAL '7 days'
        )
      )
    ),
    'mix_plays_top', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.play_count DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          m.id AS mix_id,
          m.slug,
          m.title,
          m.artist_name,
          COUNT(e.id)::bigint AS play_count
        FROM public.mix_play_events e
        INNER JOIN public.mixes m ON m.id = e.mix_id
        GROUP BY m.id, m.slug, m.title, m.artist_name
        ORDER BY play_count DESC
        LIMIT p_limit
      ) t
    ),
    'favorite_artists', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.cnt DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          a.id AS artist_id,
          a.slug,
          COALESCE(NULLIF(TRIM(a.name_display), ''), a.name) AS name,
          COUNT(*)::bigint AS cnt
        FROM public.favorite_artists fa
        INNER JOIN public.artists a ON a.id = fa.artist_id
        GROUP BY a.id, a.slug, COALESCE(NULLIF(TRIM(a.name_display), ''), a.name)
        ORDER BY cnt DESC
        LIMIT p_limit
      ) t
    ),
    'favorite_labels', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.cnt DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          l.id AS label_id,
          l.slug,
          l.name,
          COUNT(*)::bigint AS cnt
        FROM public.favorite_labels fl
        INNER JOIN public.labels l ON l.id = fl.label_id
        GROUP BY l.id, l.slug, l.name
        ORDER BY cnt DESC
        LIMIT p_limit
      ) t
    ),
    'favorite_events', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.cnt DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          e.id AS event_id,
          e.slug,
          e.name,
          COUNT(*)::bigint AS cnt
        FROM public.favorite_events fe
        INNER JOIN public.events e ON e.id = fe.event_id
        GROUP BY e.id, e.slug, e.name
        ORDER BY cnt DESC
        LIMIT p_limit
      ) t
    ),
    'events_engaged', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.engaged_users DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          e.id AS event_id,
          e.slug,
          e.name,
          COUNT(DISTINCT x.uid)::bigint AS engaged_users
        FROM public.events e
        INNER JOIN (
          SELECT event_id, user_id AS uid FROM public.favorite_events
          UNION
          SELECT event_id, user_id AS uid FROM public.event_attendance
        ) x ON x.event_id = e.id
        GROUP BY e.id, e.slug, e.name
        ORDER BY engaged_users DESC
        LIMIT p_limit
      ) t
    ),
    'event_attendance_attending', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.cnt DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          e.id AS event_id,
          e.slug,
          e.name,
          COUNT(*)::bigint AS cnt
        FROM public.event_attendance ea
        INNER JOIN public.events e ON e.id = ea.event_id
        WHERE ea.status = 'attending'
        GROUP BY e.id, e.slug, e.name
        ORDER BY cnt DESC
        LIMIT p_limit
      ) t
    ),
    'event_attendance_attended', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.cnt DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          e.id AS event_id,
          e.slug,
          e.name,
          COUNT(*)::bigint AS cnt
        FROM public.event_attendance ea
        INNER JOIN public.events e ON e.id = ea.event_id
        WHERE ea.status = 'attended'
        GROUP BY e.id, e.slug, e.name
        ORDER BY cnt DESC
        LIMIT p_limit
      ) t
    ),
    'saved_mixes', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.saves DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          m.id AS mix_id,
          m.slug,
          m.title,
          m.artist_name,
          COUNT(*)::bigint AS saves
        FROM public.saved_mixes sm
        INNER JOIN public.mixes m ON m.id = sm.mix_id
        GROUP BY m.id, m.slug, m.title, m.artist_name
        ORDER BY saves DESC
        LIMIT p_limit
      ) t
    ),
    'event_ratings_top', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.avg_rating DESC, t.rating_count DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          e.id AS event_id,
          e.slug,
          e.name,
          ROUND(AVG(er.rating)::numeric, 2) AS avg_rating,
          COUNT(*)::bigint AS rating_count
        FROM public.event_ratings er
        INNER JOIN public.events e ON e.id = er.event_id
        GROUP BY e.id, e.slug, e.name
        ORDER BY AVG(er.rating) DESC, COUNT(*) DESC
        LIMIT p_limit
      ) t
    ),
    'artist_sightings_count', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.sightings_count DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          a.id AS artist_id,
          a.slug,
          COALESCE(NULLIF(TRIM(a.name_display), ''), a.name) AS name,
          COUNT(s.id)::bigint AS sightings_count
        FROM public.artist_sightings s
        INNER JOIN public.artists a ON a.id = s.artist_id
        GROUP BY a.id, a.slug, COALESCE(NULLIF(TRIM(a.name_display), ''), a.name)
        ORDER BY sightings_count DESC
        LIMIT p_limit
      ) t
    ),
    'artist_sightings_rated', (
      SELECT COALESCE(
        jsonb_agg(to_jsonb(t) ORDER BY t.avg_rating DESC, t.rating_count DESC),
        '[]'::jsonb
      )
      FROM (
        SELECT
          a.id AS artist_id,
          a.slug,
          COALESCE(NULLIF(TRIM(a.name_display), ''), a.name) AS name,
          ROUND(AVG(s.rating)::numeric, 2) AS avg_rating,
          COUNT(*)::bigint AS rating_count
        FROM public.artist_sightings s
        INNER JOIN public.artists a ON a.id = s.artist_id
        WHERE s.rating IS NOT NULL
        GROUP BY a.id, a.slug, COALESCE(NULLIF(TRIM(a.name_display), ''), a.name)
        ORDER BY AVG(s.rating) DESC, COUNT(*) DESC
        LIMIT p_limit
      ) t
    )
  );
$$;

REVOKE ALL ON FUNCTION public.admin_engagement_stats(integer) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_engagement_stats(integer) TO service_role;
