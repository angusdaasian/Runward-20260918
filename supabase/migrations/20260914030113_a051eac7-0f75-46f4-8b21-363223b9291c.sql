-- ============ owner / visibility helpers ============
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
    WHEN 'polar' THEN SELECT user_id INTO v_user FROM public.polar_activities WHERE id = v_id;
    WHEN 'suunto' THEN SELECT user_id INTO v_user FROM public.suunto_activities WHERE id = v_id;
    WHEN 'intervals' THEN SELECT user_id INTO v_user FROM public.intervals_activities WHERE id = v_id;
    ELSE RETURN NULL;
  END CASE;
  RETURN v_user;
END $$;

CREATE OR REPLACE FUNCTION public.can_view_social_activity(p_source text, p_source_id text)
RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH o AS (SELECT public.social_activity_owner(p_source, p_source_id) AS uid)
  SELECT COALESCE((
    SELECT o.uid = auth.uid()
        OR public.shares_group_with(auth.uid(), o.uid)
        OR EXISTS (SELECT 1 FROM public.social_prefs s WHERE s.user_id = o.uid AND s.social_opt_in)
    FROM o WHERE o.uid IS NOT NULL
  ), false);
$$;

REVOKE ALL ON FUNCTION public.social_activity_owner(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.can_view_social_activity(text, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.social_activity_owner(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.can_view_social_activity(text, text) TO authenticated, service_role;

-- ============ likes ============
CREATE TABLE public.activity_likes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_id text NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (source, source_id, user_id)
);
GRANT SELECT, INSERT, DELETE ON public.activity_likes TO authenticated;
GRANT ALL ON public.activity_likes TO service_role;
ALTER TABLE public.activity_likes ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View likes on visible runs" ON public.activity_likes FOR SELECT TO authenticated
  USING (public.can_view_social_activity(source, source_id));
CREATE POLICY "Like visible runs" ON public.activity_likes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_social_activity(source, source_id));
CREATE POLICY "Remove own like" ON public.activity_likes FOR DELETE TO authenticated
  USING (user_id = auth.uid());
CREATE INDEX activity_likes_activity_idx ON public.activity_likes (source, source_id);

-- ============ comments ============
CREATE TABLE public.activity_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  source_id text NOT NULL,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT activity_comments_body_len CHECK (char_length(btrim(body)) BETWEEN 1 AND 500)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.activity_comments TO authenticated;
GRANT ALL ON public.activity_comments TO service_role;
ALTER TABLE public.activity_comments ENABLE ROW LEVEL SECURITY;
CREATE POLICY "View comments on visible runs" ON public.activity_comments FOR SELECT TO authenticated
  USING (public.can_view_social_activity(source, source_id));
CREATE POLICY "Comment on visible runs" ON public.activity_comments FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid() AND public.can_view_social_activity(source, source_id));
CREATE POLICY "Edit own comment" ON public.activity_comments FOR UPDATE TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "Delete own comment" ON public.activity_comments FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR public.social_activity_owner(source, source_id) = auth.uid());
CREATE INDEX activity_comments_activity_idx ON public.activity_comments (source, source_id, created_at);

