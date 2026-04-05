
-- Create apple_health_connections table (missing from DB)
CREATE TABLE IF NOT EXISTS public.apple_health_connections (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(user_id)
);

ALTER TABLE public.apple_health_connections ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own apple health connection"
  ON public.apple_health_connections FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own apple health connection"
  ON public.apple_health_connections FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete own apple health connection"
  ON public.apple_health_connections FOR DELETE
  USING (auth.uid() = user_id);

-- Create apple_health_activities table (referenced in code)
CREATE TABLE IF NOT EXISTS public.apple_health_activities (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL,
  name TEXT NOT NULL,
  sport_type TEXT NOT NULL DEFAULT 'Run',
  distance NUMERIC NOT NULL DEFAULT 0,
  moving_time INTEGER NOT NULL DEFAULT 0,
  elapsed_time INTEGER NOT NULL DEFAULT 0,
  total_elevation_gain NUMERIC NOT NULL DEFAULT 0,
  start_date TIMESTAMP WITH TIME ZONE NOT NULL,
  average_speed NUMERIC NOT NULL DEFAULT 0,
  max_speed NUMERIC NOT NULL DEFAULT 0,
  average_heartrate NUMERIC,
  max_heartrate NUMERIC,
  source TEXT DEFAULT 'Apple Health',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

ALTER TABLE public.apple_health_activities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can read own apple health activities"
  ON public.apple_health_activities FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert own apple health activities"
  ON public.apple_health_activities FOR INSERT
  WITH CHECK (auth.uid() = user_id);
