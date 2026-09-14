CREATE OR REPLACE FUNCTION public.rename_leaderboard_group(p_group_id uuid, p_name text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_name text := btrim(p_name);
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Authentication required';
  END IF;

  IF v_name IS NULL OR v_name = '' THEN
    RAISE EXCEPTION 'Group name cannot be blank';
  END IF;

  UPDATE public.leaderboard_groups
     SET name = v_name
   WHERE id = p_group_id
     AND owner_user_id = auth.uid();

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Only the group leader can rename this group';
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.rename_leaderboard_group(uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.rename_leaderboard_group(uuid, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.rename_leaderboard_group(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.rename_leaderboard_group(uuid, text) TO service_role;