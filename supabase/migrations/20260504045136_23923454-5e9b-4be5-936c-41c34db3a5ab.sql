-- Terra API integration tables (Beta, parallel to existing Garmin Railway)

CREATE TABLE public.terra_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  terra_user_id text NOT NULL,
  provider text NOT NULL,
  reference_id text,
  scopes text[],
  active boolean NOT NULL DEFAULT true,
  last_webhook_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider)
);
CREATE INDEX idx_terra_connections_terra_user_id ON public.terra_connections(terra_user_id);
ALTER TABLE public.terra_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own terra connections" ON public.terra_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own terra connections" ON public.terra_connections FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role full access terra_connections" ON public.terra_connections FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE TRIGGER trg_terra_connections_updated_at BEFORE UPDATE ON public.terra_connections FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.terra_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  terra_activity_id text NOT NULL,
  activity_name text,
  activity_type text,
  start_time timestamptz,
  duration_seconds integer,
  distance_meters numeric,
  calories integer,
  average_hr integer,
  max_hr integer,
  elevation_gain numeric,
  average_speed numeric,
  avg_cadence numeric,
  aerobic_te numeric,
  anaerobic_te numeric,
  training_load numeric,
  vo2max numeric,
  has_gps boolean DEFAULT false,
  summary_polyline text,
  laps jsonb DEFAULT '[]'::jsonb,
  raw_json jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, terra_activity_id)
);
ALTER TABLE public.terra_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own terra activities" ON public.terra_activities FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Users delete own terra activities" ON public.terra_activities FOR DELETE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role full access terra_activities" ON public.terra_activities FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.terra_daily_health (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  provider text NOT NULL,
  date date NOT NULL,
  vo2max numeric,
  resting_hr integer,
  sleep_seconds integer,
  sleep_score integer,
  steps integer,
  fetched_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, provider, date)
);
ALTER TABLE public.terra_daily_health ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own terra daily health" ON public.terra_daily_health FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "Service role full access terra_daily_health" ON public.terra_daily_health FOR ALL TO service_role USING (true) WITH CHECK (true);

CREATE TABLE public.terra_webhook_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type text,
  terra_user_id text,
  reference_id text,
  signature_valid boolean,
  payload jsonb,
  processing_error text,
  received_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX idx_terra_webhook_events_received ON public.terra_webhook_events(received_at DESC);
ALTER TABLE public.terra_webhook_events ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins read terra webhook events" ON public.terra_webhook_events FOR SELECT TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
CREATE POLICY "Service role full access terra_webhook_events" ON public.terra_webhook_events FOR ALL TO service_role USING (true) WITH CHECK (true);