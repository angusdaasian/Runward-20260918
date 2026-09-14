CREATE OR REPLACE FUNCTION public.shares_group_with(p_a uuid, p_b uuid)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.leaderboard_group_members m1
    JOIN public.leaderboard_group_members m2 ON m2.group_id = m1.group_id
    WHERE m1.user_id = p_a AND m2.user_id = p_b
  );
$$;

CREATE OR REPLACE FUNCTION public.get_group_feed(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE(source text, source_id text, user_id uuid, display_name text, avatar_url text, started_at timestamp with time zone, activity_name text, activity_type text, distance_km numeric, duration_s numeric, elevation_m numeric, group_names text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH friends AS (
    SELECT DISTINCT m2.user_id
    FROM public.leaderboard_group_members m1
    JOIN public.leaderboard_group_members m2 ON m2.group_id = m1.group_id
    WHERE m1.user_id = auth.uid()
  ), raw AS (
    SELECT a.* FROM public.community_activity_rows_since(now() - interval '45 days') a
    WHERE public.community_is_run(a.activity_type)
      AND (a.user_id = auth.uid() OR a.user_id IN (SELECT user_id FROM friends))
  )
  SELECT r.source, r.source_id, r.user_id, p.display_name, p.avatar_url, r.started_at,
         r.activity_name, r.activity_type, round(r.distance_m / 1000, 2), r.duration_s, r.elevation_m,
         NULL::text
  FROM raw r
  JOIN public.profiles p ON p.user_id = r.user_id
  ORDER BY r.started_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
$$;

CREATE OR REPLACE FUNCTION public.get_social_activity_detail(p_source text, p_source_id text)
RETURNS TABLE(source text, source_id text, user_id uuid, display_name text, avatar_url text, started_at timestamp with time zone, activity_name text, activity_type text, distance_km numeric, duration_s numeric, elevation_m numeric, summary_polyline text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT a.source, a.source_id, a.user_id, p.display_name, p.avatar_url, a.started_at,
         a.activity_name, a.activity_type, round(a.distance_m / 1000, 2), a.duration_s, a.elevation_m,
         a.summary_polyline
  FROM public.community_activity_rows_since(now() - interval '400 days') a
  JOIN public.profiles p ON p.user_id = a.user_id
  WHERE a.source = p_source AND a.source_id = p_source_id
    AND public.community_is_run(a.activity_type)
    AND (
      a.user_id = auth.uid()
      OR public.shares_group_with(auth.uid(), a.user_id)
      OR EXISTS (SELECT 1 FROM public.social_prefs s WHERE s.user_id = a.user_id AND s.social_opt_in)
    )
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.shares_group_with(uuid, uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_group_feed(integer, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_social_activity_detail(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.shares_group_with(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_group_feed(integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_social_activity_detail(text, text) TO authenticated, service_role;