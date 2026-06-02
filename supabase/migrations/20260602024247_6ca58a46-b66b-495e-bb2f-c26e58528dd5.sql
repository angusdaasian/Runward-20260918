
-- Strava multi-app routing
CREATE TABLE IF NOT EXISTS public.strava_apps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  client_id text NOT NULL UNIQUE,
  client_secret text,
  verify_token text,
  subscription_id bigint,
  max_athletes integer NOT NULL DEFAULT 10,
  priority integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.strava_apps TO authenticated;
GRANT ALL ON public.strava_apps TO service_role;

ALTER TABLE public.strava_apps ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage strava apps"
  ON public.strava_apps FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

CREATE POLICY "Service role full access strava_apps"
  ON public.strava_apps FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE TRIGGER strava_apps_set_updated_at
  BEFORE UPDATE ON public.strava_apps
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Add strava_app_id to connections
ALTER TABLE public.strava_connections
  ADD COLUMN IF NOT EXISTS strava_app_id uuid REFERENCES public.strava_apps(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS strava_connections_strava_app_id_idx
  ON public.strava_connections(strava_app_id);

-- Seed app #1 (Client ID 215250); client_secret to be filled via admin UI
INSERT INTO public.strava_apps (client_id, max_athletes, priority, is_active, notes)
VALUES ('215250', 10, 0, true, 'Primary Strava app — set client_secret + verify_token in admin UI')
ON CONFLICT (client_id) DO NOTHING;

-- Backfill: route every existing connection to app #1
UPDATE public.strava_connections sc
SET strava_app_id = (SELECT id FROM public.strava_apps WHERE client_id = '215250')
WHERE sc.strava_app_id IS NULL;
