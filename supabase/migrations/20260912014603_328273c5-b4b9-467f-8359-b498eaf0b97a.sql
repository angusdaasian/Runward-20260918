CREATE OR REPLACE FUNCTION public.community_sport_label(p_source text, p_raw text)
RETURNS text LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT CASE
    WHEN p_raw IS NULL OR p_raw = '' THEN 'Run'
    WHEN p_raw ~ '^[0-9.]+$' THEN CASE split_part(p_raw, '.', 1)
      WHEN '8' THEN 'Run' WHEN '0' THEN 'Run' WHEN '37' THEN 'Run' WHEN '44' THEN 'Run'
      WHEN '59' THEN 'Run' WHEN '63' THEN 'Run' WHEN '64' THEN 'Run'
      WHEN '58' THEN 'Treadmill run' WHEN '149' THEN 'Trail run' WHEN '169' THEN 'Trail run' WHEN '210' THEN 'Trail run'
      WHEN '1' THEN 'Ride' WHEN '16' THEN 'Ride' WHEN '18' THEN 'Ride' WHEN '20' THEN 'Ride' WHEN '30' THEN 'Ride'
      WHEN '32' THEN 'Swim' WHEN '83' THEN 'Swim'
      WHEN '7' THEN 'Walk' WHEN '130' THEN 'Hike' WHEN '80' THEN 'Strength'
      ELSE 'Other' END
    ELSE p_raw
  END;
$$;

GRANT EXECUTE ON FUNCTION public.community_sport_label(text, text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.community_is_run(p_type text)
RETURNS boolean LANGUAGE sql IMMUTABLE SET search_path = public AS $$
  SELECT lower(public.community_sport_label('x', p_type)) LIKE '%run%';
$$;

GRANT EXECUTE ON FUNCTION public.community_is_run(text) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.community_activity_rows()
 RETURNS TABLE(user_id uuid, source text, source_id text, started_at timestamp with time zone, activity_name text, activity_type text, distance_m numeric, duration_s numeric, elevation_m numeric, summary_polyline text)
 LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public'
AS $function$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['strava_activities','terra_activities','apple_health_activities','garmin_activities','polar_activities','suunto_activities','intervals_activities'] LOOP
    RETURN QUERY EXECUTE format(
      'SELECT user_id, %L::text, id::text, COALESCE(to_jsonb(x)->>''start_date'', to_jsonb(x)->>''start_time'', to_jsonb(x)->>''start_date_local'', to_jsonb(x)->>''date'')::timestamptz, COALESCE(to_jsonb(x)->>''name'', to_jsonb(x)->>''activity_name'', to_jsonb(x)->>''title'', ''Run''), public.community_sport_label(%L, COALESCE(to_jsonb(x)->>''sport_type'', to_jsonb(x)->>''activity_type'', to_jsonb(x)->>''sport'', to_jsonb(x)->>''type'')), COALESCE(NULLIF(to_jsonb(x)->>''distance_meters'', '''')::numeric, NULLIF(to_jsonb(x)->>''distance_metres'', '''')::numeric, NULLIF(to_jsonb(x)->>''distance'', '''')::numeric, NULLIF(to_jsonb(x)->>''distance_km'', '''')::numeric * 1000, 0), COALESCE(NULLIF(to_jsonb(x)->>''moving_time'', '''')::numeric, NULLIF(to_jsonb(x)->>''duration_seconds'', '''')::numeric, NULLIF(to_jsonb(x)->>''duration'', '''')::numeric, 0), COALESCE(NULLIF(to_jsonb(x)->>''total_elevation_gain'', '''')::numeric, NULLIF(to_jsonb(x)->>''elevation_gain_meters'', '''')::numeric, NULLIF(to_jsonb(x)->>''elevation_gain'', '''')::numeric, NULLIF(to_jsonb(x)->>''elevation_meters'', '''')::numeric, 0), COALESCE(to_jsonb(x)->>''summary_polyline'', to_jsonb(x)->>''polyline'') FROM public.%I x',
      replace(t, '_activities', ''), replace(t, '_activities', ''), t
    );
  END LOOP;
END; $function$;
