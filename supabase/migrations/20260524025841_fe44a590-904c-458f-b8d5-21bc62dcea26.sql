ALTER TABLE public.terra_webhook_queue
ADD COLUMN IF NOT EXISTS claimed_at TIMESTAMPTZ;

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
  UPDATE public.terra_webhook_queue q
  SET status = CASE WHEN q.attempts >= 5 THEN 'failed' ELSE 'pending' END,
      last_error = COALESCE(q.last_error, 'stale processing reset'),
      claimed_at = NULL
  WHERE q.status = 'processing'
    AND COALESCE(q.claimed_at, q.received_at) < now() - interval '10 minutes';

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
      attempts = q.attempts + 1,
      claimed_at = now()
  FROM claimed
  WHERE q.id = claimed.id
  RETURNING q.id, q.env, q.raw_body, q.signature_header, q.attempts;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'terra-reconcile-every-minute') THEN
    PERFORM cron.unschedule('terra-reconcile-every-minute');
  END IF;

  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'process-terra-queue-every-minute') THEN
    PERFORM cron.unschedule('process-terra-queue-every-minute');
  END IF;
END $$;

SELECT cron.schedule(
  'process-terra-queue-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/process-terra-queue',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJIUzI1NiIsInJlZiI6ImtiZ2h2Y2x3aHhuamVza2RvZGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTE0MDQsImV4cCI6MjA5MDkyNzQwNH0.ymRqbqpdRssDmDI_zCWsKNFKAOQGfns76JnSmTsIaBM"}'::jsonb,
    body := concat('{"time":"', now(), '"}')::jsonb
  ) AS request_id;
  $$
);