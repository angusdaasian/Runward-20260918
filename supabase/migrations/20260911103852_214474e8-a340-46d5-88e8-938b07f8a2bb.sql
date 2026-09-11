CREATE TABLE public.social_prefs (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  leaderboard_opt_in boolean NOT NULL DEFAULT false,
  social_opt_in boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.social_prefs TO authenticated;
GRANT ALL ON public.social_prefs TO service_role;
ALTER TABLE public.social_prefs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users manage own social preferences" ON public.social_prefs FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE TRIGGER social_prefs_updated_at BEFORE UPDATE ON public.social_prefs FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.leaderboard_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  name text NOT NULL,
  emoji text,
  invite_code text NOT NULL UNIQUE DEFAULT upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8)),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaderboard_groups TO authenticated;
GRANT ALL ON public.leaderboard_groups TO service_role;
ALTER TABLE public.leaderboard_groups ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Owners create leaderboard groups" ON public.leaderboard_groups FOR INSERT TO authenticated WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Owners update leaderboard groups" ON public.leaderboard_groups FOR UPDATE TO authenticated USING (owner_user_id = auth.uid()) WITH CHECK (owner_user_id = auth.uid());
CREATE POLICY "Owners delete leaderboard groups" ON public.leaderboard_groups FOR DELETE TO authenticated USING (owner_user_id = auth.uid());
CREATE TRIGGER leaderboard_groups_updated_at BEFORE UPDATE ON public.leaderboard_groups FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.leaderboard_group_members (
  group_id uuid NOT NULL REFERENCES public.leaderboard_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.profiles(user_id) ON DELETE CASCADE,
  role text NOT NULL DEFAULT 'member',
  joined_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id),
  CONSTRAINT leaderboard_group_member_role_valid CHECK (role IN ('owner', 'member'))
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.leaderboard_group_members TO authenticated;
GRANT ALL ON public.leaderboard_group_members TO service_role;
ALTER TABLE public.leaderboard_group_members ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Members view shared group roster" ON public.leaderboard_group_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.leaderboard_group_members mine WHERE mine.group_id = group_id AND mine.user_id = auth.uid()));
CREATE POLICY "Users leave groups and owners remove members" ON public.leaderboard_group_members FOR DELETE TO authenticated USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.leaderboard_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid()));
CREATE POLICY "Members view leaderboard groups" ON public.leaderboard_groups FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.leaderboard_group_members m WHERE m.group_id = id AND m.user_id = auth.uid()));

