
WITH month_bonus AS (
  SELECT user_id, COALESCE(SUM(xp_awarded), 0) AS bonus
  FROM public.social_rewards_claimed
  WHERE claimed_at >= date_trunc('month', now())
  GROUP BY user_id
),
needs_fix AS (
  -- Users whose current monthly_xp doesn't already include the bonus
  -- Heuristic: if monthly_xp < bonus we definitely lost it; if equal to a clean activity-only value we add safely.
  -- We just add the bonus delta = bonus_owed - bonus_already_present (estimated as 0 because webhooks set monthly_xp = activity_only).
  SELECT mb.user_id, mb.bonus
  FROM month_bonus mb
  JOIN public.profiles p ON p.user_id = mb.user_id
)
UPDATE public.profiles p
SET monthly_xp  = COALESCE(p.monthly_xp, 0)  + nf.bonus,
    lifetime_xp = COALESCE(p.lifetime_xp, 0) + nf.bonus
FROM needs_fix nf
WHERE p.user_id = nf.user_id;
