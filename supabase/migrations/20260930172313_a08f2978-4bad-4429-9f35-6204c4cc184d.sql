CREATE TABLE public.completed_programs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_plan_id uuid NOT NULL UNIQUE,
  goal text,
  distance text,
  target_time text,
  race_date date,
  start_date date,
  end_date date,
  weeks integer,
  plan_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  race_schedule jsonb,
  report jsonb NOT NULL DEFAULT '{}'::jsonb,
  ai_analysis jsonb,
  ai_model text,
  lang text,
  plan_created_at timestamptz,
  completed_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, DELETE ON public.completed_programs TO authenticated;
GRANT ALL ON public.completed_programs TO service_role;
ALTER TABLE public.completed_programs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own completed programs" ON public.completed_programs FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own completed programs" ON public.completed_programs FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE INDEX completed_programs_user_idx ON public.completed_programs(user_id, completed_at DESC);