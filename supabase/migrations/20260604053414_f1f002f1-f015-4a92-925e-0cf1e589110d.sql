
CREATE TABLE public.suunto_connections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE,
  suunto_username TEXT NOT NULL,
  access_token TEXT NOT NULL,
  refresh_token TEXT NOT NULL,
  expires_at BIGINT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_suunto_connections_username ON public.suunto_connections(suunto_username);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suunto_connections TO authenticated;
GRANT ALL ON public.suunto_connections TO service_role;

ALTER TABLE public.suunto_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own suunto connection"
  ON public.suunto_connections FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE TRIGGER suunto_connections_updated_at
  BEFORE UPDATE ON public.suunto_connections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TABLE public.suunto_activities (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL,
  suunto_workout_key TEXT NOT NULL UNIQUE,
  name TEXT,
  sport_type TEXT NOT NULL DEFAULT 'Run',
  activity_id INTEGER,
  distance NUMERIC,
  moving_time INTEGER,
  elapsed_time INTEGER,
  total_elevation_gain NUMERIC,
  start_date TIMESTAMPTZ NOT NULL,
  average_speed NUMERIC,
  max_speed NUMERIC,
  average_heartrate NUMERIC,
  max_heartrate NUMERIC,
  summary_polyline TEXT,
  environment TEXT NOT NULL DEFAULT 'prod',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX idx_suunto_activities_user ON public.suunto_activities(user_id, start_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.suunto_activities TO authenticated;
GRANT ALL ON public.suunto_activities TO service_role;

ALTER TABLE public.suunto_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users manage own suunto activities"
  ON public.suunto_activities FOR ALL
  USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
