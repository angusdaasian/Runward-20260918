CREATE OR REPLACE VIEW public.community_activities_v AS
 SELECT user_id, 'strava'::text AS source, id::text AS source_id, start_date AS started_at, name AS activity_name,
   community_sport_label('strava', sport_type) AS activity_type, COALESCE(distance,0::numeric) AS distance_m,
   COALESCE(moving_time,0)::numeric AS duration_s, COALESCE(total_elevation_gain,0::numeric) AS elevation_m,
   summary_polyline, average_heartrate::numeric AS avg_hr
 FROM strava_activities
UNION ALL
 SELECT user_id, 'terra', id::text, start_time, activity_name,
   community_sport_label('terra', activity_type), COALESCE(distance_meters,0::numeric),
   COALESCE(duration_seconds,0)::numeric, COALESCE(elevation_gain,0::numeric), summary_polyline, average_hr::numeric
 FROM terra_activities
UNION ALL
 SELECT user_id, 'garmin', id::text, start_time, activity_name,
   community_sport_label('garmin', activity_type), COALESCE(distance_meters,0::numeric),
   COALESCE(duration_seconds,0)::numeric, COALESCE(elevation_gain,0::numeric), summary_polyline, average_hr::numeric
 FROM garmin_activities
UNION ALL
 SELECT user_id, 'apple', id::text, start_date, name,
   community_sport_label('apple', sport_type), COALESCE(distance,0::numeric),
   COALESCE(moving_time,0)::numeric, COALESCE(total_elevation_gain,0::numeric), NULL::text, average_heartrate::numeric
 FROM apple_health_activities
UNION ALL
 SELECT user_id, 'polar', id::text, start_date, detailed_sport_type,
   community_sport_label('polar', sport_type), COALESCE(distance,0::numeric),
   COALESCE(duration,0)::numeric, 0::numeric, NULL::text, average_heart_rate::numeric
 FROM polar_activities
UNION ALL
 SELECT user_id, 'suunto', id::text, start_date, name,
   community_sport_label('suunto', sport_type), COALESCE(distance,0::numeric),
   COALESCE(moving_time,0)::numeric, COALESCE(total_elevation_gain,0::numeric), summary_polyline, average_heartrate::numeric
 FROM suunto_activities
UNION ALL
 SELECT user_id, 'intervals', id::text, start_date, name,
   community_sport_label('intervals', sport_type), COALESCE(distance,0::double precision)::numeric,
   COALESCE(moving_time,0)::numeric, COALESCE(total_elevation_gain,0::double precision)::numeric,
   summary_polyline, average_heartrate::numeric
 FROM intervals_activities;

CREATE OR REPLACE FUNCTION public.community_activity_rows_since(p_since timestamp with time zone)
RETURNS TABLE(user_id uuid, source text, source_id text, started_at timestamp with time zone, activity_name text, activity_type text, distance_m numeric, duration_s numeric, elevation_m numeric, summary_polyline text, avg_hr numeric)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT a.user_id, a.source, a.source_id, a.started_at, a.activity_name, a.activity_type,
         a.distance_m, a.duration_s, a.elevation_m, a.summary_polyline, a.avg_hr
  FROM public.community_activities_v a
  WHERE a.started_at >= p_since;
$$;

REVOKE ALL ON FUNCTION public.community_activity_rows_since(timestamp with time zone) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.community_activity_rows_since(timestamp with time zone) TO authenticated, service_role;