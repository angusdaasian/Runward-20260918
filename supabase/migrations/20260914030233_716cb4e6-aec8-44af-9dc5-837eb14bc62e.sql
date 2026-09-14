CREATE OR REPLACE FUNCTION public.social_activity_owner(p_source text, p_source_id text)
RETURNS uuid LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE v_id uuid; v_user uuid;
BEGIN
  BEGIN v_id := p_source_id::uuid; EXCEPTION WHEN others THEN RETURN NULL; END;
  CASE p_source
    WHEN 'strava' THEN SELECT user_id INTO v_user FROM public.strava_activities WHERE id = v_id;
    WHEN 'terra' THEN SELECT user_id INTO v_user FROM public.terra_activities WHERE id = v_id;
    WHEN 'garmin' THEN SELECT user_id INTO v_user FROM public.garmin_activities WHERE id = v_id;
    WHEN 'apple' THEN SELECT user_id INTO v_user FROM public.apple_health_activities WHERE id = v_id;
    WHEN 'apple_health' THEN SELECT user_id INTO v_user FROM public.apple_health_activities WHERE id = v_id;
    WHEN 'polar' THEN SELECT user_id INTO v_user FROM public.polar_activities WHERE id = v_id;
    WHEN 'suunto' THEN SELECT user_id INTO v_user FROM public.suunto_activities WHERE id = v_id;
    WHEN 'intervals' THEN SELECT user_id INTO v_user FROM public.intervals_activities WHERE id = v_id;
    ELSE RETURN NULL;
  END CASE;
  RETURN v_user;
END $$;

CREATE OR REPLACE FUNCTION public.get_my_leaderboard_groups()
RETURNS TABLE(id uuid, name text, emoji text, invite_code text, owner_user_id uuid, member_count bigint, push_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT g.id, g.name, g.emoji,
         CASE WHEN g.owner_user_id = auth.uid() THEN g.invite_code ELSE NULL END,
         g.owner_user_id,
         (SELECT count(*) FROM public.leaderboard_group_members m2 WHERE m2.group_id = g.id),
         me.push_enabled
  FROM public.leaderboard_groups g
  JOIN public.leaderboard_group_members me ON me.group_id = g.id AND me.user_id = auth.uid()
  ORDER BY g.created_at DESC;
$$;
REVOKE ALL ON FUNCTION public.get_my_leaderboard_groups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_leaderboard_groups() TO authenticated, service_role;