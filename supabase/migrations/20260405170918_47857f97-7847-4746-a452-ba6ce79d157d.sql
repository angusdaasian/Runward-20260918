
-- Create reward_codes table
CREATE TABLE public.reward_codes (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  code_string text NOT NULL,
  type text NOT NULL DEFAULT 'premium_win',
  is_assigned boolean NOT NULL DEFAULT false,
  user_id uuid,
  assigned_at timestamp with time zone,
  month_year text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.reward_codes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can do everything with reward_codes"
  ON public.reward_codes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Users can view own assigned codes"
  ON public.reward_codes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Service role full access reward_codes"
  ON public.reward_codes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Drop old season_rewards table
DROP TABLE IF EXISTS public.season_rewards;

-- Assign admin role to angchenghk@gmail.com
INSERT INTO public.user_roles (user_id, role)
VALUES ('54576cb1-3ef4-4fff-8859-a0e610283def', 'admin')
ON CONFLICT (user_id, role) DO NOTHING;
