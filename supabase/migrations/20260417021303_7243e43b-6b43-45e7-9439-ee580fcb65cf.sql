CREATE OR REPLACE FUNCTION public.get_leaderboard(p_is_premium boolean, p_limit int)
RETURNS TABLE (
  user_id uuid,
  display_name text,
  avatar_url text,
  monthly_xp integer,
  is_premium boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT p.user_id, p.display_name, p.avatar_url, p.monthly_xp, p.is_premium
  FROM public.profiles p
  WHERE p.is_premium = p_is_premium
    AND p.monthly_xp > 0
  ORDER BY p.monthly_xp DESC
  LIMIT GREATEST(p_limit, 0);
$$;

REVOKE EXECUTE ON FUNCTION public.get_leaderboard(boolean, int) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_leaderboard(boolean, int) TO authenticated;