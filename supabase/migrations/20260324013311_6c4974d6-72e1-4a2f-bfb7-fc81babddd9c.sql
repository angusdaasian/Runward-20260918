CREATE TABLE public.training_plans (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
  goal TEXT NOT NULL,
  distance TEXT NOT NULL,
  target_time TEXT NOT NULL,
  race_date DATE NOT NULL,
  weeks INTEGER NOT NULL,
  plan_data JSONB NOT NULL DEFAULT '[]'::jsonb,
  raw_output TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.training_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own training plans"
  ON public.training_plans FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own training plans"
  ON public.training_plans FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own training plans"
  ON public.training_plans FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own training plans"
  ON public.training_plans FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);