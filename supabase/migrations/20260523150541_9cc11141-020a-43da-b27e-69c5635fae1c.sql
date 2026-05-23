CREATE EXTENSION IF NOT EXISTS pg_cron;
CREATE EXTENSION IF NOT EXISTS pg_net;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'terra-reconcile-every-minute') THEN
    PERFORM cron.unschedule('terra-reconcile-every-minute');
  END IF;
END$$;

SELECT cron.schedule(
  'terra-reconcile-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/terra-reconcile',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZ2h2Y2x3aHhuamVza2RvZGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTE0MDQsImV4cCI6MjA5MDkyNzQwNH0.ymRqbqpdRssDmDI_zCWsKNFKAOQGfns76JnSmTsIaBM"}'::jsonb,
    body := concat('{"time":"', now(), '"}')::jsonb
  ) AS request_id;
  $$
);