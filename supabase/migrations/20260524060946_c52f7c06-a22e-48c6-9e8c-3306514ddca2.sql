
-- Seed queue with every active Terra connection, target date = today (UTC)
INSERT INTO public.terra_today_oneoff_queue (user_id, terra_user_id, provider, target_date)
SELECT user_id, terra_user_id, provider, DATE '2026-05-24'
FROM public.terra_connections
WHERE active = true
ON CONFLICT DO NOTHING;

-- Ensure pg_cron + pg_net are enabled
CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Remove any prior job with same name (idempotent)
DO $$
DECLARE jid bigint;
BEGIN
  FOR jid IN SELECT jobid FROM cron.job WHERE jobname = 'terra-today-oneoff' LOOP
    PERFORM cron.unschedule(jid);
  END LOOP;
END $$;

-- Schedule every 2 minutes
SELECT cron.schedule(
  'terra-today-oneoff',
  '*/2 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-today-oneoff-tick',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-webhook-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1)
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
  $$
);
