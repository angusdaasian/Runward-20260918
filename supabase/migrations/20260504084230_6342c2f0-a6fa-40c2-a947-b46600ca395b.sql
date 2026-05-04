-- Track one-time social/promo rewards claimed by users (e.g. Instagram follow)
CREATE TABLE public.social_rewards_claimed (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  reward_key TEXT NOT NULL,
  xp_awarded INTEGER NOT NULL DEFAULT 0,
  claimed_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE (user_id, reward_key)
);

ALTER TABLE public.social_rewards_claimed ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own social rewards"
ON public.social_rewards_claimed
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own social rewards"
ON public.social_rewards_claimed
FOR INSERT
TO authenticated
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Service role full access social rewards"
ON public.social_rewards_claimed
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);