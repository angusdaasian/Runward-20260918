
-- Strava connections table
CREATE TABLE public.strava_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  strava_athlete_id bigint NOT NULL,
  access_token text NOT NULL,
  refresh_token text NOT NULL,
  expires_at bigint NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.strava_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own strava connection" ON public.strava_connections
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own strava connection" ON public.strava_connections
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own strava connection" ON public.strava_connections
  FOR UPDATE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own strava connection" ON public.strava_connections
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role full access strava connections" ON public.strava_connections
  FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Strava activities table
CREATE TABLE public.strava_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  strava_id bigint NOT NULL UNIQUE,
  name text NOT NULL,
  sport_type text NOT NULL DEFAULT 'Run',
  distance numeric NOT NULL DEFAULT 0,
  moving_time integer NOT NULL DEFAULT 0,
  elapsed_time integer NOT NULL DEFAULT 0,
  total_elevation_gain numeric NOT NULL DEFAULT 0,
  start_date timestamp with time zone NOT NULL,
  average_speed numeric NOT NULL DEFAULT 0,
  max_speed numeric NOT NULL DEFAULT 0,
  average_heartrate numeric,
  max_heartrate numeric,
  summary_polyline text,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

ALTER TABLE public.strava_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own strava activities" ON public.strava_activities
  FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own strava activities" ON public.strava_activities
  FOR INSERT TO authenticated WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own strava activities" ON public.strava_activities
  FOR DELETE TO authenticated USING (auth.uid() = user_id);

CREATE POLICY "Service role full access strava activities" ON public.strava_activities
  FOR ALL TO service_role USING (true) WITH CHECK (true);
