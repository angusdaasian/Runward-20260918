CREATE TABLE public.stridee_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  stridee_user_id text,
  provider text NOT NULL DEFAULT 'garmin',
  status text NOT NULL DEFAULT 'pending',
  connected_at timestamptz,
  last_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.stridee_connections TO authenticated;
GRANT ALL ON public.stridee_connections TO service_role;
ALTER TABLE public.stridee_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view own stridee connection" ON public.stridee_connections FOR SELECT TO authenticated USING (auth.uid() = user_id);

CREATE TABLE public.stridee_sync_state (
  id text PRIMARY KEY,
  last_received_at timestamptz,
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT ALL ON public.stridee_sync_state TO service_role;
ALTER TABLE public.stridee_sync_state ENABLE ROW LEVEL SECURITY;