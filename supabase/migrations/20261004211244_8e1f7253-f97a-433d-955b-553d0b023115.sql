CREATE OR REPLACE FUNCTION public.get_public_routes(p_limit integer DEFAULT 100)
RETURNS TABLE(source text, source_id text, user_id uuid, display_name text, started_at timestamptz, activity_name text, distance_km numeric, elevation_m numeric, summary_polyline text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT DISTINCT ON (a.user_id, round(a.distance_m / 500), left(a.summary_polyline, 12))
         a.source, a.source_id, a.user_id, p.display_name, a.started_at, a.activity_name,
         round(a.distance_m / 1000, 2), a.elevation_m, a.summary_polyline
  FROM public.community_activity_rows_since(now() - interval '180 days') a
  JOIN public.social_prefs s ON s.user_id = a.user_id AND s.social_opt_in
  JOIN public.profiles p ON p.user_id = a.user_id
  WHERE auth.uid() IS NOT NULL
    AND public.community_is_run(a.activity_type)
    AND length(coalesce(a.summary_polyline, '')) > 20
    AND a.distance_m >= 1000
  ORDER BY a.user_id, round(a.distance_m / 500), left(a.summary_polyline, 12), a.started_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 300);
$$;
REVOKE ALL ON FUNCTION public.get_public_routes(integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.get_public_routes(integer) TO authenticated;