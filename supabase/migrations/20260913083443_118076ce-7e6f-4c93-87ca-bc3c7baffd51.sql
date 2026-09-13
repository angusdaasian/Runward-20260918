CREATE INDEX IF NOT EXISTS idx_strava_activities_user_start ON public.strava_activities(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_terra_activities_user_start ON public.terra_activities(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_user_start ON public.garmin_activities(user_id, start_time);
CREATE INDEX IF NOT EXISTS idx_apple_health_activities_user_start ON public.apple_health_activities(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_polar_activities_user_start ON public.polar_activities(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_suunto_activities_user_start ON public.suunto_activities(user_id, start_date);
CREATE INDEX IF NOT EXISTS idx_intervals_activities_user_start ON public.intervals_activities(user_id, start_date);

CREATE OR REPLACE VIEW public.community_activities_v AS
  SELECT user_id, 'strava'::text AS source, id::text AS source_id, start_date AS started_at, name AS activity_name,
         public.community_sport_label('strava', sport_type) AS activity_type,
         COALESCE(distance,0)::numeric AS distance_m, COALESCE(moving_time,0)::numeric AS duration_s,
         COALESCE(total_elevation_gain,0)::numeric AS elevation_m, summary_polyline
  FROM public.strava_activities
  UNION ALL
  SELECT user_id, 'terra', id::text, start_time, activity_name,
         public.community_sport_label('terra', activity_type),
         COALESCE(distance_meters,0)::numeric, COALESCE(duration_seconds,0)::numeric,
         COALESCE(elevation_gain,0)::numeric, summary_polyline
  FROM public.terra_activities
  UNION ALL
  SELECT user_id, 'garmin', id::text, start_time, activity_name,
         public.community_sport_label('garmin', activity_type),
         COALESCE(distance_meters,0)::numeric, COALESCE(duration_seconds,0)::numeric,
         COALESCE(elevation_gain,0)::numeric, summary_polyline
  FROM public.garmin_activities
  UNION ALL
  SELECT user_id, 'apple', id::text, start_date, name,
         public.community_sport_label('apple', sport_type),
         COALESCE(distance,0)::numeric, COALESCE(moving_time,0)::numeric,
         COALESCE(total_elevation_gain,0)::numeric, NULL::text
  FROM public.apple_health_activities
  UNION ALL
  SELECT user_id, 'polar', id::text, start_date, detailed_sport_type,
         public.community_sport_label('polar', sport_type),
         COALESCE(distance,0)::numeric, COALESCE(duration,0)::numeric, 0::numeric, NULL::text
  FROM public.polar_activities
  UNION ALL
  SELECT user_id, 'suunto', id::text, start_date, name,
         public.community_sport_label('suunto', sport_type),
         COALESCE(distance,0)::numeric, COALESCE(moving_time,0)::numeric,
         COALESCE(total_elevation_gain,0)::numeric, summary_polyline
  FROM public.suunto_activities
  UNION ALL
  SELECT user_id, 'intervals', id::text, start_date, name,
         public.community_sport_label('intervals', sport_type),
         COALESCE(distance,0)::numeric, COALESCE(moving_time,0)::numeric,
         COALESCE(total_elevation_gain,0)::numeric, summary_polyline
  FROM public.intervals_activities;

REVOKE ALL ON public.community_activities_v FROM anon, authenticated;
GRANT SELECT ON public.community_activities_v TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_month_km(p_month date DEFAULT (date_trunc('month'::text, now()))::date)
RETURNS TABLE(distance_km numeric, run_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  SELECT round(COALESCE(sum(a.distance_m), 0) / 1000, 2), count(*)
  FROM public.community_activities_v a
  WHERE a.user_id = auth.uid()
    AND a.started_at >= date_trunc('month', p_month::timestamp)
    AND a.started_at < date_trunc('month', p_month::timestamp) + interval '1 month'
    AND public.community_is_run(a.activity_type);
$$;

CREATE OR REPLACE FUNCTION public.get_km_leaderboard(p_month date DEFAULT (date_trunc('month'::text, now()))::date, p_limit integer DEFAULT 100)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, distance_km numeric, run_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH runs AS (
    SELECT a.user_id, sum(a.distance_m) AS dist, count(*) AS runs
    FROM public.community_activities_v a
    WHERE a.started_at >= date_trunc('month', p_month::timestamp)
      AND a.started_at < date_trunc('month', p_month::timestamp) + interval '1 month'
      AND public.community_is_run(a.activity_type)
      AND a.user_id IN (SELECT s.user_id FROM public.social_prefs s WHERE s.leaderboard_opt_in)
    GROUP BY a.user_id
  )
  SELECT p.user_id, p.display_name, p.avatar_url, round(r.dist / 1000, 2), r.runs
  FROM runs r JOIN public.profiles p ON p.user_id = r.user_id
  ORDER BY r.dist DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;

CREATE OR REPLACE FUNCTION public.get_group_leaderboard(p_group_id uuid, p_month date DEFAULT (date_trunc('month'::text, now()))::date)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, distance_km numeric, run_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $$
  WITH allowed AS (
    SELECT m.user_id FROM public.leaderboard_group_members m
    WHERE m.group_id = p_group_id
      AND EXISTS (SELECT 1 FROM public.leaderboard_group_members mine WHERE mine.group_id = p_group_id AND mine.user_id = auth.uid())
  ), runs AS (
    SELECT a.user_id, sum(a.distance_m) AS dist, count(*) AS runs
    FROM public.community_activities_v a
    WHERE a.user_id IN (SELECT user_id FROM allowed)
      AND a.started_at >= date_trunc('month', p_month::timestamp)
      AND a.started_at < date_trunc('month', p_month::timestamp) + interval '1 month'
      AND public.community_is_run(a.activity_type)
    GROUP BY a.user_id
  )
  SELECT p.user_id, p.display_name, p.avatar_url, round(COALESCE(r.dist,0) / 1000, 2), COALESCE(r.runs, 0)
  FROM allowed al JOIN public.profiles p ON p.user_id = al.user_id LEFT JOIN runs r ON r.user_id = al.user_id
  ORDER BY r.dist DESC NULLS LAST;
$$;

GRANT EXECUTE ON FUNCTION public.get_my_month_km(date) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_km_leaderboard(date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_group_leaderboard(uuid, date) TO authenticated;