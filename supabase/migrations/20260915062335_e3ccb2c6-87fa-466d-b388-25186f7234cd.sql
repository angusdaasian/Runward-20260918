CREATE TABLE public.group_messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES public.leaderboard_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  body text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_messages TO authenticated;
GRANT ALL ON public.group_messages TO service_role;

ALTER TABLE public.group_messages ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Members read group messages" ON public.group_messages
FOR SELECT TO authenticated
USING (public.is_leaderboard_group_member(group_id, auth.uid()));

CREATE POLICY "Members post group messages" ON public.group_messages
FOR INSERT TO authenticated
WITH CHECK (user_id = auth.uid() AND public.is_leaderboard_group_member(group_id, auth.uid()));

CREATE POLICY "Author or leader edits group messages" ON public.group_messages
FOR UPDATE TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.leaderboard_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid()))
WITH CHECK (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.leaderboard_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid()));

CREATE POLICY "Author or leader deletes group messages" ON public.group_messages
FOR DELETE TO authenticated
USING (user_id = auth.uid() OR EXISTS (SELECT 1 FROM public.leaderboard_groups g WHERE g.id = group_id AND g.owner_user_id = auth.uid()));

CREATE INDEX idx_group_messages_group_created ON public.group_messages (group_id, created_at DESC);

CREATE TABLE public.group_message_reads (
  group_id uuid NOT NULL REFERENCES public.leaderboard_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  last_read_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (group_id, user_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.group_message_reads TO authenticated;
GRANT ALL ON public.group_message_reads TO service_role;

ALTER TABLE public.group_message_reads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Own read markers" ON public.group_message_reads
FOR ALL TO authenticated
USING (user_id = auth.uid())
WITH CHECK (user_id = auth.uid());

CREATE OR REPLACE FUNCTION public.get_group_messages(p_group_id uuid, p_before timestamptz DEFAULT NULL, p_limit integer DEFAULT 40)
RETURNS TABLE(id uuid, group_id uuid, user_id uuid, display_name text, avatar_url text, body text, created_at timestamptz, is_mine boolean, can_delete boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT m.id, m.group_id, m.user_id, p.display_name, p.avatar_url, m.body, m.created_at,
         m.user_id = auth.uid() AS is_mine,
         (m.user_id = auth.uid() OR g.owner_user_id = auth.uid()) AS can_delete
  FROM public.group_messages m
  JOIN public.leaderboard_groups g ON g.id = m.group_id
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.group_id = p_group_id
    AND m.deleted_at IS NULL
    AND (p_before IS NULL OR m.created_at < p_before)
    AND public.is_leaderboard_group_member(p_group_id, auth.uid())
  ORDER BY m.created_at DESC
  LIMIT LEAST(GREATEST(COALESCE(p_limit, 40), 1), 100)
$$;

CREATE OR REPLACE FUNCTION public.send_group_message(p_group_id uuid, p_body text)
RETURNS TABLE(id uuid, group_id uuid, user_id uuid, display_name text, avatar_url text, body text, created_at timestamptz, is_mine boolean, can_delete boolean)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_body text := btrim(coalesce(p_body, ''));
  v_id uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in';
  END IF;
  IF NOT public.is_leaderboard_group_member(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only group members can send messages';
  END IF;
  IF v_body = '' THEN
    RAISE EXCEPTION 'Message cannot be empty';
  END IF;
  IF length(v_body) > 1000 THEN
    RAISE EXCEPTION 'Message is too long';
  END IF;

  INSERT INTO public.group_messages (group_id, user_id, body)
  VALUES (p_group_id, auth.uid(), v_body)
  RETURNING public.group_messages.id INTO v_id;

  RETURN QUERY
  SELECT m.id, m.group_id, m.user_id, p.display_name, p.avatar_url, m.body, m.created_at,
         true AS is_mine, true AS can_delete
  FROM public.group_messages m
  LEFT JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.id = v_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.delete_group_message(p_message_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE public.group_messages m
  SET deleted_at = now()
  WHERE m.id = p_message_id
    AND m.deleted_at IS NULL
    AND (m.user_id = auth.uid()
         OR EXISTS (SELECT 1 FROM public.leaderboard_groups g WHERE g.id = m.group_id AND g.owner_user_id = auth.uid()));
  IF NOT FOUND THEN
    RAISE EXCEPTION 'You cannot delete this message';
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_group_chat_read(p_group_id uuid)
RETURNS void
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT public.is_leaderboard_group_member(p_group_id, auth.uid()) THEN
    RAISE EXCEPTION 'Only group members can read this chat';
  END IF;
  INSERT INTO public.group_message_reads (group_id, user_id, last_read_at)
  VALUES (p_group_id, auth.uid(), now())
  ON CONFLICT (group_id, user_id) DO UPDATE SET last_read_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.get_my_group_chat_summaries()
RETURNS TABLE(group_id uuid, name text, emoji text, member_count bigint, last_body text, last_at timestamptz, last_sender text, unread_count bigint)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH my_groups AS (
    SELECT g.id, g.name, g.emoji
    FROM public.leaderboard_groups g
    JOIN public.leaderboard_group_members m ON m.group_id = g.id AND m.user_id = auth.uid()
  ),
  counts AS (
    SELECT m.group_id, count(*) AS member_count
    FROM public.leaderboard_group_members m
    WHERE m.group_id IN (SELECT id FROM my_groups)
    GROUP BY m.group_id
  ),
  last_msg AS (
    SELECT DISTINCT ON (m.group_id) m.group_id, m.body, m.created_at, p.display_name
    FROM public.group_messages m
    LEFT JOIN public.profiles p ON p.user_id = m.user_id
    WHERE m.group_id IN (SELECT id FROM my_groups) AND m.deleted_at IS NULL
    ORDER BY m.group_id, m.created_at DESC
  ),
  unread AS (
    SELECT m.group_id, count(*) AS unread_count
    FROM public.group_messages m
    LEFT JOIN public.group_message_reads r ON r.group_id = m.group_id AND r.user_id = auth.uid()
    WHERE m.group_id IN (SELECT id FROM my_groups)
      AND m.deleted_at IS NULL
      AND m.user_id <> auth.uid()
      AND (r.last_read_at IS NULL OR m.created_at > r.last_read_at)
    GROUP BY m.group_id
  )
  SELECT g.id, g.name, g.emoji,
         coalesce(c.member_count, 0),
         l.body, l.created_at, l.display_name,
         coalesce(u.unread_count, 0)
  FROM my_groups g
  LEFT JOIN counts c ON c.group_id = g.id
  LEFT JOIN last_msg l ON l.group_id = g.id
  LEFT JOIN unread u ON u.group_id = g.id
  ORDER BY l.created_at DESC NULLS LAST, g.name
$$;

REVOKE ALL ON FUNCTION public.get_group_messages(uuid, timestamptz, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.send_group_message(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.delete_group_message(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.mark_group_chat_read(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_my_group_chat_summaries() FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_group_messages(uuid, timestamptz, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.send_group_message(uuid, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.delete_group_message(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_group_chat_read(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_my_group_chat_summaries() TO authenticated, service_role;

ALTER PUBLICATION supabase_realtime ADD TABLE public.group_messages;
ALTER TABLE public.group_messages REPLICA IDENTITY FULL;