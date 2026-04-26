ALTER TABLE public.garmin_connections
  ADD COLUMN IF NOT EXISTS last_refreshed_at timestamptz;

CREATE TABLE IF NOT EXISTS public.garmin_daily_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  date date NOT NULL,
  vo2max numeric,
  resting_hr integer,
  sleep_seconds integer,
  sleep_score integer,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, date)
);

CREATE INDEX IF NOT EXISTS idx_garmin_daily_health_user_date
  ON public.garmin_daily_health (user_id, date DESC);

ALTER TABLE public.garmin_daily_health ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users read own daily health"
  ON public.garmin_daily_health
  FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Service role full access garmin_daily_health"
  ON public.garmin_daily_health
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);