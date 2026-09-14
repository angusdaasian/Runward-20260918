CREATE OR REPLACE FUNCTION public.get_group_feed(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE(source text, source_id text, user_id uuid, display_name text, avatar_url text, started_at timestamp with time zone, activity_name text, activity_type text, distance_km numeric, duration_s numeric, elevation_m numeric, avg_hr numeric, group_names text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH shared_groups AS (
    SELECT
      m2.user_id,
      string_agg(DISTINCT g.name, ', ' ORDER BY g.name) AS group_names
    FROM public.leaderboard_group_members m1
    JOIN public.leaderboard_group_members m2 ON m2.group_id = m1.group_id
    JOIN public.leaderboard_groups g ON g.id = m1.group_id
    WHERE m1.user_id = auth.uid()
    GROUP BY m2.user_id
  ), raw AS (
    SELECT a.*
    FROM public.community_activity_rows_since(now() - interval '45 days') a
    JOIN shared_groups sg ON sg.user_id = a.user_id
    WHERE public.community_is_run(a.activity_type)
  )
  SELECT
    r.source,
    r.source_id,
    r.user_id,
    p.display_name,
    p.avatar_url,
    r.started_at,
    r.activity_name,
    r.activity_type,
    round(r.distance_m / 1000, 2),
    r.duration_s,
    r.elevation_m,
    r.avg_hr,
    sg.group_names
  FROM raw r
  JOIN public.profiles p ON p.user_id = r.user_id
  JOIN shared_groups sg ON sg.user_id = r.user_id
  ORDER BY r.started_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100)
  OFFSET GREATEST(p_offset, 0);
$function$;

REVOKE ALL ON FUNCTION public.get_group_feed(integer, integer) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_group_feed(integer, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_group_feed(integer, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_feed(integer, integer) TO service_role;