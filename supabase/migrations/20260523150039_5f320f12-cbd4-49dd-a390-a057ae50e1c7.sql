ALTER TABLE public.terra_webhook_events
  ADD COLUMN IF NOT EXISTS payload_id text;

CREATE INDEX IF NOT EXISTS idx_terra_webhook_events_payload_id
  ON public.terra_webhook_events(payload_id);

CREATE INDEX IF NOT EXISTS idx_terra_webhook_events_received_at
  ON public.terra_webhook_events(received_at DESC);

CREATE INDEX IF NOT EXISTS idx_terra_data_payloads_created_at
  ON public.terra_data_payloads(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_terra_misc_payloads_created_at
  ON public.terra_misc_payloads(created_at DESC);

CREATE TABLE IF NOT EXISTS public.terra_reconciliation_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  payload_id text NOT NULL,
  terra_user_id text,
  data_type text,
  source_table text NOT NULL, -- 'terra_data_payloads' | 'terra_misc_payloads'
  status text NOT NULL,       -- 'recovered' | 'webhook_missing_in_supabase' | 'fetch_failed'
  detail text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_terra_reconciliation_log_payload_id
  ON public.terra_reconciliation_log(payload_id);

CREATE INDEX IF NOT EXISTS idx_terra_reconciliation_log_created_at
  ON public.terra_reconciliation_log(created_at DESC);

ALTER TABLE public.terra_reconciliation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Service role full access terra_reconciliation_log"
  ON public.terra_reconciliation_log
  FOR ALL
  TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Admins read terra reconciliation log"
  ON public.terra_reconciliation_log
  FOR SELECT
  TO authenticated
  USING (has_role(auth.uid(), 'admin'::app_role));