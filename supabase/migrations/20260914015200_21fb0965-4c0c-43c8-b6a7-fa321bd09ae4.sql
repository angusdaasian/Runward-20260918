
CREATE OR REPLACE FUNCTION public.gen_group_invite_code()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_alphabet text := '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';
  v_code text;
  v_i int;
  v_try int := 0;
BEGIN
  LOOP
    v_code := '';
    FOR v_i IN 1..5 LOOP
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    END LOOP;
    EXIT WHEN NOT EXISTS (SELECT 1 FROM public.leaderboard_groups WHERE invite_code = v_code);
    v_try := v_try + 1;
    IF v_try > 50 THEN RAISE EXCEPTION 'could not generate invite code'; END IF;
  END LOOP;
  RETURN v_code;
END; $$;

GRANT EXECUTE ON FUNCTION public.gen_group_invite_code() TO authenticated, service_role;

ALTER TABLE public.leaderboard_groups ALTER COLUMN invite_code SET DEFAULT public.gen_group_invite_code();

UPDATE public.leaderboard_groups SET invite_code = public.gen_group_invite_code() WHERE length(coalesce(invite_code, '')) <> 5;

CREATE OR REPLACE FUNCTION public.rotate_group_code(p_group_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leaderboard_groups WHERE id = p_group_id AND owner_user_id = auth.uid()) THEN RAISE EXCEPTION 'owner access required'; END IF;
  v_code := public.gen_group_invite_code();
  UPDATE public.leaderboard_groups SET invite_code = v_code WHERE id = p_group_id;
  RETURN v_code;
END; $$;

GRANT EXECUTE ON FUNCTION public.rotate_group_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_social_feed(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE(source text, source_id text, user_id uuid, display_name text, avatar_url text, started_at timestamp with time zone, activity_name text, activity_type text, distance_km numeric, duration_s numeric, elevation_m numeric, summary_polyline text, start_lat_rounded numeric, start_lng_rounded numeric)
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
         NULL::text, round((d.point)[1], 2), round((d.point)[2], 2)
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
