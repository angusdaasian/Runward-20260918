CREATE TABLE public.pushed_workouts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  plan_id UUID NOT NULL REFERENCES public.training_plans(id) ON DELETE CASCADE,
  week INTEGER NOT NULL,
  day_index INTEGER NOT NULL,
  provider TEXT NOT NULL,
  terra_log_id TEXT,
  pushed_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_id, week, day_index, provider)
);

CREATE INDEX idx_pushed_workouts_user_plan ON public.pushed_workouts(user_id, plan_id);

ALTER TABLE public.pushed_workouts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own pushed workouts"
  ON public.pushed_workouts FOR SELECT TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users insert own pushed workouts"
  ON public.pushed_workouts FOR INSERT TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users delete own pushed workouts"
  ON public.pushed_workouts FOR DELETE TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access pushed_workouts"
  ON public.pushed_workouts FOR ALL TO service_role
  USING (true) WITH CHECK (true);