CREATE TRIGGER activity_comments_updated_at BEFORE UPDATE ON public.activity_comments
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============ read RPCs ============
CREATE OR REPLACE FUNCTION public.get_activity_comments(p_source text, p_source_id text)
RETURNS TABLE(id uuid, user_id uuid, display_name text, avatar_url text, body text, created_at timestamptz, is_mine boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT c.id, c.user_id, p.display_name, p.avatar_url, c.body, c.created_at, c.user_id = auth.uid()
  FROM public.activity_comments c
  LEFT JOIN public.profiles p ON p.user_id = c.user_id
  WHERE c.source = p_source AND c.source_id = p_source_id
    AND public.can_view_social_activity(p_source, p_source_id)
  ORDER BY c.created_at ASC
  LIMIT 200;
$$;

CREATE OR REPLACE FUNCTION public.get_activity_likes(p_source text, p_source_id text)
RETURNS TABLE(like_count bigint, liked_by_me boolean, likers text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT count(*)::bigint,
         bool_or(l.user_id = auth.uid()),
         string_agg(COALESCE(p.display_name, 'Runner'), ', ' ORDER BY l.created_at DESC)
  FROM public.activity_likes l
  LEFT JOIN public.profiles p ON p.user_id = l.user_id
  WHERE l.source = p_source AND l.source_id = p_source_id
    AND public.can_view_social_activity(p_source, p_source_id);
$$;

CREATE OR REPLACE FUNCTION public.get_activity_social_counts(p_sources text[], p_source_ids text[])
RETURNS TABLE(source text, source_id text, like_count bigint, comment_count bigint, liked_by_me boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  WITH refs AS (
    SELECT s AS source, i AS source_id
    FROM unnest(p_sources, p_source_ids) AS t(s, i)
  )
  SELECT r.source, r.source_id,
    (SELECT count(*) FROM public.activity_likes l WHERE l.source = r.source AND l.source_id = r.source_id),
    (SELECT count(*) FROM public.activity_comments c WHERE c.source = r.source AND c.source_id = r.source_id),
    EXISTS (SELECT 1 FROM public.activity_likes l WHERE l.source = r.source AND l.source_id = r.source_id AND l.user_id = auth.uid())
  FROM refs r;
$$;

REVOKE ALL ON FUNCTION public.get_activity_comments(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_activity_likes(text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_activity_social_counts(text[], text[]) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_activity_comments(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_activity_likes(text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_activity_social_counts(text[], text[]) TO authenticated, service_role;

-- ============ per-group push toggle ============
ALTER TABLE public.leaderboard_group_members
  ADD COLUMN IF NOT EXISTS push_enabled boolean NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.set_group_push(p_group_id uuid, p_enabled boolean)
RETURNS void LANGUAGE sql SECURITY DEFINER SET search_path TO 'public' AS $$
  UPDATE public.leaderboard_group_members
  SET push_enabled = p_enabled
  WHERE group_id = p_group_id AND user_id = auth.uid();
$$;
REVOKE ALL ON FUNCTION public.set_group_push(uuid, boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.set_group_push(uuid, boolean) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_my_leaderboard_groups();
CREATE FUNCTION public.get_my_leaderboard_groups()
RETURNS TABLE(id uuid, name text, emoji text, invite_code text, owner_user_id uuid, member_count bigint, push_enabled boolean)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT g.id, g.name, g.emoji, g.invite_code, g.owner_user_id,
         (SELECT count(*) FROM public.leaderboard_group_members m2 WHERE m2.group_id = g.id),
         me.push_enabled
  FROM public.leaderboard_groups g
  JOIN public.leaderboard_group_members me ON me.group_id = g.id AND me.user_id = auth.uid()
  ORDER BY g.created_at ASC;
$$;
REVOKE ALL ON FUNCTION public.get_my_leaderboard_groups() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_my_leaderboard_groups() TO authenticated, service_role;

-- Recipients of a "friend just ran" push: co-group members with the toggle on.
CREATE OR REPLACE FUNCTION public.get_group_push_recipients(p_user_id uuid)
RETURNS TABLE(user_id uuid, lang text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path TO 'public' AS $$
  SELECT DISTINCT m2.user_id, COALESCE(p.lang, 'en')
  FROM public.leaderboard_group_members m1
  JOIN public.leaderboard_group_members m2 ON m2.group_id = m1.group_id
  LEFT JOIN public.profiles p ON p.user_id = m2.user_id
  WHERE m1.user_id = p_user_id
    AND m2.user_id <> p_user_id
    AND m2.push_enabled;
$$;
REVOKE ALL ON FUNCTION public.get_group_push_recipients(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_group_push_recipients(uuid) TO service_role;

-- ============ notify edge function on new activity ============
CREATE OR REPLACE FUNCTION public.tg_notify_group_activity()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public', 'vault', 'extensions' AS $$
DECLARE
  v_source text;
  v_key text;
BEGIN
  v_source := CASE TG_TABLE_NAME
    WHEN 'strava_activities' THEN 'strava'
    WHEN 'intervals_activities' THEN 'intervals'
    WHEN 'terra_activities' THEN 'terra'
    WHEN 'polar_activities' THEN 'polar'
    WHEN 'suunto_activities' THEN 'suunto'
    WHEN 'garmin_activities' THEN 'garmin'
    WHEN 'apple_health_activities' THEN 'apple'
    ELSE TG_TABLE_NAME
  END;

  SELECT decrypted_secret INTO v_key FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1;
  IF v_key IS NULL THEN RETURN NEW; END IF;

  PERFORM net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/notify-group-activity',
    headers := jsonb_build_object('Content-Type', 'application/json', 'x-webhook-key', v_key),
    body := jsonb_build_object('source', v_source, 'source_id', NEW.id::text, 'user_id', NEW.user_id),
    timeout_milliseconds := 5000
  );
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  RETURN NEW;
END $$;

CREATE TRIGGER notify_group_activity AFTER INSERT ON public.strava_activities FOR EACH ROW EXECUTE FUNCTION public.tg_notify_group_activity();
CREATE TRIGGER notify_group_activity AFTER INSERT ON public.terra_activities FOR EACH ROW EXECUTE FUNCTION public.tg_notify_group_activity();
CREATE TRIGGER notify_group_activity AFTER INSERT ON public.garmin_activities FOR EACH ROW EXECUTE FUNCTION public.tg_notify_group_activity();
CREATE TRIGGER notify_group_activity AFTER INSERT ON public.apple_health_activities FOR EACH ROW EXECUTE FUNCTION public.tg_notify_group_activity();
CREATE TRIGGER notify_group_activity AFTER INSERT ON public.polar_activities FOR EACH ROW EXECUTE FUNCTION public.tg_notify_group_activity();
CREATE TRIGGER notify_group_activity AFTER INSERT ON public.suunto_activities FOR EACH ROW EXECUTE FUNCTION public.tg_notify_group_activity();
CREATE TRIGGER notify_group_activity AFTER INSERT ON public.intervals_activities FOR EACH ROW EXECUTE FUNCTION public.tg_notify_group_activity();