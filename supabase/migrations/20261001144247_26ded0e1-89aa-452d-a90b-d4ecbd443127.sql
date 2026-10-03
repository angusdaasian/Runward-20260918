CREATE TABLE public.onesignal_cleanup_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  csv_url text NOT NULL,
  status text NOT NULL DEFAULT 'running',
  total_candidates int NOT NULL DEFAULT 0,
  processed int NOT NULL DEFAULT 0,
  deleted int NOT NULL DEFAULT 0,
  skipped_linked int NOT NULL DEFAULT 0,
  failed int NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.onesignal_cleanup_runs TO authenticated;
GRANT ALL ON public.onesignal_cleanup_runs TO service_role;
ALTER TABLE public.onesignal_cleanup_runs ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins view cleanup runs" ON public.onesignal_cleanup_runs
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'admin'));