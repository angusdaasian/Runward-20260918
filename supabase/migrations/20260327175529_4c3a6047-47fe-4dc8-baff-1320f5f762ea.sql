
CREATE TABLE public.free_training_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  distance text NOT NULL,
  target_time text NOT NULL,
  days_per_week integer NOT NULL,
  weekly_km_min integer NOT NULL,
  weekly_km_max integer NOT NULL,
  plan_data jsonb NOT NULL DEFAULT '[]'::jsonb,
  weeks integer NOT NULL DEFAULT 12,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(distance, target_time)
);

ALTER TABLE public.free_training_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can read free plans"
ON public.free_training_plans
FOR SELECT
TO public
USING (true);
