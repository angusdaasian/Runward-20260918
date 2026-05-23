
CREATE TABLE public.terra_webhook_queue (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  env TEXT NOT NULL,
  raw_body TEXT NOT NULL,
  signature_header TEXT,
  status TEXT NOT NULL DEFAULT 'pending',
  attempts INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  received_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  processed_at TIMESTAMPTZ
);

CREATE INDEX terra_webhook_queue_pending_idx
  ON public.terra_webhook_queue (received_at)
  WHERE status = 'pending';

ALTER TABLE public.terra_webhook_queue ENABLE ROW LEVEL SECURITY;

-- No policies: service role only.

CREATE OR REPLACE FUNCTION public.claim_terra_webhook_queue(batch_size INT)
RETURNS TABLE (
  id UUID,
  env TEXT,
  raw_body TEXT,
  signature_header TEXT,
  attempts INT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    SELECT q.id
    FROM public.terra_webhook_queue q
    WHERE q.status = 'pending'
    ORDER BY q.received_at ASC
    LIMIT batch_size
    FOR UPDATE SKIP LOCKED
  )
  UPDATE public.terra_webhook_queue q
  SET status = 'processing',
      attempts = q.attempts + 1
  FROM claimed
  WHERE q.id = claimed.id
  RETURNING q.id, q.env, q.raw_body, q.signature_header, q.attempts;
END;
$$;
