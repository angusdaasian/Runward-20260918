ALTER TABLE public.terra_webhook_events DROP COLUMN IF EXISTS payload_id;
ALTER TABLE public.terra_webhook_events ADD COLUMN payload_ids text[];
CREATE INDEX IF NOT EXISTS idx_terra_webhook_events_payload_ids
  ON public.terra_webhook_events USING GIN (payload_ids);