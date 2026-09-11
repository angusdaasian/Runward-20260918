CREATE OR REPLACE FUNCTION public.is_leaderboard_group_member(p_group_id uuid, p_user_id uuid DEFAULT auth.uid()) RETURNS boolean LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$ SELECT EXISTS (SELECT 1 FROM public.leaderboard_group_members WHERE group_id = p_group_id AND user_id = p_user_id); $$;
REVOKE ALL ON FUNCTION public.is_leaderboard_group_member(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.is_leaderboard_group_member(uuid, uuid) TO service_role;

DROP POLICY IF EXISTS "Members view shared group roster" ON public.leaderboard_group_members;
CREATE POLICY "Members view shared group roster" ON public.leaderboard_group_members FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_leaderboard_group_member(group_id, auth.uid()));
DROP POLICY IF EXISTS "Members view leaderboard groups" ON public.leaderboard_groups;
CREATE POLICY "Members view leaderboard groups" ON public.leaderboard_groups FOR SELECT TO authenticated USING (owner_user_id = auth.uid() OR public.is_leaderboard_group_member(id, auth.uid()));

REVOKE EXECUTE ON FUNCTION public.get_group_by_code(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_group_by_code(text) TO authenticated;