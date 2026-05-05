
CREATE TABLE public.weekly_plan_reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  week_index integer NOT NULL,
  week_start date NOT NULL,
  week_end date NOT NULL,
  completion_pct integer NOT NULL DEFAULT 0,
  distance_score integer NOT NULL DEFAULT 0,
  hr_score integer NOT NULL DEFAULT 0,
  pace_score integer NOT NULL DEFAULT 0,
  recovery_score integer NOT NULL DEFAULT 0,
  overall_score integer NOT NULL DEFAULT 0,
  stats jsonb NOT NULL DEFAULT '{}'::jsonb,
  insights_en text,
  insights_zh text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, plan_id, week_index)
);

CREATE INDEX idx_weekly_plan_reviews_user ON public.weekly_plan_reviews(user_id, week_start DESC);

ALTER TABLE public.weekly_plan_reviews ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own weekly reviews"
  ON public.weekly_plan_reviews FOR SELECT
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users insert own weekly reviews"
  ON public.weekly_plan_reviews FOR INSERT
  TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users update own weekly reviews"
  ON public.weekly_plan_reviews FOR UPDATE
  TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role full access weekly reviews"
  ON public.weekly_plan_reviews FOR ALL
  TO service_role USING (true) WITH CHECK (true);

CREATE TRIGGER update_weekly_plan_reviews_updated_at
  BEFORE UPDATE ON public.weekly_plan_reviews
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
