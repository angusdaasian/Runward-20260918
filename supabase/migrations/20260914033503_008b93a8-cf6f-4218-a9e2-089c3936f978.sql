DROP FUNCTION IF EXISTS public.community_activity_rows_since(timestamptz);
DROP FUNCTION IF EXISTS public.get_social_feed(integer, integer);
DROP FUNCTION IF EXISTS public.get_group_feed(integer, integer);

CREATE OR REPLACE FUNCTION public.community_activity_rows_since(p_since timestamptz)
RETURNS TABLE(user_id uuid, source text, source_id text, started_at timestamptz, activity_name text, activity_type text, distance_m numeric, duration_s numeric, elevation_m numeric, summary_polyline text, avg_hr numeric)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['strava_activities','terra_activities','apple_health_activities','garmin_activities','polar_activities','suunto_activities','intervals_activities'] LOOP
    RETURN QUERY EXECUTE format(
      'SELECT * FROM (SELECT user_id, %L::text AS source, id::text AS source_id, COALESCE(to_jsonb(x)->>''start_date'', to_jsonb(x)->>''start_time'', to_jsonb(x)->>''start_date_local'', to_jsonb(x)->>''date'')::timestamptz AS started_at, COALESCE(to_jsonb(x)->>''name'', to_jsonb(x)->>''activity_name'', to_jsonb(x)->>''title'', ''Run'') AS activity_name, public.community_sport_label(%L, COALESCE(to_jsonb(x)->>''sport_type'', to_jsonb(x)->>''activity_type'', to_jsonb(x)->>''sport'', to_jsonb(x)->>''type'')) AS activity_type, COALESCE(NULLIF(to_jsonb(x)->>''distance_meters'', '''')::numeric, NULLIF(to_jsonb(x)->>''distance_metres'', '''')::numeric, NULLIF(to_jsonb(x)->>''distance'', '''')::numeric, NULLIF(to_jsonb(x)->>''distance_km'', '''')::numeric * 1000, 0) AS distance_m, COALESCE(NULLIF(to_jsonb(x)->>''moving_time'', '''')::numeric, NULLIF(to_jsonb(x)->>''duration_seconds'', '''')::numeric, NULLIF(to_jsonb(x)->>''duration'', '''')::numeric, 0) AS duration_s, COALESCE(NULLIF(to_jsonb(x)->>''total_elevation_gain'', '''')::numeric, NULLIF(to_jsonb(x)->>''elevation_gain_meters'', '''')::numeric, NULLIF(to_jsonb(x)->>''elevation_gain'', '''')::numeric, NULLIF(to_jsonb(x)->>''elevation_meters'', '''')::numeric, 0) AS elevation_m, COALESCE(to_jsonb(x)->>''summary_polyline'', to_jsonb(x)->>''polyline'') AS summary_polyline, COALESCE(NULLIF(to_jsonb(x)->>''average_heartrate'', '''')::numeric, NULLIF(to_jsonb(x)->>''average_hr'', '''')::numeric, NULLIF(to_jsonb(x)->>''average_heart_rate'', '''')::numeric, NULLIF(to_jsonb(x)->>''avg_hr'', '''')::numeric, NULLIF(to_jsonb(x)->>''avg_heartrate'', '''')::numeric) AS avg_hr FROM public.%I x) s WHERE s.started_at >= $1',
      replace(t, '_activities', ''), replace(t, '_activities', ''), t
    ) USING p_since;
  END LOOP;
END; $function$;

CREATE OR REPLACE FUNCTION public.get_social_feed(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE(source text, source_id text, user_id uuid, display_name text, avatar_url text, started_at timestamp with time zone, activity_name text, activity_type text, distance_km numeric, duration_s numeric, elevation_m numeric, summary_polyline text, start_lat_rounded numeric, start_lng_rounded numeric, avg_hr numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH raw AS (
    SELECT a.* FROM public.community_activity_rows_since(now() - interval '45 days') a
    WHERE public.community_is_run(a.activity_type)
      AND EXISTS (SELECT 1 FROM public.social_prefs s WHERE s.user_id = a.user_id AND s.social_opt_in)
  ), mine AS (
    SELECT public.polyline_first_point(r.summary_polyline) AS point
    FROM public.community_activity_rows_since(now() - interval '45 days') r
    WHERE r.user_id = auth.uid() AND r.summary_polyline IS NOT NULL
      AND public.community_is_run(r.activity_type)
    ORDER BY r.started_at DESC LIMIT 15
  ), viewer AS (
    SELECT avg(point[1]) AS lat, avg(point[2]) AS lng FROM mine WHERE point IS NOT NULL
  ), top AS (
    SELECT s.* FROM raw s ORDER BY s.started_at DESC LIMIT 200
  ), located AS (
    SELECT t.*, public.polyline_first_point(t.summary_polyline) AS point FROM top t
  )
  SELECT d.source, d.source_id, d.user_id, p.display_name, p.avatar_url, d.started_at,
         d.activity_name, d.activity_type, round(d.distance_m / 1000, 2), d.duration_s, d.elevation_m,
         NULL::text, round((d.point)[1], 2), round((d.point)[2], 2), d.avg_hr
  FROM located d
  JOIN public.profiles p ON p.user_id = d.user_id
  CROSS JOIN viewer v
  ORDER BY
    CASE WHEN d.point IS NULL OR v.lat IS NULL THEN 1 ELSE 0 END,
    CASE WHEN d.point IS NULL OR v.lat IS NULL THEN NULL
         ELSE power((d.point)[1] - v.lat, 2) + power(((d.point)[2] - v.lng) * cos(radians(v.lat)), 2) END,
    d.started_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
$$;

GRANT EXECUTE ON FUNCTION public.get_social_feed(integer, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_group_feed(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE(source text, source_id text, user_id uuid, display_name text, avatar_url text, started_at timestamp with time zone, activity_name text, activity_type text, distance_km numeric, duration_s numeric, elevation_m numeric, avg_hr numeric, group_names text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO public AS $$
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
         r.avg_hr, NULL::text
  FROM raw r
  JOIN public.profiles p ON p.user_id = r.user_id
  ORDER BY r.started_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
$$;

REVOKE ALL ON FUNCTION public.get_group_feed(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_feed(integer, integer) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.community_activity_rows_since(timestamptz) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.community_activity_rows_since(timestamptz) TO authenticated, service_role;