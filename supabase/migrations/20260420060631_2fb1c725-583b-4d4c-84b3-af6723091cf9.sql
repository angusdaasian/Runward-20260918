-- Remove old job if it exists (idempotent)
DO $$
BEGIN
  PERFORM cron.unschedule('daily-morning-push-8am-hkt');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'daily-morning-push-8am-hkt',
  '0 0 * * *', -- 00:00 UTC = 08:00 HKT
  $$
  SELECT net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/send-daily-morning-push',
    headers := '{"Content-Type": "application/json", "Authorization": "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZ2h2Y2x3aHhuamVza2RvZGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTE0MDQsImV4cCI6MjA5MDkyNzQwNH0.ymRqbqpdRssDmDI_zCWsKNFKAOQGfns76JnSmTsIaBM"}'::jsonb,
    body := jsonb_build_object('triggered_at', now())
  );
  $$
);