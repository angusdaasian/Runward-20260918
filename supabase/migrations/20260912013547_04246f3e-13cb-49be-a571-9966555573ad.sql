CREATE OR REPLACE FUNCTION public.polyline_first_point(p_encoded text)
RETURNS numeric[] LANGUAGE plpgsql IMMUTABLE STRICT SET search_path = public AS $$
DECLARE idx integer := 1; lat integer := 0; lng integer := 0; shift integer; result integer; b integer; delta integer; n integer := length(p_encoded);
BEGIN
  IF p_encoded ~ '^-?[0-9]+([.][0-9]+)?,-?[0-9]+([.][0-9]+)?' THEN RETURN ARRAY[split_part(p_encoded, ',', 1)::numeric, split_part(p_encoded, ',', 2)::numeric]; END IF;
  shift := 0; result := 0;
  LOOP
    IF idx > n THEN RETURN NULL; END IF; b := ascii(substr(p_encoded, idx, 1)) - 63; idx := idx + 1; result := result | ((b & 31) << shift); shift := shift + 5; EXIT WHEN b < 32;
  END LOOP;
  delta := CASE WHEN (result & 1) = 1 THEN NOT (result >> 1) ELSE result >> 1 END; lat := lat + delta;
  shift := 0; result := 0;
  LOOP
    IF idx > n THEN RETURN NULL; END IF; b := ascii(substr(p_encoded, idx, 1)) - 63; idx := idx + 1; result := result | ((b & 31) << shift); shift := shift + 5; EXIT WHEN b < 32;
  END LOOP;
  delta := CASE WHEN (result & 1) = 1 THEN NOT (result >> 1) ELSE result >> 1 END; lng := lng + delta;
  RETURN ARRAY[lat::numeric / 100000, lng::numeric / 100000];
EXCEPTION WHEN OTHERS THEN RETURN NULL;
END; $$;
REVOKE ALL ON FUNCTION public.polyline_first_point(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.polyline_first_point(text) TO service_role;

CREATE OR REPLACE FUNCTION public.get_social_feed(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE(source text, source_id text, user_id uuid, display_name text, avatar_url text, started_at timestamptz, activity_name text, activity_type text, distance_km numeric, duration_s numeric, elevation_m numeric, summary_polyline text, start_lat_rounded numeric, start_lng_rounded numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH decoded AS (
    SELECT a.*, public.polyline_first_point(a.summary_polyline) AS point FROM public.community_activity_rows() a
  ), located AS (
    SELECT d.*, d.point[1] AS start_lat, d.point[2] AS start_lng FROM decoded d
  ), viewer AS (
    SELECT avg(d.start_lat) lat, avg(d.start_lng) lng FROM located d WHERE d.user_id = auth.uid() AND d.started_at >= now() - interval '90 days' AND d.start_lat IS NOT NULL
  )
  SELECT d.source, d.source_id, d.user_id, p.display_name, p.avatar_url, d.started_at, d.activity_name, d.activity_type, round(d.distance_m / 1000, 2), d.duration_s, d.elevation_m, NULL::text, round(d.start_lat, 2), round(d.start_lng, 2)
  FROM located d JOIN public.social_prefs s ON s.user_id = d.user_id AND s.social_opt_in JOIN public.profiles p ON p.user_id = d.user_id CROSS JOIN viewer v
  WHERE lower(COALESCE(d.activity_type, 'run')) LIKE '%run%'
  ORDER BY CASE WHEN d.start_lat IS NULL OR v.lat IS NULL THEN 1 ELSE 0 END, CASE WHEN d.start_lat IS NULL OR v.lat IS NULL THEN NULL ELSE power(d.start_lat - v.lat, 2) + power((d.start_lng - v.lng) * cos(radians(v.lat)), 2) END, d.started_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
$$;
REVOKE ALL ON FUNCTION public.get_social_feed(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_social_feed(integer, integer) TO authenticated;