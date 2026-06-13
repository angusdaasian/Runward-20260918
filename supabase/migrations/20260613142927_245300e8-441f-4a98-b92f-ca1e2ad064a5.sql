
-- intervals.icu connections
CREATE TABLE public.intervals_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  athlete_id text NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at bigint NOT NULL,
  scope text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervals_connections TO authenticated;
GRANT ALL ON public.intervals_connections TO service_role;

ALTER TABLE public.intervals_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intervals_conn_select_own" ON public.intervals_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "intervals_conn_insert_own" ON public.intervals_connections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "intervals_conn_update_own" ON public.intervals_connections
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "intervals_conn_delete_own" ON public.intervals_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_intervals_conn_updated_at
  BEFORE UPDATE ON public.intervals_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- intervals.icu activities (mirrors strava_activities)
CREATE TABLE public.intervals_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  intervals_id text NOT NULL UNIQUE,
  name text,
  sport_type text,
  distance double precision,
  moving_time integer,
  elapsed_time integer,
  total_elevation_gain double precision,
  start_date timestamptz,
  average_speed double precision,
  max_speed double precision,
  average_heartrate double precision,
  max_heartrate double precision,
  summary_polyline text,
  environment text DEFAULT 'prod',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_intervals_activities_user ON public.intervals_activities(user_id, start_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.intervals_activities TO authenticated;
GRANT ALL ON public.intervals_activities TO service_role;

ALTER TABLE public.intervals_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "intervals_act_select_own" ON public.intervals_activities
  FOR SELECT TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "intervals_act_insert_own" ON public.intervals_activities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);
CREATE POLICY "intervals_act_update_own" ON public.intervals_activities
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);
CREATE POLICY "intervals_act_delete_own" ON public.intervals_activities
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE TRIGGER trg_intervals_act_updated_at
  BEFORE UPDATE ON public.intervals_activities
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
