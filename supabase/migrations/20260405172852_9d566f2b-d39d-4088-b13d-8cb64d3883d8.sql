
-- Create used_codes table to store redeemed/assigned codes
CREATE TABLE public.used_codes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  original_code_id uuid,
  code_string text NOT NULL,
  type text NOT NULL DEFAULT 'premium_win',
  user_id uuid NOT NULL,
  month_year text,
  assigned_at timestamptz,
  used_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.used_codes ENABLE ROW LEVEL SECURITY;

-- Users can view their own used codes
CREATE POLICY "Users can view own used codes"
  ON public.used_codes FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Admins full access
CREATE POLICY "Admins full access used_codes"
  ON public.used_codes FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'admin'))
  WITH CHECK (has_role(auth.uid(), 'admin'));

-- Service role full access
CREATE POLICY "Service role full access used_codes"
  ON public.used_codes FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
