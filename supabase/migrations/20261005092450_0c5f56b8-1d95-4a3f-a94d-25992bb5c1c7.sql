CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  PERFORM cron.unschedule(jobid)
  FROM cron.job
  WHERE jobname = 'terra-final-shutdown-hourly';
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'terra-final-shutdown-hourly',
  '5 * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-final-shutdown',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'apikey', 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZ2h2Y2x3aHhuamVza2RvZGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTE0MDQsImV4cCI6MjA5MDkyNzQwNH0.ymRqbqpdRssDmDI_zCWsKNFKAOQGfns76JnSmTsIaBM',
      'x-webhook-key', (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'webhook_auth_key' LIMIT 1)
    ),
    body := jsonb_build_object('source', 'cron'),
    timeout_milliseconds := 120000
  );
  $$
);