
CREATE TABLE public.polar_connections (
  user_id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  polar_user_id bigint NOT NULL,
  member_id text NOT NULL,
  access_token text NOT NULL,
  expires_at bigint NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX polar_connections_polar_user_id_idx ON public.polar_connections(polar_user_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.polar_connections TO authenticated;
GRANT ALL ON public.polar_connections TO service_role;
ALTER TABLE public.polar_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "polar_conn self" ON public.polar_connections
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

CREATE TABLE public.polar_activities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  polar_exercise_id text NOT NULL,
  upload_time timestamptz,
  start_date timestamptz NOT NULL,
  duration integer,
  distance numeric,
  sport_type text,
  detailed_sport_type text,
  calories integer,
  average_heart_rate integer,
  maximum_heart_rate integer,
  training_load numeric,
  has_route boolean DEFAULT false,
  club_id bigint,
  club_name text,
  raw jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(polar_exercise_id)
);
CREATE INDEX polar_activities_user_id_idx ON public.polar_activities(user_id, start_date DESC);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.polar_activities TO authenticated;
GRANT ALL ON public.polar_activities TO service_role;
ALTER TABLE public.polar_activities ENABLE ROW LEVEL SECURITY;
CREATE POLICY "polar_act self" ON public.polar_activities
  FOR ALL TO authenticated
  USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
