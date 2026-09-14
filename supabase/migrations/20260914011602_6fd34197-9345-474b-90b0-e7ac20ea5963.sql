CREATE OR REPLACE FUNCTION public.community_activity_rows_since(p_since timestamptz)
RETURNS TABLE(user_id uuid, source text, source_id text, started_at timestamptz, activity_name text, activity_type text, distance_m numeric, duration_s numeric, elevation_m numeric, summary_polyline text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
  SELECT user_id, 'strava', id::text, start_date, COALESCE(name,'Run'), public.community_sport_label('strava', sport_type), COALESCE(distance,0), COALESCE(moving_time,0), COALESCE(total_elevation_gain,0), summary_polyline
  FROM public.strava_activities WHERE start_date >= p_since
  UNION ALL
  SELECT user_id, 'intervals', id::text, start_date, COALESCE(name,'Run'), public.community_sport_label('intervals', sport_type), COALESCE(distance,0), COALESCE(moving_time,0), COALESCE(total_elevation_gain,0), summary_polyline
  FROM public.intervals_activities WHERE start_date >= p_since
  UNION ALL
  SELECT user_id, 'suunto', id::text, start_date, COALESCE(name,'Run'), public.community_sport_label('suunto', sport_type), COALESCE(distance,0), COALESCE(moving_time,0), COALESCE(total_elevation_gain,0), summary_polyline
  FROM public.suunto_activities WHERE start_date >= p_since
  UNION ALL
  SELECT user_id, 'apple_health', id::text, start_date, COALESCE(name,'Run'), public.community_sport_label('apple_health', sport_type), COALESCE(distance,0), COALESCE(moving_time,0), COALESCE(total_elevation_gain,0), NULL
  FROM public.apple_health_activities WHERE start_date >= p_since
  UNION ALL
  SELECT user_id, 'terra', id::text, start_time, COALESCE(activity_name,'Run'), public.community_sport_label('terra', activity_type), COALESCE(distance_meters,0), COALESCE(duration_seconds,0), COALESCE(elevation_gain,0), summary_polyline
  FROM public.terra_activities WHERE start_time >= p_since
  UNION ALL
  SELECT user_id, 'garmin', id::text, start_time, COALESCE(activity_name,'Run'), public.community_sport_label('garmin', activity_type), COALESCE(distance_meters,0), COALESCE(duration_seconds,0), COALESCE(elevation_gain,0), summary_polyline
  FROM public.garmin_activities WHERE start_time >= p_since
  UNION ALL
  SELECT user_id, 'polar', id::text, start_date, 'Run', public.community_sport_label('polar', sport_type), COALESCE(distance,0), COALESCE(duration,0), 0, NULL
  FROM public.polar_activities WHERE start_date >= p_since;
$function$;

CREATE INDEX IF NOT EXISTS idx_strava_activities_start_date ON public.strava_activities(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_intervals_activities_start_date ON public.intervals_activities(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_suunto_activities_start_date ON public.suunto_activities(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_apple_health_activities_start_date ON public.apple_health_activities(start_date DESC);
CREATE INDEX IF NOT EXISTS idx_terra_activities_start_time ON public.terra_activities(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_garmin_activities_start_time ON public.garmin_activities(start_time DESC);
CREATE INDEX IF NOT EXISTS idx_polar_activities_start_date ON public.polar_activities(start_date DESC);