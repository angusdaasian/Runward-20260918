CREATE OR REPLACE FUNCTION public.get_social_activity_streams(p_source text, p_source_id text)
RETURNS TABLE(
  avg_hr numeric,
  max_hr numeric,
  laps jsonb,
  hr_samples jsonb,
  distance_samples jsonb,
  zone_lowers numeric[]
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_user uuid;
  v_allowed boolean := false;
  v_custom numeric[];
  v_age int;
  v_max numeric;
  v_rest numeric := 60;
  v_reserve numeric;
BEGIN
  SELECT a.user_id INTO v_user
  FROM public.community_activity_rows_since(now() - interval '400 days') a
  WHERE a.source = p_source AND a.source_id = p_source_id
  LIMIT 1;

  IF v_user IS NULL THEN RETURN; END IF;

  SELECT (v_user = auth.uid()
          OR public.shares_group_with(auth.uid(), v_user)
          OR EXISTS (SELECT 1 FROM public.social_prefs s WHERE s.user_id = v_user AND s.social_opt_in))
  INTO v_allowed;

  IF NOT v_allowed THEN RETURN; END IF;

  SELECT p.custom_hr_zones::numeric[], p.age INTO v_custom, v_age
  FROM public.profiles p WHERE p.user_id = v_user;

  IF v_custom IS NOT NULL AND array_length(v_custom, 1) = 5 THEN
    zone_lowers := v_custom;
  ELSE
    v_max := CASE WHEN v_age IS NOT NULL AND v_age > 0 AND v_age < 120 THEN greatest(120, 220 - v_age) ELSE 190 END;
    v_reserve := greatest(1, v_max - v_rest);
    zone_lowers := ARRAY[
      round(v_rest + 0.5 * v_reserve),
      round(v_rest + 0.6 * v_reserve),
      round(v_rest + 0.7 * v_reserve),
      round(v_rest + 0.8 * v_reserve),
      round(v_rest + 0.9 * v_reserve)
    ];
  END IF;

  IF p_source = 'strava' THEN
    SELECT t.average_heartrate, t.max_heartrate, NULL::jsonb, NULL::jsonb, NULL::jsonb
      INTO avg_hr, max_hr, laps, hr_samples, distance_samples
    FROM public.strava_activities t WHERE t.id::text = p_source_id;
  ELSIF p_source = 'intervals' THEN
    SELECT t.average_heartrate, t.max_heartrate, NULL::jsonb, NULL::jsonb, NULL::jsonb
      INTO avg_hr, max_hr, laps, hr_samples, distance_samples
    FROM public.intervals_activities t WHERE t.id::text = p_source_id;
  ELSIF p_source = 'apple_health' THEN
    SELECT t.average_heartrate, t.max_heartrate, NULL::jsonb, NULL::jsonb, NULL::jsonb
      INTO avg_hr, max_hr, laps, hr_samples, distance_samples
    FROM public.apple_health_activities t WHERE t.id::text = p_source_id;
  ELSIF p_source = 'suunto' THEN
    SELECT t.average_heartrate, t.max_heartrate, NULL::jsonb, t.hr_samples, t.distance_samples
      INTO avg_hr, max_hr, laps, hr_samples, distance_samples
    FROM public.suunto_activities t WHERE t.id::text = p_source_id;
  ELSIF p_source = 'terra' THEN
    SELECT t.average_hr, t.max_hr, t.laps, t.hr_samples, t.distance_samples
      INTO avg_hr, max_hr, laps, hr_samples, distance_samples
    FROM public.terra_activities t WHERE t.id::text = p_source_id;
  ELSIF p_source = 'garmin' THEN
    SELECT t.average_hr, t.max_hr, t.laps, NULL::jsonb, NULL::jsonb
      INTO avg_hr, max_hr, laps, hr_samples, distance_samples
    FROM public.garmin_activities t WHERE t.id::text = p_source_id;
  ELSIF p_source = 'polar' THEN
    SELECT t.average_heart_rate, t.maximum_heart_rate, NULL::jsonb, NULL::jsonb, NULL::jsonb
      INTO avg_hr, max_hr, laps, hr_samples, distance_samples
    FROM public.polar_activities t WHERE t.id::text = p_source_id;
  ELSE
    RETURN;
  END IF;

  RETURN NEXT;
END;
$function$;

REVOKE ALL ON FUNCTION public.get_social_activity_streams(text, text) FROM public;
GRANT EXECUTE ON FUNCTION public.get_social_activity_streams(text, text) TO authenticated, service_role;