CREATE OR REPLACE FUNCTION public.community_activity_rows()
RETURNS TABLE(user_id uuid, source text, source_id text, started_at timestamptz, activity_name text, activity_type text, distance_m numeric, duration_s numeric, elevation_m numeric, summary_polyline text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['strava_activities','terra_activities','apple_health_activities','garmin_activities','polar_activities','suunto_activities','intervals_activities'] LOOP
    RETURN QUERY EXECUTE format(
      'SELECT user_id, %L::text, id::text, COALESCE(to_jsonb(x)->>''start_date'', to_jsonb(x)->>''start_time'', to_jsonb(x)->>''start_date_local'', to_jsonb(x)->>''date'')::timestamptz, COALESCE(to_jsonb(x)->>''name'', to_jsonb(x)->>''activity_name'', to_jsonb(x)->>''title'', ''Run''), COALESCE(to_jsonb(x)->>''sport_type'', to_jsonb(x)->>''activity_type'', to_jsonb(x)->>''sport'', to_jsonb(x)->>''type'', ''Run''), COALESCE(NULLIF(to_jsonb(x)->>''distance_meters'', '''')::numeric, NULLIF(to_jsonb(x)->>''distance_metres'', '''')::numeric, NULLIF(to_jsonb(x)->>''distance'', '''')::numeric, NULLIF(to_jsonb(x)->>''distance_km'', '''')::numeric * 1000, 0), COALESCE(NULLIF(to_jsonb(x)->>''moving_time'', '''')::numeric, NULLIF(to_jsonb(x)->>''duration_seconds'', '''')::numeric, NULLIF(to_jsonb(x)->>''duration'', '''')::numeric, 0), COALESCE(NULLIF(to_jsonb(x)->>''total_elevation_gain'', '''')::numeric, NULLIF(to_jsonb(x)->>''elevation_gain_meters'', '''')::numeric, NULLIF(to_jsonb(x)->>''elevation_gain'', '''')::numeric, NULLIF(to_jsonb(x)->>''elevation_meters'', '''')::numeric, 0), COALESCE(to_jsonb(x)->>''summary_polyline'', to_jsonb(x)->>''polyline'') FROM public.%I x',
      replace(t, '_activities', ''), t
    );
  END LOOP;
END; $$;
REVOKE ALL ON FUNCTION public.community_activity_rows() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.community_activity_rows() TO service_role;

CREATE OR REPLACE FUNCTION public.get_my_month_km(p_month date DEFAULT date_trunc('month', now())::date)
RETURNS TABLE(distance_km numeric, run_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT round(COALESCE(sum(a.distance_m), 0) / 1000, 2), count(*)
  FROM public.community_activity_rows() a
  WHERE a.user_id = auth.uid() AND a.started_at >= date_trunc('month', p_month::timestamp) AND a.started_at < date_trunc('month', p_month::timestamp) + interval '1 month' AND lower(COALESCE(a.activity_type, 'run')) LIKE '%run%';
$$;
REVOKE ALL ON FUNCTION public.get_my_month_km(date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_month_km(date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_km_leaderboard(p_month date DEFAULT date_trunc('month', now())::date, p_limit integer DEFAULT 100)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, distance_km numeric, run_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.display_name, p.avatar_url, round(sum(a.distance_m) / 1000, 2), count(*)
  FROM public.social_prefs s JOIN public.profiles p ON p.user_id = s.user_id JOIN public.community_activity_rows() a ON a.user_id = s.user_id
  WHERE s.leaderboard_opt_in AND a.started_at >= date_trunc('month', p_month::timestamp) AND a.started_at < date_trunc('month', p_month::timestamp) + interval '1 month' AND lower(COALESCE(a.activity_type, 'run')) LIKE '%run%'
  GROUP BY p.user_id, p.display_name, p.avatar_url ORDER BY sum(a.distance_m) DESC LIMIT LEAST(GREATEST(p_limit, 1), 200);
$$;
REVOKE ALL ON FUNCTION public.get_km_leaderboard(date, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_km_leaderboard(date, integer) TO authenticated;

CREATE OR REPLACE FUNCTION public.create_leaderboard_group(p_name text, p_emoji text DEFAULT NULL)
RETURNS TABLE(id uuid, name text, emoji text, invite_code text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group public.leaderboard_groups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF length(trim(p_name)) < 2 OR length(trim(p_name)) > 50 THEN RAISE EXCEPTION 'group name must be 2 to 50 characters'; END IF;
  INSERT INTO public.leaderboard_groups(owner_user_id, name, emoji) VALUES (auth.uid(), trim(p_name), nullif(trim(p_emoji), '')) RETURNING * INTO v_group;
  INSERT INTO public.leaderboard_group_members(group_id, user_id, role) VALUES (v_group.id, auth.uid(), 'owner');
  RETURN QUERY SELECT v_group.id, v_group.name, v_group.emoji, v_group.invite_code;
END; $$;
REVOKE ALL ON FUNCTION public.create_leaderboard_group(text, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_leaderboard_group(text, text) TO authenticated;

CREATE OR REPLACE FUNCTION public.join_group_by_code(p_code text)
RETURNS TABLE(id uuid, name text, emoji text)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_group public.leaderboard_groups%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  SELECT * INTO v_group FROM public.leaderboard_groups g WHERE g.invite_code = upper(trim(p_code));
  IF v_group.id IS NULL THEN RAISE EXCEPTION 'invalid invitation'; END IF;
  INSERT INTO public.leaderboard_group_members(group_id, user_id, role) VALUES (v_group.id, auth.uid(), 'member') ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT v_group.id, v_group.name, v_group.emoji;
END; $$;
REVOKE ALL ON FUNCTION public.join_group_by_code(text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.join_group_by_code(text) TO authenticated;

CREATE OR REPLACE FUNCTION public.rotate_group_code(p_group_id uuid)
RETURNS text LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_code text;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.leaderboard_groups WHERE id = p_group_id AND owner_user_id = auth.uid()) THEN RAISE EXCEPTION 'owner access required'; END IF;
  v_code := upper(substr(encode(gen_random_bytes(8), 'hex'), 1, 8));
  UPDATE public.leaderboard_groups SET invite_code = v_code WHERE id = p_group_id;
  RETURN v_code;
END; $$;
REVOKE ALL ON FUNCTION public.rotate_group_code(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.rotate_group_code(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_group_by_code(p_code text)
RETURNS TABLE(id uuid, name text, emoji text, member_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.name, g.emoji, count(m.user_id) FROM public.leaderboard_groups g LEFT JOIN public.leaderboard_group_members m ON m.group_id = g.id WHERE g.invite_code = upper(trim(p_code)) GROUP BY g.id, g.name, g.emoji;
$$;
REVOKE ALL ON FUNCTION public.get_group_by_code(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_by_code(text) TO anon, authenticated;

CREATE OR REPLACE FUNCTION public.get_my_leaderboard_groups()
RETURNS TABLE(id uuid, name text, emoji text, invite_code text, owner_user_id uuid, member_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT g.id, g.name, g.emoji, CASE WHEN g.owner_user_id = auth.uid() THEN g.invite_code ELSE NULL END, g.owner_user_id, count(all_m.user_id)
  FROM public.leaderboard_group_members mine JOIN public.leaderboard_groups g ON g.id = mine.group_id LEFT JOIN public.leaderboard_group_members all_m ON all_m.group_id = g.id
  WHERE mine.user_id = auth.uid() GROUP BY g.id, g.name, g.emoji, g.invite_code, g.owner_user_id ORDER BY g.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_leaderboard_groups() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_leaderboard_groups() TO authenticated;

CREATE OR REPLACE FUNCTION public.get_group_leaderboard(p_group_id uuid, p_month date DEFAULT date_trunc('month', now())::date)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, distance_km numeric, run_count bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.user_id, p.display_name, p.avatar_url, round(COALESCE(sum(a.distance_m), 0) / 1000, 2), count(a.source_id)
  FROM public.leaderboard_group_members m JOIN public.profiles p ON p.user_id = m.user_id LEFT JOIN public.community_activity_rows() a ON a.user_id = m.user_id AND a.started_at >= date_trunc('month', p_month::timestamp) AND a.started_at < date_trunc('month', p_month::timestamp) + interval '1 month' AND lower(COALESCE(a.activity_type, 'run')) LIKE '%run%'
  WHERE m.group_id = p_group_id AND EXISTS (SELECT 1 FROM public.leaderboard_group_members mine WHERE mine.group_id = p_group_id AND mine.user_id = auth.uid())
  GROUP BY p.user_id, p.display_name, p.avatar_url ORDER BY sum(a.distance_m) DESC NULLS LAST;
$$;
REVOKE ALL ON FUNCTION public.get_group_leaderboard(uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_group_leaderboard(uuid, date) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_social_feed(p_limit integer DEFAULT 30, p_offset integer DEFAULT 0)
RETURNS TABLE(source text, source_id text, user_id uuid, display_name text, avatar_url text, started_at timestamptz, activity_name text, activity_type text, distance_km numeric, duration_s numeric, elevation_m numeric, summary_polyline text, start_lat_rounded numeric, start_lng_rounded numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH decoded AS (
    SELECT a.*, CASE WHEN a.summary_polyline ~ '^-?[0-9]+([.][0-9]+)?,-?[0-9]+([.][0-9]+)?' THEN split_part(a.summary_polyline, ',', 1)::numeric ELSE NULL END AS start_lat, CASE WHEN a.summary_polyline ~ '^-?[0-9]+([.][0-9]+)?,-?[0-9]+([.][0-9]+)?' THEN split_part(a.summary_polyline, ',', 2)::numeric ELSE NULL END AS start_lng
    FROM public.community_activity_rows() a
  ), viewer AS (
    SELECT avg(d.start_lat) lat, avg(d.start_lng) lng FROM decoded d WHERE d.user_id = auth.uid() AND d.started_at >= now() - interval '90 days' AND d.start_lat IS NOT NULL
  )
  SELECT d.source, d.source_id, d.user_id, p.display_name, p.avatar_url, d.started_at, d.activity_name, d.activity_type, round(d.distance_m / 1000, 2), d.duration_s, d.elevation_m, d.summary_polyline, round(d.start_lat, 2), round(d.start_lng, 2)
  FROM decoded d JOIN public.social_prefs s ON s.user_id = d.user_id AND s.social_opt_in JOIN public.profiles p ON p.user_id = d.user_id CROSS JOIN viewer v
  WHERE lower(COALESCE(d.activity_type, 'run')) LIKE '%run%'
  ORDER BY CASE WHEN d.start_lat IS NULL OR v.lat IS NULL THEN 1 ELSE 0 END, CASE WHEN d.start_lat IS NULL OR v.lat IS NULL THEN NULL ELSE power(d.start_lat - v.lat, 2) + power((d.start_lng - v.lng) * cos(radians(v.lat)), 2) END, d.started_at DESC
  LIMIT LEAST(GREATEST(p_limit, 1), 100) OFFSET GREATEST(p_offset, 0);
$$;
REVOKE ALL ON FUNCTION public.get_social_feed(integer, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_social_feed(integer, integer) TO authenticated;