CREATE OR REPLACE FUNCTION public.get_leaderboard_group_members(p_group_id uuid)
RETURNS TABLE(user_id uuid, display_name text, avatar_url text, role text, joined_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT m.user_id, p.display_name, p.avatar_url, m.role, m.joined_at
  FROM public.leaderboard_group_members m
  JOIN public.profiles p ON p.user_id = m.user_id
  WHERE m.group_id = p_group_id
    AND public.is_leaderboard_group_member(p_group_id, auth.uid())
  ORDER BY CASE WHEN m.role = 'owner' THEN 0 ELSE 1 END, m.joined_at;
$$;
REVOKE ALL ON FUNCTION public.get_leaderboard_group_members(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_leaderboard_group_members(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.remove_leaderboard_group_member(p_group_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'authentication required'; END IF;
  IF p_user_id = auth.uid() THEN
    IF EXISTS (SELECT 1 FROM public.leaderboard_groups WHERE id = p_group_id AND owner_user_id = auth.uid()) THEN RAISE EXCEPTION 'owners must delete the group'; END IF;
  ELSIF NOT EXISTS (SELECT 1 FROM public.leaderboard_groups WHERE id = p_group_id AND owner_user_id = auth.uid()) THEN
    RAISE EXCEPTION 'owner access required';
  END IF;
  DELETE FROM public.leaderboard_group_members WHERE group_id = p_group_id AND user_id = p_user_id AND role <> 'owner';
END; $$;
REVOKE ALL ON FUNCTION public.remove_leaderboard_group_member(uuid, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.remove_leaderboard_group_member(uuid, uuid) TO authenticated;