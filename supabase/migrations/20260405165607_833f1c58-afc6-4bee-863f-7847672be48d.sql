
-- Add ranked season columns to profiles
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS monthly_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS lifetime_xp integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS is_premium boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS rank_tier text NOT NULL DEFAULT 'Bronze',
  ADD COLUMN IF NOT EXISTS division text NOT NULL DEFAULT 'V',
  ADD COLUMN IF NOT EXISTS last_login timestamp with time zone DEFAULT now();

-- Create season_rewards table
CREATE TABLE public.season_rewards (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id uuid NOT NULL,
  month_year text NOT NULL,
  promo_code text NOT NULL,
  claimed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE (user_id, month_year)
);

ALTER TABLE public.season_rewards ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own rewards"
  ON public.season_rewards FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can update own rewards to claim"
  ON public.season_rewards FOR UPDATE
  USING (auth.uid() = user_id);

CREATE POLICY "Admins can view all rewards"
  ON public.season_rewards FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert rewards"
  ON public.season_rewards FOR INSERT
  TO authenticated
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Service role full access season_rewards"
  ON public.season_rewards FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Create a secure leaderboard view (no raw activity data)
CREATE OR REPLACE VIEW public.leaderboard_view AS
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
