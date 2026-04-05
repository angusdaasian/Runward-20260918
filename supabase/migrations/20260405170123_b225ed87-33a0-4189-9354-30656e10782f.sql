
-- Drop and recreate view with security_invoker = true
DROP VIEW IF EXISTS public.leaderboard_view;

CREATE VIEW public.leaderboard_view
WITH (security_invoker = true)
AS
SELECT
  p.user_id,
  p.display_name,
  p.avatar_url,
  p.rank_tier,
  p.division,
  p.monthly_xp,
  p.lifetime_xp,
  p.is_premium
FROM public.profiles p
WHERE p.monthly_xp > 0
ORDER BY p.monthly_xp DESC;
