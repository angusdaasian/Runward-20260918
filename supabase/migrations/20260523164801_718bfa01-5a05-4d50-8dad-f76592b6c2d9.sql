
SELECT cron.schedule(
  'process-terra-queue-every-minute',
  '* * * * *',
  $$
  SELECT net.http_post(
    url := 'https://kbghvclwhxnjeskdodeh.supabase.co/functions/v1/process-terra-queue',
    headers := '{"Content-Type":"application/json","apikey":"eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImtiZ2h2Y2x3aHhuamVza2RvZGVoIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzUzNTE0MDQsImV4cCI6MjA5MDkyNzQwNH0.ymRqbqpdRssDmDI_zCWsKNFKAOQGfns76JnSmTsIaBM"}'::jsonb,
    body := concat('{"time":"', now(), '"}')::jsonb
  ) AS request_id;
  $$
);
